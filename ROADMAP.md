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
- [ ] P0-03 Rename everything: product name, bundle id `io.plainchant.scribe`, IndexedDB and localStorage names, service worker cache name, manifest, titles, window title, and the in-app copy. Done when no test or search finds "Plainchant Web" outside the lineage digest and the licence. Size M.
- [ ] P0-04 Remove what Scribe will not use: Live JS mode and the Console, the Insert palette of web components, breakpoints, flex and grid handles, and the pseudo-state bar. Keep the shared page parts (candidate for P3-07) and the network preview (D-009, adapted in P5-07). Done when tests are green and `check_docs.py` agrees with the new structure. Size M.
- [ ] P0-05 Replace the home page, Help guide, and shortcut sheet with Scribe copy (placeholder text is acceptable until P2), in the manuscript look (D-008). Size S.
- [ ] P0-06 The manuscript look (D-008): one set of CSS custom properties for colour and type, a light and a dark mode that follows the system setting with a manual switch, open-licensed fonts in `fonts/`, and a light palette for the syntax colours. Done when every studio surface is checked in both modes and the structure tests find no hard-coded colours outside the variables. Size M.

## Phase 1: The book format

Goal: Scribe can create a valid, empty book and read and edit its package document without rewriting it.

- [ ] P1-01 `src/xml-ast.js`: a non-destructive, well-formed XML parser with byte ranges and a splicer, no DOCTYPE or external entities. Done when round-trip and splice tests pass on OPF, nav, and XHTML samples. Size L.
- [ ] P1-02 New-book template: `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `nav.xhtml`, one chapter, `book.css`, folders for images and fonts, with a generated UUID identifier and `dcterms:modified`. Done when the template passes EPUBCheck (P5-01). Size M.
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
