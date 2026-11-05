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

_Last updated: 2026-11-04, session 9, on `master`: Phase 1 is complete, `P2-01` is done (New makes a book; the Stage shows chapters), `P0-07` makes the offline cache network first, `P2-02` adds reader settings, `P2-03` paged mode, `P2-04` device presets, `P2-05` navigation, and `P2-06` Stage editing: Phase 2 is complete; `P3-01` adds the Book panel, `P3-02` the chapters organiser, `P3-03` split and merge, and `P3-04` generated contents._

**Where things stand, in one paragraph:** Phase 0 is done. Phase 1 is done: six pure modules, loaded by `app.html` since `P2-01` (except `src/xhtml.js`, which waits for paste in `P2-06`): `src/xml-ast.js` (`P1-01`, D-011) parses and splices XML; `src/book-template.js` (`P1-02`, D-012) makes a new book that passes EPUBCheck 5.4.0; `src/book.js` (`P1-03`, D-014) reads a package document into a model with its XmlAst nodes and reports package-rule problems; `src/opf-edit.js` (`P1-04`, D-015) turns metadata, manifest, and spine changes into splices of that OPF; `src/nav.js` (`P1-05`, D-016) reads and edits the nav document the same way; `src/xhtml.js` (`P1-06`, D-017) checks chapters, fixes HTML entities, and cleans pasted HTML. Since `P2-01` (D-018), New makes a book and Load Example Book opens a three-chapter guide; the Stage shows the open chapter as `application/xhtml+xml`, with reader settings (text size, margins, theme; D-020) paged or scroll layout (D-021), device presets (D-022), moving between chapters, the contents, and links (D-023), and Stage editing of chapters through the Design bridge (D-024). Phase 2 is complete. The Book tab in the Inspector edits the metadata (D-025), and the Chapters tab adds, renames, deletes, reorders, splits, and merges chapters with the toc and links following (D-026, D-027), and can generate the contents and landmarks from headings (D-028). There is no export yet (Phase 5). Old saved projects still open as web pages. The app is served on port 8081 with storage and cache of its own (D-013). The repository is public at `https://github.com/aedmark/plainchant-scribe`. Next: `P3-05`, the cover.

**Verified** (2026-11-04 for `npm test` and the docs checks, otherwise 2026-11-03; Linux, Node, Python 3, Rust/Cargo; browser pane for the load check)

| Suite | Result |
| --- | --- |
| `npm test` (EPUBCheck 5.4.0 on Java 27 included) | **195/195** (186 without EPUBCheck) |
| `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo build` | **7/7**, passes |
| `python3 tools/check_docs.py` | `0 error(s), 0 warning(s)` |
| `python3 tools/manual.py check docs/plainchant-scribe.manual.json`, `python3 -m unittest tools/test_manual.py` | 2 sections, 5 entries; 6/6 OK |

