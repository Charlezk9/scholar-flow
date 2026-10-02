use crate::db::Db;
use crate::models::{
    AgendaItem, AgendaItemInput, AgendaSubitem, AgendaSubitemInput, CalEvent, Countdown,
    CountdownInput, EventInput, Milestone, MilestoneInput,
};
use tauri::State;

#[tauri::command]
pub fn list_countdowns(db: State<'_, Db>) -> Result<Vec<Countdown>, String> {
    db.list_countdowns()
}

#[tauri::command]
pub fn save_countdown(db: State<'_, Db>, input: CountdownInput) -> Result<Countdown, String> {
    db.save_countdown(input)
}

#[tauri::command]
pub fn delete_countdown(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.delete_countdown(&id)
}

/// 设置皇冠（全局唯一）；传 `null` 取消。
#[tauri::command]
pub fn set_crown(db: State<'_, Db>, id: Option<String>) -> Result<(), String> {
    db.set_crown(id.as_deref())
}

// ---------- 里程碑（v1.1 · CD-16） ----------

/// 一次全量返回全部里程碑（决议 Q3），前端按 countdownId 归集。
#[tauri::command]
pub fn list_milestones(db: State<'_, Db>) -> Result<Vec<Milestone>, String> {
    db.list_milestones()
}

/// 新建 / 更新 / 勾选：`id` 空即新建，`sortOrder` 不传则追加到末尾。
#[tauri::command]
pub fn save_milestone(db: State<'_, Db>, input: MilestoneInput) -> Result<Milestone, String> {
    db.save_milestone(input)
}

#[tauri::command]
pub fn delete_milestone(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.delete_milestone(&id)
}

// ---------- 议程事项（v1.2 · AG-01 ~ AG-05） ----------

#[tauri::command]
pub fn list_agenda_items(db: State<'_, Db>) -> Result<Vec<AgendaItem>, String> {
    db.list_agenda_items()
}

#[tauri::command]
pub fn save_agenda_item(db: State<'_, Db>, input: AgendaItemInput) -> Result<AgendaItem, String> {
    db.save_agenda_item(input)
}

#[tauri::command]
pub fn delete_agenda_item(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.delete_agenda_item(&id)
}

#[tauri::command]
pub fn list_agenda_subitems(db: State<'_, Db>) -> Result<Vec<AgendaSubitem>, String> {
    db.list_agenda_subitems()
}

#[tauri::command]
pub fn save_agenda_subitem(
    db: State<'_, Db>,
    input: AgendaSubitemInput,
) -> Result<AgendaSubitem, String> {
    db.save_agenda_subitem(input)
}

#[tauri::command]
pub fn delete_agenda_subitem(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.delete_agenda_subitem(&id)
}

/// 桥（AG-05）：把事项安排到某天 —— 建全天事件 + 归档事项（一个事务）
#[tauri::command]
pub fn schedule_agenda_item(
    db: State<'_, Db>,
    id: String,
    date: String,
) -> Result<CalEvent, String> {
    db.schedule_agenda_item(&id, &date)
}

#[tauri::command]
pub fn list_events(db: State<'_, Db>, from: String, to: String) -> Result<Vec<CalEvent>, String> {
    db.list_events(&from, &to)
}

#[tauri::command]
pub fn save_event(db: State<'_, Db>, input: EventInput) -> Result<CalEvent, String> {
    db.save_event(input)
}

#[tauri::command]
pub fn move_event(db: State<'_, Db>, id: String, start: String, end: String) -> Result<(), String> {
    db.move_event(&id, &start, &end)
}

#[tauri::command]
pub fn delete_event(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.delete_event(&id)
}

#[tauri::command]
pub fn all_settings(db: State<'_, Db>) -> Result<Vec<(String, String)>, String> {
    db.all_settings()
}

#[tauri::command]
pub fn set_setting(db: State<'_, Db>, key: String, value: String) -> Result<(), String> {
    db.set_setting(&key, &value)
}

#[tauri::command]
pub fn export_json(db: State<'_, Db>) -> Result<String, String> {
    db.export_json()
}

#[tauri::command]
pub fn data_dir(db: State<'_, Db>) -> String {
    db.dir_display()
}

#[tauri::command]
pub fn list_daily_routine_slots(
    db: State<Db>,
    date: String,
) -> Result<Vec<crate::models::DailyRoutineSlot>, String> {
    db.list_daily_routine_slots(&date)
}
#[tauri::command]
pub fn save_daily_routine_slot(
    db: State<Db>,
    date: String,
    slot_key: String,
    category: String,
) -> Result<crate::models::DailyRoutineSlot, String> {
    db.save_daily_routine_slot(&date, &slot_key, &category)
}
#[tauri::command]
pub fn clear_daily_routine_slot(
    db: State<Db>,
    date: String,
    slot_key: String,
) -> Result<(), String> {
    db.clear_daily_routine_slot(&date, &slot_key)
}
#[tauri::command]
pub fn save_agenda_note(db: State<Db>, id: String, note: String) -> Result<(), String> {
    db.save_agenda_note(&id, &note)
}
#[tauri::command]
pub fn duplicate_agenda_item(db: State<Db>, id: String) -> Result<(), String> {
    db.duplicate_agenda_item(&id)
}
