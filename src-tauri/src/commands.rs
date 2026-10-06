use crate::db::Db;
use crate::models::{
    AgendaItem, AgendaItemInput, AgendaSubitem, AgendaSubitemInput, CalEvent, Countdown,
    CountdownInput, EventInput, Milestone, MilestoneInput,
};
use tauri::State;

#[tauri::command]
pub fn list_countdowns(db: State<'_, std::sync::Arc<Db>>) -> Result<Vec<Countdown>, String> {
    db.list_countdowns()
}

#[tauri::command]
pub fn save_countdown(
    db: State<'_, std::sync::Arc<Db>>,
    input: CountdownInput,
) -> Result<Countdown, String> {
    db.save_countdown(input)
}

#[tauri::command]
pub fn delete_countdown(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<(), String> {
    db.delete_countdown(&id)
}

/// 设置皇冠（全局唯一）；传 `null` 取消。
#[tauri::command]
pub fn set_crown(db: State<'_, std::sync::Arc<Db>>, id: Option<String>) -> Result<(), String> {
    db.set_crown(id.as_deref())
}

// ---------- 里程碑（v1.1 · CD-16） ----------

/// 一次全量返回全部里程碑（决议 Q3），前端按 countdownId 归集。
#[tauri::command]
pub fn list_milestones(db: State<'_, std::sync::Arc<Db>>) -> Result<Vec<Milestone>, String> {
    db.list_milestones()
}

/// 新建 / 更新 / 勾选：`id` 空即新建，`sortOrder` 不传则追加到末尾。
#[tauri::command]
pub fn save_milestone(
    db: State<'_, std::sync::Arc<Db>>,
    input: MilestoneInput,
) -> Result<Milestone, String> {
    db.save_milestone(input)
}

#[tauri::command]
pub fn delete_milestone(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<(), String> {
    db.delete_milestone(&id)
}

// ---------- 议程事项（v1.2 · AG-01 ~ AG-05） ----------

#[tauri::command]
pub fn list_agenda_items(db: State<'_, std::sync::Arc<Db>>) -> Result<Vec<AgendaItem>, String> {
    db.list_agenda_items()
}

#[tauri::command]
pub fn save_agenda_item(
    db: State<'_, std::sync::Arc<Db>>,
    input: AgendaItemInput,
) -> Result<AgendaItem, String> {
    db.save_agenda_item(input)
}

#[tauri::command]
pub fn delete_agenda_item(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<(), String> {
    db.delete_agenda_item(&id)
}

#[tauri::command]
pub fn list_agenda_subitems(
    db: State<'_, std::sync::Arc<Db>>,
) -> Result<Vec<AgendaSubitem>, String> {
    db.list_agenda_subitems()
}

#[tauri::command]
pub fn save_agenda_subitem(
    db: State<'_, std::sync::Arc<Db>>,
    input: AgendaSubitemInput,
) -> Result<AgendaSubitem, String> {
    db.save_agenda_subitem(input)
}

#[tauri::command]
pub fn delete_agenda_subitem(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<(), String> {
    db.delete_agenda_subitem(&id)
}

/// 桥（AG-05）：把事项安排到某天 —— 建全天事件 + 归档事项（一个事务）
#[tauri::command]
pub fn schedule_agenda_item(
    db: State<'_, std::sync::Arc<Db>>,
    id: String,
    date: String,
) -> Result<CalEvent, String> {
    db.schedule_agenda_item(&id, &date)
}

#[tauri::command]
pub fn list_events(
    db: State<'_, std::sync::Arc<Db>>,
    from: String,
    to: String,
) -> Result<Vec<CalEvent>, String> {
    db.list_events(&from, &to)
}

#[tauri::command]
pub fn save_event(
    db: State<'_, std::sync::Arc<Db>>,
    input: EventInput,
) -> Result<CalEvent, String> {
    db.save_event(input)
}

#[tauri::command]
pub fn move_event(
    db: State<'_, std::sync::Arc<Db>>,
    id: String,
    start: String,
    end: String,
) -> Result<(), String> {
    db.move_event(&id, &start, &end)
}

#[tauri::command]
pub fn delete_event(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<(), String> {
    db.delete_event(&id)
}

#[tauri::command]
pub fn all_settings(db: State<'_, std::sync::Arc<Db>>) -> Result<Vec<(String, String)>, String> {
    db.all_settings()
}

#[tauri::command]
pub fn set_setting(
    db: State<'_, std::sync::Arc<Db>>,
    key: String,
    value: String,
) -> Result<(), String> {
    db.set_setting(&key, &value)
}

#[tauri::command]
pub fn export_json(db: State<'_, std::sync::Arc<Db>>) -> Result<String, String> {
    db.export_json()
}

#[tauri::command]
pub fn data_dir(db: State<'_, std::sync::Arc<Db>>) -> String {
    db.dir_display()
}

#[tauri::command]
pub fn list_daily_routine_slots(
    db: State<'_, std::sync::Arc<Db>>,
    date: String,
) -> Result<Vec<crate::models::DailyRoutineSlot>, String> {
    db.list_daily_routine_slots(&date)
}
#[tauri::command]
pub fn save_daily_routine_slot(
    db: State<'_, std::sync::Arc<Db>>,
    date: String,
    slot_key: String,
    category: String,
) -> Result<crate::models::DailyRoutineSlot, String> {
    db.save_daily_routine_slot(&date, &slot_key, &category)
}
#[tauri::command]
pub fn clear_daily_routine_slot(
    db: State<'_, std::sync::Arc<Db>>,
    date: String,
    slot_key: String,
) -> Result<(), String> {
    db.clear_daily_routine_slot(&date, &slot_key)
}
#[tauri::command]
pub fn save_agenda_note(
    db: State<'_, std::sync::Arc<Db>>,
    id: String,
    note: String,
) -> Result<(), String> {
    db.save_agenda_note(&id, &note)
}
#[tauri::command]
pub fn duplicate_agenda_item(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<(), String> {
    db.duplicate_agenda_item(&id)
}

// ---------- 文献模块（v1.4 · LIT-02 ~ LIT-08） ----------

#[tauri::command]
pub fn list_library_nodes(
    db: State<'_, std::sync::Arc<Db>>,
) -> Result<Vec<crate::models::LibraryNode>, String> {
    db.list_library_nodes()
}

#[tauri::command]
pub fn save_library_node(
    db: State<'_, std::sync::Arc<Db>>,
    input: crate::models::LibraryNodeInput,
) -> Result<crate::models::LibraryNode, String> {
    db.save_library_node(input)
}

#[tauri::command]
pub fn delete_library_node(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<(), String> {
    db.delete_library_node(&id)
}

#[tauri::command]
pub fn list_papers(db: State<'_, std::sync::Arc<Db>>) -> Result<Vec<crate::models::Paper>, String> {
    db.list_papers()
}

#[tauri::command]
pub fn save_paper(
    db: State<'_, std::sync::Arc<Db>>,
    input: crate::models::PaperInput,
) -> Result<crate::models::Paper, String> {
    db.save_paper(input)
}

#[tauri::command]
pub fn delete_paper(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<(), String> {
    db.delete_paper(&id)
}

#[tauri::command]
pub fn list_paper_files(
    db: State<'_, std::sync::Arc<Db>>,
) -> Result<Vec<crate::models::PaperFile>, String> {
    db.list_paper_files()
}

#[tauri::command]
pub fn import_paper_file(
    db: State<'_, std::sync::Arc<Db>>,
    input: crate::models::PaperFileInput,
) -> Result<crate::models::PaperFile, String> {
    db.import_paper_file(input)
}

#[tauri::command]
pub fn delete_paper_file(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<(), String> {
    db.delete_paper_file(&id)
}

#[tauri::command]
pub fn read_paper_file(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<Vec<u8>, String> {
    db.read_paper_file(&id)
}

#[tauri::command]
pub fn list_paper_extracts(
    db: State<'_, std::sync::Arc<Db>>,
    paper_id: Option<String>,
) -> Result<Vec<crate::models::PaperExtract>, String> {
    db.list_paper_extracts(paper_id.as_deref())
}

#[tauri::command]
pub fn save_paper_extract(
    db: State<'_, std::sync::Arc<Db>>,
    input: crate::models::PaperExtractInput,
) -> Result<crate::models::PaperExtract, String> {
    db.save_paper_extract(input)
}

#[tauri::command]
pub fn delete_paper_extract(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<(), String> {
    db.delete_paper_extract(&id)
}

#[tauri::command]
pub fn read_paper_extract(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<String, String> {
    db.read_paper_extract(&id)
}

#[tauri::command]
pub fn extraction_progress(db: State<'_, std::sync::Arc<Db>>, paper_id: String, file_id: String, engine: String) -> Result<Option<serde_json::Value>, String> {
    db.extraction_progress(&paper_id,&file_id,&engine)
}

#[tauri::command]
pub fn translation_progress(db: State<'_, std::sync::Arc<Db>>, paper_id: String, file_id: Option<String>) -> Result<Option<serde_json::Value>, String> {
    db.translation_progress(&paper_id,file_id.as_deref())
}

#[tauri::command]
pub fn read_translation_blocks(db: State<'_, std::sync::Arc<Db>>, id: String) -> Result<serde_json::Value, String> {
    db.read_translation_blocks(&id)
}

#[tauri::command]
pub fn read_paper_asset(
    db: State<'_, std::sync::Arc<Db>>,
    id: String,
    asset: String,
) -> Result<Vec<u8>, String> {
    db.read_paper_asset(&id, &asset)
}

#[tauri::command]
pub fn list_tags(db: State<'_, std::sync::Arc<Db>>) -> Result<Vec<crate::models::Tag>, String> {
    db.list_tags()
}

#[tauri::command]
pub fn ensure_tag(
    db: State<'_, std::sync::Arc<Db>>,
    name: String,
) -> Result<crate::models::Tag, String> {
    db.ensure_tag(&name)
}

/// 跑一次 Markdown 提取（`fast` = 本地快线，`glm` = 云 OCR）。
#[tauri::command]
pub async fn extract_paper_markdown(
    db: State<'_, std::sync::Arc<Db>>,
    paper_id: String,
    engine: String,
    file_id: Option<String>,
    operation_id: Option<String>,
) -> Result<crate::models::PaperExtract, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.run_extract_file_traced(&paper_id, &engine, file_id.as_deref(),operation_id.as_deref().unwrap_or("unknown"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn list_paper_tags(
    db: State<'_, std::sync::Arc<Db>>,
    paper_id: String,
) -> Result<Vec<crate::models::Tag>, String> {
    db.list_paper_tags(&paper_id)
}
#[tauri::command]
pub fn set_paper_tag(
    db: State<'_, std::sync::Arc<Db>>,
    paper_id: String,
    tag_id: String,
    attached: bool,
) -> Result<(), String> {
    db.set_paper_tag(&paper_id, &tag_id, attached)
}

#[tauri::command]
pub fn literature_cloud_ready() -> bool {
    if std::env::var("GLM_API_KEY").is_ok_and(|key| !key.trim().is_empty()) {
        return true;
    }
    let Some(home) = std::env::var_os("HOME") else {
        return false;
    };
    let path = std::path::Path::new(&home).join(".config/runningdo/secrets.env");
    std::fs::read_to_string(path).is_ok_and(|text| {
        text.lines().any(|line| {
            line.split_once('=').is_some_and(|(k, v)| {
                k.trim() == "GLM_API_KEY" && !v.trim().trim_matches(['\"', '\'']).is_empty()
            })
        })
    })
}

/// 原生选择后直接入库；取消不写数据，不把所选路径传回前端。
#[tauri::command]
pub async fn choose_paper_file(
    app: tauri::AppHandle,
    db: State<'_, std::sync::Arc<Db>>,
    paper_id: String,
) -> Result<Option<crate::models::PaperFile>, String> {
    use tauri_plugin_dialog::DialogExt;
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_title("选择文献附件")
            .blocking_pick_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        db.import_paper_file(crate::models::PaperFileInput {
            paper_id,
            src_path: path.to_string_lossy().into_owned(),
            role: None,
        })
        .map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn record_diagnostic(db: State<'_, std::sync::Arc<Db>>, record: serde_json::Value) {
    crate::diagnostics::record(&db.dir, record);
}
#[tauri::command]
pub fn read_diagnostics(db: State<'_, std::sync::Arc<Db>>) -> Result<String,String> {crate::diagnostics::read(&db.dir)}
#[tauri::command]
pub fn open_diagnostics_dir(db: State<'_, std::sync::Arc<Db>>) -> Result<(),String> {
    let path=db.dir.join("logs");std::fs::create_dir_all(&path).map_err(|_|"无法创建日志目录")?;
    std::process::Command::new("open").arg(path).spawn().map_err(|_|"无法打开日志目录")?;Ok(())
}
