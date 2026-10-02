use serde::{Deserialize, Serialize};

/// 倒计时事项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Countdown {
    pub id: String,
    pub title: String,
    /// YYYY-MM-DD
    pub target_date: String,
    /// HH:mm，为空表示全天
    pub target_time: Option<String>,
    /// YYYY-MM-DD，用于进度条
    pub start_date: Option<String>,
    pub note: Option<String>,
    pub color: Option<String>,
    pub pinned: bool,
    /// 皇冠：全局唯一的「最重要」倒计时，显示在标题栏下方
    pub crowned: bool,
    pub show_on_calendar: bool,
    pub repeat_rule: Option<String>,
    pub archived: bool,
    pub remind_days: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 新建 / 更新倒计时的入参
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CountdownInput {
    pub id: Option<String>,
    pub title: String,
    pub target_date: String,
    pub target_time: Option<String>,
    pub start_date: Option<String>,
    pub note: Option<String>,
    pub color: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    /// `None` = 不改动皇冠归属（皇冠只通过 `set_crown` 显式修改，
    /// 避免「顺手保存一下」把皇冠弄丢）
    #[serde(default)]
    pub crowned: Option<bool>,
    #[serde(default = "default_true")]
    pub show_on_calendar: bool,
    pub repeat_rule: Option<String>,
    #[serde(default)]
    pub archived: bool,
    pub remind_days: Option<String>,
}

fn default_true() -> bool {
    true
}

/// 倒计时下的里程碑（TODO 项，v1.1 · CD-16）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Milestone {
    pub id: String,
    pub countdown_id: String,
    pub title: String,
    pub done: bool,
    /// 首次勾选的时间；取消勾选时清空
    pub done_at: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// 新建 / 更新里程碑的入参。勾选也走整条覆写（`save_milestone` 单一入口）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneInput {
    /// `None` / 空串 = 新建
    pub id: Option<String>,
    pub countdown_id: String,
    pub title: String,
    #[serde(default)]
    pub done: bool,
    /// 顺序：`None` = 已有记录保持原顺序 / 新建时追加到末尾
    #[serde(default)]
    pub sort_order: Option<i64>,
}

/// 日历事件（单日或跨日区间）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalEvent {
    pub id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub all_day: bool,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub note: Option<String>,
    pub location: Option<String>,
    pub color: Option<String>,
    /// 提前多少分钟提醒；0 = 不提醒（v0.1 仅存值，v0.2 接入通知）
    pub remind_minutes: Option<i64>,
    pub repeat_rule: Option<String>,
    pub repeat_until: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    pub id: Option<String>,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub all_day: bool,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub note: Option<String>,
    pub location: Option<String>,
    pub color: Option<String>,
    /// 提前多少分钟提醒；0 = 不提醒
    pub remind_minutes: Option<i64>,
    pub repeat_rule: Option<String>,
    pub repeat_until: Option<String>,
}

/// 议程事项（v1.2 · AG-01）：没有日期的待办，标题 + 若干子项
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaItem {
    pub id: String,
    pub title: String,
    pub note: Option<String>,
    pub pinned: bool,
    /// 完成 / 已安排 / 不想做了，统一进「已完成」区（与倒计时的归档同一交互）
    pub archived: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// 新建 / 更新议程事项的入参
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaItemInput {
    /// `None` / 空串 = 新建
    pub id: Option<String>,
    pub title: String,
    pub note: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub archived: bool,
    /// 顺序：`None` = 已有记录保持原顺序 / 新建时追加到末尾
    #[serde(default)]
    pub sort_order: Option<i64>,
}

/// 议程事项下的子项（与里程碑同形）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaSubitem {
    pub id: String,
    pub item_id: String,
    pub title: String,
    pub done: bool,
    pub done_at: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgendaSubitemInput {
    pub id: Option<String>,
    pub item_id: String,
    pub title: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub sort_order: Option<i64>,
}

/// v1.3 日常安排，未填写的默认块不保存。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyRoutineSlot {
    pub date: String,
    pub slot_key: String,
    pub category: String,
    pub created_at: String,
    pub updated_at: String,
}
