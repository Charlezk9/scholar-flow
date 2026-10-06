//! 本地受控诊断；拒绝任意正文/异常字符串。记录失败不能影响业务。
use serde_json::{json, Value};
use std::{fs, io::Write, path::Path, sync::Mutex};
static LOCK: Mutex<()> = Mutex::new(());
const MAX_BYTES: u64 = 5 * 1024 * 1024;
const KEEP: usize = 5;
const DAYS: u64 = 14 * 24 * 3600;
const FIELDS: &[&str] = &[
    "blockId",
    "batchIds",
    "attempt",
    "completed",
    "total",
    "elapsedMs",
    "httpStatus",
    "promptTokens",
    "completionTokens",
    "resumed",
    "invalidated",
    "rule",
    "model",
    "sourceHash",
    "validatorVersion",
    "paperId",
    "command",
    "exceptionType",
    "missingTokenIds",
    "duplicateTokenIds",
];
fn identifier(v: &Value) -> Option<&str> {
    v.as_str().filter(|s| {
        !s.is_empty()
            && s.len() <= 128
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || "_.:-".contains(c))
    })
}
pub fn sanitize(value: &Value) -> Value {
    let attrs = value["attributes"]
        .as_object()
        .map(|m| {
            m.iter()
                .filter_map(|(k, v)| {
                    let valid = v.is_number()
                        || v.is_boolean()
                        || identifier(v).is_some()
                        || v.as_array()
                            .is_some_and(|a| a.len() <= 256 && a.iter().all(Value::is_u64));
                    (FIELDS.contains(&k.as_str()) && valid).then(|| (k.clone(), v.clone()))
                })
                .collect::<serde_json::Map<String, Value>>()
        })
        .unwrap_or_default();
    json!({"timestamp":chrono::Utc::now().to_rfc3339(),"appVersion":env!("CARGO_PKG_VERSION"),"level":if value["level"]=="ERROR" {"ERROR"} else if value["level"]=="WARN" {"WARN"} else {"INFO"},"event":identifier(&value["event"]).unwrap_or("APP_OPERATION_FAILED"),"stage":identifier(&value["stage"]).unwrap_or("unknown"),"operationId":identifier(&value["operationId"]).unwrap_or("unknown"),"attributes":attrs})
}
fn append(dir: &Path, value: &Value, limit: u64) -> std::io::Result<()> {
    let _guard = LOCK
        .lock()
        .map_err(|_| std::io::Error::other("logger lock"))?;
    fs::create_dir_all(dir)?;
    for entry in fs::read_dir(dir)?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("diagnostics")
            && name.ends_with(".jsonl")
            && entry
                .metadata()?
                .modified()?
                .elapsed()
                .unwrap_or_default()
                .as_secs()
                > DAYS
        {
            fs::remove_file(entry.path())?;
        }
    }
    let path = dir.join("diagnostics.jsonl");
    if fs::metadata(&path)
        .map(|m| m.len() >= limit)
        .unwrap_or(false)
    {
        let oldest = dir.join(format!("diagnostics.{}.jsonl", KEEP - 1));
        if oldest.exists() {
            fs::remove_file(oldest)?;
        }
        for i in (1..KEEP - 1).rev() {
            let old = dir.join(format!("diagnostics.{i}.jsonl"));
            if old.exists() {
                fs::rename(old, dir.join(format!("diagnostics.{}.jsonl", i + 1)))?;
            }
        }
        fs::rename(&path, dir.join("diagnostics.1.jsonl"))?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    writeln!(file, "{}", sanitize(value))
}
pub fn record(root: &Path, value: Value) {
    let _ = append(&root.join("logs"), &value, MAX_BYTES);
}
pub fn read(root: &Path) -> Result<String, String> {
    let _guard = LOCK.lock().map_err(|_| "日志暂不可用")?;
    let mut records = Vec::new();
    for i in (0..KEEP).rev() {
        let name = if i == 0 {
            "diagnostics.jsonl".to_string()
        } else {
            format!("diagnostics.{i}.jsonl")
        };
        if let Ok(file) = fs::File::open(root.join("logs").join(name)) {
            use std::io::{BufRead, BufReader};
            for line in BufReader::new(file).lines().map_while(Result::ok) {
                if serde_json::from_str::<Value>(&line).is_ok() {
                    records.push(line);
                    if records.len() > 200 {
                        records.remove(0);
                    }
                }
            }
        }
    }
    Ok(records.join("\n"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn drops_secrets_and_arbitrary_text() {
        let v = sanitize(
            &json!({"event":"X","operationId":"ok","attributes":{"key":"secret","rule":"body with spaces","blockId":60,"model":"glm-5.3-flash"},"message":"secret"}),
        );
        assert!(v.get("message").is_none());
        assert_eq!(v["attributes"]["blockId"], 60);
        assert!(v["attributes"].get("key").is_none());
        assert!(v["attributes"].get("rule").is_none());
    }
    #[test]
    fn rotates_and_write_failure_isolated() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let dir = root.join("logs");
        for _ in 0..10 {
            append(&dir, &json!({"event":"TEST"}), 1).unwrap();
        }
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 5);
        assert_eq!(read(&root).unwrap().lines().count(), 5);
        let blocked = root.join("file");
        fs::write(&blocked, "x").unwrap();
        record(&blocked, json!({"event":"FAIL"}));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn expired_logs_are_removed_without_touching_other_files() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let dir = root.join("logs");
        fs::create_dir_all(&dir).unwrap();
        let old = dir.join("diagnostics.1.jsonl");
        fs::write(&old, "{}\n").unwrap();
        fs::File::open(&old)
            .unwrap()
            .set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(DAYS + 60))
            .unwrap();
        fs::write(dir.join("keep.txt"), "x").unwrap();
        record(&root, json!({"event":"TEST"}));
        assert!(!old.exists());
        assert!(dir.join("keep.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
