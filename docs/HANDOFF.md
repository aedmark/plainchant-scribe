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

_Last updated: 2026-11-06, on `master`: Phases 0 to 4 are done but `P3-07`; Phase 5 is done (the round trip, D-042, and send to reader, D-043), and Phase 6 is done through `P6-02` (accessibility metadata, D-044; page numbers, language, roles, alt text, and reading order, D-045). See ROADMAP for each item._

**Where things stand, in one paragraph:** Phase 0 is done. Phase 1 is done: six pure modules, loaded by `app.html` since `P2-01` (`src/xhtml.js` since `P5-04`): `src/xml-ast.js` (`P1-01`, D-011) parses and splices XML; `src/book-template.js` (`P1-02`, D-012) makes a new book that passes EPUBCheck 5.4.0; `src/book.js` (`P1-03`, D-014) reads a package document into a model with its XmlAst nodes and reports package-rule problems; `src/opf-edit.js` (`P1-04`, D-015) turns metadata, manifest, and spine changes into splices of that OPF; `src/nav.js` (`P1-05`, D-016) reads and edits the nav document the same way; `src/xhtml.js` (`P1-06`, D-017) checks chapters, fixes HTML entities, and cleans pasted HTML. Since `P2-01` (D-018), New makes a book and Load Example Book opens a three-chapter guide; the Stage shows the open chapter as `application/xhtml+xml`, with reader settings (text size, margins, theme; D-020) paged or scroll layout (D-021), device presets (D-022), moving between chapters, the contents, and links (D-023), and Stage editing of chapters through the Design bridge (D-024). Phase 2 is complete. The Book tab in the Inspector edits the metadata (D-025), and the Chapters tab adds, renames, deletes, reorders, splits, and merges chapters with the toc and links following (D-026, D-027), and can generate the contents and landmarks from headings (D-028); the Book tab also sets or generates the cover (D-029) and edits the series and contributors (D-030). Phase 3 is complete. The Layout tab writes paragraph, opener, scene-break, and small-caps settings into the stylesheet, embeds fonts, adds footnotes and endnotes, and inserts figures, tables, poems, and quotes (D-031 to D-035); the Problems panel lints book CSS (D-036). Phase 4 is complete. Export makes an `.epub` that passes EPUBCheck, in the browser and (by a Save dialog) the desktop app (D-037), and Open file… imports an `.epub` as a new book after checking the archive (D-038); the Chapters tab imports Markdown and plain text as chapters (D-039). Old saved projects still open as web pages. The app is served on port 8081 with storage and cache of its own (D-013). The repository is public at `https://github.com/aedmark/plainchant-scribe`. Phase 5 added the Problems tab (D-040, D-041), the round trip (D-042), and send to reader (D-043). Next: `P6-03`.

**Verified** (2026-11-06 for `npm test`, `cargo test` and the docs checks, otherwise 2026-11-03; Linux, Node, Python 3, Rust/Cargo; browser pane for the load check)

| Suite | Result |
| --- | --- |
| `npm test` (EPUBCheck 5.4.0 on Java 27, DAISY Ace 1.4.6 on Chrome, qrencode 4.1.1, and zbarimg 0.23.95 included) | **311/311** (285 without EPUBCheck and Ace) |
| `npm run roundtrip` (7 books, EPUBCheck 5.4.0, Calibre 9.14.0) | **7 passed** |
| `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo build` | **14/14**, passes |
| `python3 tools/check_docs.py` | `0 error(s), 0 warning(s)` |
| `python3 tools/manual.py check docs/plainchant-scribe.manual.json`, `python3 -m unittest tools/test_manual.py` | 2 sections, 5 entries; 6/6 OK |

