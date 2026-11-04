# Session Handoff

Read this first when resuming unfinished work. Rewrite the top half whenever current state changes materially or work
pauses with context another session needs.
The session log below it is append-only history. "Current state" fits on a screen or two (about 80 lines);
what does not fit is history, and belongs in the session log.

Protocol: see [AGENTS.md](../AGENTS.md) (`CLAUDE.md` imports it). Plan: [ROADMAP.md](../ROADMAP.md).
Architecture: [ARCHITECTURE.md](ARCHITECTURE.md). Decisions: [DECISIONS.md](DECISIONS.md).
Tests: [TESTING.md](TESTING.md). Security: [SECURITY.md](SECURITY.md).
Changes: [CHANGELOG.md](CHANGELOG.md). Older sessions and the Plainchant Web history: [archive/](archive/README.md).

---

## Current state

_Last updated: 2026-11-03, session 3, on `master` (commits `318b048` copy, then the rename): the inherited Plainchant Web code is in the repository, renamed, and green._

**Where things stand, in one paragraph:** Plainchant Scribe has its plan, decisions, and documentation schemes (phase 0 items `P0-01` to `P0-03` are done) and a working, renamed copy of Plainchant Web's code. The app still behaves as a web-page editor: its Stage, Inspector, Live JS mode, and Insert palette are all still there. No EPUB feature exists. The next work is removing what Scribe will not use (`P0-04`), then the home page copy and manuscript look (`P0-05`, `P0-06`), then the XML parser (`P1-01`).

**Verified** (2026-11-03, Linux, Node, Python 3, Rust/Cargo; browser pane for the load check)

| Suite | Result |
| --- | --- |
| `npm test` | **104/104** |
| `cargo test --manifest-path src-tauri/Cargo.toml` | **7/7** |
| `cargo build --manifest-path src-tauri/Cargo.toml` | passes |
| `python3 tools/check_docs.py` | `0 error(s), 0 warning(s)` |
| `python3 tools/manual.py check docs/plainchant-scribe.manual.json`, `python3 -m unittest tools/test_manual.py` | 2 sections, 4 entries; 6/6 OK |

**What works**
- **The inherited studio** (`P0-02`, D-001, D-003): everything in Plainchant Web at `4c30d7b`, including Prism colours, the File and Edit menus, folder links, and the preview server. Not rewritten here; see the lineage digest.
- **Renamed shell** (`P0-03`): name, bundle id `io.plainchant.scribe`, `0.1.0`, separate storage names. A structure test fails if the old name returns.
- **Documentation schemes** (`P0-01`, D-007): `tools/check_docs.py` and the 3x manual.

**Not verified**
- The desktop window was not opened (`cargo build` and tests only); the maintainer tested desktop paths by hand in Plainchant Web.
- EPUB rules in the plan come from memory of EPUB 3.3, not a re-read of the specification (D-004).
- Nothing has run against EPUBCheck, Calibre, or the Kindle yet (D-010, Q-004).

**Gotchas for the next session**
- Read [archive/plainchant-web-lineage.md](archive/plainchant-web-lineage.md) first: it names what to keep, what to drop, and the traps (cache-first service worker, the 500-line limit per app script, the HTML parser being too forgiving for XML).
- In the agent's browser pane the service worker did not register for either app (an "unknown error occurred when fetching the script" console message), including the unchanged Plainchant Web; this is the pane, not the rename.
- `tools/check_docs.py` and `tools/manual.py` are the shared schemes' own files; replace them from their source repositories instead of editing (D-007).
- IDs in the lineage digest are written so the checker ignores them on purpose.
- `icons/` and `fonts/` are still Plainchant Web's until `P0-06`.

## Next steps (in order)

1. Answer Q-004 (Kindle model, firmware, and how books reach it) when convenient; it only gates trusting Kindle results.
2. `P0-04`: remove the web-only features (Live JS mode and Console, Insert palette, breakpoints, flex and grid handles, pseudo-state bar); keep the preview and shared parts (D-009). Each removal needs its tests, structure checks, and docs rows removed with it.
3. `P0-05` and `P0-06`: Scribe copy and the manuscript look with light and dark modes (D-008).
4. Start `P1-01`, the XML parser, which every later phase depends on.

## Open questions for maintainers

- Q-004 Kindle model and firmware, and how books reach it (gates Kindle results in P5-06).

## Session log

Newest first. Copy the template for each new session. Work done between sessions (a maintainer's commits, another
agent) gets a short entry too, written by whoever notices it, so the log has no gaps. Past 10 entries, move the
oldest to `docs/archive/` and leave a pointer here.

### Session 1: 2026-11-03: create the repository and the plan

**Contributor:** Claude (Sonnet 5.5), with the maintainer
**Goal:** Turn the agreed Plainchant Scribe plan into a repository that the next session can start from.
**Done:** P0-01
**Changed:** new repository `plainchant-scribe`: `AGENTS.md`, `CLAUDE.md`, `README.md`, `ROADMAP.md`, `LICENSE`, `docs/*`, the lineage digest in `docs/archive/`, the shared tools in `tools/`, and the 3x manual source and build.
**Decisions:** D-001 to D-007; questions Q-001 to Q-003.

### Session 3: 2026-11-03: the port and the rename

**Contributor:** Claude (Sonnet 5.5), with the maintainer
**Goal:** Copy the Plainchant Web code and rename it (`P0-02`, `P0-03`).
**Done:** P0-02, P0-03
**Changed:** the copied source (`app.html`, `src/`, `src-tauri/`, `sw.js`, `test/`, `fonts/`, `icons/`, `package.json`, `manifest.webmanifest`); the rename across the app, storage, and shell; a placeholder `index.html`; a rename guard test; `AGENTS.md` map and commands, `README.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/CHANGELOG.md`, the manual.
**Decisions:** none new.
**Verified:** the table in Current state; the first commit of the copy passed `npm test` 103/103 and `cargo build` unchanged.

### Session 2: 2026-11-03: the maintainer answers Q-001 to Q-003

**Contributor:** Claude (Sonnet 5.5), with the maintainer
**Goal:** Record the answers so phase 0 is unblocked.
**Done:** none closed; P0-06 added, P5-07 added, P0-04 and P5-06 reworded
**Changed:** `docs/DECISIONS.md`, `ROADMAP.md`, `docs/HANDOFF.md`, `docs/TESTING.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`
**Decisions:** D-008 (manuscript look, light and dark), D-009 (keep the preview as send to reader), D-010 (Calibre and a legacy Kindle); question Q-004 added.
**Verified:** `python3 tools/check_docs.py` and `python3 -m unittest tools/test_manual.py`, results in the table above.
**Verified:** `python3 tools/check_docs.py` (0 errors, 0 warnings); `python3 tools/manual.py check` (2 sections, 4 entries); `python3 -m unittest tools/test_manual.py` (6/6).