**What works**
- **The trimmed studio** (`P0-02`, `P0-04`, D-001, D-003): Design-mode editing, Inspector, Explorer, Assets, Problems, Parts, Format, find and replace, undo across files, versions, library, folder links, Prism colours, File and Edit menus, shortcut sheet, and the preview server. Not rewritten; see the lineage digest.
- **Renamed shell** (`P0-03`): name, bundle id `io.plainchant.scribe`, `0.1.0`, separate storage names. A structure test fails if the old name returns.
- **Removal guard** (`P0-04`): a structure test fails if a removed file, element, or identifier returns.
- **Manuscript look** (`P0-06`, D-008): light and dark palettes, EB Garamond headings, Match system / Light / Dark in Settings; contrast and palette-parity tests. New home page (`P0-05`).
- **Documentation schemes** (`P0-01`, D-007).
- **Generated contents** (`P3-04`, D-028): Generate contents… on the Chapters tab; `BookContents.plan` and `apply`, previewed by `src/app/contents-ui.js`.
- **Split and merge** (`P3-03`, D-027): `BookChapters.split(entries, path, headingStart)` and `merge(entries, path)`; link rewriting by `retarget` in `src/book-chapters.js`.
- **Chapters organiser** (`P3-02`, D-026): the Inspector's Chapters tab; `BookChapters` results committed by `commitChapters` in `src/app/spine-ui.js` through the Explorer's `commitFileChange`.
- **Book panel** (`P3-01`, D-025): the Inspector's Book tab; `BookMeta` ops applied by `applyBookOps` in `src/app/book-ui.js`, which also has `applyFileText(path, text)` for writing any file as one undo step.
- **Stage editing** (`P2-06`, D-024): the bridge in the Stage copy; `bookEditRefused` in `src/app/stage-book.js` guards `applyHtmlTransform` for chapters.
- **Navigation** (`P2-05`, D-023): «, Contents, » on the Stage bar; paging past an end changes chapter; links followed by `followBookLink` in `src/app/stage-nav.js`; a pending target (`stageTarget`) is applied after the new chapter loads.
- **Device presets** (`P2-04`, D-022): Fit, Phone, E-ink, Tablet and rotate on the Stage bar for books; `layoutDevice` in `src/app/reader-device.js` sizes and scales the frame.
- **Paged mode** (`P2-03`, D-021): columns one viewport wide; ‹ Page n of m › and keys; the page kept across edits; `goToPage`, `turnToFragment`, and the page-end marker in `src/app/reader-ui.js`.
- **Reader settings** (`P2-02`, D-020): the Stage bar's Reader panel; saved in the Studio's settings; size scaling on load in `applyReaderSize`.
- **Books in the Studio** (`P2-01`, D-018): New, Load Example Book, and the first run make books; the Stage renders chapters from a Blob URL as XHTML; checked by hand in the browser pane, not in the Tauri window.
- **XHTML checks** (`P1-06`, D-017): `Xhtml.check`, `fixEntities`, and the paste normaliser `normalize`/`fromHtml`; a chapter with a normalised paste passes EPUBCheck.
- **Nav document** (`P1-05`, D-016): `Nav.read(files, bookModel)` and its edit ops; an edited nav passes EPUBCheck with no messages.
- **OPF edits** (`P1-04`, D-015): `OpfEdit` ops return XmlAst edits for a fresh model; an edited book passes EPUBCheck with no messages.
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
- The service worker registers in the agent's browser pane when the app is served by the `scribe` launch entry (seen 2026-11-04; earlier sessions saw it fail, apparently from the pane, not the app). It is network first (D-019), so a plain reload shows changes; stopping the server tests the offline path.
- Serve the browser app on port 8081 (`npm run serve`), not 8080, which is Plainchant Web's (D-013).
- `Book.read` takes text files keyed by container path; binary files (images, fonts) are passed as `options.assets` paths, because the working copy keeps them as Blobs.
- `OpfEdit` ops are for one fresh model each: apply the edits, `Book.read` again, then run the next op. Only `touchModified` changes `dcterms:modified`, so whatever saves or exports must call it. `setItemPath` changes the href only; the file and the links to it are not moved.
- A project is a book when it has `META-INF/container.xml` (`Project.isBookEntries`); books and old web projects take two paths through `core.js`, `stage.js` (`drawStageNow`), and `Project.pack`/`unpack`. `isPagePath` in `core.js` counts `.xhtml` as a page.
- For text input in new UI, use the maintainer's `askText` dialog (`src/app/dialogs.js`), not `window.prompt`. For yes/no questions, use `askConfirm` (added beside it for `P3-02`). One `window.confirm` is left, in `src/app/asset-ui.js`, and could move to `askConfirm`.
- The Design bridge's tag checks must use `tagName.toUpperCase()`: XHTML documents keep tag names in lower case. The Assets dialog's image insert writes `<img ...>`, which the chapter guard refuses.
- With a device preset, the Stage frame is absolutely positioned, sized, and scaled by `layoutDevice`; `stageFrameWrap.dataset.device` marks it. Books always use `data-vp="full"`; the inherited viewport switch is hidden for them.
- In paged mode, the page number is `scrollLeft / innerWidth` of the Stage copy. Anything that scrolls it must go through `goToPage`, or the scroll listener snaps it. The `#scribe-page-end` marker exists only in the Stage copy.
- Every `.vp-btn` on the page is treated as a viewport button by `panes.js`; the Reader panel's buttons are `.chip` for that reason.
- The Stage iframe's sandbox is `allow-scripts allow-same-origin` (inherited), which isolates nothing; `BookStage.assemble` stripping scripts and handlers is the real protection (SECURITY). Keep it that way when `P2-06` adds a bridge script for chapters.
- To drive the app in the browser pane, use the untracked `.claude/launch.json` entry `scribe` (port 8081), open `/app.html`, and call `openFileInEditor`, `startNewScript`, `saveScript`, `openLibrary` from `javascript_tool`; setting `editor.value` and dispatching `input` stands in for typing. Loading a web project with `loadProjectIntoEditor` keeps the current id, so it saves over the open book.
- `Nav` follows EPUBCheck 5.4.0 where it is stricter than EPUB 3.3 §7 (four rules, D-016); their messages name EPUBCheck. Recheck them when EPUBCheck is updated.
- `Xhtml.normalize` needs a DOM-like tree: in the app, `Xhtml.fromHtml(html)` uses the browser's `DOMParser`; in Node it throws `no-parser`, so tests build trees by hand. Chromium's real parse was checked once by hand in the browser pane (TESTING).
- The agent's file-writing tool turns `\u` escapes in JavaScript into the raw characters, invisible ones included. Write such strings with a script, or check afterwards with `grep -P '[^\x00-\x7F]'`.
- EPUBCheck lives in the git-ignored `.tools/` folder, so a fresh clone runs `npm test` without it and prints "not run"; see TESTING for the download. It validates against EPUB 3.4 rules.
- `XmlAst` offsets are string indices, not bytes (D-011). Edits return `{ start, end, text }` lists for one parse: apply them with `XmlAst.applyEdits(ast.text, edits)` and re-parse before the next edit. Several edits from the same parse can be applied together if they do not overlap.
- Internally declared entities stay as `&name;` in `XmlAst` values; HTML entities such as `&nbsp;` are `undeclared-entity` errors whose message gives the numeric form.
- `tools/check_docs.py` and `tools/manual.py` are the shared schemes' own files; replace them from their source repositories instead of editing (D-007).
- IDs in the lineage digest are written so the checker ignores them on purpose. `icons/` are still Plainchant Web's. The example page behind "Load Example Page" is still a web page until `P1-02`.

