// The optional EPUBCheck run (P5-05, D-041, D-005). The app packs the book as Export would and sends its bytes here;
// this writes them to a fresh temporary folder, runs `java -jar <jar> book.epub --json report.json` directly (no
// shell, the paths are arguments), returns the report, and deletes the folder. The jar is one the author chose.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const TIME_LIMIT: Duration = Duration::from_secs(300);

#[derive(Serialize)]
pub struct RunResult {
    command: String,
    report: String,
}

// JAVA_HOME's java when it exists, else `java` from the PATH.
fn java_program() -> PathBuf {
    if let Some(home) = std::env::var_os("JAVA_HOME") {
        let exe = if cfg!(windows) { "java.exe" } else { "java" };
        let candidate = PathBuf::from(home).join("bin").join(exe);
        if candidate.is_file() {
            return candidate;
        }
    }
    PathBuf::from("java")
}

// The jar must be an existing file ending in .jar.
fn check_jar(jar: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(jar.trim());
    if !path.extension().map(|e| e.eq_ignore_ascii_case("jar")).unwrap_or(false) {
        return Err(format!("{} is not a .jar file. Choose the epubcheck.jar from an EPUBCheck release.", path.display()));
    }
    if !path.is_file() {
        return Err(format!("{} was not found. Choose the EPUBCheck jar again.", path.display()));
    }
    Ok(path)
}

// A new, empty folder under the system's temporary folder; fails rather than reuse one that exists.
fn fresh_dir() -> Result<PathBuf, String> {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    for n in 0..16u32 {
        let dir = std::env::temp_dir().join(format!("scribe-epubcheck-{}-{}-{}", std::process::id(), nanos, n));
        if fs::create_dir(&dir).is_ok() {
            return Ok(dir);
        }
    }
    Err("A temporary folder for EPUBCheck could not be made.".to_string())
}

fn last_lines(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(n)..].join(" ")
}

fn run_in(dir: &Path, java: &Path, jar: &Path, bytes: &[u8]) -> Result<RunResult, String> {
    let epub = dir.join("book.epub");
    let report = dir.join("report.json");
    let log = dir.join("stderr.txt");
    fs::write(&epub, bytes).map_err(|e| format!("The book could not be written for EPUBCheck: {}", e))?;
    let stderr = fs::File::create(&log).map_err(|e| e.to_string())?;
    let command = format!("{} -jar {} book.epub --json report.json", java.display(), jar.display());
    let mut child = Command::new(java)
        .arg("-jar")
        .arg(jar)
        .arg(&epub)
        .arg("--json")
        .arg(&report)
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(stderr)
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "Java was not found. Install a Java runtime (11 or newer), or set JAVA_HOME, and try again.".to_string()
            } else {
                format!("Java could not be started: {}", e)
            }
        })?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break, // EPUBCheck exits non-zero when the book has errors, so the status says nothing.
            Ok(None) if started.elapsed() > TIME_LIMIT => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("EPUBCheck took more than five minutes and was stopped.".to_string());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(e.to_string()),
        }
    }
    match fs::read_to_string(&report) {
        Ok(text) => Ok(RunResult { command, report: text }),
        Err(_) => {
            let said = last_lines(&fs::read_to_string(&log).unwrap_or_default(), 3);
            Err(format!("EPUBCheck wrote no report{}", if said.is_empty() { ".".to_string() } else { format!(": {}", said) }))
        }
    }
}

fn run_blocking(jar: String, data: String) -> Result<RunResult, String> {
    let jar = check_jar(&jar)?;
    let bytes = super::decode_base64(&data).ok_or_else(|| "The book's data could not be read.".to_string())?;
    let dir = fresh_dir()?;
    let result = run_in(&dir, &java_program(), &jar, &bytes);
    let _ = fs::remove_dir_all(&dir);
    result
}

#[tauri::command]
pub async fn epubcheck_run(jar: String, data: String) -> Result<RunResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_blocking(jar, data))
        .await
        .map_err(|e| e.to_string())?
}

// Asks for the EPUBCheck jar. None when the author cancels.
#[tauri::command]
pub fn epubcheck_pick_jar() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Choose the EPUBCheck jar")
        .add_filter("EPUBCheck jar", &["jar"])
        .pick_file()
        .map(|p| p.to_string_lossy().into_owned())
}

// EPUBCHECK_JAR, when it names a jar that exists.
#[tauri::command]
pub fn epubcheck_env_jar() -> Option<String> {
    let jar = std::env::var("EPUBCHECK_JAR").ok()?;
    check_jar(&jar).ok().map(|p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_existing_jar_files() {
        assert!(check_jar("/no/such/epubcheck.jar").is_err());
        assert!(check_jar("Cargo.toml").is_err());
        let dir = fresh_dir().unwrap();
        let jar = dir.join("epubcheck.JAR");
        fs::write(&jar, b"x").unwrap();
        assert_eq!(check_jar(jar.to_str().unwrap()).unwrap(), jar);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn fresh_dirs_are_new_and_empty() {
        let a = fresh_dir().unwrap();
        let b = fresh_dir().unwrap();
        assert_ne!(a, b);
        assert_eq!(fs::read_dir(&a).unwrap().count(), 0);
        fs::remove_dir_all(&a).unwrap();
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn reports_a_missing_java_and_cleans_up() {
        let dir = fresh_dir().unwrap();
        let jar = dir.join("epubcheck.jar");
        fs::write(&jar, b"x").unwrap();
        let err = run_in(&dir, Path::new("/no/such/java"), &jar, b"PK").err().unwrap();
        assert!(err.starts_with("Java was not found"), "{}", err);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn keeps_the_last_lines_of_a_log() {
        assert_eq!(last_lines("a\n\nb\nc\nd\n", 2), "c d");
        assert_eq!(last_lines("", 3), "");
    }

    // Runs the real EPUBCheck from .tools/ when it and Java are there; otherwise says so and passes.
    #[test]
    fn runs_epubcheck_from_tools_when_present() {
        let tools = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".tools");
        let mut jars: Vec<PathBuf> = fs::read_dir(&tools)
            .map(|d| d.filter_map(|e| e.ok()).map(|e| e.path().join("epubcheck.jar")).filter(|p| p.is_file()).collect())
            .unwrap_or_default();
        jars.sort();
        let Some(jar) = jars.pop() else {
            eprintln!("epubcheck run: not run (no jar in .tools/)");
            return;
        };
        if Command::new(java_program()).arg("-version").stderr(Stdio::null()).status().is_err() {
            eprintln!("epubcheck run: not run (no java)");
            return;
        }
        // An empty zip: EPUBCheck still writes a report, with a fatal message.
        let result = run_blocking(jar.to_string_lossy().into_owned(), "UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==".to_string()).unwrap();
        assert!(result.report.contains("RSC-002"), "{}", result.report);
        assert!(result.command.contains("--json report.json"));
    }
}
