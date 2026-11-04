# Roadmap

Item IDs are permanent: `P<phase>-<nn>`. Never renumber; append new items at the end of their phase.
`[ ]` open · `[~]` in progress (who holds it, since when, and what is left) · `[x]` done · `[-]` dropped (say why,
and the decision). An item held `[~]` by someone else is theirs until they or a maintainer release it.

A finished item says what was done, the decision if any, the evidence (the test, or the measurement), and the date.
A new item says where it came from (a test run, a real user, a maintainer) and the date. Keep an item's history in it:
"tried X, measured Y, then did Z" is how the next session avoids trying X again. Bugs are items too, filed under
the phase they belong to.

All items below were proposed by the agent and approved by the maintainer on 2026-11-03 unless they say otherwise.
Phases are ordered by dependency; sizes are rough (S under a day, M a few days, L about a week or more).

## Phase 0: Spinoff and scaffolding

Goal: a green, renamed copy of Plainchant Web with the features Scribe does not want removed, and the docs schemes in place.

- [x] P0-01 Create the repository with the Manifold and 3x documentation schemes, the roadmap, the decisions, and a digest of the Plainchant Web history (D-003, D-007). Evidence: `python3 tools/check_docs.py` and `python3 -m unittest tools/test_manual.py` (2026-11-03). Size S.
- [x] P0-02 Copy the Plainchant Web source (`app.html`, `index.html`, `manifest.webmanifest`, `src/`, `src-tauri/`, `sw.js`, `test/`, `fonts/`, `icons/`, `package.json`) from the commit named in D-003 without its git history, using `git archive`. Evidence: `npm test` 103/103, `cargo test` 7/7, and `cargo build` pass unchanged (2026-11-03). The licence gained a Third-Party Notices section for the vendored Prism, as in Plainchant Web. Size S.
- [x] P0-03 Rename everything: product name ("Plainchant Scribe"), bundle id `io.plainchant.scribe`, versions `0.1.0`, IndexedDB (`plainchant_scribe`), `localStorage` (`plainchant_scribe_settings`, `plainchant_scribe_emergency`), the cross-tab channel, the service worker cache (`plainchant-scribe-v1`), the project-format marker (`plainchantScribe`), manifest, titles, window title, Cargo package, and the in-app copy; `index.html` is an honest placeholder until P0-05. Evidence: a structure test fails if the old name appears in the app, its storage names, or its desktop shell; `npm test` 104/104, `cargo test` 7/7, `cargo build`; the renamed app loaded in a browser pane with a new `plainchant_scribe` database and no console errors from the app (2026-11-03). Size M.
- [x] P0-04 Remove what Scribe will not use: Live JS mode and the Console, the Insert palette of web components (toolbar menu, context submenu, and drag onto the Stage), breakpoints, flex and grid handles, and the pseudo-state bar. Kept the shared page parts (candidate for P3-07) and the network preview (D-009, adapted in P5-07). Done 2026-11-03: 8 app scripts, `src/layout.js`, and `test/layout.test.js` deleted; `CssAst` state helpers, `MEDIA_PRESETS`, `DomOutline.dropPlacement`, `Editing.SNIPPETS`, and `Project.consoleBridge` removed, with their tests; previews now always drop `<script>` (D-004); `stage-live.js` became `stage-links.js` (link following only). Kept on purpose: `CssAst`'s media-aware lookups (generic CSS), `HtmlAst.insertElementAt` (used by the Assets dialog), and Tab abbreviations. Evidence: a structure test fails if any removed file, element id, or identifier returns; `npm test` 89/89, `cargo build`; the trimmed app loaded in a browser pane with the right inspector tabs, a working context menu, and file switches in sync (2026-11-03). Size M.
- [x] P0-05 Replace the home page, Help guide, and shortcut sheet with Scribe copy, in the manuscript look (D-008). Done 2026-11-03: `index.html` is a three-chapter folio (the idea, the plan in six steps, where it stands today, which says plainly that Scribe cannot make an EPUB yet); the Help guide opens with Scribe's status and drops the Dreamweaver framing; the shortcut sheet needed only the Stage label changed in `P0-04`; the two "Starter Template" buttons now say "Load Example Page" because the example is still a web page until `P1-02`. Evidence: the structure test for the home page (no script, links and anchors resolve) passes; both modes of the home page were checked in a browser pane. Size S.
- [x] P0-06 The manuscript look (D-008). Done 2026-11-03: one set of CSS custom properties, warm paper and ink in light and lamplight in dark (`:root` is light, `data-theme="dark"` or the system setting gives dark, with no flash on load), a Settings choice of Match system (the default), Light, or Dark, EB Garamond (OFL, six files and its licence in `fonts/`) for headings and the home page with Courier Prime kept for code, a light and a dark syntax palette, and the inherited retro theme removed. Every hard-coded colour outside the theme blocks became a variable (shadows, find highlights, warning amber, the Stage paper). Evidence: 4 tests in `test/theme.test.js` (every text, button, and syntax pair reaches 4.5:1 in both modes, light and dark define the same variables, the system fallback equals the dark theme, no colour outside the theme blocks, the home page palette matches the studio's); screenshots of the studio and the home page in both modes (2026-11-03). Not covered: the app icons are still Plainchant Web's, and the Reading Stage's own reader themes (`P2-02`). Size M.

## Phase 1: The book format

Goal: Scribe can create a valid, empty book and read and edit its package document without rewriting it.

- [x] P1-01 `src/xml-ast.js`: a non-destructive, well-formed XML parser with byte ranges and a splicer, no DOCTYPE or external entities. Done when round-trip and splice tests pass on OPF, nav, and XHTML samples. Size L. Done 2026-11-03 (D-011): offsets are string indices ("byte ranges" in practice means character ranges); `parse()` reports every error with code and position and returns a best-effort tree; namespaces resolved; the DOCTYPE is kept but never processed, with internal entity names noted and never expanded; limits on depth (256), size (16 Mi characters), attributes (1024), and errors (100); generic splices `applyEdits`, `setAttr`, `removeAttr`, `setText`, `insert` (indents like its neighbours, keeps the file's line ends, re-parses to refuse breaking markup), `remove` (takes the whole line when the node is alone on it). Rules re-read from XML 1.0 (Fifth Edition), Namespaces in XML 1.0 (Third Edition), and EPUB 3.3 §3.9 on w3.org, which showed that internal entity declarations are allowed. Evidence: 13 tests in `test/xml-ast.test.js` on four fixtures in `test/fixtures/xml/` (every file rebuilds exactly from its ranges; each splice changes only its range and leaves the file well-formed; 29 malformed inputs give the expected error codes; namespace and security cases), `npm test` 106/106; Python's expat agreed on all 45 well-formedness verdicts, by hand; a 1.3 Mi-character chapter parsed in 82 ms (Node 22, Linux). Not covered: `app.html` does not load the module yet (`P1-03` will), and EPUB-level DOCTYPE and encoding rules are left to `P1-06` and `P5-04`.
- [x] P1-02 New-book template: `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `nav.xhtml`, one chapter, `book.css`, folders for images and fonts, with a generated UUID identifier and `dcterms:modified`. Done when the template passes EPUBCheck (P5-01). Size M. Done 2026-11-03 (D-012): `src/book-template.js`, a pure module (not yet wired into the app), with the `OEBPS/text`, `OEBPS/css`, `OEBPS/images`, `OEBPS/fonts` layout, defaults "Untitled Book" and `en`, no creator unless given, a random v4 UUID, and no accessibility metadata (left to `P6-01`). The first EPUBCheck run found one error: a landmark to the nav itself, which is not in the spine (RSC-011), so that landmark was dropped. Evidence: EPUBCheck 5.4.0 (Java 27, Linux) reports 0 fatals, 0 errors, 0 warnings, 0 infos on the default book and on one with a French title, creator, and escaped characters, and reports an error when `dcterms:modified` is removed (`test/epubcheck.test.js`); 6 tests in `test/book-template.test.js`; `npm test` 114/114. The zip in the oracle test is `Zip.build` with `mimetype` first; the export rules themselves are still `P5-01`.
- [ ] P1-03 `src/book.js` (UMD): read an OPF into a model (metadata, manifest, spine, cover) and report problems. Size M.
- [ ] P1-04 OPF edit operations by splicing: set or add metadata, add, rename, or remove a manifest item, reorder the spine, with the rest of the file untouched. Size M.
- [ ] P1-05 Nav document read and write: table of contents, landmarks, page list. Size M.
- [ ] P1-06 XHTML well-formedness check, entity handling (HTML named entities are not XML), and a pasted-HTML to XHTML normaliser. Size M.

## Phase 2: The Reading Stage

Goal: see a chapter as a reader would, and edit it there.

- [ ] P2-01 Render the open chapter in the Stage iframe with the book's CSS, images, and fonts from the Studio working copy, scripts stripped. Size M.
- [ ] P2-02 Reader controls: font size, margins, and light, sepia, and dark themes, applied as overrides that never touch the book's files. Size S.
- [ ] P2-03 Paged mode with CSS columns and a page indicator, plus scroll mode. Size M.
- [ ] P2-04 Device presets: phone, 6-inch e-ink (greyscale, no animation), tablet. Size S.
- [ ] P2-05 Spine navigation: previous and next chapter, a table-of-contents sidebar, and following internal links across chapters. Size M.
- [ ] P2-06 Keep Plainchant Web's click, double-click to edit text, and drag reorder on the Reading Stage, adapted to XHTML. Size M.

## Phase 3: Structure

Goal: the author never has to open the OPF to manage the book.

- [ ] P3-01 Book panel: title, creators with roles, language, publisher, date, description, rights, identifier, modified date. Size M.
- [ ] P3-02 Spine and contents organiser: add, rename, delete, and drag chapters; the manifest and spine update together. Size M.
- [ ] P3-03 Split a chapter at a heading and merge two chapters, updating links and the contents. Size M.
- [ ] P3-04 Generate or refresh the nav document from headings, with a level limit and landmarks. Size M.
- [ ] P3-05 Cover: choose an image and mark it as the cover image, or generate a simple typographic cover. Size M.
- [ ] P3-06 Series and collection metadata (`belongs-to-collection`) and extra contributors. Size S.
- [ ] P3-07 Reusable front and back matter from Plainchant Web's shared parts, if P0-04 kept them. Size M.

## Phase 4: Layout

Goal: a book that looks designed, with every choice written down as plain CSS.

- [ ] P4-01 Style presets written into `book.css`: paragraph indent or spacing, line height, justification, hyphenation, widows and orphans. Size M.
- [ ] P4-02 Chapter openers, scene breaks and ornaments, drop caps, small caps. Size M.
- [ ] P4-03 Embedded fonts: import TTF, OTF, or WOFF2, write `@font-face`, add to the manifest, and remind the author to check the font licence. Size M.
- [ ] P4-04 Footnotes and endnotes with `epub:type` noteref and footnote. Size M.
- [ ] P4-05 Figures, images, tables, poetry, and block quotes that survive reflow. Size M.
- [ ] P4-06 CSS lint for properties that reading systems handle badly or not at all (absolute positioning, fixed pixel type, unsupported selectors). Size M.

## Phase 5: Import, export, and validation

Goal: books go in and out cleanly, and the author knows whether a book is valid.

- [ ] P5-01 Export `.epub` following the container rules: `mimetype` first, stored, no extra field; everything else after it. Done when the sample books pass EPUBCheck, and fail it if the rule is broken. Size M.
- [ ] P5-02 Import `.epub` into a book, refusing unsafe paths and oversized entries. Size M.
- [ ] P5-03 Import Markdown and plain text into chapters (import only, D-002). Size M.
- [ ] P5-04 Book Problems tab: manifest and spine integrity, media types, unique ids, nav present, cover marked, links and anchors, missing alt text, heading order, chapter size. Reuses Plainchant Web's Problems tab. Size L.
- [ ] P5-05 Optional EPUBCheck run in the desktop app when Java and the jar are found, with its messages parsed into the Problems tab (D-005). Size M.
- [ ] P5-06 Round-trip evidence: import a corpus of public-domain EPUBs, export them, and compare EPUBCheck results before and after, then open the exports in Calibre; a legacy Kindle check goes through Calibre's conversion and is reported as such (D-010, Q-004). Size M.
- [ ] P5-07 Send to reader: adapt the opt-in preview server (D-009) to serve the reading view and the exported `.epub` for download over the local network, with the inherited token and off-by-default rules, and a SECURITY note for the download. Size M.

## Phase 6: Accessibility and publishing

Goal: books that meet current accessibility expectations and the stores' requirements.

- [ ] P6-01 Accessibility metadata wizard (EPUB Accessibility 1.1: access modes, features, hazards, summary). Size M.
- [ ] P6-02 Page list, landmarks, an alt-text pass, a reading-order check, and per-element language. Size M.
- [ ] P6-03 A publishing checklist per store (Kobo, Apple Books, Amazon through EPUB upload, Google Play), written from each store's current published requirements on the day it is written. Documentation only, and no compatibility claim for a reader the project cannot test (D-010). Size S.

## Phase 7: Later

Not committed. Decide only after the phases above ship.

- [ ] P7-01 Fixed-layout books (viewport, rendition properties).
- [ ] P7-02 SVG cover and image tooling.
- [ ] P7-03 `.docx` import.
- [ ] P7-04 EPUB 2 `toc.ncx` fallback.
- [ ] P7-05 Associate `.epub` files with the desktop app and open them directly.
