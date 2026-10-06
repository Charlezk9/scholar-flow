mod commands;
mod diagnostics;
mod db;
mod library;
mod models;

use db::Db;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};

fn focus_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // ---------- 数据库 ----------
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db_path = dir.join("runningdo.db");
            let db = Db::open(db_path).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            diagnostics::record(&dir,serde_json::json!({"event":"APP_STARTED","stage":"startup"}));
            let panic_dir=dir.clone();
            let previous=std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {diagnostics::record(&panic_dir,serde_json::json!({"event":"RUST_PANIC","level":"ERROR","stage":"runtime"}));previous(info);}));
            app.manage(std::sync::Arc::new(db));

            // ---------- 菜单栏常驻（MAC-04） ----------
            let open_i = MenuItem::with_id(app, "open", "打开 RunningDO", true, None::<&str>)?;
            let new_cd = MenuItem::with_id(app, "new_countdown", "新建倒计时", true, None::<&str>)?;
            let new_ev = MenuItem::with_id(app, "new_event", "新建事件", true, None::<&str>)?;
            let today = MenuItem::with_id(app, "today", "回到今天", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出 RunningDO", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &new_cd, &new_ev, &today, &sep, &quit])?;

            let mut builder = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .tooltip("RunningDO");
            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone()).icon_as_template(true);
            }
            builder
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "open" => focus_main(app),
                    other => {
                        focus_main(app);
                        let _ = app.emit("menu-action", other.to_string());
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        focus_main(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭按钮 = 隐藏窗口，应用继续在菜单栏运行（MAC-04 / SET-11）
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_daily_routine_slots,
            commands::save_daily_routine_slot,
            commands::clear_daily_routine_slot,
            commands::save_agenda_note,
            commands::duplicate_agenda_item,
            commands::list_countdowns,
            commands::save_countdown,
            commands::delete_countdown,
            commands::set_crown,
            commands::list_milestones,
            commands::save_milestone,
            commands::delete_milestone,
            commands::list_agenda_items,
            commands::save_agenda_item,
            commands::delete_agenda_item,
            commands::list_agenda_subitems,
            commands::save_agenda_subitem,
            commands::delete_agenda_subitem,
            commands::schedule_agenda_item,
            commands::list_events,
            commands::save_event,
            commands::move_event,
            commands::delete_event,
            commands::all_settings,
            commands::set_setting,
            commands::export_json,
            commands::data_dir,
            commands::record_diagnostic,
            commands::read_diagnostics,
            commands::open_diagnostics_dir,
            commands::list_library_nodes,
            commands::save_library_node,
            commands::delete_library_node,
            commands::list_papers,
            commands::save_paper,
            commands::delete_paper,
            commands::list_paper_files,
            commands::import_paper_file,
            commands::choose_paper_file,
            commands::delete_paper_file,
            commands::read_paper_file,
            commands::list_paper_extracts,
            commands::save_paper_extract,
            commands::delete_paper_extract,
            commands::read_paper_extract,
            commands::read_translation_blocks,
            commands::translation_progress,
            commands::read_paper_asset,
            commands::list_tags,
            commands::ensure_tag,
            commands::literature_cloud_ready,
            commands::list_paper_tags,
            commands::set_paper_tag,
            commands::extract_paper_markdown,
        ])
        .run(tauri::generate_context!())
        .expect("RunningDO 启动失败");
}
