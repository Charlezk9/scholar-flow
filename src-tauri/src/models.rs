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

// ═══════════════════════════════════════════════════════════
// v1.4 · 文献模块（LIT-02 ~ LIT-08）
// ═══════════════════════════════════════════════════════════

/// 资料库文件夹节点（单亲树，Q1A）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryNode {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryNodeInput {
    /// `None` / 空串 = 新建
    pub id: Option<String>,
    pub parent_id: Option<String>,
    pub name: String,
    /// `None` = 已有节点保持原顺序 / 新建时追加到末尾
    #[serde(default)]
    pub sort_order: Option<i64>,
}

/// 文献条目（论文 / 教材 / 杂志 / 其他）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Paper {
    pub id: String,
    pub node_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub authors: Option<String>,
    pub year: Option<i64>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub url: Option<String>,
    pub status: String,
    pub note: Option<String>,
    /// JSON：类型专属字段与模型建议的元数据（title/venue/…）
    pub extra: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperInput {
    pub id: Option<String>,
    pub node_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub authors: Option<String>,
    pub year: Option<i64>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub url: Option<String>,
    /// `None` = 保持原状态
    #[serde(default)]
    pub status: Option<String>,
    pub note: Option<String>,
    pub extra: Option<String>,
}

/// 附件（拷贝入库，记 sha256 与原路径）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperFile {
    pub id: String,
    pub paper_id: String,
    pub role: String,
    pub original_path: Option<String>,
    /// 相对数据目录，如 `files/papers/<paperId>/<sha8>-name.pdf`
    pub rel_path: String,
    pub size: Option<i64>,
    pub sha256: Option<String>,
    pub missing: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperFileInput {
    pub paper_id: String,
    /// 磁盘上的绝对路径（由文件选择器或拖拽提供）
    pub src_path: String,
    #[serde(default)]
    pub role: Option<String>,
}

/// 提取产物（多引擎并存，永不覆盖）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperExtract {
    pub id: String,
    pub paper_id: String,
    pub file_id: Option<String>,
    pub engine: String,
    pub engine_version: Option<String>,
    pub source_sha256: Option<String>,
    pub rel_path: Option<String>,
    pub status: String,
    pub pages: Option<i64>,
    pub chars: Option<i64>,
    /// JSON：质量检测指标
    pub quality: Option<String>,
    /// JSON：耗时 / token / 费用估算 / 模型建议的元数据
    pub meta: Option<String>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperExtractInput {
    pub id: Option<String>,
    pub paper_id: String,
    pub file_id: Option<String>,
    pub engine: String,
    pub engine_version: Option<String>,
    pub source_sha256: Option<String>,
    pub rel_path: Option<String>,
    pub status: String,
    pub pages: Option<i64>,
    pub chars: Option<i64>,
    pub quality: Option<String>,
    pub meta: Option<String>,
    pub error: Option<String>,
}

/// 标签（Q2A：与文件夹正交）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
}
