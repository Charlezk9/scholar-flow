use crate::models::{
    AgendaItem, AgendaItemInput, AgendaSubitem, AgendaSubitemInput, CalEvent, Countdown,
    CountdownInput, DailyRoutineSlot, EventInput, Milestone, MilestoneInput,
};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Db {
    conn: Mutex<Connection>,
    dir: PathBuf,
}

fn validate_routine(date: &str, key: Option<&str>, category: Option<&str>) -> Result<(), String> {
    let parsed =
        chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "日期无效".to_string())?;
    if parsed.format("%Y-%m-%d").to_string() != date {
        return Err("日期无效".into());
    }
    if let Some(k) = key {
        if !["morning_1", "morning_2", "afternoon", "evening"].contains(&k) {
            return Err("时间块无效".into());
        }
    }
    if let Some(c) = category {
        if !(1..=20).contains(&c.trim().chars().count()) {
            return Err("类别须为 1–20 个字符".into());
        }
    }
    Ok(())
}
fn list_routine_with(
    conn: &Connection,
    date: Option<&str>,
) -> Result<Vec<DailyRoutineSlot>, String> {
    let mut stmt = conn.prepare("SELECT date,slot_key,category,created_at,updated_at FROM daily_routine_slots WHERE (?1 IS NULL OR date=?1) ORDER BY date,slot_key").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![date], |r| {
            Ok(DailyRoutineSlot {
                date: r.get(0)?,
                slot_key: r.get(1)?,
                category: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

/// 幂等地补列（老库升级）
fn ensure_column(conn: &Connection, table: &str, column: &str, ty: &str) -> Result<(), String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|e| e.to_string())?;
    let names = stmt
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if !names.iter().any(|n| n == column) {
        conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {ty}"))
            .map_err(|e| format!("补列 {table}.{column} 失败: {e}"))?;
    }
    Ok(())
}

fn b(v: bool) -> i64 {
    if v {
        1
    } else {
        0
    }
}

fn table_exists(conn: &Connection, name: &str) -> Result<bool, String> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
            params![name],
            |_| Ok(true),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(false))
}

/// countdowns 的列清单。读的时候按下标取值，**顺序必须与此保持一致**。
const CD_COLS: &str = "id,title,target_date,target_time,start_date,note,color,pinned,crowned,\
                       show_on_calendar,repeat_rule,archived,remind_days,created_at,updated_at";

/// milestones 的列清单（与 CD_COLS 同样：下标顺序必须与 MILESTONE_COLS 一致）
const MS_COLS: &str = "id,countdown_id,title,done,done_at,sort_order,created_at,updated_at";

fn ms_from_row(r: &Row<'_>) -> rusqlite::Result<Milestone> {
    Ok(Milestone {
        id: r.get(0)?,
        countdown_id: r.get(1)?,
        title: r.get(2)?,
        done: r.get::<_, i64>(3)? != 0,
        done_at: r.get(4)?,
        sort_order: r.get(5)?,
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
    })
}

/// 查全部里程碑（拿连接直查，供 list_milestones 与备份共用）
fn list_agenda_items_with(conn: &Connection) -> Result<Vec<AgendaItem>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {AG_COLS} FROM agenda_items ORDER BY pinned DESC, sort_order ASC, created_at ASC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], ag_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn list_agenda_subitems_with(conn: &Connection) -> Result<Vec<AgendaSubitem>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {AGS_COLS} FROM agenda_subitems ORDER BY item_id ASC, sort_order ASC, created_at ASC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], ags_from_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn list_milestones_with(conn: &Connection) -> Result<Vec<Milestone>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {MS_COLS} FROM milestones ORDER BY countdown_id ASC, sort_order ASC, created_at ASC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], ms_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// agenda_items 的列清单（下标顺序必须与 AG_COLS 一致）
const AG_COLS: &str = "id,title,note,pinned,archived,sort_order,created_at,updated_at";

fn ag_from_row(r: &Row<'_>) -> rusqlite::Result<AgendaItem> {
    Ok(AgendaItem {
        id: r.get(0)?,
        title: r.get(1)?,
        note: r.get(2)?,
        pinned: r.get::<_, i64>(3)? != 0,
        archived: r.get::<_, i64>(4)? != 0,
        sort_order: r.get(5)?,
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
    })
}

/// agenda_subitems 的列清单
const AGS_COLS: &str = "id,item_id,title,done,done_at,sort_order,created_at,updated_at";

fn ags_from_row(r: &Row<'_>) -> rusqlite::Result<AgendaSubitem> {
    Ok(AgendaSubitem {
        id: r.get(0)?,
        item_id: r.get(1)?,
        title: r.get(2)?,
        done: r.get::<_, i64>(3)? != 0,
        done_at: r.get(4)?,
        sort_order: r.get(5)?,
        created_at: r.get(6)?,
        updated_at: r.get(7)?,
    })
}

fn cd_from_row(r: &Row<'_>) -> rusqlite::Result<Countdown> {
    Ok(Countdown {
        id: r.get(0)?,
        title: r.get(1)?,
        target_date: r.get(2)?,
        target_time: r.get(3)?,
        start_date: r.get(4)?,
        note: r.get(5)?,
        color: r.get(6)?,
        pinned: r.get::<_, i64>(7)? != 0,
        crowned: r.get::<_, i64>(8)? != 0,
        show_on_calendar: r.get::<_, i64>(9)? != 0,
        repeat_rule: r.get(10)?,
        archived: r.get::<_, i64>(11)? != 0,
        remind_days: r.get(12)?,
        created_at: r.get(13)?,
        updated_at: r.get(14)?,
    })
}