**What works**
- **The trimmed studio** (`P0-02`, `P0-04`, D-001, D-003): Design-mode editing, Inspector, Explorer, Assets, Problems, Parts, Format, find and replace, undo across files, versions, library, folder links, Prism colours, File and Edit menus, shortcut sheet, and the preview server. Not rewritten; see the lineage digest.
- **Renamed shell** (`P0-03`): name, bundle id `io.plainchant.scribe`, `0.1.0`, separate storage names. A structure test fails if the old name returns.
- **Removal guard** (`P0-04`): a structure test fails if a removed file, element, or identifier returns.
- **Manuscript look** (`P0-06`, D-008): light and dark palettes, EB Garamond headings, Match system / Light / Dark in Settings; contrast and palette-parity tests. New home page (`P0-05`).
- **Documentation schemes** (`P0-01`, D-007).
- **Accessibility content** (`P6-02`, D-045): `src/app/structure-ui.js` drives `BookPages`, `BookLang`, `BookRoles`, and `BookAlt`; `BookOrder` and those modules' `rows` join `bookProblems`. **Accessibility metadata** (`P6-01`, D-044): the Book tab's Accessibility section (`src/app/a11y-ui.js`) writes `BookA11y` ops (`src/book-a11y.js`); `BookA11y.rows` adds the Problems tab's metadata rows in `bookProblems`. Ace lives in `.tools/ace/` (see TESTING). **Send to reader** (`P5-07`, D-043): `src/app/preview-ui.js` pushes `BookPage.share`'s page and files and the `.epub` from `packOpenBook` to `src-tauri/src/preview.rs`, which is strict in book mode and sets a nonce CSP; `src/qr.js` draws the QR code. Not yet tried in a real window or on a phone. **Round trip** (`P5-06`, D-042): `npm run roundtrip` (`tools/roundtrip.js`) on the books listed in `test/corpus.json`, kept in `.tools/corpus/`. **EPUBCheck in the desktop app** (`P5-05`, D-041): Run EPUBCheck in the Problems tab (`src/app/epubcheck-ui.js`) packs the book with `packOpenBook` (`src/app/epub-export-ui.js`) and calls the Rust `epubcheck_run` (`src-tauri/src/epubcheck.rs`); `EpubcheckReport` (`src/epubcheck-report.js`) makes the rows of the EPUBCheck category.
- **Book Problems tab** (`P5-04`, D-040): `BookCheck` in `src/book-check.js` gives the Problems tab its book rules (new Package category) and Export its errors check (`bookProblems` in `src/app/problems-ui.js`); `test/book-check-cases.js` holds BookCheck and EPUBCheck to the same broken books. The Stylesheets category is `CssLint` (`P4-06`, D-036).
- **Import** (`P5-02`, `P5-03`, D-038, D-039): `Epub.read` in `src/epub.js` checks an `.epub`, then `importEpub` in `src/app/import.js` opens it as a new project; `MarkdownImport` in `src/markdown-import.js`, behind Import text… in the Chapters tab, adds chapters with `BookNotes.insertAt` and `BookBlocks.listImage`. **Export** (`P5-01`, D-037): the Export dialog's .epub section for books (`src/app/epub-export-ui.js`); `BookExport` packs with `Zip` (now with deflated entries); the Rust `save_book_file` command saves on the desktop.
- **Blocks** (`P4-05`, D-035): the Layout tab's figures, tables, poems, and quotes section; `BookBlocks` writes and places them; the Assets panel's Insert makes a figure in a book.
- **Notes** (`P4-04`, D-034): the Layout tab's Notes section; `BookNotes` adds and removes noterefs with their footnotes or endnotes and renumbers in reading order.
- **Embedded fonts** (`P4-03`, D-033): the Layout tab's Fonts section; `FontInfo` reads TTF and OTF tables; `BookFonts` keeps the file, manifest item, and `@font-face` rule together.
- **Openers and breaks** (`P4-02`, D-032): more Layout tab settings in the same block; Insert scene break (`BookStyle.sceneBreakAfter`).
- **Layout presets** (`P4-01`, D-031): the Inspector's Layout tab (`src/app/style-ui.js`); `BookStyle` writes one marked block at the end of the main stylesheet.
- **Series and contributors** (`P3-06`, D-030): Series fields and a Contributors list in the Book tab; ↑/↓ on people (`OpfEdit.moveMetadata`).
- **Cover** (`P3-05`, D-029): the Book tab's Cover section; `BookCover` with `commitCover` in `src/app/cover-ui.js` (a new image goes in through `commitFileChange`'s `apply`, so it is the same undo step).
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
- The desktop window was not opened (the EPUBCheck run and Save dialog included); the maintainer tested desktop paths by hand in Plainchant Web only. Nothing has been opened in Calibre yet (D-010).
- EPUB rules in the plan come from memory of EPUB 3.3 (D-004), except XML conformance (§3.9) and the XHTML requirements (§6.1.2), re-read on w3.org for `P1-01`. Re-read the relevant section before each later item.

