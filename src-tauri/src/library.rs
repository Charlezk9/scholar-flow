//! v1.4 · 文献模块数据层（`LIT-02` ~ `LIT-08`）
//!
//! 分工：**表结构**在 `db.rs::migrate()` 里建（含迁移前兜底备份）；这里只放行为：
//! 文件夹树、文献条目、附件（拷贝入库 + sha256 去重）、提取产物与标签。
//!
//! 纪律（沿用既有教训）：
//! - 整条覆写的接口必须区分「省略 = 保持原状」（`PaperInput::status` 即 `Option`）。
//! - 文件访问一律过 Rust：路径必须在数据目录内（防目录穿越）。
//! - 提取产物**只增不改**，同一引擎同源文件才有缓存复用。

use crate::db::{now_iso, table_exists, Db};
use crate::models::{
    LibraryNode, LibraryNodeInput, Paper, PaperExtract, PaperExtractInput, PaperFile,
    PaperFileInput, PaperInput, Tag,
};
use rusqlite::{params, Connection, OptionalExtension, Row};
use sha2::{Digest, Sha256};
use std::path::{Component, Path, PathBuf};

const KINDS: [&str; 4] = ["paper", "textbook", "magazine", "other"];
const STATUSES: [&str; 3] = ["unread", "reading", "read"];
const ROLES: [&str; 4] = ["main", "supplement", "slides", "other"];
const EXTRACT_STATUSES: [&str; 4] = ["queued", "running", "done", "failed"];

// ---------------------------------------------------------------- 行映射

fn node_from_row(r: &Row<'_>) -> rusqlite::Result<LibraryNode> {
    Ok(LibraryNode {
        id: r.get(0)?,
        parent_id: r.get(1)?,
        name: r.get(2)?,
        sort_order: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
    })
}

fn paper_from_row(r: &Row<'_>) -> rusqlite::Result<Paper> {
    Ok(Paper {
        id: r.get(0)?,
        node_id: r.get(1)?,
        kind: r.get(2)?,
        title: r.get(3)?,
        authors: r.get(4)?,
        year: r.get(5)?,
        venue: r.get(6)?,
        doi: r.get(7)?,
        url: r.get(8)?,
        status: r.get(9)?,
        note: r.get(10)?,
        extra: r.get(11)?,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
    })
}

fn file_from_row(r: &Row<'_>) -> rusqlite::Result<PaperFile> {
    Ok(PaperFile {
        id: r.get(0)?,
        paper_id: r.get(1)?,
        role: r.get(2)?,
        original_path: r.get(3)?,
        rel_path: r.get(4)?,
        size: r.get(5)?,
        sha256: r.get(6)?,
        missing: r.get::<_, i64>(7)? != 0,
        created_at: r.get(8)?,
        updated_at: r.get(9)?,
    })
}

fn extract_from_row(r: &Row<'_>) -> rusqlite::Result<PaperExtract> {
    Ok(PaperExtract {
        id: r.get(0)?,
        paper_id: r.get(1)?,
        file_id: r.get(2)?,
        engine: r.get(3)?,
        engine_version: r.get(4)?,
        source_sha256: r.get(5)?,
        rel_path: r.get(6)?,
        status: r.get(7)?,
        pages: r.get(8)?,
        chars: r.get(9)?,
        quality: r.get(10)?,
        meta: r.get(11)?,
        error: r.get(12)?,
        created_at: r.get(13)?,
        updated_at: r.get(14)?,
    })
}

fn tag_from_row(r: &Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: r.get(0)?,
        name: r.get(1)?,
        color: r.get(2)?,
        created_at: r.get(3)?,
    })
}

// ---------------------------------------------------------------- 查询（供备份复用）

pub(crate) fn list_nodes_with(conn: &Connection) -> Result<Vec<LibraryNode>, String> {
    let mut stmt = conn
        .prepare("SELECT id,parent_id,name,sort_order,created_at,updated_at FROM library_nodes ORDER BY parent_id IS NOT NULL, sort_order, name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], node_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub(crate) fn list_papers_with(conn: &Connection) -> Result<Vec<Paper>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id,node_id,kind,title,authors,year,venue,doi,url,status,note,extra,created_at,updated_at \
             FROM papers ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], paper_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub(crate) fn list_files_with(conn: &Connection) -> Result<Vec<PaperFile>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id,paper_id,role,original_path,rel_path,size,sha256,missing,created_at,updated_at \
             FROM paper_files ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], file_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub(crate) fn list_extracts_with(conn: &Connection) -> Result<Vec<PaperExtract>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id,paper_id,file_id,engine,engine_version,source_sha256,rel_path,status,pages,chars,quality,meta,error,created_at,updated_at \
             FROM paper_extracts ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], extract_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

pub(crate) fn list_tags_with(conn: &Connection) -> Result<Vec<Tag>, String> {
    let mut stmt = conn
        .prepare("SELECT id,name,color,created_at FROM tags ORDER BY name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], tag_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// 备份用的文献模块负载。表不存在（老库）时全为空数组。
pub(crate) fn library_payload(
    conn: &Connection,
) -> Result<Vec<(String, serde_json::Value)>, String> {
    let mut out: Vec<(String, serde_json::Value)> = Vec::new();
    let probes: [(&str, &str); 5] = [
        ("libraryNodes", "library_nodes"),
        ("papers", "papers"),
        ("paperFiles", "paper_files"),
        ("paperExtracts", "paper_extracts"),
        ("tags", "tags"),
    ];
    for (key, table) in probes {
        if !table_exists(conn, table)? {
            out.push((key.to_string(), serde_json::json!([])));
            continue;
        }
        let value = match key {
            "libraryNodes" => serde_json::to_value(list_nodes_with(conn)?),
            "papers" => serde_json::to_value(list_papers_with(conn)?),
            "paperFiles" => serde_json::to_value(list_files_with(conn)?),
            "paperExtracts" => serde_json::to_value(list_extracts_with(conn)?),
            _ => serde_json::to_value(list_tags_with(conn)?),
        }
        .map_err(|e| e.to_string())?;
        out.push((key.to_string(), value));
    }
    if table_exists(conn, "paper_tags")? {
        let mut statement = conn
            .prepare("SELECT paper_id,tag_id FROM paper_tags ORDER BY paper_id,tag_id")
            .map_err(|e| e.to_string())?;
        let links = statement.query_map([], |r| Ok(serde_json::json!({"paperId":r.get::<_,String>(0)?,"tagId":r.get::<_,String>(1)?}))).map_err(|e| e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e| e.to_string())?;
        out.push(("paperTags".into(), serde_json::json!(links)));
    }
    Ok(out)
}

// ---------------------------------------------------------------- 校验与工具

fn validate_node_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    let len = trimmed.chars().count();
    if !(1..=60).contains(&len) {
        return Err("文件夹名须为 1–60 个字符".into());
    }
    Ok(trimmed.to_string())
}

fn normalize_role(role: Option<&str>) -> Result<String, String> {
    let role = role.unwrap_or("main");
    if !ROLES.contains(&role) {
        return Err(format!("附件类型无效：{role}"));
    }
    Ok(role.to_string())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("读取文件失败: {e}"))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

/// 把相对路径解析回数据目录内；越界即拒绝（防目录穿越）。
fn resolve_inside(dir: &Path, rel: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(rel);
    if candidate.is_absolute() || candidate.components().any(|c| c == Component::ParentDir) {
        return Err("路径越界".into());
    }
    Ok(dir.join(candidate))
}

/// 仅保留文件名，去掉任何目录成分。

/// 绝对路径 → 相对数据目录（落库用）
fn rel_to_dir(dir: &Path, abs: &Path) -> String {
    abs.strip_prefix(dir)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| abs.to_string_lossy().to_string())
}

fn safe_file_name(src: &Path) -> String {
    src.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into())
}

/// **存储约定（用户硬要求）**：提取稿必须持久化，且**与 PDF 放在一起** ——
/// 同一目录、同一主干名：`<pdf 主干>.<engine>.md`（元数据为 `.meta.json`）。
/// PDF 与提取稿共同构成该文献项的「补充内容」，所以两者生命周期绑定。
pub(crate) fn sibling_rel(pdf_rel: &str, suffix: &str) -> String {
    let path = Path::new(pdf_rel);
    let dir = path
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "paper".into());
    let name = format!("{stem}{suffix}");
    if dir.is_empty() {
        name
    } else {
        format!("{dir}/{name}")
    }
}

