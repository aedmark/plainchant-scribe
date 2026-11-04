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

_Last updated: 2026-11-03, session 6, on `master`: `P1-01` is done (the XML parser and splicer)._

**Where things stand, in one paragraph:** Phase 0 is done (`P0-01` to `P0-06`), and phase 1 has its foundation: `src/xml-ast.js` (`P1-01`, D-011) parses XML 1.0 with namespaces into a tree of string offsets, reports every well-formedness error without throwing, and builds splices that change only their range. Nothing in the app uses it yet; `app.html` does not load it. The rest of the app is the inherited Design-mode HTML and CSS editor (Inspector, Explorer, Assets, Problems, Parts, folder links, send-to-reader preview) in the manuscript look (D-008). No EPUB feature exists for the user yet. Next: `P1-02` (new-book template) and `P1-03` (book model), which builds on `XmlAst`.

**Verified** (2026-11-03, Linux, Node, Python 3, Rust/Cargo; browser pane for the load check)

| Suite | Result |
| --- | --- |
| `npm test` | **106/106** |
| `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo build` | **7/7**, passes |
| `python3 tools/check_docs.py` | `0 error(s), 0 warning(s)` |
| `python3 tools/manual.py check docs/plainchant-scribe.manual.json`, `python3 -m unittest tools/test_manual.py` | 2 sections, 5 entries; 6/6 OK |

**What works**
- **The trimmed studio** (`P0-02`, `P0-04`, D-001, D-003): Design-mode editing, Inspector, Explorer, Assets, Problems, Parts, Format, find and replace, undo across files, versions, library, folder links, Prism colours, File and Edit menus, shortcut sheet, and the preview server. Not rewritten; see the lineage digest.
- **Renamed shell** (`P0-03`): name, bundle id `io.plainchant.scribe`, `0.1.0`, separate storage names. A structure test fails if the old name returns.
- **Removal guard** (`P0-04`): a structure test fails if a removed file, element, or identifier returns.
- **Manuscript look** (`P0-06`, D-008): light and dark palettes, EB Garamond headings, Match system / Light / Dark in Settings; contrast and palette-parity tests. New home page (`P0-05`).
- **Documentation schemes** (`P0-01`, D-007).
- **XML parser and splicer** (`P1-01`, D-011): `XmlAst.parse` plus `applyEdits`, `setAttr`, `removeAttr`, `setText`, `insert`, `remove`; tested on the fixtures in `test/fixtures/xml/`; expat agreed on 45 verdicts.

**Not verified**
- The desktop window was not opened; the maintainer tested desktop paths by hand in Plainchant Web only.
- EPUB rules in the plan come from memory of EPUB 3.3 (D-004), except XML conformance (§3.9) and the XHTML requirements (§6.1.2), re-read on w3.org for `P1-01`. Re-read the relevant section before each later item.
- Nothing has run against EPUBCheck or Calibre yet (D-010).

**Gotchas for the next session**
- Read [archive/plainchant-web-lineage.md](archive/plainchant-web-lineage.md) first: what to keep, what to drop, and the traps (cache-first service worker, 500-line limit per app script, the HTML parser being too forgiving for XML).
- Previews now always drop `<script>` (D-004), so the Stage cannot run book scripts.
- `.console-row`, `.console-level`, `.console-msg`, `.console-src`, `.console-badge`, and `.css-state-bar` are CSS class names the Problems and Parts tabs still use; they are named for the removed Console and state bar. Rename them when those tabs are reworked (`P5-04`).
- `inspector-ui.js` (447 lines) and `stage.js` (461) are the largest app scripts against the 500-line limit; new Inspector or Stage behaviour needs a new file.
- In the agent's browser pane the service worker does not register for either app (an "unknown error occurred when fetching the script" console message); this is the pane, not the app.
- `XmlAst` offsets are string indices, not bytes (D-011). Edits return `{ start, end, text }` lists for one parse: apply them with `XmlAst.applyEdits(ast.text, edits)` and re-parse before the next edit. Several edits from the same parse can be applied together if they do not overlap.
- Internally declared entities stay as `&name;` in `XmlAst` values; HTML entities such as `&nbsp;` are `undeclared-entity` errors whose message gives the numeric form.
- `tools/check_docs.py` and `tools/manual.py` are the shared schemes' own files; replace them from their source repositories instead of editing (D-007).
- IDs in the lineage digest are written so the checker ignores them on purpose. `icons/` are still Plainchant Web's. The example page behind "Load Example Page" is still a web page until `P1-02`.

## Next steps (in order)

1. `P1-02`, the new-book template. Its acceptance needs EPUBCheck (`P5-01`), so decide with the maintainer whether to check it by hand with a local EPUBCheck jar first.
2. `P1-03`, the book model on top of `XmlAst`; it is the first feature to load `src/xml-ast.js` in `app.html` (add it to `sw.js` `APP_FILES` and the load-order test at the same time).

## Open questions for maintainers

- Q-004 Kindle model and firmware, and how books reach it. Deferred by the maintainer as not important yet; ask again only when a Kindle result is wanted (P5-06).

## Session log

Newest first. Copy the template for each new session. Work done between sessions (a maintainer's commits, another
agent) gets a short entry too, written by whoever notices it, so the log has no gaps. Past 10 entries, move the
oldest to `docs/archive/` and leave a pointer here.

### Session 6: 2026-11-03: the XML parser and splicer

**Contributor:** Claude (Opus 5.5), with the maintainer
**Goal:** `P1-01`.
**Done:** P1-01
**Changed:** new `src/xml-ast.js`, `test/xml-ast.test.js`, `test/fixtures/xml/` (`content.opf`, `nav.xhtml`, `chapter.xhtml`, `container.xml`); `test/run.js`; `ROADMAP.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TESTING.md`, this file.
**Decisions:** D-011 (offsets, error recovery, namespaces, DOCTYPE and entities, limits, splice set, fixtures), each chosen by the maintainer. The spec re-read changed one answer: internal entity declarations are allowed by EPUB 3.3 §3.9, so their names are noted and never expanded.
**Verified:** `npm test` 106/106; expat cross-check 45/45 by hand; `check_docs.py` result in the table above.

### Session 1: 2026-11-03: create the repository and the plan

**Contributor:** Claude (Sonnet 5.5), with the maintainer
**Goal:** Turn the agreed Plainchant Scribe plan into a repository that the next session can start from.
**Done:** P0-01
**Changed:** new repository `plainchant-scribe`: `AGENTS.md`, `CLAUDE.md`, `README.md`, `ROADMAP.md`, `LICENSE`, `docs/*`, the lineage digest in `docs/archive/`, the shared tools in `tools/`, and the 3x manual source and build.
**Decisions:** D-001 to D-007; questions Q-001 to Q-003.

### Session 5: 2026-11-03: the manuscript look and the home page

**Contributor:** Claude (Sonnet 5.5), with the maintainer
**Goal:** `P0-05`, `P0-06`.
**Done:** P0-05, P0-06
**Changed:** `src/styles.css` (light and dark palettes, variables for every colour, EB Garamond, heading type), `src/home.css` and `index.html` rewritten, `src/app/settings.js` (system default, retro removed), `app.html` (Settings radios, theme colour, Help intro, "Load Example Page"), `sw.js`, `manifest.webmanifest`, six EB Garamond files and its licence in `fonts/`, `test/theme.test.js`, docs.
**Decisions:** none new (D-008 updated).
**Verified:** the table in Current state; screenshots of the studio and the home page in both modes.

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
