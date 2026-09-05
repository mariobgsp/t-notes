#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ponytail: batch substring match for large-corpus search; JS keeps sync fallback
#[tauri::command]
fn match_notes(query: String, texts: Vec<String>) -> Vec<u8> {
    let q = query.to_lowercase();
    texts
        .iter()
        .map(|t| u8::from(t.to_lowercase().contains(&q)))
        .collect()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![match_notes])
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .run(tauri::generate_context!())
        .expect("error while running t-notes");
}