/// 提取稿的落盘相对路径（与 PDF 同目录）
pub(crate) fn extract_md_rel(pdf_rel: &str, engine: &str) -> String {
    sibling_rel(pdf_rel, &format!(".{engine}.md"))
}

/// 提取元数据的落盘相对路径（与 PDF 同目录）
pub(crate) fn extract_meta_rel(pdf_rel: &str, engine: &str) -> String {
    sibling_rel(pdf_rel, &format!(".{engine}.meta.json"))
}

// ---------------------------------------------------------------- 行为

impl Db {
    // ---------- 文件夹树 ----------

    pub fn list_library_nodes(&self) -> Result<Vec<LibraryNode>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        list_nodes_with(&conn)
    }

    /// 新建 / 重命名 / 移动。`parentId` 为 `None` 即根级。
    pub fn save_library_node(&self, input: LibraryNodeInput) -> Result<LibraryNode, String> {
        let name = validate_node_name(&input.name)?;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_iso();
        let id = match input.id.as_deref() {
            Some(existing) if !existing.trim().is_empty() => existing.to_string(),
            _ => uuid::Uuid::new_v4().to_string(),
        };

        if let Some(parent) = input.parent_id.as_deref() {
            if parent == id {
                return Err("不能把自己作为上级文件夹".into());
            }
            let exists: Option<String> = conn
                .query_row(
                    "SELECT id FROM library_nodes WHERE id=?1",
                    params![parent],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if exists.is_none() {
                return Err("上级文件夹不存在".into());
            }
            // 自环检测：沿着祖先往上走，撞到自己就是循环
            let mut cursor = Some(parent.to_string());
            while let Some(cur) = cursor {
                if cur == id {
                    return Err("不能移动到自己的子文件夹里".into());
                }
                cursor = conn
                    .query_row(
                        "SELECT parent_id FROM library_nodes WHERE id=?1",
                        params![cur],
                        |r| r.get::<_, Option<String>>(0),
                    )
                    .optional()
                    .map_err(|e| e.to_string())?
                    .flatten();
            }
        }

        let is_update: bool = conn
            .query_row(
                "SELECT 1 FROM library_nodes WHERE id=?1",
                params![id],
                |_| Ok(true),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(false);

        if is_update {
            let sort_order = match input.sort_order {
                Some(v) => v,
                None => conn
                    .query_row(
                        "SELECT sort_order FROM library_nodes WHERE id=?1",
                        params![id],
                        |r| r.get(0),
                    )
                    .map_err(|e| e.to_string())?,
            };
            conn.execute(
                "UPDATE library_nodes SET parent_id=?2, name=?3, sort_order=?4, updated_at=?5 WHERE id=?1",
                params![id, input.parent_id, name, sort_order, now],
            )
            .map_err(|e| e.to_string())?;
        } else {
            let sort_order = match input.sort_order {
                Some(v) => v,
                None => conn
                    .query_row(
                        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM library_nodes \
                         WHERE (parent_id IS ?1)",
                        params![input.parent_id],
                        |r| r.get::<_, i64>(0),
                    )
                    .map_err(|e| e.to_string())?,
            };
            conn.execute(
                "INSERT INTO library_nodes(id,parent_id,name,sort_order,created_at,updated_at) \
                 VALUES(?1,?2,?3,?4,?5,?5)",
                params![id, input.parent_id, name, sort_order, now],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.query_row(
            "SELECT id,parent_id,name,sort_order,created_at,updated_at FROM library_nodes WHERE id=?1",
            params![id],
            node_from_row,
        )
        .map_err(|e| e.to_string())
    }

    /// 删除文件夹：子文件夹级联删除；其中的文献变成「未分类」（`ON DELETE SET NULL`）。
    pub fn delete_library_node(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM library_nodes WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ---------- 文献条目 ----------

    pub fn list_papers(&self) -> Result<Vec<Paper>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        list_papers_with(&conn)
    }

    pub fn save_paper(&self, input: PaperInput) -> Result<Paper, String> {
        let title = input.title.trim();
        let title_len = title.chars().count();
        if !(1..=200).contains(&title_len) {
            return Err("标题须为 1–200 个字符".into());
        }
        if !KINDS.contains(&input.kind.as_str()) {
            return Err(format!("文献类别无效：{}", input.kind));
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_iso();
        let id = match input.id.as_deref() {
            Some(existing) if !existing.trim().is_empty() => existing.to_string(),
            _ => uuid::Uuid::new_v4().to_string(),
        };
        // 标题必须唯一（用户要求「不能重复」）：归一化 = trim + 大小写不敏感
        let clash: Option<String> = conn
            .query_row(
                "SELECT id FROM papers WHERE lower(trim(title)) = lower(trim(?1)) AND id <> ?2 LIMIT 1",
                params![title, id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if clash.is_some() {
            return Err("已有一篇同名文献，标题不能重复".into());
        }
        if let Some(year) = input.year {
            if !(1000..=3000).contains(&year) {
                return Err("年份超出范围".into());
            }
        }
        if let Some(node_id) = input.node_id.as_deref() {
            let exists: Option<String> = conn
                .query_row(
                    "SELECT id FROM library_nodes WHERE id=?1",
                    params![node_id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            if exists.is_none() {
                return Err("目标文件夹不存在".into());
            }
        }

        let is_update: bool = conn
            .query_row("SELECT 1 FROM papers WHERE id=?1", params![id], |_| {
                Ok(true)
            })
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(false);

        if is_update {
            // 状态省略 = 保持原状（与 v1.0 的 crowned / v1.1 的 sortOrder 同一条教训）
            let status = match input.status.as_deref() {
                Some(s) => {
                    if !STATUSES.contains(&s) {
                        return Err(format!("阅读状态无效：{s}"));
                    }
                    s.to_string()
                }
                None => conn
                    .query_row("SELECT status FROM papers WHERE id=?1", params![id], |r| {
                        r.get(0)
                    })
                    .map_err(|e| e.to_string())?,
            };
            conn.execute(
                "UPDATE papers SET node_id=?2, kind=?3, title=?4, authors=?5, year=?6, venue=?7, \
                 doi=?8, url=?9, status=?10, note=?11, extra=?12, updated_at=?13 WHERE id=?1",
                params![
                    id,
                    input.node_id,
                    input.kind,
                    title,
                    input.authors,
                    input.year,
                    input.venue,
                    input.doi,
                    input.url,
                    status,
                    input.note,
                    input.extra,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            let status = input.status.as_deref().unwrap_or("unread");
            if !STATUSES.contains(&status) {
                return Err(format!("阅读状态无效：{status}"));
            }
            conn.execute(
                "INSERT INTO papers(id,node_id,kind,title,authors,year,venue,doi,url,status,note,extra,created_at,updated_at) \
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13)",
                params![
                    id,
                    input.node_id,
                    input.kind,
                    title,
                    input.authors,
                    input.year,
                    input.venue,
                    input.doi,
                    input.url,
                    status,
                    input.note,
                    input.extra,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.query_row(
            "SELECT id,node_id,kind,title,authors,year,venue,doi,url,status,note,extra,created_at,updated_at \
             FROM papers WHERE id=?1",
            params![id],
            paper_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn delete_paper(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM papers WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ---------- 附件（拷贝入库） ----------

    pub fn list_paper_files(&self) -> Result<Vec<PaperFile>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        list_files_with(&conn)
    }

    /// 导入附件：校验 → 拷贝进数据目录 → 记 sha256。
    /// 同一篇文献里相同 sha256 的文件视为重复，直接返回既有记录（幂等）。
    pub fn import_paper_file(&self, input: PaperFileInput) -> Result<PaperFile, String> {
        let role = normalize_role(input.role.as_deref())?;
        let src = PathBuf::from(&input.src_path);
        if !src.is_file() {
            return Err(format!("文件不存在：{}", input.src_path));
        }
        let meta = std::fs::metadata(&src).map_err(|e| format!("读取文件信息失败: {e}"))?;
        const MAX_BYTES: u64 = 300 * 1024 * 1024;
        if meta.len() > MAX_BYTES {
            return Err("单个附件不得超过 300 MB".into());
        }
        let sha = sha256_file(&src)?;

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let paper_exists: Option<String> = conn
            .query_row(
                "SELECT id FROM papers WHERE id=?1",
                params![input.paper_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if paper_exists.is_none() {
            return Err("文献不存在".into());
        }

        if let Some(existing) = conn
            .query_row(
                "SELECT id,paper_id,role,original_path,rel_path,size,sha256,missing,created_at,updated_at \
                 FROM paper_files WHERE paper_id=?1 AND sha256=?2",
                params![input.paper_id, sha],
                file_from_row,
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            return Ok(existing);
        }

        if src.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("pdf")) {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM paper_files WHERE paper_id=?1 AND lower(rel_path) LIKE '%.pdf'",
                params![input.paper_id], |r| r.get(0),
            ).map_err(|e| e.to_string())?;
            if count > 0 { return Err("每条文献只能有一个 PDF 源，请先清空现有 PDF 源".into()); }
        }

        let dir = self.dir.join("files").join("papers").join(&input.paper_id);
        std::fs::create_dir_all(&dir).map_err(|e| format!("创建附件目录失败: {e}"))?;
        let short = &sha[..8.min(sha.len())];
        let target = dir.join(format!("{short}-{}", safe_file_name(&src)));
        std::fs::copy(&src, &target).map_err(|e| format!("拷贝文件失败: {e}"))?;

        let rel_path = format!(
            "files/papers/{}/{}",
            input.paper_id,
            target
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default()
        );
        let id = uuid::Uuid::new_v4().to_string();
        let now = now_iso();
        conn.execute(
            "INSERT INTO paper_files(id,paper_id,role,original_path,rel_path,size,sha256,missing,created_at,updated_at) \
             VALUES(?1,?2,?3,?4,?5,?6,?7,0,?8,?8)",
            params![
                id,
                input.paper_id,
                role,
                input.src_path,
                rel_path,
                meta.len() as i64,
                sha,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT id,paper_id,role,original_path,rel_path,size,sha256,missing,created_at,updated_at \
             FROM paper_files WHERE id=?1",
            params![id],
            file_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn delete_paper_file(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rel: Option<String> = conn
            .query_row(
                "SELECT rel_path FROM paper_files WHERE id=?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM paper_files WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        if let Some(rel) = rel {
            if let Ok(abs) = resolve_inside(&self.dir, &rel) {
                // 提取稿与 PDF 同主干名：删附件时一并清掉，避免留下孤儿产物
                for suffix in [
                    ".fast.md",
                    ".glm.md",
                    ".fast.meta.json",
                    ".glm.meta.json",
                    ".markitdown.md",
                    ".markitdown.meta.json",
                    ".layout.md",
                    ".translation.md",
                    ".translation.meta.json",
                    ".translation.checkpoint.json",
                    ".translation.progress.json",
                    ".layout.meta.json",
                ] {
                    if let Ok(sibling) = resolve_inside(&self.dir, &sibling_rel(&rel, suffix)) {
                        let _ = std::fs::remove_file(sibling);
                    }
                }
                let assets = sibling_rel(&rel, ".layout.assets");
                if let Ok(path) = resolve_inside(&self.dir, &assets) {
                    let _ = std::fs::remove_dir_all(path);
                }
                let _ = std::fs::remove_file(abs);
            }
        }
        Ok(())
    }

    /// 读取附件字节（前端据此渲染 PDF）；文件不在时把 `missing` 置位并报错。
    pub fn read_paper_file(&self, id: &str) -> Result<Vec<u8>, String> {
        let (rel, abs) = {
            let conn = self.conn.lock().map_err(|e| e.to_string())?;
            let rel: Option<String> = conn
                .query_row(
                    "SELECT rel_path FROM paper_files WHERE id=?1",
                    params![id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let rel = rel.ok_or_else(|| "附件不存在".to_string())?;
            let abs = resolve_inside(&self.dir, &rel)?;
            (rel, abs)
        };
        match std::fs::read(&abs) {
            Ok(bytes) => Ok(bytes),
            Err(e) => {
                let conn = self.conn.lock().map_err(|e| e.to_string())?;
                let _ = conn.execute(
                    "UPDATE paper_files SET missing=1, updated_at=?2 WHERE rel_path=?1",
                    params![rel, now_iso()],
                );
                Err(format!("附件已丢失（{}）：{e}", abs.to_string_lossy()))
            }
        }
    }

    /// 附件的绝对路径——供提取脚本读取。
    pub fn paper_file_abs_path(&self, id: &str) -> Result<PathBuf, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rel: Option<String> = conn
            .query_row(
                "SELECT rel_path FROM paper_files WHERE id=?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let rel = rel.ok_or_else(|| "附件不存在".to_string())?;
        resolve_inside(&self.dir, &rel)
    }

    // ---------- 提取产物 ----------

    pub fn list_paper_extracts(&self, paper_id: Option<&str>) -> Result<Vec<PaperExtract>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut all = list_extracts_with(&conn)?;
        if let Some(pid) = paper_id {
            all.retain(|e| e.paper_id == pid);
        }
        Ok(all)
    }

    pub fn save_paper_extract(&self, input: PaperExtractInput) -> Result<PaperExtract, String> {
        let engine = input.engine.trim();
        if engine.is_empty() {
            return Err("引擎名不能为空".into());
        }
        if !EXTRACT_STATUSES.contains(&input.status.as_str()) {
            return Err(format!("提取状态无效：{}", input.status));
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_iso();
        let id = match input.id.as_deref() {
            Some(existing) if !existing.trim().is_empty() => existing.to_string(),
            _ => uuid::Uuid::new_v4().to_string(),
        };
        conn.execute(
            "INSERT INTO paper_extracts(id,paper_id,file_id,engine,engine_version,source_sha256,rel_path,status,pages,chars,quality,meta,error,created_at,updated_at) \
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14) \
             ON CONFLICT(id) DO UPDATE SET status=excluded.status, pages=excluded.pages, chars=excluded.chars, \
             quality=excluded.quality, meta=excluded.meta, error=excluded.error, rel_path=excluded.rel_path, updated_at=excluded.updated_at",
            params![
                id,
                input.paper_id,
                input.file_id,
                engine,
                input.engine_version,
                input.source_sha256,
                input.rel_path,
                input.status,
                input.pages,
                input.chars,
                input.quality,
                input.meta,
                input.error,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id,paper_id,file_id,engine,engine_version,source_sha256,rel_path,status,pages,chars,quality,meta,error,created_at,updated_at \
             FROM paper_extracts WHERE id=?1",
            params![id],
            extract_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn delete_paper_extract(&self, id: &str) -> Result<(), String> {
        let dependents: Vec<String> = self.list_paper_extracts(None)?.into_iter().filter(|e| {
            e.engine == "translation" && serde_json::from_str::<serde_json::Value>(e.meta.as_deref().unwrap_or("{}"))
                .is_ok_and(|meta| meta["sourceExtractId"].as_str() == Some(id))
        }).map(|e| e.id).collect();
        for dependent in dependents { if dependent != id { self.delete_paper_extract(&dependent)?; } }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rel: Option<String> = conn.query_row("SELECT rel_path FROM paper_extracts WHERE id=?1", params![id], |r| r.get(0)).optional().map_err(|e| e.to_string())?.flatten();
        if let Some(rel) = rel {
            if let Ok(path) = resolve_inside(&self.dir, &rel) {
                if path.exists() { std::fs::remove_file(&path).map_err(|e| e.to_string())?; }
                let meta = path.with_extension("meta.json");
                if meta.exists() { std::fs::remove_file(meta).map_err(|e| e.to_string())?; }
                if path.file_name().is_some_and(|n| n.to_string_lossy().ends_with(".translation.md")) {
                    for suffix in ["checkpoint.json","progress.json"] {
                        let auxiliary=path.with_extension(suffix);
                        if auxiliary.exists() {std::fs::remove_file(auxiliary).map_err(|e| e.to_string())?;}
                    }
                }
                let assets = path.with_extension("assets");
                if assets.exists() { std::fs::remove_dir_all(assets).map_err(|e| e.to_string())?; }
            }
        }
        conn.execute("DELETE FROM paper_extracts WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 读取提取产物（Markdown 文本）。
    pub fn read_paper_extract(&self, id: &str) -> Result<String, String> {
        let rel = {
            let conn = self.conn.lock().map_err(|e| e.to_string())?;
            let rel: Option<Option<String>> = conn
                .query_row(
                    "SELECT rel_path FROM paper_extracts WHERE id=?1",
                    params![id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            rel.ok_or_else(|| "提取记录不存在".to_string())?
                .ok_or_else(|| "该记录没有产物文件".to_string())?
        };
        let abs = resolve_inside(&self.dir, &rel)?;
        std::fs::read_to_string(&abs).map_err(|e| format!("读取产物失败: {e}"))
    }

    pub fn translation_progress(&self, paper_id: &str, file_id: Option<&str>) -> Result<Option<serde_json::Value>, String> {
        let file = self.list_paper_files()?.into_iter()
            .find(|f| f.paper_id == paper_id && file_id.is_none_or(|id| f.id == id)).ok_or("源附件不存在")?;
        let path = resolve_inside(&self.dir, &extract_md_rel(&file.rel_path,"translation"))?.with_extension("progress.json");
        let path = resolve_inside(&self.dir, &rel_to_dir(&self.dir,&path))?;
        let Ok(text) = std::fs::read_to_string(path) else {return Ok(None);};
        let data: serde_json::Value = serde_json::from_str(&text).map_err(|_| "进度数据无效")?;
        let completed=data["completed"].as_u64().ok_or("进度数据无效")?;
        let total=data["total"].as_u64().filter(|n| *n>0 && *n>=completed).ok_or("进度数据无效")?;
        let stage=data["stage"].as_str().filter(|s| ["translating","retrying","failed","done"].contains(s)).ok_or("进度数据无效")?;
        Ok(Some(serde_json::json!({"completed":completed,"total":total,"stage":stage,"updatedAt":data["updatedAt"]})))
    }

    /// 对照全文只保存在译稿旁的侧文件，数据库/JSON备份仅存来源关系。
    pub fn read_translation_blocks(&self, id: &str) -> Result<serde_json::Value, String> {
        let extract = self.list_paper_extracts(None)?.into_iter()
            .find(|e| e.id == id && e.engine == "translation" && e.status == "done")
            .ok_or("译稿不存在")?;
        let path = resolve_inside(&self.dir, extract.rel_path.as_deref().ok_or("译稿路径缺失")?)?;
        let metadata = resolve_inside(&self.dir, &rel_to_dir(&self.dir, &path.with_extension("meta.json")))?;
        let value: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(metadata).map_err(|_| "段落映射文件缺失")?).map_err(|_| "段落映射文件无效")?;
        let blocks = value.get("blocks").filter(|v| v.is_array()).ok_or("段落映射缺失")?;
        let items = blocks.as_array().ok_or("段落映射缺失")?;
        if items.is_empty() || items.iter().enumerate().any(|(index, block)| {
            block["id"].as_u64() != Some(index as u64)
                || !block["source"].as_str().is_some_and(|s| !s.trim().is_empty())
                || !block["translation"].as_str().is_some_and(|s| !s.trim().is_empty())
        }) { return Err("段落映射无效".into()); }
        Ok(blocks.clone())
    }

    /// 只读取登记的图片资产；规范化后检查符号链接边界。
    pub fn read_paper_asset(&self, id: &str, asset: &str) -> Result<Vec<u8>, String> {
        let extracts = self.list_paper_extracts(None)?;
        let extract = extracts
            .iter()
            .find(|e| e.id == id && e.status == "done")
            .ok_or("产物不存在")?;
        let meta: serde_json::Value = serde_json::from_str(extract.meta.as_deref().unwrap_or("{}"))
            .map_err(|_| "资产元数据无效")?;
        if !meta["assets"].as_array().is_some_and(|items| {
            items
                .iter()
                .any(|item| item["path"].as_str() == Some(asset))
        }) {
            return Err("未登记的图片资产".into());
        }
        let md = resolve_inside(
            &self.dir,
            extract.rel_path.as_deref().ok_or("产物文件缺失")?,
        )?;
        let directory = md
            .with_extension("assets")
            .canonicalize()
            .map_err(|_| "图片目录缺失")?;
        let path = resolve_inside(md.parent().ok_or("产物路径无效")?, asset)?
            .canonicalize()
            .map_err(|_| "图片缺失")?;
        let root = self.dir.canonicalize().map_err(|e| e.to_string())?;
        if !directory.starts_with(&root)
            || !path.starts_with(&directory)
            || path.extension().and_then(|x| x.to_str()) != Some("png")
        {
            return Err("图片路径越界".into());
        }
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err("图片格式无效".into());
        }
        Ok(bytes)
    }

    /// 提取产物的存放目录（脚本写文件用），相对数据目录。
    pub fn extract_dir_rel(&self, paper_id: &str) -> String {
        format!("files/papers/{paper_id}/extract")
    }

    // ---------- 标签 ----------

    pub fn list_tags(&self) -> Result<Vec<Tag>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        list_tags_with(&conn)
    }

    /// 按名字取标签（不存在则创建）——幂等，方便「边输入边打标签」。
    pub fn ensure_tag(&self, name: &str) -> Result<Tag, String> {
        let name = name.trim();
        let len = name.chars().count();
        if !(1..=24).contains(&len) {
            return Err("标签须为 1–24 个字符".into());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if let Some(tag) = conn
            .query_row(
                "SELECT id,name,color,created_at FROM tags WHERE name=?1",
                params![name],
                tag_from_row,
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            return Ok(tag);
        }
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO tags(id,name,color,created_at) VALUES(?1,?2,NULL,?3)",
            params![id, name, now_iso()],
        )
        .map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id,name,color,created_at FROM tags WHERE id=?1",
            params![id],
            tag_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn list_paper_tags(&self, paper_id: &str) -> Result<Vec<Tag>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT t.id,t.name,t.color,t.created_at FROM tags t JOIN paper_tags pt ON pt.tag_id=t.id WHERE pt.paper_id=?1 ORDER BY t.name").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map(params![paper_id], tag_from_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(rows)
    }
    pub fn set_paper_tag(
        &self,
        paper_id: &str,
        tag_id: &str,
        attached: bool,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if attached {
            conn.execute(
                "INSERT OR IGNORE INTO paper_tags(paper_id,tag_id) VALUES(?1,?2)",
                params![paper_id, tag_id],
            )
        } else {
            conn.execute(
                "DELETE FROM paper_tags WHERE paper_id=?1 AND tag_id=?2",
                params![paper_id, tag_id],
            )
        }
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ---------- 提取（LIT-07 / LIT-08） ----------

    /// 跑一次提取：调用 `scripts/extract_markdown.py`，产物写盘，结果落 `paper_extracts`。
    ///
    /// 缓存：同一篇 + 同一引擎 + 同一源 sha256 已有成功记录则直接复用（只增不改）。
    /// Python 与脚本路径可用 `RUNNINGDO_PY` / `RUNNINGDO_EXTRACT_SCRIPT` 覆盖（打包阶段再定策略）。
    pub fn run_extract(&self, paper_id: &str, engine: &str) -> Result<PaperExtract, String> {
        self.run_extract_file(paper_id, engine, None)
    }

    pub fn run_extract_file(
        &self,
        paper_id: &str,
        engine: &str,
        requested_file: Option<&str>,
    ) -> Result<PaperExtract, String> {
        let engine = engine.trim();
        if !["fast", "glm", "markitdown", "layout", "translation"].contains(&engine) {
            return Err(format!("未知引擎：{engine}"));
        }

        let (file_id, mut sha, abs) = {
            let conn = self.conn.lock().map_err(|e| e.to_string())?;
            let row: Option<(String, Option<String>, String)> = conn
                .query_row(
                    "SELECT id,sha256,rel_path FROM paper_files WHERE paper_id=?1 AND (?2 IS NULL OR id=?2) ORDER BY created_at ASC LIMIT 1",
                    params![paper_id, requested_file],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let (id, sha, rel) = row.ok_or_else(|| "这篇文献还没有附件".to_string())?;
            let abs = resolve_inside(&self.dir, &rel)?;
            (id, sha, abs)
        };
        if !abs.is_file() {
            return Err(format!("附件已丢失：{}", abs.to_string_lossy()));
        }

        let translation_source = if engine == "translation" {
            let source = self.list_paper_extracts(Some(paper_id))?.into_iter()
                .find(|e| e.engine == "layout" && e.status == "done" && e.file_id.as_deref() == Some(&file_id))
                .ok_or("请先完成Markdown整理")?;
            let content = self.read_paper_extract(&source.id)?;
            sha = Some(format!("{:x}", Sha256::digest(content.as_bytes())));
            Some(source)
        } else { None };

        if let Some(cached) = {
            let conn = self.conn.lock().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT id,paper_id,file_id,engine,engine_version,source_sha256,rel_path,status,pages,chars,quality,meta,error,created_at,updated_at \
                 FROM paper_extracts WHERE paper_id=?1 AND engine=?2 AND status='done' \
                 AND (source_sha256 IS ?3) AND file_id=?4 ORDER BY created_at DESC LIMIT 1",
                params![paper_id, engine, sha, file_id],
                extract_from_row,
            )
            .optional()
            .map_err(|e| e.to_string())?
        } {
            let source_matches = translation_source.as_ref().is_none_or(|source| {
                serde_json::from_str::<serde_json::Value>(cached.meta.as_deref().unwrap_or("{}"))
                    .is_ok_and(|meta| meta["sourceExtractId"].as_str() == Some(&source.id))
            });
            if source_matches && (translation_source.is_none() || self.read_translation_blocks(&cached.id).is_ok()) && cached
                .rel_path
                .as_ref()
                .is_some_and(|rel| resolve_inside(&self.dir, rel).is_ok_and(|p| p.is_file()))
            {
                return Ok(cached);
            }
        }

        // 产物与 PDF 同目录同主干名（用户硬要求：持久化 + 放在一起）
        let md_rel = extract_md_rel(&abs.to_string_lossy(), engine);
        let meta_rel = extract_meta_rel(&abs.to_string_lossy(), engine);
        let md_abs = self.dir.join(&md_rel);
        let meta_abs = self.dir.join(&meta_rel);
        if let Some(parent) = md_abs.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建产物目录失败: {e}"))?;
        }

        let py = std::env::var("RUNNINGDO_PY").unwrap_or_else(|_| {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../.conda/lit/bin/python")
                .to_string_lossy()
                .to_string()
        });
        let script = std::env::var("RUNNINGDO_EXTRACT_SCRIPT").unwrap_or_else(|_| {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../scripts/extract_markdown.py")
                .to_string_lossy()
                .to_string()
        });

        let raw = if let Some(source) = &translation_source {
            Some(resolve_inside(&self.dir, source.rel_path.as_deref().ok_or("整理稿文件缺失")?)?)
        } else if engine == "layout" {
            let extracts = self.list_paper_extracts(Some(paper_id))?;
            let source = extracts
                .iter()
                .find(|e| {
                    e.file_id.as_deref() == Some(&file_id)
                        && e.engine != "layout" && e.engine != "translation"
                        && e.status == "done"
                        && e.source_sha256 == sha
                })
                .ok_or("请先提取原稿")?;
            Some(resolve_inside(
                &self.dir,
                source.rel_path.as_deref().ok_or("原稿文件缺失")?,
            )?)
        } else {
            None
        };
        let mut command = std::process::Command::new(&py);
        command.arg(&script);
        if let Some(raw) = raw {
            command.arg("--raw").arg(raw);
        }
        let run = command
            .args(["--engine", engine])
            .arg("--in")
            .arg(&abs)
            .arg("--out")
            .arg(&md_abs)
            .arg("--meta")
            .arg(&meta_abs)
            .current_dir(&self.dir)
            .output()
            .map_err(|e| format!("无法启动提取器（{py}）：{e}"))?;

        if !run.status.success() {
            let stderr = String::from_utf8_lossy(&run.stderr);
            let tail: String = stderr
                .chars()
                .rev()
                .take(600)
                .collect::<String>()
                .chars()
                .rev()
                .collect();
            return self.save_paper_extract(PaperExtractInput {
                id: None,
                paper_id: paper_id.to_string(),
                file_id: Some(file_id),
                engine: engine.to_string(),
                engine_version: None,
                source_sha256: sha.clone(),
                rel_path: None,
                status: "failed".into(),
                pages: None,
                chars: None,
                quality: None,
                meta: None,
                error: Some(format!("{}：{}",if engine == "translation" {"翻译失败"} else {"提取失败"},tail.trim().trim_start_matches("提取失败："))),
            });
        }

        let meta_text = std::fs::read_to_string(&meta_abs).unwrap_or_default();
        let meta_json: serde_json::Value =
            serde_json::from_str(&meta_text).unwrap_or(serde_json::json!({}));
        let chars = meta_json["quality"]["chars"].as_i64();
        let pages = meta_json["quality"]["pages"].as_i64();
        let suggested = meta_json
            .get("suggested")
            .cloned()
            .unwrap_or(serde_json::json!({}));

        self.save_paper_extract(PaperExtractInput {
            id: None,
            paper_id: paper_id.to_string(),
            file_id: Some(file_id),
            engine: engine.to_string(),
            engine_version: meta_json["engine_version"].as_str().map(|s| s.to_string()),
            source_sha256: sha,
            rel_path: Some(rel_to_dir(&self.dir, &md_abs)),
            status: "done".into(),
            pages,
            chars,
            quality: Some(meta_json["quality"].to_string()),
            meta: Some(
                serde_json::json!({
                    "suggested": suggested,
                    "assets": meta_json.get("assets").cloned().unwrap_or(serde_json::json!([])),
                    "source": meta_json.get("source").cloned(),
                    "sourceExtractId": translation_source.as_ref().map(|s| &s.id),
                    "usage": meta_json.get("usage").cloned().unwrap_or(serde_json::json!({})),
                })
                .to_string(),
            ),
            error: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::PaperInput;

    fn tmp_db() -> (Db, PathBuf) {
        let dir = std::env::temp_dir().join(format!("rd-lit-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = Db::open(dir.join("t.db")).unwrap();
        (db, dir)
    }

    fn paper_input(title: &str) -> PaperInput {
        PaperInput {
            id: None,
            node_id: None,
            kind: "paper".into(),
            title: title.into(),
            authors: None,
            year: None,
            venue: None,
            doi: None,
            url: None,
            status: None,
            note: None,
            extra: None,
        }
    }

    fn node(db: &Db, parent: Option<&str>, name: &str) -> LibraryNode {
        db.save_library_node(LibraryNodeInput {
            id: None,
            parent_id: parent.map(|s| s.to_string()),
            name: name.into(),
            sort_order: None,
        })
        .unwrap()
    }

    #[test]
    fn tag_links_are_idempotent_backed_up_and_cascade() {
        let (db, _temp) = tmp_db();
        let paper = db.save_paper(paper_input("标签验证")).unwrap();
        let tag = db.ensure_tag("Transformer").unwrap();
        db.set_paper_tag(&paper.id, &tag.id, true).unwrap();
        db.set_paper_tag(&paper.id, &tag.id, true).unwrap();
        assert_eq!(db.list_paper_tags(&paper.id).unwrap().len(), 1);
        let path = db.export_json().unwrap();
        let j: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        assert_eq!(j["paperTags"].as_array().unwrap().len(), 1);
        db.set_paper_tag(&paper.id, &tag.id, false).unwrap();
        assert!(db.list_paper_tags(&paper.id).unwrap().is_empty());
        assert_eq!(db.list_tags().unwrap().len(), 1);
        db.set_paper_tag(&paper.id, &tag.id, true).unwrap();
        db.delete_paper(&paper.id).unwrap();
        assert!(db.list_paper_tags(&paper.id).unwrap().is_empty());
    }

    #[test]
    fn node_tree_crud_and_cascade() {
        let (db, _dir) = tmp_db();
        let root = node(&db, None, "读过的");
        let child = node(&db, Some(&root.id), "多模态");
        let grand = node(&db, Some(&child.id), "VLM");
        let nodes = db.list_library_nodes().unwrap();
        assert_eq!(nodes.len(), 3);

        // 重命名 + 移动
        let renamed = db
            .save_library_node(LibraryNodeInput {
                id: Some(grand.id.clone()),
                parent_id: Some(root.id.clone()),
                name: "  VLM（已归位） ".into(),
                sort_order: Some(0),
            })
            .unwrap();
        assert_eq!(renamed.name, "VLM（已归位）");
        assert_eq!(renamed.parent_id.as_deref(), Some(root.id.as_str()));

        // 删中间节点：子节点级联删除
        db.delete_library_node(&child.id).unwrap();
        assert_eq!(db.list_library_nodes().unwrap().len(), 2);
    }

    #[test]
    fn node_cannot_move_into_own_child() {
        let (db, _dir) = tmp_db();
        let root = node(&db, None, "根");
        let child = node(&db, Some(&root.id), "子");
        let err = db
            .save_library_node(LibraryNodeInput {
                id: Some(root.id.clone()),
                parent_id: Some(child.id.clone()),
                name: "根".into(),
                sort_order: None,
            })
            .unwrap_err();
        assert!(err.contains("子文件夹"), "实际：{err}");
    }

    #[test]
    fn deleting_node_keeps_papers_as_uncategorized() {
        let (db, _dir) = tmp_db();
        let folder = node(&db, None, "临时");
        let paper = db
            .save_paper(PaperInput {
                node_id: Some(folder.id.clone()),
                ..paper_input("Attention")
            })
            .unwrap();
        db.delete_library_node(&folder.id).unwrap();
        let papers = db.list_papers().unwrap();
        assert_eq!(papers.len(), 1);
        assert_eq!(papers[0].id, paper.id);
        assert!(papers[0].node_id.is_none(), "文献应落到「未分类」");
    }

    #[test]
    fn paper_validation_and_status_preserved_on_partial_save() {
        let (db, _dir) = tmp_db();
        assert!(db.save_paper(paper_input("   ")).is_err(), "空标题应被拒绝");
        assert!(db
            .save_paper(PaperInput {
                kind: "novel".into(),
                ..paper_input("书")
            })
            .is_err());

        let saved = db
            .save_paper(paper_input("Attention Is All You Need"))
            .unwrap();
        assert_eq!(saved.status, "unread");
        db.save_paper(PaperInput {
            id: Some(saved.id.clone()),
            status: Some("reading".into()),
            ..paper_input("Attention Is All You Need")
        })
        .unwrap();
        // 局部更新（省略 status）不得把状态重置
        let again = db
            .save_paper(PaperInput {
                id: Some(saved.id.clone()),
                venue: Some("NeurIPS".into()),
                ..paper_input("Attention Is All You Need")
            })
            .unwrap();
        assert_eq!(again.status, "reading");
        assert_eq!(again.venue.as_deref(), Some("NeurIPS"));
    }

    #[test]
    fn paper_titles_must_be_unique() {
        let (db, _dir) = tmp_db();
        db.save_paper(paper_input("Attention Is All You Need"))
            .unwrap();
        // 完全同名
        let err = db
            .save_paper(paper_input("Attention Is All You Need"))
            .unwrap_err();
        assert!(err.contains("不能重复"), "实际：{err}");
        // 前后空格 + 大小写差异也算重复
        assert!(db
            .save_paper(paper_input("  attention is all you need "))
            .is_err());
        // 不同标题可以建
        let other = db.save_paper(paper_input("BERT")).unwrap();
        // 改成与他人同名 → 拒绝
        let err = db
            .save_paper(PaperInput {
                id: Some(other.id.clone()),
                title: "Attention Is All You Need".into(),
                ..paper_input("BERT")
            })
            .unwrap_err();
        assert!(err.contains("不能重复"), "实际：{err}");
        // 原名保存自己不受影响
        db.save_paper(PaperInput {
            id: Some(other.id.clone()),
            venue: Some("NAACL".into()),
            ..paper_input("BERT")
        })
        .unwrap();
    }

    #[test]
    fn import_file_copies_and_dedupes_by_sha256() {
        let (db, dir) = tmp_db();
        let paper = db.save_paper(paper_input("论文")).unwrap();
        let src = dir.join("attention.pdf");
        std::fs::write(&src, b"%PDF-1.7 fake").unwrap();

        let first = db
            .import_paper_file(PaperFileInput {
                paper_id: paper.id.clone(),
                src_path: src.to_string_lossy().to_string(),
                role: None,
            })
            .unwrap();
        assert!(first.rel_path.starts_with("files/papers/"));
        assert!(first.sha256.is_some());
        assert!(dir.join(&first.rel_path).is_file(), "文件应被拷进数据目录");
        assert!(!first.missing);

        // 幂等：同 sha256 再导入返回同一条
        let second = db
            .import_paper_file(PaperFileInput {
                paper_id: paper.id.clone(),
                src_path: src.to_string_lossy().to_string(),
                role: None,
            })
            .unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(db.list_paper_files().unwrap().len(), 1);

        let other = dir.join("other.PDF");
        std::fs::write(&other, b"different source").unwrap();
        assert!(db.import_paper_file(PaperFileInput {paper_id:paper.id.clone(),src_path:other.to_string_lossy().into(),role:None}).unwrap_err().contains("一个 PDF 源"));

        // 读字节 + 缺失检测
        let bytes = db.read_paper_file(&first.id).unwrap();
        assert_eq!(bytes, b"%PDF-1.7 fake");
        std::fs::remove_file(dir.join(&first.rel_path)).unwrap();
        assert!(db.read_paper_file(&first.id).is_err());
        assert!(db.list_paper_files().unwrap()[0].missing);
    }

    #[test]
    fn import_rejects_missing_file_and_bad_role() {
        let (db, dir) = tmp_db();
        let paper = db.save_paper(paper_input("论文")).unwrap();
        assert!(db
            .import_paper_file(PaperFileInput {
                paper_id: paper.id.clone(),
                src_path: dir.join("nope.pdf").to_string_lossy().to_string(),
                role: None,
            })
            .is_err());
        let src = dir.join("a.pdf");
        std::fs::write(&src, b"x").unwrap();
        assert!(db
            .import_paper_file(PaperFileInput {
                paper_id: paper.id,
                src_path: src.to_string_lossy().to_string(),
                role: Some("cover".into()),
            })
            .is_err());
    }

    #[test]
    fn extract_records_round_trip_and_cascade() {
        let (db, _dir) = tmp_db();
        let paper = db.save_paper(paper_input("论文")).unwrap();
        let done = db
            .save_paper_extract(PaperExtractInput {
                id: None,
                paper_id: paper.id.clone(),
                file_id: None,
                engine: "builtin-fast".into(),
                engine_version: Some("pymupdf-1.28".into()),
                source_sha256: Some("abc".into()),
                rel_path: Some("files/papers/x/extract/builtin-fast.md".into()),
                status: "done".into(),
                pages: Some(15),
                chars: Some(39498),
                quality: Some(r#"{"cid":0}"#.into()),
                meta: Some(r#"{"suggested":{"title":"Attention"}}"#.into()),
                error: None,
            })
            .unwrap();
        assert_eq!(db.list_paper_extracts(Some(&paper.id)).unwrap().len(), 1);

        // 同一记录的更新走 id（状态流转）
        db.save_paper_extract(PaperExtractInput {
            id: Some(done.id.clone()),
            paper_id: paper.id.clone(),
            file_id: None,
            engine: "builtin-fast".into(),
            engine_version: None,
            source_sha256: None,
            rel_path: None,
            status: "failed".into(),
            pages: None,
            chars: None,
            quality: None,
            meta: None,
            error: Some("引擎不可用".into()),
        })
        .unwrap();
        let rows = db.list_paper_extracts(None).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].status, "failed");
        assert_eq!(rows[0].error.as_deref(), Some("引擎不可用"));

        // 删文献 → 提取记录级联清掉
        db.delete_paper(&paper.id).unwrap();
        assert!(db.list_paper_extracts(None).unwrap().is_empty());
    }

    #[test]
    fn translation_cache_persistence_and_source_cleanup() {
        let (db, dir) = tmp_db();
        let paper = db.save_paper(paper_input("Translation fixture")).unwrap();
        let src = dir.join("paper.pdf");
        std::fs::write(&src, b"%PDF-1.7").unwrap();
        let file = db.import_paper_file(PaperFileInput {paper_id:paper.id.clone(),src_path:src.to_string_lossy().into_owned(),role:None}).unwrap();
        assert!(db.run_extract_file(&paper.id,"translation",Some(&file.id)).unwrap_err().contains("整理"));
        let layout_rel=extract_md_rel(&file.rel_path,"layout");
        let content="# English source\n\nA $x_i$.";
        std::fs::write(dir.join(&layout_rel),content).unwrap();
        let source=db.save_paper_extract(PaperExtractInput {id:None,paper_id:paper.id.clone(),file_id:Some(file.id.clone()),engine:"layout".into(),engine_version:None,source_sha256:file.sha256.clone(),rel_path:Some(layout_rel.clone()),status:"done".into(),pages:None,chars:None,quality:None,meta:None,error:None}).unwrap();
        let translated_rel=extract_md_rel(&file.rel_path,"translation");
        std::fs::write(dir.join(&translated_rel),"# 中文译稿").unwrap();
        std::fs::write(dir.join(&translated_rel).with_extension("meta.json"),serde_json::json!({"blocks":[{"id":0,"source":"English","translation":"中文"}]}).to_string()).unwrap();
        let translated=db.save_paper_extract(PaperExtractInput {id:None,paper_id:paper.id.clone(),file_id:Some(file.id.clone()),engine:"translation".into(),engine_version:None,source_sha256:Some(format!("{:x}",Sha256::digest(content.as_bytes()))),rel_path:Some(translated_rel.clone()),status:"done".into(),pages:None,chars:None,quality:None,meta:Some(serde_json::json!({"sourceExtractId":source.id}).to_string()),error:None}).unwrap();
        let cached=db.run_extract_file(&paper.id,"translation",Some(&file.id)).unwrap();
        assert_eq!(cached.id,translated.id);
        assert_eq!(db.read_paper_extract(&cached.id).unwrap(),"# 中文译稿");
        assert_eq!(db.read_translation_blocks(&cached.id).unwrap()[0]["translation"],"中文");
        assert!(!cached.meta.unwrap().contains("English"));
        let progress_path=dir.join(&translated_rel).with_extension("progress.json");
        let checkpoint_path=dir.join(&translated_rel).with_extension("checkpoint.json");
        std::fs::write(&progress_path,serde_json::json!({"completed":1,"total":3,"stage":"retrying","updatedAt":1}).to_string()).unwrap();
        std::fs::write(&checkpoint_path,"{}").unwrap();
        assert_eq!(db.translation_progress(&paper.id,Some(&file.id)).unwrap().unwrap()["completed"],1);
        assert!(db.translation_progress("other-paper",Some(&file.id)).is_err());
        let mapping_path=dir.join(&translated_rel).with_extension("meta.json");
        let mapping=std::fs::read_to_string(&mapping_path).unwrap();
        std::fs::write(&mapping_path,"{\"blocks\":[{\"id\":4,\"source\":\"A\",\"translation\":\"中\"}]}").unwrap();
        assert!(db.read_translation_blocks(&translated.id).is_err());
        std::fs::write(&mapping_path,mapping).unwrap();
        drop(db);
        let db=Db::open(dir.join("t.db")).unwrap();
        assert_eq!(db.read_paper_extract(&translated.id).unwrap(),"# 中文译稿");
        db.delete_paper_extract(&source.id).unwrap();
        assert!(db.list_paper_extracts(None).unwrap().is_empty());
        assert!(!dir.join(translated_rel).exists());
        assert!(!progress_path.exists());
        assert!(!checkpoint_path.exists());
        assert!(dir.join(&file.rel_path).exists());
    }

    #[test]
    fn image_assets_are_registered_and_confined() {
        let (db, dir) = tmp_db();
        let paper = db.save_paper(paper_input("图片测试")).unwrap();
        let assets = dir.join("sample.layout.assets");
        std::fs::create_dir_all(&assets).unwrap();
        let png = b"\x89PNG\r\n\x1a\nfixture";
        std::fs::write(assets.join("figure.png"), png).unwrap();
        std::fs::write(dir.join("outside.png"), png).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(dir.join("outside.png"), assets.join("link.png")).unwrap();
        let extract = db.save_paper_extract(PaperExtractInput {
            id: None, paper_id: paper.id, file_id: None, engine: "layout".into(), engine_version: None,
            source_sha256: None, rel_path: Some("sample.layout.md".into()), status: "done".into(),
            pages: None, chars: None, quality: None, error: None,
            meta: Some(serde_json::json!({"assets":[{"path":"sample.layout.assets/figure.png"},{"path":"sample.layout.assets/link.png"},{"path":"../outside.png"},{"path":"/tmp/outside.png"}]}).to_string()),
        }).unwrap();
        assert_eq!(
            db.read_paper_asset(&extract.id, "sample.layout.assets/figure.png")
                .unwrap(),
            png
        );
        assert!(db.read_paper_asset(&extract.id, "outside.png").is_err());
        assert!(db.read_paper_asset(&extract.id, "../outside.png").is_err());
        assert!(db
            .read_paper_asset(&extract.id, "/tmp/outside.png")
            .is_err());
        #[cfg(unix)]
        assert!(db
            .read_paper_asset(&extract.id, "sample.layout.assets/link.png")
            .is_err());
        std::fs::write(dir.join("sample.layout.md"), "整理稿").unwrap();
        std::fs::write(dir.join("sample.layout.meta.json"), "{}").unwrap();
        std::fs::write(dir.join("sample.pdf"), "PDF source").unwrap();
        std::fs::write(dir.join("sample.fast.md"), "internal raw").unwrap();
        db.delete_paper_extract(&extract.id).unwrap();
        assert!(!dir.join("sample.layout.md").exists());
        assert!(!dir.join("sample.layout.meta.json").exists());
        assert!(!assets.exists());
        assert!(dir.join("sample.pdf").exists());
        assert!(dir.join("sample.fast.md").exists());
        assert!(dir.join("outside.png").exists());
        assert!(db.list_paper_extracts(None).unwrap().is_empty());
    }

    /// 端到端（需本机 `.conda/lit`）：导入真实 PDF → 跑 fast 引擎 → 断言 md 与 PDF 同目录。
    /// 默认跳过，设 `RUNNINGDO_E2E_EXTRACT=1` 才跑。
    #[test]
    fn e2e_fast_engine_writes_markdown_next_to_pdf() {
        if std::env::var("RUNNINGDO_E2E_EXTRACT").is_err() {
            return;
        }
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../docs/test/attention-is-all-you-need.pdf");
        if !fixture.is_file() {
            return;
        }
        let (db, dir) = tmp_db();
        let paper = db
            .save_paper(paper_input("Attention Is All You Need"))
            .unwrap();
        let file = db
            .import_paper_file(PaperFileInput {
                paper_id: paper.id.clone(),
                src_path: fixture.to_string_lossy().to_string(),
                role: None,
            })
            .unwrap();

        let extract = db.run_extract(&paper.id, "fast").unwrap();
        assert_eq!(extract.status, "done", "错误：{:?}", extract.error);
        let rel = extract.rel_path.clone().expect("应有产物路径");
        assert_eq!(rel, extract_md_rel(&file.rel_path, "fast"));
        assert_eq!(
            Path::new(&rel).parent(),
            Path::new(&file.rel_path).parent(),
            "提取稿必须与 PDF 同目录"
        );
        let abs = dir.join(&rel);
        assert!(
            abs.is_file(),
            "产物必须持久化落盘：{}",
            abs.to_string_lossy()
        );
        let text = std::fs::read_to_string(&abs).unwrap();
        assert!(
            text.chars().count() > 30_000,
            "提取字符数异常：{}",
            text.chars().count()
        );
        assert_eq!(db.list_paper_extracts(Some(&paper.id)).unwrap().len(), 1);
    }

    #[test]
    fn extract_paths_sit_next_to_the_pdf() {
        // 用户硬要求：md 必须与 PDF 放在一起，共同构成该文献的补充内容
        let pdf = "files/papers/p1/9f8e7d6c-attention.pdf";
        assert_eq!(
            extract_md_rel(pdf, "glm"),
            "files/papers/p1/9f8e7d6c-attention.glm.md"
        );
        assert_eq!(
            extract_meta_rel(pdf, "fast"),
            "files/papers/p1/9f8e7d6c-attention.fast.meta.json"
        );
        // 同一目录（目录部分必须一致）
        assert_eq!(
            Path::new(&extract_md_rel(pdf, "fast")).parent(),
            Path::new(pdf).parent()
        );
    }

    #[test]
    fn deleting_file_removes_sibling_extracts() {
        let (db, dir) = tmp_db();
        let paper = db.save_paper(paper_input("论文")).unwrap();
        let src = dir.join("paper.pdf");
        std::fs::write(&src, b"%PDF-1.7").unwrap();
        let file = db
            .import_paper_file(PaperFileInput {
                paper_id: paper.id.clone(),
                src_path: src.to_string_lossy().to_string(),
                role: None,
            })
            .unwrap();

        let md_rel = extract_md_rel(&file.rel_path, "fast");
        let md_abs = dir.join(&md_rel);
        std::fs::write(&md_abs, "# 提取稿").unwrap();
        assert!(md_abs.is_file());

        db.delete_paper_file(&file.id).unwrap();
        assert!(!md_abs.exists(), "删附件应连带清掉同主干的提取稿");
    }

    #[test]
    fn extract_rejects_unknown_engine_and_missing_file() {
        let (db, _dir) = tmp_db();
        let paper = db.save_paper(paper_input("论文")).unwrap();
        assert!(db.run_extract(&paper.id, "magic-ai").is_err());
        let err = db.run_extract(&paper.id, "fast").unwrap_err();
        assert!(err.contains("附件"), "实际：{err}");
    }

    #[test]
    fn tags_are_idempotent_and_backup_carries_library() {
        let (db, _dir) = tmp_db();
        let a = db.ensure_tag(" 多模态 ").unwrap();
        let b = db.ensure_tag("多模态").unwrap();
        assert_eq!(a.id, b.id);
        assert!(db.ensure_tag("").is_err());

        let path = db.export_json().unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(json["version"], 5);
        assert!(json["libraryNodes"].is_array());
        assert!(json["papers"].is_array());
        assert!(json["paperFiles"].is_array());
        assert!(json["paperExtracts"].is_array());
        assert_eq!(json["tags"].as_array().unwrap().len(), 1);
    }
}