impl Db {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        let dir = path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        let conn = Connection::open(path).map_err(|e| format!("打开数据库失败: {e}"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("初始化数据库失败: {e}"))?;
        let db = Db {
            conn: Mutex::new(conn),
            dir,
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn dir_display(&self) -> String {
        self.dir.to_string_lossy().to_string()
    }

    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // 第一次加「最新一批表」之前先落一份 JSON 兜底（v1.1 引入，v1.2 沿用）：
        // 新增表 + 外键级联属于「迁移出意外就麻烦」的操作，先留个捞得回来的副本。
        // 幂等：这一批表建好后再启动就不会重复备份。
        // v1.3 起看 daily_routine_slots；兜底备份必须包含所有已存在的表。
        let has_latest_tables: bool = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='daily_routine_slots'",
                [],
                |_| Ok(true),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(false);
        let has_countdowns: bool = conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='countdowns'",
                [],
                |_| Ok(true),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(false);
        if !has_latest_tables && has_countdowns {
            // 旧库可能没有 crowned；备份查询前先做无损补列。
            ensure_column(&conn, "countdowns", "crowned", "INTEGER NOT NULL DEFAULT 0")?;
            let version = if table_exists(&conn, "agenda_items")? {
                3
            } else if table_exists(&conn, "milestones")? {
                2
            } else {
                1
            };
            export_json_with(&conn, &self.dir, version)?;
        }

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS countdowns (
                id               TEXT PRIMARY KEY,
                title            TEXT NOT NULL,
                target_date      TEXT NOT NULL,
                target_time      TEXT,
                start_date       TEXT,
                note             TEXT,
                color            TEXT,
                pinned           INTEGER NOT NULL DEFAULT 0,
                crowned          INTEGER NOT NULL DEFAULT 0,
                show_on_calendar INTEGER NOT NULL DEFAULT 1,
                repeat_rule      TEXT,
                archived         INTEGER NOT NULL DEFAULT 0,
                remind_days      TEXT,
                created_at       TEXT NOT NULL,
                updated_at       TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_countdowns_target ON countdowns(target_date);

            CREATE TABLE IF NOT EXISTS events (
                id           TEXT PRIMARY KEY,
                title        TEXT NOT NULL,
                start_date   TEXT NOT NULL,
                end_date     TEXT NOT NULL,
                all_day      INTEGER NOT NULL DEFAULT 1,
                start_time   TEXT,
                end_time     TEXT,
                note         TEXT,
                location     TEXT,
                color        TEXT,
                remind_minutes INTEGER,
                repeat_rule  TEXT,
                repeat_until TEXT,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_date);
            CREATE INDEX IF NOT EXISTS idx_events_end ON events(end_date);

            CREATE TABLE IF NOT EXISTS daily_routine_slots (
                date TEXT NOT NULL,
                slot_key TEXT NOT NULL CHECK(slot_key IN ('morning_1','morning_2','afternoon','evening')),
                category TEXT NOT NULL CHECK(length(trim(category)) BETWEEN 1 AND 20),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(date, slot_key)
            );
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- v1.1 · CD-16：倒计时下的里程碑（TODO）。
            -- 外键 + ON DELETE CASCADE：删倒计时时由 SQLite 自己清理，
            -- 依赖 Db::open 里已启用的 PRAGMA foreign_keys=ON。
            CREATE TABLE IF NOT EXISTS milestones (
                id           TEXT PRIMARY KEY,
                countdown_id TEXT NOT NULL REFERENCES countdowns(id) ON DELETE CASCADE,
                title        TEXT NOT NULL,
                done         INTEGER NOT NULL DEFAULT 0,
                done_at      TEXT,
                sort_order   INTEGER NOT NULL DEFAULT 0,
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_milestones_cd ON milestones(countdown_id, sort_order);

            -- v1.2 · AG-01/AG-02：议程事项（没有日期的待办）与它的子项。
            -- 子项与 milestones 同形，便于复用同一套交互与动效。
            CREATE TABLE IF NOT EXISTS agenda_items (
                id         TEXT PRIMARY KEY,
                title      TEXT NOT NULL,
                note       TEXT,
                pinned     INTEGER NOT NULL DEFAULT 0,
                archived   INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS agenda_subitems (
                id         TEXT PRIMARY KEY,
                item_id    TEXT NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
                title      TEXT NOT NULL,
                done       INTEGER NOT NULL DEFAULT 0,
                done_at    TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_agenda_sub ON agenda_subitems(item_id, sort_order);
            "#,
        )
        .map_err(|e| format!("建表失败: {e}"))?;
        ensure_column(&conn, "events", "remind_minutes", "INTEGER")?;
        // 皇冠（P0，v0.1.x 补上）：全局唯一的「最重要」倒计时
        ensure_column(&conn, "countdowns", "crowned", "INTEGER NOT NULL DEFAULT 0")?;
        Ok(())
    }

    // ---------- 倒计时 ----------

    pub fn list_countdowns(&self) -> Result<Vec<Countdown>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {CD_COLS} FROM countdowns \
                 ORDER BY crowned DESC, pinned DESC, target_date ASC"
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| cd_from_row(r))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn save_countdown(&self, input: CountdownInput) -> Result<Countdown, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_iso();
        let title = input.title.trim().to_string();
        if title.is_empty() {
            return Err("标题不能为空".into());
        }
        let id = match input.id.clone() {
            Some(v) if !v.is_empty() => v,
            _ => uuid::Uuid::new_v4().to_string(),
        };
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM countdowns WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let created = if exists.is_some() {
            conn.query_row(
                "SELECT created_at FROM countdowns WHERE id = ?1",
                params![id],
                |r| r.get::<_, String>(0),
            )
            .unwrap_or_else(|_| now.clone())
        } else {
            now.clone()
        };

        // 入参没带 crowned（None）时保持原状 —— 否则在卡片上点个「置顶」
        // 或「归档」就会顺手把皇冠弄丢
        let crowned = match input.crowned {
            Some(v) => v,
            None => {
                conn.query_row(
                    "SELECT crowned FROM countdowns WHERE id = ?1",
                    params![id],
                    |r| r.get::<_, i64>(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .unwrap_or(0)
                    != 0
            }
        };

        if exists.is_some() {
            conn.execute(
                "UPDATE countdowns SET title=?2, target_date=?3, target_time=?4, start_date=?5, \
                 note=?6, color=?7, pinned=?8, crowned=?9, show_on_calendar=?10, repeat_rule=?11, \
                 archived=?12, remind_days=?13, updated_at=?14 WHERE id=?1",
                params![
                    id,
                    title,
                    input.target_date,
                    input.target_time,
                    input.start_date,
                    input.note,
                    input.color,
                    b(input.pinned),
                    b(crowned),
                    b(input.show_on_calendar),
                    input.repeat_rule,
                    b(input.archived),
                    input.remind_days,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO countdowns (id,title,target_date,target_time,start_date,note,color,\
                 pinned,crowned,show_on_calendar,repeat_rule,archived,remind_days,created_at,updated_at) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
                params![
                    id,
                    title,
                    input.target_date,
                    input.target_time,
                    input.start_date,
                    input.note,
                    input.color,
                    b(input.pinned),
                    b(crowned),
                    b(input.show_on_calendar),
                    input.repeat_rule,
                    b(input.archived),
                    input.remind_days,
                    created,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        // 皇冠全库只能有一个
        if crowned {
            conn.execute(
                "UPDATE countdowns SET crowned = 0 WHERE id != ?1",
                params![id],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.query_row(
            &format!("SELECT {CD_COLS} FROM countdowns WHERE id = ?1"),
            params![id],
            |r| cd_from_row(r),
        )
        .map_err(|e| e.to_string())
    }

    /// 设置皇冠（全局唯一）。传 `None` 或空串表示取消。
    pub fn set_crown(&self, id: Option<&str>) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute("UPDATE countdowns SET crowned = 0 WHERE crowned != 0", [])
            .map_err(|e| e.to_string())?;
        if let Some(v) = id {
            if !v.is_empty() {
                let n = tx
                    .execute(
                        "UPDATE countdowns SET crowned = 1, updated_at = ?2 WHERE id = ?1",
                        params![v, now_iso()],
                    )
                    .map_err(|e| e.to_string())?;
                if n == 0 {
                    return Err("找不到这条倒计时".into());
                }
            }
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn delete_countdown(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM countdowns WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ---------- 里程碑（v1.1 · CD-16） ----------

    /// 一次全量拿全部里程碑（决议 Q3）：自用规模小，前端按 countdownId 归集，
    /// 折叠态才能直接显示「☑ 1/3」徽章。
    pub fn list_milestones(&self) -> Result<Vec<Milestone>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        list_milestones_with(&conn)
    }

    /// 新建 / 更新里程碑。`id` 为空即新建；不传 `sort_order` 时追加到末尾。
    ///
    /// 勾选也走这里（整条覆写）：单一入口，避免出现「只改一半字段」的命令。
    pub fn save_milestone(&self, input: MilestoneInput) -> Result<Milestone, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_iso();
        let title = input.title.trim().to_string();
        if title.is_empty() {
            return Err("里程碑内容不能为空".into());
        }
        if !table_exists(&conn, "milestones")? {
            return Err("里程碑表未初始化".into());
        }
        // 父记录必须存在（否则外键会报错，但报错信息不如这句清楚）
        let parent: Option<String> = conn
            .query_row(
                "SELECT id FROM countdowns WHERE id = ?1",
                params![input.countdown_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if parent.is_none() {
            return Err("找不到这条倒计时".into());
        }

        let id = match input.id.clone() {
            Some(v) if !v.is_empty() => v,
            _ => uuid::Uuid::new_v4().to_string(),
        };
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM milestones WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        // 顺序语义（与 `crowned: Option<bool>` 同一条教训）：
        //   显式给了值 → 用它；
        //   `None` + 已有记录 → **保持原顺序**（否则「改个名字」就会把这条甩到末尾）；
        //   `None` + 新建 → 追加到该倒计时末尾。
        let sort_order = match input.sort_order {
            Some(v) => v,
            None if exists.is_some() => conn
                .query_row(
                    "SELECT sort_order FROM milestones WHERE id = ?1",
                    params![id],
                    |r| r.get::<_, i64>(0),
                )
                .map_err(|e| e.to_string())?,
            None => conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM milestones WHERE countdown_id = ?1",
                    params![input.countdown_id],
                    |r| r.get::<_, i64>(0),
                )
                .unwrap_or(0),
        };

        if exists.is_some() {
            // 勾选时间只在「从未完成→完成」时写入（重复保存不会把时间刷掉）
            let done_at: Option<String> = if input.done {
                conn.query_row(
                    "SELECT done_at FROM milestones WHERE id = ?1",
                    params![id],
                    |r| r.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .flatten()
                .or_else(|| Some(now.clone()))
            } else {
                None
            };
            conn.execute(
                "UPDATE milestones SET title=?2, done=?3, done_at=?4, sort_order=?5, updated_at=?6 \
                 WHERE id=?1",
                params![id, title, b(input.done), done_at, sort_order, now],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO milestones (id,countdown_id,title,done,done_at,sort_order,created_at,updated_at) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    id,
                    input.countdown_id,
                    title,
                    b(input.done),
                    if input.done { Some(now.clone()) } else { None },
                    sort_order,
                    now,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.query_row(
            &format!("SELECT {MS_COLS} FROM milestones WHERE id = ?1"),
            params![id],
            ms_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn delete_milestone(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM milestones WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ---------- 议程事项（v1.2 · AG-01 ~ AG-05） ----------

    /// 一次全量（含已归档）——前端按 archived 分区，与倒计时列表同一策略。
    pub fn list_agenda_items(&self) -> Result<Vec<AgendaItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        list_agenda_items_with(&conn)
    }

    pub fn save_agenda_item(&self, input: AgendaItemInput) -> Result<AgendaItem, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_iso();
        let title = input.title.trim().to_string();
        if title.is_empty() {
            return Err("标题不能为空".into());
        }
        let id = match input.id.clone() {
            Some(v) if !v.is_empty() => v,
            _ => uuid::Uuid::new_v4().to_string(),
        };
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM agenda_items WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        // 顺序语义与里程碑一致：None + 已有记录 = 保持原顺序
        let sort_order = match input.sort_order {
            Some(v) => v,
            None if exists.is_some() => conn
                .query_row(
                    "SELECT sort_order FROM agenda_items WHERE id = ?1",
                    params![id],
                    |r| r.get::<_, i64>(0),
                )
                .map_err(|e| e.to_string())?,
            None => conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM agenda_items",
                    [],
                    |r| r.get::<_, i64>(0),
                )
                .unwrap_or(0),
        };

        if exists.is_some() {
            conn.execute(
                "UPDATE agenda_items SET title=?2, note=?3, pinned=?4, archived=?5, \
                 sort_order=?6, updated_at=?7 WHERE id=?1",
                params![
                    id,
                    title,
                    input.note,
                    b(input.pinned),
                    b(input.archived),
                    sort_order,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO agenda_items (id,title,note,pinned,archived,sort_order,created_at,updated_at) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    id,
                    title,
                    input.note,
                    b(input.pinned),
                    b(input.archived),
                    sort_order,
                    now,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.query_row(
            &format!("SELECT {AG_COLS} FROM agenda_items WHERE id = ?1"),
            params![id],
            ag_from_row,
        )
        .map_err(|e| e.to_string())
    }

    /// 删事项：子项由外键 ON DELETE CASCADE 清理（与里程碑同一机制）
    pub fn delete_agenda_item(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM agenda_items WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_agenda_subitems(&self) -> Result<Vec<AgendaSubitem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        list_agenda_subitems_with(&conn)
    }

    /// 新建 / 改名 / 勾选（整条覆写，单一入口）
    pub fn save_agenda_subitem(&self, input: AgendaSubitemInput) -> Result<AgendaSubitem, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_iso();
        let title = input.title.trim().to_string();
        if title.is_empty() {
            return Err("子项内容不能为空".into());
        }
        let parent: Option<String> = conn
            .query_row(
                "SELECT id FROM agenda_items WHERE id = ?1",
                params![input.item_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if parent.is_none() {
            return Err("找不到这条议程事项".into());
        }

        let id = match input.id.clone() {
            Some(v) if !v.is_empty() => v,
            _ => uuid::Uuid::new_v4().to_string(),
        };
        let exists: Option<String> = conn
            .query_row(
                "SELECT id FROM agenda_subitems WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let sort_order = match input.sort_order {
            Some(v) => v,
            None if exists.is_some() => conn
                .query_row(
                    "SELECT sort_order FROM agenda_subitems WHERE id = ?1",
                    params![id],
                    |r| r.get::<_, i64>(0),
                )
                .map_err(|e| e.to_string())?,
            None => conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order) + 1, 0) FROM agenda_subitems WHERE item_id = ?1",
                    params![input.item_id],
                    |r| r.get::<_, i64>(0),
                )
                .unwrap_or(0),
        };

        if exists.is_some() {
            // 勾选时间只在「从未完成 → 完成」时写入（重复保存不刷新时间）
            let done_at: Option<String> = if input.done {
                conn.query_row(
                    "SELECT done_at FROM agenda_subitems WHERE id = ?1",
                    params![id],
                    |r| r.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .flatten()
                .or_else(|| Some(now.clone()))
            } else {
                None
            };
            conn.execute(
                "UPDATE agenda_subitems SET title=?2, done=?3, done_at=?4, sort_order=?5, updated_at=?6 \
                 WHERE id=?1",
                params![id, title, b(input.done), done_at, sort_order, now],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO agenda_subitems (id,item_id,title,done,done_at,sort_order,created_at,updated_at) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    id,
                    input.item_id,
                    title,
                    b(input.done),
                    if input.done { Some(now.clone()) } else { None },
                    sort_order,
                    now,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.query_row(
            &format!("SELECT {AGS_COLS} FROM agenda_subitems WHERE id = ?1"),
            params![id],
            ags_from_row,
        )
        .map_err(|e| e.to_string())
    }

    pub fn delete_agenda_subitem(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM agenda_subitems WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 桥（AG-05）：把事项「安排到某天」——
    /// 一个事务里创建全天事件（备注带上未完成子项）并把事项归档。
    /// 单向出口：之后事项与事件不再保持关联，因此不存在双向同步问题。
    pub fn schedule_agenda_item(&self, id: &str, date: &str) -> Result<CalEvent, String> {
        validate_routine(date, None, None)?;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

        let item = tx
            .query_row(
                &format!("SELECT {AG_COLS} FROM agenda_items WHERE id = ?1"),
                params![id],
                ag_from_row,
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let item = item.ok_or_else(|| "找不到这条议程事项".to_string())?;

        // 未完成子项写进事件备注 —— 落地到日历那天一眼能看到要做什么
        let mut stmt = tx
            .prepare(&format!(
                "SELECT {AGS_COLS} FROM agenda_subitems WHERE item_id = ?1 ORDER BY sort_order ASC"
            ))
            .map_err(|e| e.to_string())?;
        let subs = stmt
            .query_map(params![id], ags_from_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);

        let mut lines: Vec<String> = Vec::new();
        if let Some(n) = item.note.as_deref() {
            if !n.trim().is_empty() {
                lines.push(n.trim().to_string());
            }
        }
        for s in subs.iter().filter(|s| !s.done) {
            lines.push(format!("· {}", s.title));
        }
        let note = if lines.is_empty() {
            None
        } else {
            Some(lines.join(
                "
",
            ))
        };

        let event_id = uuid::Uuid::new_v4().to_string();
        let now = now_iso();
        tx.execute(
            "INSERT INTO events (id,title,start_date,end_date,all_day,start_time,end_time,note,\
             location,color,remind_minutes,repeat_rule,repeat_until,created_at,updated_at) \
             VALUES (?1,?2,?3,?3,1,NULL,NULL,?4,NULL,?5,NULL,NULL,NULL,?6,?6)",
            params![event_id, item.title, date, note, "indigo", now],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            "UPDATE agenda_items SET archived = 1, updated_at = ?2 WHERE id = ?1",
            params![id, now],
        )
        .map_err(|e| e.to_string())?;

        let event = tx
            .query_row(
                "SELECT id,title,start_date,end_date,all_day,start_time,end_time,note,location,\
                 color,remind_minutes,repeat_rule,repeat_until,created_at,updated_at \
                 FROM events WHERE id = ?1",
                params![event_id],
                |r| {
                    Ok(CalEvent {
                        id: r.get(0)?,
                        title: r.get(1)?,
                        start_date: r.get(2)?,
                        end_date: r.get(3)?,
                        all_day: r.get::<_, i64>(4)? != 0,
                        start_time: r.get(5)?,
                        end_time: r.get(6)?,
                        note: r.get(7)?,
                        location: r.get(8)?,
                        color: r.get(9)?,
                        remind_minutes: r.get(10)?,
                        repeat_rule: r.get(11)?,
                        repeat_until: r.get(12)?,
                        created_at: r.get(13)?,
                        updated_at: r.get(14)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;
        Ok(event)
    }

    // ---------- 事件 ----------

    pub fn list_events(&self, from: &str, to: &str) -> Result<Vec<CalEvent>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id,title,start_date,end_date,all_day,start_time,end_time,note,location,\
                 color,remind_minutes,repeat_rule,repeat_until,created_at,updated_at \
                 FROM events WHERE end_date >= ?1 AND start_date <= ?2 \
                 ORDER BY start_date ASC, all_day DESC, start_time ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![from, to], |r| {
                Ok(CalEvent {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    start_date: r.get(2)?,
                    end_date: r.get(3)?,
                    all_day: r.get::<_, i64>(4)? != 0,
                    start_time: r.get(5)?,
                    end_time: r.get(6)?,
                    note: r.get(7)?,
                    location: r.get(8)?,
                    color: r.get(9)?,
                    remind_minutes: r.get(10)?,
                    repeat_rule: r.get(11)?,
                    repeat_until: r.get(12)?,
                    created_at: r.get(13)?,
                    updated_at: r.get(14)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn save_event(&self, input: EventInput) -> Result<CalEvent, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_iso();
        let title = input.title.trim().to_string();
        if title.is_empty() {
            return Err("标题不能为空".into());
        }
        let mut start = input.start_date.clone();
        let mut end = input.end_date.clone();
        if end.is_empty() {
            end = start.clone();
        }
        // 保证 start <= end
        if end < start {
            std::mem::swap(&mut start, &mut end);
        }
        let (start_time, end_time) = if input.all_day {
            (None, None)
        } else {
            (input.start_time.clone(), input.end_time.clone())
        };

        let id = match input.id.clone() {
            Some(v) if !v.is_empty() => v,
            _ => uuid::Uuid::new_v4().to_string(),
        };
        let exists: Option<String> = conn
            .query_row("SELECT id FROM events WHERE id = ?1", params![id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;

        let created = if exists.is_some() {
            conn.query_row(
                "SELECT created_at FROM events WHERE id = ?1",
                params![id],
                |r| r.get::<_, String>(0),
            )
            .unwrap_or_else(|_| now.clone())
        } else {
            now.clone()
        };

        if exists.is_some() {
            conn.execute(
                "UPDATE events SET title=?2, start_date=?3, end_date=?4, all_day=?5, \
                 start_time=?6, end_time=?7, note=?8, location=?9, color=?10, \
                 remind_minutes=?11, repeat_rule=?12, repeat_until=?13, updated_at=?14 \
                 WHERE id=?1",
                params![
                    id,
                    title,
                    start,
                    end,
                    b(input.all_day),
                    start_time,
                    end_time,
                    input.note,
                    input.location,
                    input.color,
                    input.remind_minutes,
                    input.repeat_rule,
                    input.repeat_until,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO events (id,title,start_date,end_date,all_day,start_time,end_time,\
                 note,location,color,remind_minutes,repeat_rule,repeat_until,created_at,updated_at) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
                params![
                    id,
                    title,
                    start,
                    end,
                    b(input.all_day),
                    start_time,
                    end_time,
                    input.note,
                    input.location,
                    input.color,
                    input.remind_minutes,
                    input.repeat_rule,
                    input.repeat_until,
                    created,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        conn.query_row(
            "SELECT id,title,start_date,end_date,all_day,start_time,end_time,note,location,\
             color,remind_minutes,repeat_rule,repeat_until,created_at,updated_at \
             FROM events WHERE id = ?1",
            params![id],
            |r| {
                Ok(CalEvent {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    start_date: r.get(2)?,
                    end_date: r.get(3)?,
                    all_day: r.get::<_, i64>(4)? != 0,
                    start_time: r.get(5)?,
                    end_time: r.get(6)?,
                    note: r.get(7)?,
                    location: r.get(8)?,
                    color: r.get(9)?,
                    remind_minutes: r.get(10)?,
                    repeat_rule: r.get(11)?,
                    repeat_until: r.get(12)?,
                    created_at: r.get(13)?,
                    updated_at: r.get(14)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    }

    /// 仅改日期（拖拽改期）
    pub fn move_event(&self, id: &str, start: &str, end: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE events SET start_date=?2, end_date=?3, updated_at=?4 WHERE id=?1",
            params![id, start, end, now_iso()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_event(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM events WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ---------- 设置 ----------

    pub fn all_settings(&self) -> Result<Vec<(String, String)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 备份全部数据为 JSON（v1.3：version 4，新增日常安排）
    pub fn list_daily_routine_slots(&self, date: &str) -> Result<Vec<DailyRoutineSlot>, String> {
        validate_routine(date, None, None)?;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        list_routine_with(&conn, Some(date))
    }
    pub fn save_daily_routine_slot(
        &self,
        date: &str,
        key: &str,
        category: &str,
    ) -> Result<DailyRoutineSlot, String> {
        validate_routine(date, Some(key), Some(category))?;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = now_iso();
        conn.execute("INSERT INTO daily_routine_slots(date,slot_key,category,created_at,updated_at) VALUES(?1,?2,?3,?4,?4) ON CONFLICT(date,slot_key) DO UPDATE SET category=excluded.category,updated_at=excluded.updated_at", params![date,key,category.trim(),now]).map_err(|e| e.to_string())?;
        list_routine_with(&conn, Some(date))?
            .into_iter()
            .find(|s| s.slot_key == key)
            .ok_or_else(|| "保存失败".into())
    }
    pub fn clear_daily_routine_slot(&self, date: &str, key: &str) -> Result<(), String> {
        validate_routine(date, Some(key), None)?;
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM daily_routine_slots WHERE date=?1 AND slot_key=?2",
            params![date, key],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn save_agenda_note(&self, id: &str, note: &str) -> Result<(), String> {
        if note.chars().count() > 5000 {
            return Err("正文不能超过 5000 字符".into());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let n = conn
            .execute(
                "UPDATE agenda_items SET note=?2,updated_at=?3 WHERE id=?1",
                params![
                    id,
                    if note.trim().is_empty() {
                        None
                    } else {
                        Some(note.trim())
                    },
                    now_iso()
                ],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("找不到这条议程事项".into());
        }
        Ok(())
    }
    pub fn duplicate_agenda_item(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        let new_id = uuid::Uuid::new_v4().to_string();
        let now = now_iso();
        let n = tx.execute("INSERT INTO agenda_items(id,title,note,pinned,archived,sort_order,created_at,updated_at) SELECT ?2,substr(title,1,117)||' 副本',note,0,0,(SELECT COALESCE(MAX(sort_order)+1,0) FROM agenda_items),?3,?3 FROM agenda_items WHERE id=?1", params![id,new_id,now]).map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("找不到这条议程事项".into());
        }
        for sub in list_agenda_subitems_with(&tx)?
            .into_iter()
            .filter(|s| s.item_id == id)
        {
            tx.execute("INSERT INTO agenda_subitems(id,item_id,title,done,done_at,sort_order,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?7)", params![uuid::Uuid::new_v4().to_string(),new_id,sub.title,b(sub.done),sub.done_at,sub.sort_order,now]).map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn export_json(&self) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        export_json_with(&conn, &self.dir, 4)
    }
}

/// 真正写备份的地方：拿着连接直接查。
/// 不能调 `&self` 的方法 —— 那些方法会再把 Mutex 锁一次，直接死锁。
/// `version`：迁移前按原库 schema 传 1/2/3，正常导出传 4。
fn export_json_with(conn: &Connection, dir: &Path, version: i64) -> Result<String, String> {
    let mut cd_stmt = conn
        .prepare(&format!(
            "SELECT {CD_COLS} FROM countdowns ORDER BY target_date ASC"
        ))
        .map_err(|e| e.to_string())?;
    let countdowns = cd_stmt
        .query_map([], cd_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut ev_stmt = conn
        .prepare(
            "SELECT id,title,start_date,end_date,all_day,start_time,end_time,note,location,\
             color,remind_minutes,repeat_rule,repeat_until,created_at,updated_at FROM events \
             ORDER BY start_date ASC",
        )
        .map_err(|e| e.to_string())?;
    let events = ev_stmt
        .query_map([], |r| {
            Ok(CalEvent {
                id: r.get(0)?,
                title: r.get(1)?,
                start_date: r.get(2)?,
                end_date: r.get(3)?,
                all_day: r.get::<_, i64>(4)? != 0,
                start_time: r.get(5)?,
                end_time: r.get(6)?,
                note: r.get(7)?,
                location: r.get(8)?,
                color: r.get(9)?,
                remind_minutes: r.get(10)?,
                repeat_rule: r.get(11)?,
                repeat_until: r.get(12)?,
                created_at: r.get(13)?,
                updated_at: r.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut st_stmt = conn
        .prepare("SELECT key, value FROM settings ORDER BY key ASC")
        .map_err(|e| e.to_string())?;
    let settings = st_stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let milestones: Vec<Milestone> = if table_exists(conn, "milestones")? {
        list_milestones_with(conn)?
    } else {
        Vec::new()
    };

    // v1.2 · DATA-07：议程事项与子项
    let (agenda_items, agenda_subitems): (Vec<AgendaItem>, Vec<AgendaSubitem>) =
        if table_exists(conn, "agenda_items")? {
            (
                list_agenda_items_with(conn)?,
                list_agenda_subitems_with(conn)?,
            )
        } else {
            (Vec::new(), Vec::new())
        };

    let daily_routine_slots = if table_exists(conn, "daily_routine_slots")? {
        list_routine_with(conn, None)?
    } else {
        Vec::new()
    };
    let payload = serde_json::json!({
        "version": version,
        "exportedAt": now_iso(),
        "countdowns": countdowns,
        "milestones": milestones,
        "agendaItems": agenda_items,
        "agendaSubitems": agenda_subitems,
        "dailyRoutineSlots": daily_routine_slots,
        "events": events,
        "settings": settings,
    });
    let text = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    let file = dir.join(format!(
        "runningdo-backup-{}.json",
        Local::now().format("%Y%m%d-%H%M%S-%f")
    ));
    std::fs::write(&file, &text).map_err(|e| format!("写入备份失败: {e}"))?;
    Ok(file.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{CountdownInput, EventInput};

    fn tmp_db() -> Db {
        let dir = std::env::temp_dir().join(format!("rd-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        Db::open(dir.join("t.db")).unwrap()
    }

    fn cd(title: &str, date: &str) -> CountdownInput {
        CountdownInput {
            id: None,
            title: title.into(),
            target_date: date.into(),
            target_time: None,
            start_date: None,
            note: None,
            color: Some("cinnabar".into()),
            pinned: false,
            crowned: None,
            show_on_calendar: true,
            repeat_rule: None,
            archived: false,
            remind_days: None,
        }
    }

    fn ev(title: &str, s: &str, e: &str) -> EventInput {
        EventInput {
            id: None,
            title: title.into(),
            start_date: s.into(),
            end_date: e.into(),
            all_day: true,
            start_time: None,
            end_time: None,
            note: None,
            location: None,
            color: Some("indigo".into()),
            remind_minutes: Some(15),
            repeat_rule: None,
            repeat_until: None,
        }
    }

    #[test]
    fn countdown_crud_and_order() {
        let db = tmp_db();
        assert!(db.list_countdowns().unwrap().is_empty());

        let a = db.save_countdown(cd("期末考试", "2026-06-07")).unwrap();
        let b = db.save_countdown(cd("项目交付", "2026-07-10")).unwrap();
        assert_eq!(db.list_countdowns().unwrap().len(), 2);
        // 默认按 target_date 升序
        let list = db.list_countdowns().unwrap();
        assert_eq!(list[0].id, a.id);
        assert_eq!(list[1].id, b.id);

        // 更新（同一 id 不新增）
        let mut upd = cd("期末考试（改）", "2026-06-01");
        upd.id = Some(a.id.clone());
        upd.pinned = true;
        let saved = db.save_countdown(upd).unwrap();
        assert_eq!(saved.title, "期末考试（改）");
        assert_eq!(db.list_countdowns().unwrap().len(), 2);
        // 置顶项排最前
        assert_eq!(db.list_countdowns().unwrap()[0].id, a.id);
        assert!(db.list_countdowns().unwrap()[0].pinned);

        db.delete_countdown(&a.id).unwrap();
        assert_eq!(db.list_countdowns().unwrap().len(), 1);
    }

    /* ---------------- 皇冠 ---------------- */

    fn ids_with_crown(db: &Db) -> Vec<String> {
        db.list_countdowns()
            .unwrap()
            .into_iter()
            .filter(|c| c.crowned)
            .map(|c| c.id)
            .collect()
    }

    #[test]
    fn crown_is_globally_unique() {
        let db = tmp_db();
        let a = db.save_countdown(cd("期末", "2026-06-07")).unwrap();
        let b = db.save_countdown(cd("交付", "2026-07-10")).unwrap();
        let c = db.save_countdown(cd("生日", "2026-08-01")).unwrap();
        assert!(ids_with_crown(&db).is_empty(), "默认不该有皇冠");

        db.set_crown(Some(&a.id)).unwrap();
        assert_eq!(ids_with_crown(&db), vec![a.id.clone()]);

        // 设新的 → 旧的自动摘掉
        db.set_crown(Some(&b.id)).unwrap();
        assert_eq!(ids_with_crown(&db), vec![b.id.clone()]);

        db.set_crown(Some(&c.id)).unwrap();
        assert_eq!(ids_with_crown(&db), vec![c.id.clone()]);

        // 取消
        db.set_crown(None).unwrap();
        assert!(ids_with_crown(&db).is_empty());
        db.set_crown(Some(&a.id)).unwrap();
        db.set_crown(Some("")).unwrap();
        assert!(ids_with_crown(&db).is_empty(), "空串也应视为取消");
    }

    #[test]
    fn crowned_sorts_first() {
        let db = tmp_db();
        let a = db.save_countdown(cd("早的", "2026-01-01")).unwrap();
        let b = db.save_countdown(cd("晚的", "2026-12-31")).unwrap();
        // 不加冠时按日期升序
        assert_eq!(db.list_countdowns().unwrap()[0].id, a.id);
        db.set_crown(Some(&b.id)).unwrap();
        // 加冠后即使日期更晚也排最前
        assert_eq!(db.list_countdowns().unwrap()[0].id, b.id);
        assert!(db.list_countdowns().unwrap()[0].crowned);
    }

    #[test]
    fn crown_survives_partial_saves() {
        let db = tmp_db();
        let a = db.save_countdown(cd("期末", "2026-06-07")).unwrap();
        db.set_crown(Some(&a.id)).unwrap();

        // 模拟「点一下置顶」：入参没带 crowned
        let mut pin = cd("期末", "2026-06-07");
        pin.id = Some(a.id.clone());
        pin.pinned = true;
        let saved = db.save_countdown(pin).unwrap();
        assert!(saved.pinned, "置顶应生效");
        assert!(saved.crowned, "顺手保存不该把皇冠弄丢");

        // 模拟「归档」
        let mut arch = cd("期末", "2026-06-07");
        arch.id = Some(a.id.clone());
        arch.pinned = true;
        arch.archived = true;
        let saved = db.save_countdown(arch).unwrap();
        assert!(saved.archived && saved.crowned);

        // 显式传 false 才能摘掉
        let mut off = cd("期末", "2026-06-07");
        off.id = Some(a.id.clone());
        off.crowned = Some(false);
        assert!(!db.save_countdown(off).unwrap().crowned);
    }

    #[test]
    fn save_countdown_with_crown_also_dedupes() {
        let db = tmp_db();
        let a = db.save_countdown(cd("甲", "2026-01-01")).unwrap();
        let b = db.save_countdown(cd("乙", "2026-02-01")).unwrap();
        db.set_crown(Some(&a.id)).unwrap();
        // 通过 save 直接把皇冠给乙，甲应被摘掉
        let mut give = cd("乙", "2026-02-01");
        give.id = Some(b.id.clone());
        give.crowned = Some(true);
        assert!(db.save_countdown(give).unwrap().crowned);
        assert_eq!(ids_with_crown(&db), vec![b.id.clone()]);
    }

    #[test]
    fn set_crown_unknown_id_errors() {
        let db = tmp_db();
        assert!(db.set_crown(Some("not-a-real-id")).is_err());
        // 报错后不应残留半截状态
        assert!(ids_with_crown(&db).is_empty());
    }

    /// 真实场景：用户机器上已经有一个不含 `crowned` 列的老库。
    /// 升级后旧数据必须完好，并且能正常设皇冠。
    #[test]
    fn migrates_old_db_without_crowned_column() {
        use rusqlite::Connection;

        let dir = std::env::temp_dir().join(format!("rd-old-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.db");

        // 手搓一个 v0.1 初版表结构（没有 crowned）
        {
            let c = Connection::open(&path).unwrap();
            c.execute_batch(
                "CREATE TABLE countdowns (\n                    id TEXT PRIMARY KEY, title TEXT NOT NULL, target_date TEXT NOT NULL,\n                    target_time TEXT, start_date TEXT, note TEXT, color TEXT,\n                    pinned INTEGER NOT NULL DEFAULT 0,\n                    show_on_calendar INTEGER NOT NULL DEFAULT 1,\n                    repeat_rule TEXT, archived INTEGER NOT NULL DEFAULT 0,\n                    remind_days TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL\n                );\n                CREATE TABLE events (id TEXT PRIMARY KEY, title TEXT NOT NULL,\n                    start_date TEXT NOT NULL, end_date TEXT NOT NULL,\n                    all_day INTEGER NOT NULL DEFAULT 1, start_time TEXT, end_time TEXT,\n                    note TEXT, location TEXT, color TEXT, remind_minutes INTEGER,\n                    repeat_rule TEXT, repeat_until TEXT,\n                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);\n                CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
            )
            .unwrap();
            c.execute(
                "INSERT INTO countdowns (id,title,target_date,pinned,show_on_calendar,archived,\
                 created_at,updated_at) VALUES ('old-1','老数据','2026-09-09',1,1,0,'x','x')",
                [],
            )
            .unwrap();
        }

        // 用新代码打开 → 应自动补列，且不丢数据
        let db = Db::open(path).unwrap();
        let list = db.list_countdowns().unwrap();
        assert_eq!(list.len(), 1, "升级后旧数据丢了");
        assert_eq!(list[0].title, "老数据");
        assert!(list[0].pinned, "旧的置顶状态要保留");
        assert!(!list[0].crowned, "补的列默认应为 0");

        // 补的列能用
        db.set_crown(Some("old-1")).unwrap();
        assert_eq!(ids_with_crown(&db), vec!["old-1".to_string()]);
    }

    #[test]
    fn crown_defaults_to_false_and_survives_reopen() {
        let dir = std::env::temp_dir().join(format!("rd-crown-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.db");
        {
            let db = Db::open(path.clone()).unwrap();
            let a = db.save_countdown(cd("期末", "2026-06-07")).unwrap();
            assert!(!a.crowned);
            db.set_crown(Some(&a.id)).unwrap();
        }
        // 重开（走一遍 migrate）后皇冠还在
        let db = Db::open(path).unwrap();
        let list = db.list_countdowns().unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].crowned);
    }

    #[test]
    fn countdown_rejects_empty_title() {
        let db = tmp_db();
        let mut bad = cd("   ", "2026-06-07");
        bad.title = "   ".into();
        assert!(db.save_countdown(bad).is_err());
    }

    #[test]
    fn events_range_query_and_normalize() {
        let db = tmp_db();
        // end 早于 start → 自动交换
        let e = db
            .save_event(ev("日本旅行", "2026-06-05", "2026-06-01"))
            .unwrap();
        assert_eq!(e.start_date, "2026-06-01");
        assert_eq!(e.end_date, "2026-06-05");
        assert_eq!(e.remind_minutes, Some(15));

        db.save_event(ev("远方的会", "2026-09-09", "2026-09-09"))
            .unwrap();

        // 只取 6 月区间
        let june = db.list_events("2026-06-01", "2026-06-30").unwrap();
        assert_eq!(june.len(), 1);
        assert_eq!(june[0].title, "日本旅行");

        // 覆盖 9 月
        assert_eq!(db.list_events("2026-09-01", "2026-09-30").unwrap().len(), 1);

        // 空区间
        assert_eq!(db.list_events("2026-01-01", "2026-01-31").unwrap().len(), 0);
    }

    #[test]
    fn event_move_and_delete() {
        let db = tmp_db();
        let e = db
            .save_event(ev("改期", "2026-06-01", "2026-06-03"))
            .unwrap();
        db.move_event(&e.id, "2026-06-10", "2026-06-12").unwrap();
        let got = db.list_events("2026-06-01", "2026-06-30").unwrap();
        assert_eq!(got[0].start_date, "2026-06-10");
        assert_eq!(got[0].end_date, "2026-06-12");

        db.delete_event(&e.id).unwrap();
        assert!(db
            .list_events("2026-06-01", "2026-06-30")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn settings_upsert() {
        let db = tmp_db();
        db.set_setting("week_start", "0").unwrap();
        db.set_setting("week_start", "1").unwrap();
        db.set_setting("showLunar", "false").unwrap();
        let all = db.all_settings().unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all.iter().find(|(k, _)| k == "week_start").unwrap().1, "1");
    }

    #[test]
    fn export_writes_json() {
        let db = tmp_db();
        db.save_countdown(cd("备份目标", "2026-06-07")).unwrap();
        db.save_event(ev("备份事件", "2026-06-01", "2026-06-02"))
            .unwrap();
        let path = db.export_json().unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("备份目标"));
        assert!(text.contains("备份事件"));
        // v1.2：version 3（milestones + agendaItems + agendaSubitems）
        assert!(text.contains("\"version\": 4"));
        assert!(text.contains("\"milestones\""));
        assert!(text.contains("\"agendaItems\""));
    }

    // ---------- 里程碑（v1.1 · CD-16） ----------

    fn ms(cd_id: &str, title: &str) -> MilestoneInput {
        MilestoneInput {
            id: None,
            countdown_id: cd_id.into(),
            title: title.into(),
            done: false,
            sort_order: None,
        }
    }

    #[test]
    fn milestone_crud_and_order() {
        let db = tmp_db();
        let c = db.save_countdown(cd("带里程碑", "2026-06-07")).unwrap();
        let m1 = db.save_milestone(ms(&c.id, "开题报告")).unwrap();
        let m2 = db.save_milestone(ms(&c.id, "实验数据")).unwrap();
        let m3 = db.save_milestone(ms(&c.id, "初稿")).unwrap();

        // 不传 sort_order → 依次追加
        assert_eq!((m1.sort_order, m2.sort_order, m3.sort_order), (0, 1, 2));

        let all = db.list_milestones().unwrap();
        assert_eq!(all.len(), 3);
        assert_eq!(
            all.iter().map(|m| m.title.as_str()).collect::<Vec<_>>(),
            vec!["开题报告", "实验数据", "初稿"]
        );

        // 改名
        let renamed = db
            .save_milestone(MilestoneInput {
                id: Some(m2.id.clone()),
                ..ms(&c.id, "实验数据回收")
            })
            .unwrap();
        assert_eq!(renamed.title, "实验数据回收");
        assert_eq!(renamed.sort_order, 1, "改名不应打乱顺序");

        // 删除
        db.delete_milestone(&m1.id).unwrap();
        assert_eq!(db.list_milestones().unwrap().len(), 2);
    }

    #[test]
    fn milestone_toggle_sets_done_at_once() {
        let db = tmp_db();
        let c = db.save_countdown(cd("勾选", "2026-06-07")).unwrap();
        let m = db.save_milestone(ms(&c.id, "跑完测试")).unwrap();
        assert!(m.done_at.is_none());

        let done = db
            .save_milestone(MilestoneInput {
                id: Some(m.id.clone()),
                done: true,
                ..ms(&c.id, "跑完测试")
            })
            .unwrap();
        assert!(done.done);
        let first_stamp = done.done_at.clone().expect("勾选时应写入 done_at");

        // 再次保存（比如只是改名）不得把首次勾选时间刷掉
        let again = db
            .save_milestone(MilestoneInput {
                id: Some(m.id.clone()),
                title: "跑完测试（改名）".into(),
                done: true,
                ..ms(&c.id, "跑完测试")
            })
            .unwrap();
        assert_eq!(again.done_at.as_deref(), Some(first_stamp.as_str()));

        // 取消勾选 → 清掉时间
        let undone = db
            .save_milestone(MilestoneInput {
                id: Some(m.id.clone()),
                done: false,
                ..ms(&c.id, "跑完测试")
            })
            .unwrap();
        assert!(!undone.done);
        assert!(undone.done_at.is_none());
    }

    #[test]
    fn milestone_cascade_delete_with_countdown() {
        let db = tmp_db();
        let c = db.save_countdown(cd("会被删掉", "2026-06-07")).unwrap();
        let keep = db.save_countdown(cd("要留着", "2026-07-07")).unwrap();
        db.save_milestone(ms(&c.id, "子项 A")).unwrap();
        db.save_milestone(ms(&c.id, "子项 B")).unwrap();
        db.save_milestone(ms(&keep.id, "别人的子项")).unwrap();
        assert_eq!(db.list_milestones().unwrap().len(), 3);

        db.delete_countdown(&c.id).unwrap();

        let left = db.list_milestones().unwrap();
        assert_eq!(left.len(), 1, "删倒计时应该靠外键级联删掉它的里程碑");
        assert_eq!(left[0].countdown_id, keep.id);
    }

    #[test]
    fn milestone_rejects_empty_title_and_unknown_parent() {
        let db = tmp_db();
        let c = db.save_countdown(cd("校验", "2026-06-07")).unwrap();
        assert!(db.save_milestone(ms(&c.id, "   ")).is_err());
        assert!(db.save_milestone(ms("不存在的-id", "孤儿")).is_err());
    }

    #[test]
    fn export_includes_milestones() {
        let db = tmp_db();
        let c = db.save_countdown(cd("带子项", "2026-06-07")).unwrap();
        let m = db.save_milestone(ms(&c.id, "写 PRD")).unwrap();
        db.save_milestone(MilestoneInput {
            id: Some(m.id.clone()),
            done: true,
            ..ms(&c.id, "写 PRD")
        })
        .unwrap();

        let path = db.export_json().unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"version\": 4"));
        assert!(text.contains("写 PRD"));
        assert!(text.contains("\"countdownId\""));
    }

    #[test]
    fn migration_from_v1_db_creates_table_and_backup() {
        // 手搬一份 v1.0 的库（无 milestones 表），验证升级幂等且留下兜底备份
        let dir = std::env::temp_dir().join(format!("rd-mig-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE countdowns (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, target_date TEXT NOT NULL,
                    target_time TEXT, start_date TEXT, note TEXT, color TEXT,
                    pinned INTEGER NOT NULL DEFAULT 0, show_on_calendar INTEGER NOT NULL DEFAULT 1,
                    repeat_rule TEXT, archived INTEGER NOT NULL DEFAULT 0, remind_days TEXT,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    crowned INTEGER NOT NULL DEFAULT 0);
                 CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE events (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 1, start_time TEXT,
                    end_time TEXT, note TEXT, location TEXT, color TEXT, remind_minutes INTEGER,
                    repeat_rule TEXT, repeat_until TEXT, created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL);
                 INSERT INTO countdowns (id,title,target_date,created_at,updated_at)
                    VALUES ('old-1','升级前就有的','2026-12-31','2026-01-01T00:00:00','2026-01-01T00:00:00');",
            )
            .unwrap();
        }

        let db = Db::open(path.clone()).unwrap();
        let list = db.list_countdowns().unwrap();
        assert_eq!(list.len(), 1, "升级不能丢老数据");
        assert!(db.list_milestones().unwrap().is_empty());
        // 老记录能直接挂里程碑
        db.save_milestone(ms("old-1", "升级后新增的")).unwrap();
        assert_eq!(db.list_milestones().unwrap().len(), 1);

        // 迁移前兜底备份：目录里应出现一份 JSON，且含老数据
        let backups: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("runningdo-backup-")
            })
            .collect();
        assert_eq!(backups.len(), 1, "首次加表前应留下一份兜底备份");
        let text = std::fs::read_to_string(backups[0].path()).unwrap();
        assert!(text.contains("升级前就有的"));

        // 幂等：再开一次不会重复备份、也不会报错
        let db2 = Db::open(path).unwrap();
        assert_eq!(db2.list_milestones().unwrap().len(), 1);
        let again: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("runningdo-backup-")
            })
            .collect();
        assert_eq!(again.len(), 1, "重启不应反复备份");
    }

    // ---------- 议程事项（v1.2 · AG-01 ~ AG-05） ----------

    fn ag(title: &str) -> AgendaItemInput {
        AgendaItemInput {
            id: None,
            title: title.into(),
            note: None,
            pinned: false,
            archived: false,
            sort_order: None,
        }
    }

    fn ags(item_id: &str, title: &str) -> AgendaSubitemInput {
        AgendaSubitemInput {
            id: None,
            item_id: item_id.into(),
            title: title.into(),
            done: false,
            sort_order: None,
        }
    }

    #[test]
    fn agenda_item_crud_and_order() {
        let db = tmp_db();
        let a = db.save_agenda_item(ag("准备投稿")).unwrap();
        let b = db.save_agenda_item(ag("读完那本书")).unwrap();
        let c = db.save_agenda_item(ag("整理桌面")).unwrap();
        assert_eq!((a.sort_order, b.sort_order, c.sort_order), (0, 1, 2));
        assert_eq!(
            db.list_agenda_items()
                .unwrap()
                .iter()
                .map(|x| x.title.as_str())
                .collect::<Vec<_>>(),
            vec!["准备投稿", "读完那本书", "整理桌面"]
        );

        // 改名不得打乱顺序（None = 保持原状）
        let renamed = db
            .save_agenda_item(AgendaItemInput {
                id: Some(b.id.clone()),
                title: "读完那本书（第 2 版）".into(),
                ..ag("读完那本书")
            })
            .unwrap();
        assert_eq!(renamed.sort_order, 1);

        // 归档 / 恢复
        let archived = db
            .save_agenda_item(AgendaItemInput {
                id: Some(b.id.clone()),
                archived: true,
                ..ag("读完那本书（第 2 版）")
            })
            .unwrap();
        assert!(archived.archived);
        assert_eq!(db.list_agenda_items().unwrap().len(), 3, "归档不是删除");

        // 置顶排在最前
        db.save_agenda_item(AgendaItemInput {
            id: Some(c.id.clone()),
            pinned: true,
            ..ag("整理桌面")
        })
        .unwrap();
        assert_eq!(db.list_agenda_items().unwrap()[0].id, c.id);

        db.delete_agenda_item(&a.id).unwrap();
        assert_eq!(db.list_agenda_items().unwrap().len(), 2);
    }

    #[test]
    fn agenda_item_rejects_empty_title() {
        let db = tmp_db();
        assert!(db.save_agenda_item(ag("   ")).is_err());
    }

    #[test]
    fn agenda_subitem_crud_toggle_and_order() {
        let db = tmp_db();
        let item = db.save_agenda_item(ag("准备投稿")).unwrap();
        let s1 = db.save_agenda_subitem(ags(&item.id, "写摘要")).unwrap();
        let s2 = db.save_agenda_subitem(ags(&item.id, "画图")).unwrap();
        let s3 = db.save_agenda_subitem(ags(&item.id, "初稿")).unwrap();
        assert_eq!((s1.sort_order, s2.sort_order, s3.sort_order), (0, 1, 2));
        assert!(s1.done_at.is_none());
        assert_eq!(db.list_agenda_subitems().unwrap().len(), 3);

        // 勾选 → 写入完成时间；重复保存不刷新
        let done = db
            .save_agenda_subitem(AgendaSubitemInput {
                id: Some(s1.id.clone()),
                done: true,
                ..ags(&item.id, "写摘要")
            })
            .unwrap();
        let stamp = done.done_at.clone().expect("勾选要写 done_at");
        let again = db
            .save_agenda_subitem(AgendaSubitemInput {
                id: Some(s1.id.clone()),
                title: "写摘要（改名）".into(),
                done: true,
                ..ags(&item.id, "写摘要")
            })
            .unwrap();
        assert_eq!(again.done_at.as_deref(), Some(stamp.as_str()));
        assert_eq!(again.sort_order, 0, "改名不打乱顺序");

        // 取消勾选 → 清空时间
        let undone = db
            .save_agenda_subitem(AgendaSubitemInput {
                id: Some(s1.id.clone()),
                done: false,
                ..ags(&item.id, "写摘要（改名）")
            })
            .unwrap();
        assert!(undone.done_at.is_none());

        // 树上的子项必须属于某个事项
        assert!(db.save_agenda_subitem(ags("不存在的-id", "孤儿")).is_err());
        assert!(db.save_agenda_subitem(ags(&item.id, "  ")).is_err());

        db.delete_agenda_subitem(&s3.id).unwrap();
        assert_eq!(db.list_agenda_subitems().unwrap().len(), 2);
    }

    #[test]
    fn agenda_subitems_cascade_with_item() {
        let db = tmp_db();
        let keep = db.save_agenda_item(ag("要留着")).unwrap();
        let gone = db.save_agenda_item(ag("会被删")).unwrap();
        db.save_agenda_subitem(ags(&gone.id, "子项 A")).unwrap();
        db.save_agenda_subitem(ags(&gone.id, "子项 B")).unwrap();
        db.save_agenda_subitem(ags(&keep.id, "别人的子项")).unwrap();
        assert_eq!(db.list_agenda_subitems().unwrap().len(), 3);

        db.delete_agenda_item(&gone.id).unwrap();

        let left = db.list_agenda_subitems().unwrap();
        assert_eq!(left.len(), 1, "删事项应由外键级联删掉它的子项");
        assert_eq!(left[0].item_id, keep.id);
    }

    #[test]
    fn schedule_agenda_item_creates_event_and_archives() {
        let db = tmp_db();
        let item = db
            .save_agenda_item(AgendaItemInput {
                note: Some("来自议程的备注".into()),
                ..ag("准备投稿")
            })
            .unwrap();
        db.save_agenda_subitem(AgendaSubitemInput {
            done: true,
            ..ags(&item.id, "已完成的子项")
        })
        .unwrap();
        db.save_agenda_subitem(ags(&item.id, "未完成 A")).unwrap();
        db.save_agenda_subitem(ags(&item.id, "未完成 B")).unwrap();

        let ev = db.schedule_agenda_item(&item.id, "2026-10-12").unwrap();
        assert_eq!(ev.title, "准备投稿");
        assert_eq!(ev.start_date, "2026-10-12");
        assert_eq!(ev.end_date, "2026-10-12");
        assert!(ev.all_day);
        let note = ev.note.clone().unwrap_or_default();
        assert!(note.contains("来自议程的备注"));
        assert!(note.contains("未完成 A") && note.contains("未完成 B"));
        assert!(!note.contains("已完成的子项"), "已完成的不该再列进事件备注");

        // 事项离开待办池；子项保留（不删数据）
        let items = db.list_agenda_items().unwrap();
        assert!(items.iter().find(|x| x.id == item.id).unwrap().archived);
        assert_eq!(db.list_agenda_subitems().unwrap().len(), 3);

        // 事件真的落库了
        let events = db.list_events("2026-10-01", "2026-10-31").unwrap();
        assert!(events.iter().any(|e| e.id == ev.id));

        // 未知 id 要报错，且不能留下半个事件
        assert!(db
            .schedule_agenda_item("不存在的-id", "2026-10-12")
            .is_err());
        assert_eq!(db.list_events("2026-10-01", "2026-10-31").unwrap().len(), 1);
    }

    #[test]
    fn export_includes_agenda_and_version_4() {
        let db = tmp_db();
        let item = db.save_agenda_item(ag("导出用事项")).unwrap();
        db.save_agenda_subitem(ags(&item.id, "导出用子项")).unwrap();
        let path = db.export_json().unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"version\": 4"));
        assert!(text.contains("导出用事项"));
        assert!(text.contains("导出用子项"));
        assert!(text.contains("\"agendaItems\""));
        assert!(text.contains("\"agendaSubitems\""));
    }

    #[test]
    fn migration_to_v12_keeps_v11_data_and_backs_up() {
        // 搬一份 v1.1 的库（有 milestones、没有 agenda_*），验证升级无损 + 留下兜底备份
        let dir = std::env::temp_dir().join(format!("rd-ag-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE countdowns (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, target_date TEXT NOT NULL,
                    target_time TEXT, start_date TEXT, note TEXT, color TEXT,
                    pinned INTEGER NOT NULL DEFAULT 0, crowned INTEGER NOT NULL DEFAULT 0,
                    show_on_calendar INTEGER NOT NULL DEFAULT 1, repeat_rule TEXT,
                    archived INTEGER NOT NULL DEFAULT 0, remind_days TEXT,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                 CREATE TABLE events (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 1, start_time TEXT,
                    end_time TEXT, note TEXT, location TEXT, color TEXT, remind_minutes INTEGER,
                    repeat_rule TEXT, repeat_until TEXT, created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL);
                 CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE milestones (
                    id TEXT PRIMARY KEY, countdown_id TEXT NOT NULL, title TEXT NOT NULL,
                    done INTEGER NOT NULL DEFAULT 0, done_at TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                 INSERT INTO countdowns (id,title,target_date,created_at,updated_at)
                    VALUES ('v11-cd','v1.1 的倒计时','2026-12-31','2026-01-01T00:00:00','2026-01-01T00:00:00');
                 INSERT INTO milestones (id,countdown_id,title,created_at,updated_at)
                    VALUES ('v11-ms','v11-cd','v1.1 的里程碑','2026-01-01T00:00:00','2026-01-01T00:00:00');",
            )
            .unwrap();
        }

        let db = Db::open(path.clone()).unwrap();
        assert_eq!(db.list_countdowns().unwrap().len(), 1);
        assert_eq!(db.list_milestones().unwrap().len(), 1, "v1.1 数据不能丢");
        assert!(db.list_agenda_items().unwrap().is_empty());
        db.save_agenda_item(ag("升级后新增的事项")).unwrap();
        assert_eq!(db.list_agenda_items().unwrap().len(), 1);

        let backups: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("runningdo-backup-")
            })
            .collect();
        assert_eq!(backups.len(), 1, "首次加表前应留一份兜底备份");
        let text = std::fs::read_to_string(backups[0].path()).unwrap();
        assert!(text.contains("v1.1 的里程碑"));

        // 幂等
        let db2 = Db::open(path).unwrap();
        assert_eq!(db2.list_agenda_items().unwrap().len(), 1);
        let again: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("runningdo-backup-")
            })
            .collect();
        assert_eq!(again.len(), 1, "重启不应反复备份");
    }
    #[test]
    fn routine_slots_are_sparse_unique_and_date_isolated() {
        let db = tmp_db();
        assert!(db
            .list_daily_routine_slots("2026-10-02")
            .unwrap()
            .is_empty());
        assert!(db
            .list_daily_routine_slots("2026-10-03")
            .unwrap()
            .is_empty());
        let first = db
            .save_daily_routine_slot("2026-10-02", "morning_1", " 英语 ")
            .unwrap();
        assert_eq!(first.category, "英语");
        let second = db
            .save_daily_routine_slot("2026-10-02", "morning_1", "新类别")
            .unwrap();
        assert_eq!(second.created_at, first.created_at);
        assert_eq!(db.list_daily_routine_slots("2026-10-02").unwrap().len(), 1);
        db.save_daily_routine_slot("2026-10-03", "morning_1", "课程")
            .unwrap();
        db.clear_daily_routine_slot("2026-10-02", "morning_1")
            .unwrap();
        assert!(db
            .list_daily_routine_slots("2026-10-02")
            .unwrap()
            .is_empty());
        assert_eq!(
            db.list_daily_routine_slots("2026-10-03").unwrap()[0].category,
            "课程"
        );
        assert!(db
            .list_events("2026-01-01", "2027-01-01")
            .unwrap()
            .is_empty());
    }
    #[test]
    fn routine_validation_rejects_bad_dates_slots_and_categories() {
        let db = tmp_db();
        for date in ["2026-02-30", "2026-2-02", "garbage", "2025-02-29"] {
            assert!(db.list_daily_routine_slots(date).is_err());
            assert!(db
                .save_daily_routine_slot(date, "morning_1", "英语")
                .is_err());
        }
        assert!(db
            .save_daily_routine_slot("2026-10-02", "other", "英语")
            .is_err());
        for category in ["   ".to_string(), "英".repeat(21)] {
            assert!(db
                .save_daily_routine_slot("2026-10-02", "morning_1", &category)
                .is_err());
        }
        assert!(db.clear_daily_routine_slot("2026-10-02", "other").is_err());
        assert!(db
            .list_daily_routine_slots("2026-10-02")
            .unwrap()
            .is_empty());
        assert!(db
            .save_daily_routine_slot("2028-02-29", "evening", &"😀".repeat(20))
            .is_ok());
    }
    #[test]
    fn agenda_note_patch_and_duplicate_preserve_every_part() {
        let db = tmp_db();
        let mut input = ag("混合便签");
        input.pinned = true;
        let item = db.save_agenda_item(input).unwrap();
        let sub = db.save_agenda_subitem(ags(&item.id, "待办")).unwrap();
        let mut done = ags(&item.id, "待办");
        done.id = Some(sub.id);
        done.done = true;
        db.save_agenda_subitem(done).unwrap();
        db.save_agenda_note(&item.id, "正文\n第二行").unwrap();
        let patched = db
            .list_agenda_items()
            .unwrap()
            .into_iter()
            .find(|i| i.id == item.id)
            .unwrap();
        assert!(patched.pinned);
        assert_eq!(patched.title, item.title);
        assert_eq!(patched.sort_order, item.sort_order);
        db.duplicate_agenda_item(&item.id).unwrap();
        let copy = db
            .list_agenda_items()
            .unwrap()
            .into_iter()
            .find(|i| i.id != item.id)
            .unwrap();
        assert_eq!(copy.note, patched.note);
        assert!(!copy.pinned);
        assert!(!copy.archived);
        let copied = db
            .list_agenda_subitems()
            .unwrap()
            .into_iter()
            .find(|s| s.item_id == copy.id)
            .unwrap();
        assert!(copied.done);
        assert!(copied.done_at.is_some());
        let before = db.list_agenda_items().unwrap().len();
        assert!(db.duplicate_agenda_item("unknown").is_err());
        assert_eq!(db.list_agenda_items().unwrap().len(), before);
        assert!(db.save_agenda_note("unknown", "text").is_err());
        assert!(db.save_agenda_note(&item.id, &"文".repeat(5001)).is_err());
        db.save_agenda_note(&item.id, "  ").unwrap();
        assert!(db
            .list_agenda_items()
            .unwrap()
            .iter()
            .find(|i| i.id == item.id)
            .unwrap()
            .note
            .is_none());
    }
    #[test]
    fn export_v4_contains_routine_and_all_existing_data() {
        let db = tmp_db();
        let item = db.save_agenda_item(ag("旧便签")).unwrap();
        db.save_agenda_note(&item.id, "正文").unwrap();
        db.save_agenda_subitem(ags(&item.id, "子项")).unwrap();
        db.save_daily_routine_slot("2026-10-02", "evening", "开发")
            .unwrap();
        let path = db.export_json().unwrap();
        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        assert_eq!(json["version"], 4);
        assert_eq!(json["dailyRoutineSlots"][0]["category"], "开发");
        assert_eq!(json["agendaItems"][0]["note"], "正文");
        assert_eq!(json["agendaSubitems"].as_array().unwrap().len(), 1);
    }
    #[test]
    fn v13_migration_backs_up_v12_note_and_subitems_once() {
        let db = tmp_db();
        let item = db.save_agenda_item(ag("迁移旧便签")).unwrap();
        db.save_agenda_note(&item.id, "旧正文").unwrap();
        db.save_agenda_subitem(ags(&item.id, "旧子项")).unwrap();
        let dir = db.dir.clone();
        let path = dir.join("t.db");
        db.conn
            .lock()
            .unwrap()
            .execute_batch("DROP TABLE daily_routine_slots")
            .unwrap();
        drop(db);
        let upgraded = Db::open(path.clone()).unwrap();
        assert!(upgraded
            .list_daily_routine_slots("2026-10-02")
            .unwrap()
            .is_empty());
        assert_eq!(
            upgraded.list_agenda_items().unwrap()[0].note.as_deref(),
            Some("旧正文")
        );
        let backups: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("runningdo-backup-")
            })
            .collect();
        assert_eq!(backups.len(), 1);
        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(backups[0].path()).unwrap()).unwrap();
        assert_eq!(json["version"], 3);
        assert_eq!(json["agendaItems"][0]["note"], "旧正文");
        assert_eq!(json["agendaSubitems"].as_array().unwrap().len(), 1);
        drop(upgraded);
        let _again = Db::open(path).unwrap();
        assert_eq!(
            std::fs::read_dir(&dir)
                .unwrap()
                .flatten()
                .filter(|e| e
                    .file_name()
                    .to_string_lossy()
                    .starts_with("runningdo-backup-"))
                .count(),
            1
        );
    }
    #[test]
    fn migration_aborts_if_backup_cannot_be_written() {
        let db = tmp_db();
        db.conn
            .lock()
            .unwrap()
            .execute_batch("DROP TABLE daily_routine_slots")
            .unwrap();
        let path = db.dir.join("t.db");
        let invalid_dir = path.clone();
        let guarded = Db {
            conn: Mutex::new(Connection::open(path).unwrap()),
            dir: invalid_dir,
        };
        assert!(guarded.migrate().is_err());
        assert!(!table_exists(&guarded.conn.lock().unwrap(), "daily_routine_slots").unwrap());
    }
}
