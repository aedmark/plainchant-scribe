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

_Last updated: 2026-11-03, session 8, on `master`: `P1-03` is done (the book model); storage is kept apart from Plainchant Web's (D-013)._

**Where things stand, in one paragraph:** Phase 0 is done. Phase 1 has three pure modules, none of them loaded by `app.html` yet: `src/xml-ast.js` (`P1-01`, D-011) parses and splices XML; `src/book-template.js` (`P1-02`, D-012) makes a new book that passes EPUBCheck 5.4.0; `src/book.js` (`P1-03`, D-014) reads a package document into a model with its XmlAst nodes and reports package-rule problems. The app is still the inherited Design-mode HTML and CSS editor in the manuscript look (D-008), served on port 8081 with storage and cache of its own (D-013); no EPUB feature exists for the user yet. The repository is public at `https://github.com/aedmark/plainchant-scribe`. Next: `P1-04`, OPF edits by splicing.

**Verified** (2026-11-03, Linux, Node, Python 3, Rust/Cargo; browser pane for the load check)

| Suite | Result |
| --- | --- |
| `npm test` (EPUBCheck 5.4.0 on Java 27 included) | **124/124** (122 without EPUBCheck) |
| `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo build` | **7/7**, passes |
| `python3 tools/check_docs.py` | `0 error(s), 0 warning(s)` |
| `python3 tools/manual.py check docs/plainchant-scribe.manual.json`, `python3 -m unittest tools/test_manual.py` | 2 sections, 5 entries; 6/6 OK |

**What works**
- **The trimmed studio** (`P0-02`, `P0-04`, D-001, D-003): Design-mode editing, Inspector, Explorer, Assets, Problems, Parts, Format, find and replace, undo across files, versions, library, folder links, Prism colours, File and Edit menus, shortcut sheet, and the preview server. Not rewritten; see the lineage digest.
- **Renamed shell** (`P0-03`): name, bundle id `io.plainchant.scribe`, `0.1.0`, separate storage names. A structure test fails if the old name returns.
- **Removal guard** (`P0-04`): a structure test fails if a removed file, element, or identifier returns.
- **Manuscript look** (`P0-06`, D-008): light and dark palettes, EB Garamond headings, Match system / Light / Dark in Settings; contrast and palette-parity tests. New home page (`P0-05`).
- **Documentation schemes** (`P0-01`, D-007).
- **Book model** (`P1-03`, D-014): `Book.read(files, { assets })`; problems are package rules only.
- **New-book template** (`P1-02`, D-012): `BookTemplate.create()`; EPUBCheck runs on it in `npm test` when `.tools/` has the jar.
- **XML parser and splicer** (`P1-01`, D-011): `XmlAst.parse` plus `applyEdits`, `setAttr`, `removeAttr`, `setText`, `insert`, `remove`; tested on the fixtures in `test/fixtures/xml/`; expat agreed on 45 verdicts.

**Not verified**
- The desktop window was not opened; the maintainer tested desktop paths by hand in Plainchant Web only.
- EPUB rules in the plan come from memory of EPUB 3.3 (D-004), except XML conformance (§3.9) and the XHTML requirements (§6.1.2), re-read on w3.org for `P1-01`. Re-read the relevant section before each later item.
- Only the template has run against EPUBCheck; nothing has been opened in Calibre yet (D-010).

