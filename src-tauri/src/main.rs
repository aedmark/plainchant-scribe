#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
mod preview;

use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Serialize, Clone)]
struct FileEntry {
    path: String,
    kind: String, // "file" or "dir"
    is_text: bool,
}

#[derive(Serialize)]
struct ProjectFolderPayload {
    path: String,
    base_url: String,
    files: BTreeMap<String, String>,
    tree: Vec<FileEntry>,
}

struct ServerState {
    root_dir: Arc<Mutex<Option<PathBuf>>>,
    port: u16,
}

fn is_ignored_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | ".venv" | "venv" | ".idea" | ".vscode" | "dist" | "__pycache__"
    )
}

fn is_text_ext(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
        return false;
    };
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "html" | "htm" | "css" | "js" | "mjs" | "json" | "svg" | "md" | "txt" | "xml" | "webmanifest"
    )
}

fn mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "webmanifest" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (
                (bytes[i + 1] as char).to_digit(16),
                (bytes[i + 2] as char).to_digit(16),
            ) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn spawn_asset_server(root_holder: Arc<Mutex<Option<PathBuf>>>) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("failed to bind local asset server");
    let port = listener.local_addr().unwrap().port();

    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let root_opt = root_holder.lock().ok().and_then(|g| g.clone());
            thread::spawn(move || {
                let mut stream = stream;
                let mut buf = [0u8; 4096];
                let n = match stream.read(&mut buf) {
                    Ok(n) if n > 0 => n,
                    _ => return,
                };
                let req = String::from_utf8_lossy(&buf[..n]);
                let first_line = req.lines().next().unwrap_or("");
                let mut parts = first_line.split_whitespace();
                let _method = parts.next().unwrap_or("GET");
                let raw_target = parts.next().unwrap_or("/");
                let clean_path = raw_target.split('?').next().unwrap_or("/");
                let decoded = percent_decode(clean_path.trim_start_matches('/'));

                let Some(root) = root_opt else {
                    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
                    return;
                };

                let rel = Path::new(&decoded);
                if rel.components().any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_))) {
                    let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
                    return;
                }

                let full = if decoded.is_empty() {
                    root.join("index.html")
                } else {
                    root.join(rel)
                };

                match fs::read(&full) {
                    Ok(bytes) => {
                        let mime = mime_for_path(&full);
                        let header = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
                            mime,
                            bytes.len()
                        );
                        let _ = stream.write_all(header.as_bytes());
                        let _ = stream.write_all(&bytes);
                    }
                    Err(_) => {
                        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    }
                }
            });
        }
    });

    port
}

fn is_safe_relative(rel: &Path) -> bool {
    !rel.components()
        .any(|c| matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
}

fn decode_base64(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(input.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    for b in input.bytes() {
        let v = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => break,
            b'\r' | b'\n' | b' ' => continue,
            _ => return None,
        } as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

fn scan_directory(
    base: &Path,
    current: &Path,
    files: &mut BTreeMap<String, String>,
    tree: &mut Vec<FileEntry>,
    depth: usize,
) {
    if depth > 6 {
        return;
    }
    let Ok(read_dir) = fs::read_dir(current) else {
        return;
    };
    let mut entries: Vec<_> = read_dir.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || is_ignored_dir(&name) {
            continue;
        }
        let Ok(rel) = path.strip_prefix(base) else {
            continue;
        };
        let rel_str = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");

        if path.is_dir() {
            tree.push(FileEntry {
                path: rel_str,
                kind: "dir".to_string(),
                is_text: false,
            });
            scan_directory(base, &path, files, tree, depth + 1);
        } else if path.is_file() {
            let text_ok = is_text_ext(&path)
                && path.metadata().map(|m| m.len() <= 2 * 1024 * 1024).unwrap_or(false);
            let mut loaded_text = false;
            if text_ok {
                if let Ok(content) = fs::read_to_string(&path) {
                    files.insert(rel_str.clone(), content);
                    loaded_text = true;
                }
            }
            tree.push(FileEntry {
                path: rel_str,
                kind: "file".to_string(),
                is_text: loaded_text,
            });
        }
    }
}

fn strip_verbatim(path: &str) -> String {
    match path.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC\\") => rest.to_string(),
        _ => path.to_string(),
    }
}

fn canonical_dir(dir: PathBuf) -> Result<PathBuf, String> {
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Directory does not exist: {}", dir.display()));
    }
    let real = fs::canonicalize(&dir).unwrap_or(dir);
    Ok(PathBuf::from(strip_verbatim(&real.to_string_lossy())))
}

