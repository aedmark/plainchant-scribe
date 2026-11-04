//! Read-only network preview of the Studio working copy (P7-12, D-029).
//!
//! Off by default. `preview_start` binds `0.0.0.0` on a random port and serves the files the
//! frontend pushes, only under an unguessable `/<token>/` prefix. Unsaved edits and added images
//! live in memory; images that exist only on disk fall back to the linked folder.

use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::{decode_base64, is_safe_relative, is_text_ext, mime_for_path, percent_decode};

const VERSION_PATH: &str = "__pc_version";

#[derive(Default)]
struct Content {
    files: HashMap<String, Vec<u8>>,
    entry: String,
    version: u64,
}

struct Running {
    token: String,
    port: u16,
    stop: Arc<AtomicBool>,
}

pub struct PreviewState {
    content: Arc<Mutex<Content>>,
    running: Mutex<Option<Running>>,
    root: Arc<Mutex<Option<PathBuf>>>,
}

impl PreviewState {
    pub fn new(root: Arc<Mutex<Option<PathBuf>>>) -> Self {
        PreviewState {
            content: Arc::new(Mutex::new(Content::default())),
            running: Mutex::new(None),
            root,
        }
    }
}

#[derive(Serialize)]
pub struct PreviewInfo {
    port: u16,
    token: String,
    addresses: Vec<String>,
}

fn random_token() -> String {
    let mut bytes = [0u8; 16];
    let from_os = fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut bytes)).is_ok();
    if !from_os {
        use std::collections::hash_map::RandomState;
        use std::hash::{BuildHasher, Hasher};
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        for (i, chunk) in bytes.chunks_mut(8).enumerate() {
            let mut hasher = RandomState::new().build_hasher();
            hasher.write_u64(nanos ^ (i as u64));
            chunk.copy_from_slice(&hasher.finish().to_le_bytes());
        }
    }
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn lan_address() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    if ip.is_unspecified() || ip.is_loopback() { None } else { Some(ip.to_string()) }
}

fn set_content(
    content: &Mutex<Content>,
    files: BTreeMap<String, String>,
    assets: Option<BTreeMap<String, String>>,
    entry: String,
) -> Result<(), String> {
    let mut next: HashMap<String, Vec<u8>> = HashMap::new();
    let mut guard = content.lock().map_err(|_| "preview state is unavailable".to_string())?;
    for (path, text) in files {
        if !is_safe_relative(Path::new(&path)) {
            return Err(format!("unsafe preview path: {}", path));
        }
        next.insert(path, text.into_bytes());
    }
    match assets {
        Some(map) => {
            for (path, b64) in map {
                if !is_safe_relative(Path::new(&path)) {
                    return Err(format!("unsafe preview path: {}", path));
                }
                let bytes = decode_base64(&b64).ok_or_else(|| format!("could not decode {}", path))?;
                next.insert(path, bytes);
            }
        }
        None => {
            for (path, bytes) in guard.files.iter() {
                if !next.contains_key(path) && !is_text_ext(Path::new(path)) {
                    next.insert(path.clone(), bytes.clone());
                }
            }
        }
    }
    if guard.files != next || guard.entry != entry {
        guard.files = next;
        guard.entry = entry;
        guard.version += 1;
    }
    Ok(())
}

fn respond(stream: &mut TcpStream, status: &str, mime: &str, body: &[u8], head_only: bool) {
    let header = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n",
        status,
        mime,
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    if !head_only {
        let _ = stream.write_all(body);
    }
}

fn with_reload_script(html: &[u8], token: &str) -> Vec<u8> {
    let script = format!(
        "<script>(function(){{var u='/{}/{}',v=null;function t(){{fetch(u,{{cache:'no-store'}}).then(function(r){{return r.text()}}).then(function(n){{if(v===null)v=n;else if(n!==v)location.reload()}}).catch(function(){{}})}}t();setInterval(t,1000)}})()</script>",
        token, VERSION_PATH
    );
    let text = String::from_utf8_lossy(html).into_owned();
    let at = text.to_ascii_lowercase().rfind("</body>").unwrap_or(text.len());
    format!("{}{}{}", &text[..at], script, &text[at..]).into_bytes()
}

