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

_Last updated: 2026-11-03, session 4, on `master`: the web-only features are removed (`P0-04`) and the app is green._

**Where things stand, in one paragraph:** Phase 0 items `P0-01` to `P0-04` are done. The repository holds the plan, decisions, documentation schemes, and the inherited Plainchant Web code, renamed and trimmed: Live JS mode, the Console, the Insert palette, breakpoints, flex and grid handles, and the pseudo-state bar are gone. The app is now a Design-mode HTML and CSS editor with an Inspector (Properties, CSS Designer, Parts, Problems), Explorer, Assets, Prism colours, File and Edit menus, folder links, and the send-to-reader preview. No EPUB feature exists yet. Next: the home page copy and the manuscript look (`P0-05`, `P0-06`), then the XML parser (`P1-01`).

**Verified** (2026-11-03, Linux, Node, Python 3, Rust/Cargo; browser pane for the load check)

| Suite | Result |
| --- | --- |
| `npm test` | **89/89** |
| `cargo build --manifest-path src-tauri/Cargo.toml` | passes |
| `python3 tools/check_docs.py` | `0 error(s), 0 warning(s)` |
| `python3 tools/manual.py check docs/plainchant-scribe.manual.json`, `python3 -m unittest tools/test_manual.py` | 2 sections, 4 entries; 6/6 OK |

`cargo test` (7 tests) last ran at the rename (`P0-03`); no Rust file changed since.

**What works**
- **The trimmed studio** (`P0-02`, `P0-04`, D-001, D-003): Design-mode editing, Inspector, Explorer, Assets, Problems, Parts, Format, find and replace, undo across files, versions, library, folder links, Prism colours, File and Edit menus, shortcut sheet, and the preview server. Not rewritten; see the lineage digest.
- **Renamed shell** (`P0-03`): name, bundle id `io.plainchant.scribe`, `0.1.0`, separate storage names. A structure test fails if the old name returns.
- **Removal guard** (`P0-04`): a structure test fails if a removed file, element, or identifier returns.
- **Documentation schemes** (`P0-01`, D-007).

**Not verified**
- The desktop window was not opened; the maintainer tested desktop paths by hand in Plainchant Web only.
- EPUB rules in the plan come from memory of EPUB 3.3, not a re-read of the specification (D-004).
- Nothing has run against EPUBCheck or Calibre yet (D-010).

**Gotchas for the next session**
- Read [archive/plainchant-web-lineage.md](archive/plainchant-web-lineage.md) first: what to keep, what to drop, and the traps (cache-first service worker, 500-line limit per app script, the HTML parser being too forgiving for XML).
- Previews now always drop `<script>` (D-004), so the Stage cannot run book scripts.
- `.console-row`, `.console-level`, `.console-msg`, `.console-src`, `.console-badge`, and `.css-state-bar` are CSS class names the Problems and Parts tabs still use; they are named for the removed Console and state bar. Rename them when those tabs are reworked (`P5-04`).
- `inspector-ui.js` is still close to the 500-line limit; new Inspector behaviour needs a new file.
- In the agent's browser pane the service worker does not register for either app (an "unknown error occurred when fetching the script" console message); this is the pane, not the app.
- `tools/check_docs.py` and `tools/manual.py` are the shared schemes' own files; replace them from their source repositories instead of editing (D-007).
- IDs in the lineage digest are written so the checker ignores them on purpose. `icons/` and `fonts/` are still Plainchant Web's until `P0-06`.

## Next steps (in order)

1. `P0-05` and `P0-06`: Scribe copy and the manuscript look with light and dark modes (D-008).
2. Start `P1-01`, the XML parser, which every later phase depends on.

## Open questions for maintainers

- Q-004 Kindle model and firmware, and how books reach it. Deferred by the maintainer as not important yet; ask again only when a Kindle result is wanted (P5-06).

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

### Session 4: 2026-11-03: remove the web-only features

**Contributor:** Claude (Sonnet 5.5), with the maintainer
**Goal:** `P0-04`.
**Done:** P0-04
**Changed:** deleted `src/layout.js`, `src/app/{stage-layout,layout-ui,css-media,css-states,insert-drag,console-ui}.js`, `test/layout.test.js`; renamed `stage-live.js` to `stage-links.js` (link following only); removed `CssAst` state helpers and `MEDIA_PRESETS`, `DomOutline.dropPlacement`, `Editing.SNIPPETS`, `Project.consoleBridge` and the `liveJs` and `forceStates` options; trimmed `app.html`, `inspector-ui.js`, `typing.js`, `stage.js`, `panes.js`, `menus.js`, `styles.css`, `sw.js`; added the removal guard test; updated tests and docs.
**Decisions:** none new (D-004 covers dropping scripts).
**Verified:** the table in Current state.

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