fn load_dir_payload(dir: PathBuf, state: &tauri::State<ServerState>) -> Result<ProjectFolderPayload, String> {
    let dir = canonical_dir(dir)?;
    if let Ok(mut guard) = state.root_dir.lock() {
        *guard = Some(dir.clone());
    }
    let mut files = BTreeMap::new();
    let mut tree = Vec::new();
    scan_directory(&dir, &dir, &mut files, &mut tree, 0);

    Ok(ProjectFolderPayload {
        path: dir.to_string_lossy().into_owned(),
        base_url: format!("http://127.0.0.1:{}/", state.port),
        files,
        tree,
    })
}

#[tauri::command]
fn open_project_folder(state: tauri::State<ServerState>) -> Result<Option<ProjectFolderPayload>, String> {
    let folder: Option<PathBuf> = rfd::FileDialog::new()
        .set_title("Open Project Folder")
        .pick_folder();

    let Some(dir) = folder else {
        return Ok(None);
    };
    load_dir_payload(dir, &state).map(Some)
}

#[tauri::command]
fn use_project_folder(path: String, state: tauri::State<ServerState>) -> Result<String, String> {
    let dir = canonical_dir(PathBuf::from(path))?;
    if let Ok(mut guard) = state.root_dir.lock() {
        *guard = Some(dir);
    }
    Ok(format!("http://127.0.0.1:{}/", state.port))
}

#[tauri::command]
fn open_project_folder_at(path: String, state: tauri::State<ServerState>) -> Result<ProjectFolderPayload, String> {
    load_dir_payload(PathBuf::from(path), &state)
}

#[tauri::command]
fn save_project_folder(
    path: Option<String>,
    files: Option<BTreeMap<String, String>>,
    assets: Option<BTreeMap<String, String>>,
    dirs: Option<Vec<String>>,
    html: Option<String>,
    css: Option<String>,
    js: Option<String>,
) -> Result<Option<String>, String> {
    let dir = match path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(p) => PathBuf::from(p),
        None => {
            let picked = rfd::FileDialog::new()
                .set_title("Select Folder to Export Project Files")
                .pick_folder();
            let Some(chosen) = picked else {
                return Ok(None);
            };
            chosen
        }
    };

    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    if let Some(map) = files {
        for (rel_path, content) in map {
            let rel = Path::new(&rel_path);
            if !is_safe_relative(rel) {
                continue;
            }
            let target = dir.join(rel);
            if let Some(parent) = target.parent() {
                let _ = fs::create_dir_all(parent);
            }
            fs::write(&target, content).map_err(|e| format!("{}: {}", rel_path, e))?;
        }
    } else {
        if let Some(h) = html {
            fs::write(dir.join("index.html"), h).map_err(|e| e.to_string())?;
        }
        if let Some(c) = css {
            fs::write(dir.join("styles.css"), c).map_err(|e| e.to_string())?;
        }
        if let Some(j) = js {
            fs::write(dir.join("script.js"), j).map_err(|e| e.to_string())?;
        }
    }
    for rel_path in dirs.unwrap_or_default() {
        let rel = Path::new(&rel_path);
        if is_safe_relative(rel) {
            fs::create_dir_all(dir.join(rel)).map_err(|e| format!("{}: {}", rel_path, e))?;
        }
    }
    if let Some(map) = assets {
        for (rel_path, data) in map {
            let rel = Path::new(&rel_path);
            if !is_safe_relative(rel) {
                continue;
            }
            let bytes = decode_base64(&data).ok_or_else(|| format!("{}: invalid image data", rel_path))?;
            let target = dir.join(rel);
            if fs::metadata(&target).map(|m| m.len() == bytes.len() as u64).unwrap_or(false) {
                continue;
            }
            if let Some(parent) = target.parent() {
                let _ = fs::create_dir_all(parent);
            }
            fs::write(&target, bytes).map_err(|e| format!("{}: {}", rel_path, e))?;
        }
    }
    Ok(Some(dir.to_string_lossy().into_owned()))
}