fn lookup(
    content: &Mutex<Content>,
    root: &Mutex<Option<PathBuf>>,
    rest: &str,
) -> Option<(Vec<u8>, &'static str)> {
    let key = if rest.is_empty() {
        content.lock().ok()?.entry.clone()
    } else if rest.ends_with('/') {
        format!("{}index.html", rest)
    } else {
        rest.to_string()
    };
    if key.is_empty() || !is_safe_relative(Path::new(&key)) {
        return None;
    }
    if let Some(bytes) = content.lock().ok()?.files.get(&key) {
        return Some((bytes.clone(), mime_for_path(Path::new(&key))));
    }
    let path = Path::new(&key);
    if is_text_ext(path) {
        return None;
    }
    let dir = root.lock().ok()?.clone()?;
    let bytes = fs::read(dir.join(path)).ok()?;
    Some((bytes, mime_for_path(path)))
}

fn handle(mut stream: TcpStream, token: &str, content: &Mutex<Content>, root: &Mutex<Option<PathBuf>>) {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = [0u8; 8192];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let req = String::from_utf8_lossy(&buf[..n]);
    let mut parts = req.lines().next().unwrap_or("").split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/");
    let head_only = method == "HEAD";
    if method != "GET" && !head_only {
        respond(&mut stream, "405 Method Not Allowed", "text/plain", b"Method not allowed", false);
        return;
    }
    let path = target.split(['?', '#']).next().unwrap_or("/");
    let prefix = format!("/{}/", token);
    let Some(rest_raw) = path.strip_prefix(prefix.as_str()) else {
        respond(&mut stream, "404 Not Found", "text/plain", b"Not found", head_only);
        return;
    };
    let rest = percent_decode(rest_raw);
    if rest == VERSION_PATH {
        let version = content.lock().map(|c| c.version).unwrap_or(0);
        respond(&mut stream, "200 OK", "text/plain", version.to_string().as_bytes(), head_only);
        return;
    }
    match lookup(content, root, &rest) {
        Some((bytes, mime)) => {
            let body = if mime.starts_with("text/html") { with_reload_script(&bytes, token) } else { bytes };
            respond(&mut stream, "200 OK", mime, &body, head_only);
        }
        None => respond(&mut stream, "404 Not Found", "text/plain", b"Not found", head_only),
    }
}

fn serve(
    listener: TcpListener,
    token: String,
    content: Arc<Mutex<Content>>,
    root: Arc<Mutex<Option<PathBuf>>>,
    stop: Arc<AtomicBool>,
) {
    let _ = listener.set_nonblocking(true);
    let token = Arc::new(token);
    while !stop.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((stream, _)) => {
                let (token, content, root) = (token.clone(), content.clone(), root.clone());
                thread::spawn(move || handle(stream, &token, &content, &root));
            }
            Err(_) => thread::sleep(Duration::from_millis(50)),
        }
    }
}