## Next steps (in order)

1. `P3-05`, the cover: choose an image and mark it `cover-image`, or generate a simple typographic cover. The Assets dialog's image insert still writes `<img ...>` (refused for chapters, D-024).
2. `P3-06`, series and collection metadata and extra contributors (with creator reordering, D-025).

## Open questions for maintainers

- Q-004 Kindle model and firmware, and how books reach it. Deferred by the maintainer as not important yet; ask again only when a Kindle result is wanted (P5-06).

## Session log

Newest first. Copy the template for each new session. Work done between sessions (a maintainer's commits, another
agent) gets a short entry too, written by whoever notices it, so the log has no gaps. Past 10 entries, move the
oldest to `docs/archive/` and leave a pointer here.

### Session 9: 2026-11-04: OPF edits by splicing

**Contributor:** Claude (Opus 5.5), with the maintainer
**Goal:** Commit and push `P1-03`; `P1-04`; `P1-05`; `P1-06`; `P2-01`.
**Done:** P1-04, P1-05, P1-06, P2-01, P0-07, P2-02, P2-03, P2-04, P2-05, P2-06, P3-01, P3-02, P3-03, P3-04
**Changed:** pushed `P1-03` (`6d13fb2`); new `src/opf-edit.js`, `test/opf-edit.test.js`; `test/run.js`, `test/epubcheck.test.js` (an edited book); `ROADMAP.md` (P1-04, a P5-04 note on PKG-010), `docs/DECISIONS.md` (D-015), `docs/ARCHITECTURE.md`, `docs/TESTING.md`, this file.
**Decisions:** D-015 to D-028, each point chosen by the maintainer.
**Verified:** `npm test` 133/133 (130 with `SCRIBE_SKIP_EPUBCHECK=1`); four deliberate bugs each failed a test. EPUBCheck first warned PKG-010 on a test file name with a space, which is how the P5-04 note was found. Then `P1-05` (pushed `P1-04` as `a0257c5` first): new `src/nav.js`, `test/nav.test.js`; `Book.hrefFor` moved from `OpfEdit` into `src/book.js`; `test/run.js`, `test/epubcheck.test.js`; ROADMAP (P1-05, P5-04 notes), DECISIONS (D-016), ARCHITECTURE, TESTING, this file. Verified: `npm test` 144/144 (140 without EPUBCheck); five deliberate bugs each failed a test; the EPUBCheck cross-check (43 of 64 agree, the rest stand-in content). Then `P1-06` (pushed `P1-05` as `4718c8a` first): new `src/xhtml.js`, `test/xhtml.test.js`; `test/run.js`, `test/epubcheck.test.js`; ROADMAP (P1-06, P5-04 note), DECISIONS (D-017), ARCHITECTURE, SECURITY (pasted HTML), TESTING, this file; corrected the P1-05 count without EPUBCheck to 140. Verified: `npm test` 153/153 (148 without EPUBCheck); six deliberate bugs each failed a test; EPUBCheck agreed on 25 of 26 documents; three pastes through Chromium's `DOMParser` in the browser pane. A `.claude/launch.json` for the browser pane's dev server (port 8081) was added and left untracked. Then `P2-01` (pushed `P1-06` as `be6b163` first): new `src/book-stage.js`, `src/example-book.js`, `src/app/stage-book.js`, `test/book-stage.test.js`; `src/project.js` (books), `src/app/core.js`, `stage.js`, `persistence.js`, `explorer-ui.js`, `project-links.js`, `help.js`; `app.html` and `sw.js` (the book modules and labels); `test/structure.test.js` (the new modules must load before the app scripts); `test/run.js`, `test/epubcheck.test.js`; `index.html`, `README.md`, `AGENTS.md`, ROADMAP, DECISIONS (D-018), ARCHITECTURE, SECURITY, TESTING, CHANGELOG, this file. Verified: `npm test` 160/160 (154 without EPUBCheck); five deliberate bugs each failed a test; the app by hand in the browser pane (ROADMAP P2-01). Then `P0-07` (pushed `P2-01` as `e2c9124` first): `sw.js` network first; `test/structure.test.js` (the service worker tests rewritten); ROADMAP, DECISIONS (D-019), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 161/161; the new tests fail against the old `sw.js`; update, offline, and restore by hand in the browser pane. Then `P2-02` (pushed `P0-07` as `ebbb2c4` first): new `src/app/reader-ui.js`; `src/book-stage.js` (reader CSS and the `css` option), `src/app/stage-book.js`, `src/app/settings.js`, `app.html` (Reader panel, New book), `src/styles.css`, `sw.js`; `test/book-stage.test.js`; ROADMAP, DECISIONS (D-020), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 163/163; four deliberate bugs each failed a test; the panel and size scaling by hand in the browser pane. Then `P2-03` (pushed `P2-02` as `5f12390` first): `src/book-stage.js` (paged CSS, `mode`), `src/app/reader-ui.js` (paging), `src/app/stage-book.js`, `src/app/settings.js`, `app.html` (Layout row, page indicator), `src/styles.css`; `test/book-stage.test.js`; ROADMAP, DECISIONS (D-021), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 164/164; three deliberate bugs each failed a test; paging by hand in the browser pane, which found and fixed the last-page offset and the note-link misalignment. Then `P2-04` (pushed `P2-03` as `42231d6` first): new `src/app/reader-device.js`; `src/book-stage.js` (devices, `deviceSize`, `fitScale`), `src/app/reader-ui.js`, `src/app/settings.js`, `app.html` (device switch), `src/styles.css`, `sw.js`; `test/book-stage.test.js`; ROADMAP, DECISIONS (D-022), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 165/165; three deliberate bugs each failed a test; the presets by hand in the browser pane. Then `P2-05` (pushed `P2-04` as `6f987f6` first): new `src/app/stage-nav.js`; `src/book-stage.js` (`readingOrder`, `neighbour`, `linkTarget`, `contents`), `src/app/reader-ui.js`, `src/app/stage-book.js`, `app.html` (chapter buttons, contents sidebar), `src/styles.css` (and the Stage bar wraps), `sw.js`; `test/book-stage.test.js`; ROADMAP, DECISIONS (D-023), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 168/168; four deliberate bugs each failed a test; navigation by hand in the browser pane. Then `P2-06` (pushed `P2-05` as `2455c86` first): `src/app/stage-book.js` (stamps, bridge, `bookEditRefused`), `src/book-stage.js` (`options.script`), `src/app/stage.js` (lower-case tag names), `src/app/stage-links.js`, `src/app/core.js` (the guard), `src/app/reader-ui.js`; `test/book-stage.test.js`; ROADMAP, DECISIONS (D-024), ARCHITECTURE, SECURITY, TESTING, CHANGELOG, this file. Verified: `npm test` 170/170; two deliberate bugs each failed a test; editing by hand in the browser pane. A slip in an edit script emptied `src/book-stage.js` mid-session; it was restored from HEAD and the change reapplied before anything was committed. Between items the maintainer added the `askText` modal dialog in place of `window.prompt` (committed for them as `33e870d`, with a CHANGELOG line). Then `P3-01`: new `src/book-meta.js`, `src/app/book-ui.js`, `test/book-meta.test.js`; `app.html` (Book tab and form), `src/styles.css`, `src/app/inspector-ui.js`, `src/app/core.js`, `src/app/reader-ui.js`, `sw.js`, `test/run.js`, `test/structure.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-025), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 178/178; four deliberate bugs each failed a test; the panel by hand in the browser pane. Then `P3-02` (pushed `P3-01` as `57e88ee` first): new `src/book-chapters.js`, `src/app/spine-ui.js`, `test/book-chapters.test.js`; `src/app/dialogs.js` (`askConfirm`), `app.html` (Chapters tab, confirm dialog), `src/styles.css`, `src/app/book-ui.js`, `src/app/inspector-ui.js`, `src/app/core.js`, `sw.js`, `test/run.js`, `test/structure.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-026), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 185/185; five deliberate bugs each failed a test; the tab by hand in the browser pane. Then `P3-03` (pushed `P3-02` as `213c602` first): `src/book-chapters.js` (`split`, `merge`, `retarget`), `src/app/spine-ui.js`, `app.html`, `src/styles.css`; `test/book-chapters.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-027), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 189/189; five deliberate bugs each failed a test; split and merge by hand in the browser pane. Then `P3-04` (pushed `P3-03` as `f23a712` first; that push was slow to reach GitHub but completed): new `src/book-contents.js`, `src/app/contents-ui.js`, `test/book-contents.test.js`; `app.html` (dialog, button), `src/styles.css`, `sw.js`, `test/run.js`, `test/structure.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-028), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 195/195; five deliberate bugs each failed a test; the dialog by hand in the browser pane.

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