// A file name for the Save dialog: no folders, no control or reserved characters, ending in .epub.
fn book_file_name(name: &str) -> String {
    let base: String = name
        .rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or("")
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        .collect();
    let base = base.trim().trim_start_matches('.').to_string();
    let stem = if base.to_ascii_lowercase().ends_with(".epub") { base[..base.len() - 5].to_string() } else { base };
    format!("{}.epub", if stem.trim().is_empty() { "book" } else { stem.trim() })
}

// The chosen path with .epub added when the author typed another ending.
fn with_epub_extension(path: PathBuf) -> PathBuf {
    if path.extension().map(|e| e.eq_ignore_ascii_case("epub")).unwrap_or(false) {
        return path;
    }
    let mut os = path.into_os_string();
    os.push(".epub");
    PathBuf::from(os)
}

// Export (P5-01, D-037): asks where to save the packed book and writes it. Ok(None) when the author cancels.
#[tauri::command]
fn save_book_file(name: String, data: String) -> Result<Option<String>, String> {
    let bytes = decode_base64(&data).ok_or_else(|| "The book's data could not be read.".to_string())?;
    let picked = rfd::FileDialog::new()
        .set_title("Save the Book")
        .set_file_name(book_file_name(&name))
        .add_filter("EPUB book", &["epub"])
        .save_file();
    let Some(chosen) = picked else {
        return Ok(None);
    };
    let path = with_epub_extension(chosen);
    fs::write(&path, bytes).map_err(|e| format!("{}: {}", path.display(), e))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_base64_with_and_without_padding() {
        assert_eq!(decode_base64("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(decode_base64("aGVsbG8").unwrap(), b"hello");
        assert_eq!(decode_base64("AAECAwT/").unwrap(), vec![0, 1, 2, 3, 4, 255]);
        assert_eq!(decode_base64("").unwrap(), Vec::<u8>::new());
        assert!(decode_base64("a*b").is_none());
    }

    #[test]
    fn strips_the_windows_verbatim_prefix_but_not_unc() {
        assert_eq!(strip_verbatim(r"\\?\C:\Work\site"), r"C:\Work\site");
        assert_eq!(strip_verbatim(r"\\?\UNC\host\share"), r"\\?\UNC\host\share");
        assert_eq!(strip_verbatim("/home/me/site"), "/home/me/site");
    }

    #[test]
    fn canonical_dir_resolves_dots_and_rejects_missing_folders() {
        let here = canonical_dir(PathBuf::from(".")).unwrap();
        assert!(here.is_absolute());
        assert!(canonical_dir(PathBuf::from("./no/such/folder")).is_err());
    }

    #[test]
    fn book_file_names_are_plain_and_end_in_epub() {
        assert_eq!(book_file_name("my-book.epub"), "my-book.epub");
        assert_eq!(book_file_name("my-book"), "my-book.epub");
        assert_eq!(book_file_name("../../etc/passwd"), "passwd.epub");
        assert_eq!(book_file_name("a\\b:c?.EPUB"), "bc.epub");
        assert_eq!(book_file_name(" .. "), "book.epub");
        assert_eq!(with_epub_extension(PathBuf::from("/tmp/My Book")), PathBuf::from("/tmp/My Book.epub"));
        assert_eq!(with_epub_extension(PathBuf::from("/tmp/a.EPUB")), PathBuf::from("/tmp/a.EPUB"));
        assert_eq!(with_epub_extension(PathBuf::from("/tmp/a.zip")), PathBuf::from("/tmp/a.zip.epub"));
    }

    #[test]
    fn rejects_paths_that_leave_the_project() {
        assert!(is_safe_relative(Path::new("images/a.png")));
        assert!(!is_safe_relative(Path::new("../a.png")));
        assert!(!is_safe_relative(Path::new("/etc/a.png")));
    }
}

fn main() {
    let root_holder = Arc::new(Mutex::new(None));
    let port = spawn_asset_server(root_holder.clone());
    let preview_state = preview::PreviewState::new(root_holder.clone());

    tauri::Builder::default()
        .manage(preview_state)
        .manage(ServerState {
            root_dir: root_holder,
            port,
        })
        .invoke_handler(tauri::generate_handler![
            open_project_folder,
            open_project_folder_at,
            use_project_folder,
            save_project_folder,
            save_book_file,
            preview::preview_start,
            preview::preview_update,
            preview::preview_stop,
            preview::preview_open
        ])
        .run(tauri::generate_context!())
        .expect("error while running Plainchant Scribe Tauri application");
}