fn start_server(
    state: &PreviewState,
    bind: &str,
) -> Result<(u16, String, Arc<AtomicBool>), String> {
    let listener = TcpListener::bind(bind).map_err(|e| format!("could not start the preview server: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = random_token();
    let stop = Arc::new(AtomicBool::new(false));
    let (t, c, r, s) = (token.clone(), state.content.clone(), state.root.clone(), stop.clone());
    thread::spawn(move || serve(listener, t, c, r, s));
    Ok((port, token, stop))
}

fn info(port: u16, token: &str) -> PreviewInfo {
    PreviewInfo {
        port,
        token: token.to_string(),
        addresses: lan_address().into_iter().collect(),
    }
}

#[tauri::command]
pub fn preview_start(
    files: BTreeMap<String, String>,
    assets: BTreeMap<String, String>,
    entry: String,
    state: tauri::State<PreviewState>,
) -> Result<PreviewInfo, String> {
    set_content(&state.content, files, Some(assets), entry)?;
    let mut running = state.running.lock().map_err(|_| "preview state is unavailable".to_string())?;
    if let Some(r) = running.as_ref() {
        return Ok(info(r.port, &r.token));
    }
    let (port, token, stop) = start_server(&state, "0.0.0.0:0")?;
    let result = info(port, &token);
    *running = Some(Running { token, port, stop });
    Ok(result)
}

#[tauri::command]
pub fn preview_update(
    files: BTreeMap<String, String>,
    assets: Option<BTreeMap<String, String>>,
    entry: String,
    state: tauri::State<PreviewState>,
) -> Result<(), String> {
    set_content(&state.content, files, assets, entry)
}

#[tauri::command]
pub fn preview_stop(state: tauri::State<PreviewState>) {
    if let Ok(mut running) = state.running.lock() {
        if let Some(r) = running.take() {
            r.stop.store(true, Ordering::Relaxed);
        }
    }
    if let Ok(mut content) = state.content.lock() {
        *content = Content::default();
    }
}

#[tauri::command]
pub fn preview_open(state: tauri::State<PreviewState>) -> Result<(), String> {
    let running = state.running.lock().map_err(|_| "preview state is unavailable".to_string())?;
    let r = running.as_ref().ok_or_else(|| "the preview is not running".to_string())?;
    let url = format!("http://127.0.0.1:{}/{}/", r.port, r.token);
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd").args(["/C", "start", "", &url]).spawn();
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&url).spawn();
    result.map(|_| ()).map_err(|e| format!("could not open the browser: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(port: u16, path: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(format!("GET {} HTTP/1.1\r\nHost: x\r\n\r\n", path).as_bytes()).unwrap();
        let mut out = String::new();
        let _ = stream.read_to_string(&mut out);
        out
    }

    fn files(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn tokens_are_32_hex_characters_and_differ() {
        let (a, b) = (random_token(), random_token());
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn serves_the_working_copy_only_under_the_token() {
        let state = PreviewState::new(Arc::new(Mutex::new(None)));
        set_content(
            &state.content,
            files(&[("index.html", "<html><body>hi</body></html>"), ("css/a.css", "a{}"), ("../evil", "x")]),
            Some(BTreeMap::new()),
            "index.html".to_string(),
        )
        .expect_err("a path that leaves the project is refused");
        set_content(
            &state.content,
            files(&[("index.html", "<html><body>hi</body></html>"), ("css/a.css", "a{}")]),
            Some(BTreeMap::new()),
            "index.html".to_string(),
        )
        .unwrap();
        let (port, token, stop) = start_server(&state, "127.0.0.1:0").unwrap();
        assert!(get(port, "/").starts_with("HTTP/1.1 404"));
        assert!(get(port, "/index.html").starts_with("HTTP/1.1 404"));
        assert!(get(port, "/wrong/index.html").starts_with("HTTP/1.1 404"));
        let page = get(port, &format!("/{}/", token));
        assert!(page.starts_with("HTTP/1.1 200") && page.contains("hi") && page.contains(VERSION_PATH));
        assert!(page.find("hi").unwrap() < page.find("<script>").unwrap());
        let css = get(port, &format!("/{}/css/a.css", token));
        assert!(css.contains("text/css") && css.ends_with("a{}") && !css.contains("<script>"));
        assert!(get(port, &format!("/{}/../Cargo.toml", token)).starts_with("HTTP/1.1 404"));
        assert!(get(port, &format!("/{}/%2e%2e/Cargo.toml", token)).starts_with("HTTP/1.1 404"));
        assert!(get(port, &format!("/{}/missing.html", token)).starts_with("HTTP/1.1 404"));
        let before = get(port, &format!("/{}/{}", token, VERSION_PATH));
        set_content(&state.content, files(&[("index.html", "<body>changed</body>")]), None, "index.html".to_string()).unwrap();
        let after = get(port, &format!("/{}/{}", token, VERSION_PATH));
        assert_ne!(before.rsplit("\r\n\r\n").next(), after.rsplit("\r\n\r\n").next());
        assert!(get(port, &format!("/{}/", token)).contains("changed"));
        stop.store(true, Ordering::Relaxed);
    }

    #[test]
    fn unchanged_content_keeps_the_version_and_assets_survive_text_updates() {
        let content = Mutex::new(Content::default());
        let pairs = files(&[("index.html", "<p>x</p>")]);
        let png = Some(BTreeMap::from([("images/a.png".to_string(), "AQID".to_string())]));
        set_content(&content, pairs.clone(), png, "index.html".to_string()).unwrap();
        let v = content.lock().unwrap().version;
        set_content(&content, pairs.clone(), None, "index.html".to_string()).unwrap();
        assert_eq!(content.lock().unwrap().version, v);
        assert_eq!(content.lock().unwrap().files.get("images/a.png"), Some(&vec![1u8, 2, 3]));
        set_content(&content, files(&[("index.html", "<p>y</p>")]), None, "index.html".to_string()).unwrap();
        assert_eq!(content.lock().unwrap().version, v + 1);
        assert!(content.lock().unwrap().files.contains_key("images/a.png"));
    }
}