**Gotchas for the next session**
- Read [archive/plainchant-web-lineage.md](archive/plainchant-web-lineage.md) first: what to keep, what to drop, and the traps (cache-first service worker, 500-line limit per app script, the HTML parser being too forgiving for XML).
- Previews now always drop `<script>` (D-004), so the Stage cannot run book scripts.
- `.console-row`, `.console-level`, `.console-msg`, `.console-src`, `.console-badge`, and `.css-state-bar` are CSS class names the Problems and Parts tabs still use; they are named for the removed Console and state bar. Rename them when those tabs are reworked (`P5-04`).
- `inspector-ui.js` (447 lines) and `stage.js` (461) are the largest app scripts against the 500-line limit; new Inspector or Stage behaviour needs a new file.
- In the agent's browser pane the service worker does not register for either app (an "unknown error occurred when fetching the script" console message); this is the pane, not the app.
- Serve the browser app on port 8081 (`npm run serve`), not 8080, which is Plainchant Web's (D-013).
- `Book.read` takes text files keyed by container path; binary files (images, fonts) are passed as `options.assets` paths, because the working copy keeps them as Blobs.
- EPUBCheck lives in the git-ignored `.tools/` folder, so a fresh clone runs `npm test` without it and prints "not run"; see TESTING for the download. It validates against EPUB 3.4 rules.
- `XmlAst` offsets are string indices, not bytes (D-011). Edits return `{ start, end, text }` lists for one parse: apply them with `XmlAst.applyEdits(ast.text, edits)` and re-parse before the next edit. Several edits from the same parse can be applied together if they do not overlap.
- Internally declared entities stay as `&name;` in `XmlAst` values; HTML entities such as `&nbsp;` are `undeclared-entity` errors whose message gives the numeric form.
- `tools/check_docs.py` and `tools/manual.py` are the shared schemes' own files; replace them from their source repositories instead of editing (D-007).
- IDs in the lineage digest are written so the checker ignores them on purpose. `icons/` are still Plainchant Web's. The example page behind "Load Example Page" is still a web page until `P1-02`.

## Next steps (in order)

1. `P1-04`, OPF edits by splicing (set or add metadata, add, rename, or remove a manifest item, reorder the spine), built on `Book.read` model nodes and the `XmlAst` edit builders, with `dcterms:modified` kept current.
2. `P1-05`, the nav document; then `P1-06`, the XHTML checks and normaliser.

## Open questions for maintainers

- Q-004 Kindle model and firmware, and how books reach it. Deferred by the maintainer as not important yet; ask again only when a Kindle result is wanted (P5-06).

## Session log

Newest first. Copy the template for each new session. Work done between sessions (a maintainer's commits, another
agent) gets a short entry too, written by whoever notices it, so the log has no gaps. Past 10 entries, move the
oldest to `docs/archive/` and leave a pointer here.

### Session 8: 2026-11-03: separate storage from Plainchant Web, then the book model

**Contributor:** Claude (Opus 5.5), with the maintainer
**Goal:** Make sure Scribe's cache and database are its own.
**Done:** none on the roadmap (an incidental fix)
**Changed:** `sw.js` (deletes and reads only Scribe's caches), `package.json` (serve on 8081), `test/structure.test.js` (two tests), `README.md`, `AGENTS.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, this file.
**Decisions:** D-013.
**Verified:** `npm test` 116/116; the new service worker test fails against the previous `sw.js` (it deleted `plainchant-web-v1`). Not checked in a real browser: the agent's browser pane does not register service workers.
**Then:** `P1-03` in the same session. Done: P1-03. Changed: new `src/book.js`, `test/book.test.js`; `test/run.js`; `ROADMAP.md` (P1-03, a P5-04 note), `docs/DECISIONS.md` (D-014), `docs/ARCHITECTURE.md`, `docs/TESTING.md`, this file. Verified: `npm test` 124/124; the EPUBCheck cross-check (45 of 49 agree, the rest explained in TESTING).

### Session 7: 2026-11-03: the new-book template

**Contributor:** Claude (Opus 5.5), with the maintainer
**Goal:** Push `P1-01`; `P1-02`.
**Done:** P1-02
**Changed:** created the public GitHub repository and pushed `master`; new `src/book-template.js`, `test/book-template.test.js`, `test/epubcheck.test.js`; `test/run.js`; `.gitignore` (`.tools/`); `AGENTS.md`, `ROADMAP.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TESTING.md`, this file. EPUBCheck 5.4.0 downloaded into `.tools/` (not committed).
**Decisions:** D-012 (scope, layout, defaults, content, no accessibility metadata yet, EPUBCheck as a local oracle), each chosen by the maintainer.
**Verified:** `npm test` 114/114 with EPUBCheck, 112/112 with `SCRIBE_SKIP_EPUBCHECK=1`; `check_docs.py` result in the table above.

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
