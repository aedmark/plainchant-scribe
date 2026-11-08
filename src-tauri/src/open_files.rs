// Books opened from the desktop (P7-05, D-050): an .epub double-clicked, dropped on the app's icon, or picked with
// Open With. Windows and Linux pass it as a command-line argument, to this process or, through the single-instance
// plugin, to the one already running; macOS sends it as RunEvent::Opened. The paths wait here until the webview takes
// them, and the webview can read only a path it was given, once, so the command is not a general file reader.
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

// Epub.LIMITS.total in src/epub.js: a larger book is refused before it is read into memory.
const MAX_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Default)]
pub struct OpenState {
    pending: Mutex<Vec<PathBuf>>,
    given: Mutex<HashSet<PathBuf>>,
}

fn is_epub(path: &Path) -> bool {
    path.extension().map(|e| e.eq_ignore_ascii_case("epub")).unwrap_or(false)
}

// The .epub paths among a launch's arguments (the first is the program), made absolute against its working folder.
// Linux file managers may pass a file:// URI instead of a path.
pub fn epub_args(args: &[String], cwd: &Path) -> Vec<PathBuf> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .filter_map(|a| {
            if a.starts_with("file://") {
                tauri::Url::parse(a).ok().and_then(|u| u.to_file_path().ok())
            } else {
                Some(cwd.join(a))
            }
        })
        .filter(|p| is_epub(p))
        .collect()
}

// Queues the paths and tells the webview, which then calls take_opened_books.
pub fn queue(app: &AppHandle, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    app.state::<OpenState>().pending.lock().unwrap().extend(paths);
    let _ = app.emit("books-opened", ());
}

// Brings the running window forward when a second launch hands it a file.
pub fn focus(app: &AppHandle) {
    if let Some(w) = app.webview_windows().values().next() {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
pub fn take_opened_books(state: tauri::State<OpenState>) -> Vec<String> {
    let paths: Vec<PathBuf> = state.pending.lock().unwrap().drain(..).collect();
    let mut given = state.given.lock().unwrap();
    paths
        .into_iter()
        .map(|p| {
            given.insert(p.clone());
            p.to_string_lossy().into_owned()
        })
        .collect()
}

#[tauri::command]
pub fn read_opened_book(path: String, state: tauri::State<OpenState>) -> Result<tauri::ipc::Response, String> {
    let path = PathBuf::from(path);
    if !state.given.lock().unwrap().remove(&path) {
        return Err("That file was not opened with Plainchant Scribe.".to_string());
    }
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let size = fs::metadata(&path).map_err(|e| format!("{}: {}", name, e))?.len();
    if size > MAX_BYTES {
        return Err(format!("{} is larger than {} MB, so it was not opened.", name, MAX_BYTES / 1024 / 1024));
    }
    fs::read(&path).map(tauri::ipc::Response::new).map_err(|e| format!("{}: {}", name, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn keeps_only_epub_arguments_made_absolute() {
        let args: Vec<String> = ["scribe", "a.epub", "--flag", "notes.txt", "/books/B.EPUB", "file:///books/c%20d.epub"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let got = epub_args(&args, Path::new("/home/me"));
        assert_eq!(
            got,
            vec![PathBuf::from("/home/me/a.epub"), PathBuf::from("/books/B.EPUB"), PathBuf::from("/books/c d.epub")]
        );
        assert!(epub_args(&["scribe".to_string()], Path::new("/")).is_empty());
    }
}