**Gotchas for the next session**
- Read [archive/plainchant-web-lineage.md](archive/plainchant-web-lineage.md) first: what to keep, what to drop, and the traps (cache-first service worker, 500-line limit per app script, the HTML parser being too forgiving for XML).
- Previews now always drop `<script>` (D-004), so the Stage cannot run book scripts.
- `XmlAst.position` and the `line` of `Book`, `Nav`, and `Xhtml` problems count from 0; `BookCheck` recounts from 1 by offset. Use offsets, not those lines, for anything shown. Every new book has one Problems warning (no cover); tests filter `cover-missing`.
- `inspector-ui.js` (447 lines) and `stage.js` (461) are the largest app scripts against the 500-line limit; new Inspector or Stage behaviour needs a new file.
- The service worker registers in the agent's browser pane when the app is served by the `scribe` launch entry (seen 2026-11-04; earlier sessions saw it fail, apparently from the pane, not the app). It is network first (D-019), so a plain reload shows changes; stopping the server tests the offline path.
- Serve the browser app on port 8081 (`npm run serve`), not 8080, which is Plainchant Web's (D-013).
- `Book.read` takes text files keyed by container path; binary files (images, fonts) are passed as `options.assets` paths, because the working copy keeps them as Blobs.
- `OpfEdit` ops are for one fresh model each: apply the edits, `Book.read` again, then run the next op. Only `touchModified` changes `dcterms:modified`, so whatever saves or exports must call it. `setItemPath` changes the href only; the file and the links to it are not moved.
- A project is a book when it has `META-INF/container.xml` (`Project.isBookEntries`); books and old web projects take two paths through `core.js`, `stage.js` (`drawStageNow`), and `Project.pack`/`unpack`. `isPagePath` in `core.js` counts `.xhtml` as a page.
- `src/app/layout-ui.js` is a name the structure test reserves as removed (Plainchant Web's flex and grid handles), so the Layout tab's script is `style-ui.js`.
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
- EPUBCheck lives in the git-ignored `.tools/` folder, so a fresh clone runs `npm test` without it and prints "not run"; see TESTING for the download. It validates against EPUB 3.4 rules. The EPUBCheck run is desktop only; to see its UI in the browser pane, set `window.__TAURI__ = { core: { invoke } }` with a stand-in for `epubcheck_env_jar`, `epubcheck_pick_jar`, and `epubcheck_run`, then reset `settings.epubcheckJar` and `problemsFilter`.
- `XmlAst` offsets are string indices, not bytes (D-011). Edits return `{ start, end, text }` lists for one parse: apply them with `XmlAst.applyEdits(ast.text, edits)` and re-parse before the next edit. Several edits from the same parse can be applied together if they do not overlap.
- Internally declared entities stay as `&name;` in `XmlAst` values; HTML entities such as `&nbsp;` are `undeclared-entity` errors whose message gives the numeric form.
- `tools/check_docs.py` and `tools/manual.py` are the shared schemes' own files; replace them from their source repositories instead of editing (D-007).
- IDs in the lineage digest are written so the checker ignores them on purpose. `icons/` are still Plainchant Web's. The example page behind "Load Example Page" is still a web page until `P1-02`.

## Next steps (in order)

1. The maintainer tries Send to reader in the desktop app (`npm run tauri:dev`) with a phone on the same Wi-Fi; record what they saw in `P5-07`.
2. `P6-03` (a publishing checklist per store, documentation only). Ask the design questions first.
3. Known gap for later: images imported through Assets join the manifest only when they become the cover or a figure; the Problems tab now warns about them (not-in-manifest), but nothing lists them yet.

## Open questions for maintainers

- Q-004 Kindle model and firmware, and how books reach it. Deferred by the maintainer as not important yet; ask again only when a Kindle result is wanted (P5-06).

## Session log

Newest first. Copy the template for each new session. Work done between sessions (a maintainer's commits, another
agent) gets a short entry too, written by whoever notices it, so the log has no gaps. Past 10 entries, move the
oldest to `docs/archive/` and leave a pointer here.

### Session 9: 2026-11-04: OPF edits by splicing

**Contributor:** Claude (Opus 5.5), with the maintainer
**Goal:** Commit and push `P1-03`; `P1-04`; `P1-05`; `P1-06`; `P2-01`.
**Done:** P1-04, P1-05, P1-06, P2-01, P0-07, P2-02, P2-03, P2-04, P2-05, P2-06, P3-01, P3-02, P3-03, P3-04, P3-05, P3-06, P4-01, P4-02, P4-03, P4-04, P4-05, P4-06, P5-01, P5-02, P5-03, P5-04 (2026-11-05), P5-05 (2026-11-06)
**Changed:** pushed `P1-03` (`6d13fb2`); new `src/opf-edit.js`, `test/opf-edit.test.js`; `test/run.js`, `test/epubcheck.test.js` (an edited book); `ROADMAP.md` (P1-04, a P5-04 note on PKG-010), `docs/DECISIONS.md` (D-015), `docs/ARCHITECTURE.md`, `docs/TESTING.md`, this file.
**Decisions:** D-015 to D-039, each point chosen by the maintainer.
**Verified:** `npm test` 133/133 (130 with `SCRIBE_SKIP_EPUBCHECK=1`); four deliberate bugs each failed a test. EPUBCheck first warned PKG-010 on a test file name with a space, which is how the P5-04 note was found. Then `P1-05` (pushed `P1-04` as `a0257c5` first): new `src/nav.js`, `test/nav.test.js`; `Book.hrefFor` moved from `OpfEdit` into `src/book.js`; `test/run.js`, `test/epubcheck.test.js`; ROADMAP (P1-05, P5-04 notes), DECISIONS (D-016), ARCHITECTURE, TESTING, this file. Verified: `npm test` 144/144 (140 without EPUBCheck); five deliberate bugs each failed a test; the EPUBCheck cross-check (43 of 64 agree, the rest stand-in content). Then `P1-06` (pushed `P1-05` as `4718c8a` first): new `src/xhtml.js`, `test/xhtml.test.js`; `test/run.js`, `test/epubcheck.test.js`; ROADMAP (P1-06, P5-04 note), DECISIONS (D-017), ARCHITECTURE, SECURITY (pasted HTML), TESTING, this file; corrected the P1-05 count without EPUBCheck to 140. Verified: `npm test` 153/153 (148 without EPUBCheck); six deliberate bugs each failed a test; EPUBCheck agreed on 25 of 26 documents; three pastes through Chromium's `DOMParser` in the browser pane. A `.claude/launch.json` for the browser pane's dev server (port 8081) was added and left untracked. Then `P2-01` (pushed `P1-06` as `be6b163` first): new `src/book-stage.js`, `src/example-book.js`, `src/app/stage-book.js`, `test/book-stage.test.js`; `src/project.js` (books), `src/app/core.js`, `stage.js`, `persistence.js`, `explorer-ui.js`, `project-links.js`, `help.js`; `app.html` and `sw.js` (the book modules and labels); `test/structure.test.js` (the new modules must load before the app scripts); `test/run.js`, `test/epubcheck.test.js`; `index.html`, `README.md`, `AGENTS.md`, ROADMAP, DECISIONS (D-018), ARCHITECTURE, SECURITY, TESTING, CHANGELOG, this file. Verified: `npm test` 160/160 (154 without EPUBCheck); five deliberate bugs each failed a test; the app by hand in the browser pane (ROADMAP P2-01). Then `P0-07` (pushed `P2-01` as `e2c9124` first): `sw.js` network first; `test/structure.test.js` (the service worker tests rewritten); ROADMAP, DECISIONS (D-019), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 161/161; the new tests fail against the old `sw.js`; update, offline, and restore by hand in the browser pane. Then `P2-02` (pushed `P0-07` as `ebbb2c4` first): new `src/app/reader-ui.js`; `src/book-stage.js` (reader CSS and the `css` option), `src/app/stage-book.js`, `src/app/settings.js`, `app.html` (Reader panel, New book), `src/styles.css`, `sw.js`; `test/book-stage.test.js`; ROADMAP, DECISIONS (D-020), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 163/163; four deliberate bugs each failed a test; the panel and size scaling by hand in the browser pane. Then `P2-03` (pushed `P2-02` as `5f12390` first): `src/book-stage.js` (paged CSS, `mode`), `src/app/reader-ui.js` (paging), `src/app/stage-book.js`, `src/app/settings.js`, `app.html` (Layout row, page indicator), `src/styles.css`; `test/book-stage.test.js`; ROADMAP, DECISIONS (D-021), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 164/164; three deliberate bugs each failed a test; paging by hand in the browser pane, which found and fixed the last-page offset and the note-link misalignment. Then `P2-04` (pushed `P2-03` as `42231d6` first): new `src/app/reader-device.js`; `src/book-stage.js` (devices, `deviceSize`, `fitScale`), `src/app/reader-ui.js`, `src/app/settings.js`, `app.html` (device switch), `src/styles.css`, `sw.js`; `test/book-stage.test.js`; ROADMAP, DECISIONS (D-022), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 165/165; three deliberate bugs each failed a test; the presets by hand in the browser pane. Then `P2-05` (pushed `P2-04` as `6f987f6` first): new `src/app/stage-nav.js`; `src/book-stage.js` (`readingOrder`, `neighbour`, `linkTarget`, `contents`), `src/app/reader-ui.js`, `src/app/stage-book.js`, `app.html` (chapter buttons, contents sidebar), `src/styles.css` (and the Stage bar wraps), `sw.js`; `test/book-stage.test.js`; ROADMAP, DECISIONS (D-023), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 168/168; four deliberate bugs each failed a test; navigation by hand in the browser pane. Then `P2-06` (pushed `P2-05` as `2455c86` first): `src/app/stage-book.js` (stamps, bridge, `bookEditRefused`), `src/book-stage.js` (`options.script`), `src/app/stage.js` (lower-case tag names), `src/app/stage-links.js`, `src/app/core.js` (the guard), `src/app/reader-ui.js`; `test/book-stage.test.js`; ROADMAP, DECISIONS (D-024), ARCHITECTURE, SECURITY, TESTING, CHANGELOG, this file. Verified: `npm test` 170/170; two deliberate bugs each failed a test; editing by hand in the browser pane. A slip in an edit script emptied `src/book-stage.js` mid-session; it was restored from HEAD and the change reapplied before anything was committed. Between items the maintainer added the `askText` modal dialog in place of `window.prompt` (committed for them as `33e870d`, with a CHANGELOG line). Then `P3-01`: new `src/book-meta.js`, `src/app/book-ui.js`, `test/book-meta.test.js`; `app.html` (Book tab and form), `src/styles.css`, `src/app/inspector-ui.js`, `src/app/core.js`, `src/app/reader-ui.js`, `sw.js`, `test/run.js`, `test/structure.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-025), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 178/178; four deliberate bugs each failed a test; the panel by hand in the browser pane. Then `P3-02` (pushed `P3-01` as `57e88ee` first): new `src/book-chapters.js`, `src/app/spine-ui.js`, `test/book-chapters.test.js`; `src/app/dialogs.js` (`askConfirm`), `app.html` (Chapters tab, confirm dialog), `src/styles.css`, `src/app/book-ui.js`, `src/app/inspector-ui.js`, `src/app/core.js`, `sw.js`, `test/run.js`, `test/structure.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-026), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 185/185; five deliberate bugs each failed a test; the tab by hand in the browser pane. Then `P3-03` (pushed `P3-02` as `213c602` first): `src/book-chapters.js` (`split`, `merge`, `retarget`), `src/app/spine-ui.js`, `app.html`, `src/styles.css`; `test/book-chapters.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-027), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 189/189; five deliberate bugs each failed a test; split and merge by hand in the browser pane. Then `P3-04` (pushed `P3-03` as `f23a712` first; that push was slow to reach GitHub but completed): new `src/book-contents.js`, `src/app/contents-ui.js`, `test/book-contents.test.js`; `app.html` (dialog, button), `src/styles.css`, `sw.js`, `test/run.js`, `test/structure.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-028), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 195/195; five deliberate bugs each failed a test; the dialog by hand in the browser pane. Then `P3-05` (pushed `P3-04` as `4fd58fb` first): new `src/book-cover.js`, `src/app/cover-ui.js`, `test/book-cover.test.js`; `src/book-contents.js` (cover pages left out of the toc), `src/app/asset-ui.js` (book images in `OEBPS/images`), `src/app/book-ui.js`, `app.html` (Cover section, dialog), `src/styles.css`, `sw.js`, `test/run.js`, `test/structure.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-029), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 202/202; four deliberate bugs each failed a test; the cover by hand in the browser pane. Then `P3-06` (pushed `P3-05` as `07903bf` first): `src/opf-edit.js` (`setLegacyMeta`, `removeLegacyMeta`, `moveMetadata`, `insertMeta`), `src/book-meta.js` (series, people), `src/app/book-ui.js`, `app.html`, `src/styles.css`; `test/book-meta.test.js`, `test/opf-edit.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-030), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 207/207; four deliberate bugs each failed a test; the Book tab by hand in the browser pane. Then `P4-01` (pushed `P3-06` as `b2cbe73` first): new `src/book-style.js`, `src/app/style-ui.js`, `test/book-style.test.js`; `app.html` (Layout tab), `src/styles.css`, `src/app/inspector-ui.js`, `src/app/book-ui.js`, `src/app/core.js`, `sw.js`, `test/run.js`, `test/structure.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-031), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 211/211; four deliberate bugs each failed a test; the tab by hand in the browser pane. Then `P4-02` (pushed `P4-01` as `c39a79e` first): `src/book-style.js` (openers, breaks, small caps, `withPreset`, `sceneBreakAfter`), `src/app/style-ui.js`, `app.html`; `test/book-style.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-032), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 214/214; four deliberate bugs each failed a test; the settings and the insert by hand in the browser pane. Then `P4-03` (pushed `P4-02` as `689d91a` first): new `src/font-info.js`, `src/book-fonts.js`, `src/app/fonts-ui.js`, `test/font-info.test.js`, `test/book-fonts.test.js`; `src/book-style.js` (fonts in the block), `src/app/style-ui.js`, `app.html` (Fonts section, dialog), `src/styles.css`, `sw.js`, `test/run.js`, `test/structure.test.js`, `test/book-style.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-033), ARCHITECTURE, SECURITY, TESTING, CHANGELOG, this file. Verified: `npm test` 221/221; five deliberate bugs each failed a test; `FontInfo` against fontconfig on 963 fonts; import and Stage rendering by hand in the browser pane. Then `P4-04` (pushed `P4-03` as `4e08293` first): new `src/book-notes.js`, `src/app/notes-ui.js`, `test/book-notes.test.js`; `src/book-style.js` (notes setting and styling), `app.html` (Notes section), `sw.js`, `test/run.js`, `test/structure.test.js`, `test/book-style.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-034), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 228/228; five deliberate bugs each failed a test; EPUBCheck found a duplicate id between a footnote and an endnote in one chapter, fixed before commit; notes by hand in the browser pane. Then `P4-05` (pushed `P4-04` as `b8b695e` first): new `src/book-blocks.js`, `src/app/blocks-ui.js`, `test/book-blocks.test.js`; `src/book-style.js` (the `blocks` switch), `src/app/asset-ui.js` (Insert makes a figure in a book), `app.html` (section, dialog), `sw.js`, `test/run.js`, `test/structure.test.js`, `test/book-style.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-035), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 235/235; six deliberate bugs each failed a test; every kind by hand in the browser pane. Then `P4-06` (pushed `P4-05` as `b7abffe` first): new `src/css-lint.js`, `test/css-lint.test.js`; `src/app/problems-ui.js` (Stylesheets category), `app.html`, `sw.js`, `test/run.js`, `test/structure.test.js`; ROADMAP, DECISIONS (D-036), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 241/241; six deliberate bugs each failed a test; the Problems panel by hand in the browser pane. Then `P5-01` (pushed `P4-06` as `c788603` first): new `src/book-export.js`, `src/app/epub-export-ui.js`, `test/book-export.test.js`; `src/zip.js` (deflated entries), `src-tauri/src/main.rs` (`save_book_file`), `src/app/export.js`, `app.html`, `sw.js`, `test/harness.js` (`runTestsAsync`), `test/run.js`, `test/structure.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-037), ARCHITECTURE, SECURITY, TESTING, CHANGELOG, this file. Verified: `npm test` 247/247, `cargo test` 8/8; seven deliberate bugs each failed a test; export by hand in the browser pane. EPUBCheck 5.4.0 was found not to report a deflated `mimetype`. Then `P5-02` (pushed `P5-01` as `42e981b` first): new `src/epub.js`, `test/epub.test.js`; `src/app/import.js` (`importEpub`), `app.html` (accept, hints), `sw.js`, `test/run.js`, `test/structure.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-038), ARCHITECTURE, SECURITY, TESTING, CHANGELOG, this file. Verified: `npm test` 254/254; eight deliberate bugs each failed a test; import and a hostile archive by hand in the browser pane, whose test book was then moved to Recently deleted. Then `P5-03` (pushed `P5-02` as `76fded8` first): new `src/markdown-import.js`, `test/markdown-import.test.js`; `src/book-notes.js` (`insertAt`), `src/book-blocks.js` (`listImage`), `src/app/spine-ui.js` (Import text…), `app.html`, `sw.js`, `test/run.js`, `test/structure.test.js`, `test/book-notes.test.js`, `test/epubcheck.test.js`; ROADMAP, DECISIONS (D-039), ARCHITECTURE, TESTING, CHANGELOG, this file. Verified: `npm test` 261/261; nine deliberate bugs each failed a test; import by hand in the browser pane, undone afterwards.

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
