# Decisions

Short, append-only record of choices that a future session might otherwise re-litigate. One entry per decision.
Newest at the bottom. To reverse a decision, add a new entry that supersedes it; the old one keeps its text and only
its status changes ("superseded by D-MMM"). An "Update, same session" note at the end of an entry is fine while it is
still on the working branch.

Record pre-existing choices too, the first time a session has to understand them ("status: accepted, recorded
YYYY-MM-DD"): the reason something is the way it is gets lost faster than the code.

Format:

```
## D-NNN Title  (YYYY-MM-DD, status: proposed | accepted | rejected | superseded by D-MMM)
**Context:** why this came up (the roadmap item, the bug, the measurement).
**Decision:** what we chose (numbered points if there are several).
**Alternatives:** what else was considered, and why not (one line each). Optional, but it is what stops the
re-litigation.
**Consequences:** what it costs or constrains; what was left out and why.
**Review trigger:** an event that should cause reconsideration. Optional.
```

Plainchant Web's own decisions are not repeated here. The ones that still shape this project are summarised in [archive/plainchant-web-lineage.md](archive/plainchant-web-lineage.md); the full text is in that repository's decision log.

---

## D-001 Zero-build vanilla JS frontend, with vendored Prism as the one dependency  (2026-11-03, status: accepted, inherited)
**Context:** Scribe is copied from Plainchant Web, which chose a zero-build, zero-runtime-dependency frontend so that the app runs from static files in any browser, offline, and under `file://`, and so that pure logic can be tested in plain Node.
**Decision:** 1. Pure logic lives in UMD modules under `src/*.js` and is tested in Node without a DOM. 2. The app is classic `<script>` files in `src/app/*.js` sharing one global scope, loaded in order from `app.html`, each at most 500 lines, with no duplicate top-level names. 3. No framework and no npm runtime dependency. 4. The single exception is Prism 1.30.0, vendored unmodified under `src/vendor/prism/` with its licence and credited in `LICENSE`, used only to tokenize code for syntax colours. Scribe needs it for XHTML, CSS, and XML colours.
**Alternatives:** A bundler and framework (rejected: build step, size, and no offline `file://` use); CodeMirror or Monaco (rejected: megabytes of JavaScript).
**Consequences:** Every new capability, including the XML parser and the zip code, is hand-written and tested. The limits and the vendored file are documented in the lineage digest.
**Review trigger:** A need that cannot be met without a second third-party library.

## D-002 The book's files are the source of truth; edits are splices; Markdown is import only  (2026-11-03, status: accepted)
**Context:** Plainchant Web's defining idea is that a visual edit changes only the exact byte range it touches, so files never get reformatted behind the author's back. The maintainer confirmed (2026-11-03) that a Markdown-first writing app is a different product.
**Decision:** 1. A book's `.xhtml`, `.css`, and `content.opf` files are authoritative; the Studio never keeps a second model that it writes back. 2. Visual and form-based edits (metadata, spine, contents) are splices into those files, using a non-destructive XML parser with byte ranges (`P1-01`). 3. Markdown and plain text can be imported into chapters (`P5-03`) but are never the stored form of a book.
**Alternatives:** A Markdown source compiled to EPUB (rejected by the maintainer: a different product); a JSON book model serialised on export (rejected: it would reformat the author's files and lose hand edits).
**Consequences:** The XML splicer is the foundation of the project and ships first. Form edits must tolerate hand-edited OPF files, so every operation locates its target in the existing text.
**Review trigger:** A feature that cannot be expressed as a splice.

## D-003 A fresh repository, copied from Plainchant Web master, without its git history  (2026-11-03, status: accepted)
**Context:** Plainchant Scribe is a spinoff, as Plainchant Web was spun off from Plainchant. The maintainer asked for a fresh repository in `plainchant-scribe` carrying enough history to inform development without flooding the context.
**Decision:** 1. The code comes from `aedmark/plainchant-web` master at commit `4c30d7b934c771104bf3252e49807e95a5d95bdd` (2026-11-03, 37 commits, 103 passing tests, 34 recorded decisions), copied at `P0-02` without git history. 2. The history that matters is summarised in [archive/plainchant-web-lineage.md](archive/plainchant-web-lineage.md): what was built in which order, which decisions still apply, and the gotchas that cost time. 3. The upstream repository remains the place for full history.
**Alternatives:** Forking with full history (rejected: a long log mostly about features Scribe removes); a monorepo (rejected: different product, release cycle, and storage names).
**Consequences:** `git blame` stops at the copy; the lineage digest and the commit hash are the trail. Fixes to code Scribe inherited are not automatically shared in either direction.

## D-004 EPUB 3.3, reflowable first; fixed layout and the EPUB 2 fallback later  (2026-11-03, status: accepted)
**Context:** The maintainer agreed (2026-11-03) to target the current W3C EPUB 3.3 recommendation, reflowable books first.
**Decision:** 1. Books are EPUB 3.3 reflowable with XHTML content documents, a nav document, and a package document. 2. Fixed layout (`P7-01`) and the `toc.ncx` fallback (`P7-04`) are deferred. 3. Scripted and interactive content is out of scope; scripts in imported books are preserved but never run in the Reading Stage.
**Alternatives:** Fixed layout first (rejected: far fewer authors need it, and its preview needs a different Stage); EPUB 2 (rejected: superseded).
**Consequences:** The rules the code checks come from the EPUB 3.3 and EPUB Accessibility 1.1 specifications; each check cites the spec section in a comment. Reading systems still differ, so real-reader checks stay manual (see TESTING).

## D-005 Validation: built-in rules first, optional EPUBCheck  (2026-11-03, status: accepted)
**Context:** EPUBCheck is the reference validator but needs Java, so it cannot run in a browser and cannot be required. The maintainer agreed (2026-11-03).
**Decision:** 1. Scribe ships its own rule set for the common failures (`P5-04`) and shows results in the Problems tab, in the browser and the desktop app. 2. In the desktop app, when Java and an EPUBCheck jar are found, Scribe can run it and merge its messages into the same list (`P5-05`). 3. EPUBCheck is the oracle for Scribe's own tests where it is available; where it is not, that is stated in the test report instead of skipped silently.
**Alternatives:** Bundle EPUBCheck (rejected: size and a Java runtime); trust only the built-in rules (rejected: they would be graded by their author).
**Consequences:** "Passes Scribe's checks" and "passes EPUBCheck" are different claims and are reported separately.

## D-006 EPUB only: no `.mobi` or `.azw3`  (2026-11-03, status: accepted)
**Context:** Amazon accepts EPUB uploads; the older Kindle formats need separate tools.
**Decision:** Scribe exports `.epub` and does not convert to Kindle formats. The store checklist (`P6-03`) says how to upload an EPUB to Amazon.
**Consequences:** No Kindle-specific preview. Kindle behaviour is documented as a limit, not emulated.

## D-007 The Manifold and 3x documentation schemes, adopted fresh  (2026-11-03, status: accepted)
**Context:** Plainchant Web adopted both schemes and found that agent sessions stay coherent only when current state, decisions, tests, and the roadmap each have one owner. The maintainer asked for Scribe's own versions of both.
**Decision:** 1. `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, and `docs/*` follow `the-manifold`; `tools/check_docs.py` is that repository's checker, unmodified. 2. The 3x manual is `docs/plainchant-scribe.manual.json`, built to `docs/manual.html` with `3x-documentation-scheme`'s `manual.py`, unmodified, and validated by `docs/manual.schema.json`. 3. Plainchant Web's history is not copied into the live documents (D-003).
**Consequences:** Updating either tool means replacing the file from its source repository. The manual must describe only what exists; planned features appear in the roadmap, not as manual entries, until they ship.

## D-008 A manuscript look with light and dark modes  (2026-11-03, status: accepted)
**Context:** Q-001 asked whether Scribe keeps Plainchant Web's dark studio chrome and the sister sites' paper-on-an-EGA-desk style, or gets its own look. The maintainer chose a manuscript look with a light and a dark mode (2026-11-03).
**Decision:** 1. Scribe has its own visual identity, about written pages rather than code: warm paper, ink, and serif type for the page surfaces, with restrained accents. 2. Every surface has a light and a dark variant, switchable by the user and defaulting to the system setting; the Reading Stage's own reader themes (light, sepia, dark) are separate and never change the studio chrome (`P2-02`). 3. Colours and fonts are CSS custom properties defined once, so the Stage themes, the home page, and the manual share them. 4. The inherited dark studio theme and the EGA home page are replaced, not kept as options, so there is one look to test (`P0-06`). 5. Any fonts used must be open-licensed files shipped with the app and listed in `fonts/`, as in Plainchant Web.
**Alternatives:** Keep the Plainchant Web chrome (rejected by the maintainer); offer several themes (rejected: more surface to test and nothing in the product needs it).
**Consequences:** Every inherited colour and the syntax-colour palette need a light variant with checked contrast. The Reading Stage must read as a page on a desk in both modes without looking like the book's own theme. Update 2026-11-03 (`P0-06`): implemented as EB Garamond for headings and the home page, Courier Prime for code, Inter for dense controls; `:root` is the light palette, with the dark palette written twice in CSS (once for the system setting, once for the manual choice), which a test keeps identical.

## D-009 Keep the network preview as "send to reader"  (2026-11-03, status: accepted)
**Context:** Q-002 asked whether to keep Plainchant Web's opt-in network preview. The maintainer chose to keep it as "send to reader" (2026-11-03).
**Decision:** 1. The inherited preview server (opt-in, token-gated, read-only, desktop only) stays and is renamed and adapted: it serves the book's reading view and the exported `.epub` for download, so a phone, tablet, or e-reader browser on the same network can open or fetch the book (`P5-07`). 2. Its inherited security rules apply unchanged: off until started, unguessable path token, no directory listing, stops on request or on quit. 3. Serving the `.epub` is an addition to the inherited behaviour and is recorded as such in SECURITY when built.
**Alternatives:** Drop it and rely on Export (rejected by the maintainer); a QR code (still deferred: a generator is a library-sized job under D-001).
**Consequences:** Plain HTTP on the local network, as in Plainchant Web: anyone with the link can read the book while sharing is on. It cannot help a device whose browser cannot download files.

## D-010 Test devices: Calibre, and a legacy Kindle through Calibre's conversion  (2026-11-03, status: accepted)
**Context:** Q-003 asked which reading systems the maintainer can test on. The answer (2026-11-03): Calibre and a legacy Kindle.
**Decision:** 1. Calibre (viewer and `ebook-convert`) is the first real-reader check for every release. 2. The Kindle is tested by sending a converted book, which means the result reflects Calibre's conversion and the Kindle's renderer, not Scribe's EPUB read directly. Reports must say so. 3. Scribe still does not produce Kindle formats (D-006); the test route does not change that. 4. EPUBCheck remains the validity oracle (D-005); Calibre is a rendering check, not a validator. 5. The maintainer's exact Kindle model and how books reach it are needed before Kindle results are trusted (Q-004).
**Alternatives:** Test only against EPUBCheck (rejected: validity is not rendering); buy more devices (not our call).
**Consequences:** No check on iOS, Android, Kobo, or Thorium is available to the project yet; the store checklist (`P6-03`) stays documentation and makes no compatibility claim for those. Fixes found only on the Kindle path are recorded with their conversion step.

## D-011 How XmlAst parses: character offsets, recovery, no DTD processing, limits  (2026-11-03, status: accepted)
**Context:** `P1-01` needed choices the plan left open. The maintainer chose each of them on 2026-11-03, after the agent re-read XML 1.0 (Fifth Edition), Namespaces in XML 1.0 (Third Edition), and EPUB 3.3 §3.9 and §6.1.2 on w3.org.
**Decision:** 1. Offsets are JavaScript string indices into the file's decoded text, as in `HtmlAst` and `CssAst` and the code editor; the plan's "byte ranges" (D-002, `P1-01`) means these character ranges. 2. `parse()` never throws: it reports every error it finds (up to 100) with a code, offset, line, and column, keeps going, and returns a best-effort tree marked `wellFormed: false`. The edit operations refuse a document that is not well-formed. 3. Namespaces are resolved: elements and attributes carry prefix, local name, and namespace URI, and the Namespaces in XML constraints are errors. Callers match by URI, not prefix. 4. The DOCTYPE is kept as a node and never processed. EPUB 3.3 §3.9 allows internal entity declarations, so the internal subset is scanned only for the names of internal general entities: references to them are not errors, and they are never expanded (a value keeps `&name;` as written). External entities and parameter entities are errors and are never loaded; ATTLIST defaults are ignored. 5. Limits: nesting depth 256, 16 Mi characters, 1024 attributes per element; going over one stops parsing with an error. 6. The splicer is generic (`applyEdits`, `setAttr`, `removeAttr`, `setText`, `insert`, `remove`); OPF-specific edits build on it in `P1-04`. `insert` re-parses the result and refuses markup that would make the file not well-formed. 7. Test samples are hand-written fixtures in `test/fixtures/xml/`.
**Alternatives:** UTF-8 byte offsets (rejected: an encode and decode on every splice, and the editor works in characters); stop at the first error (rejected: the code editor and Problems want every error); reject every DOCTYPE (rejected: `<!DOCTYPE html>` is normal in EPUB XHTML); expand internal entities (rejected: an attack surface, such as "billion laughs", for a rare feature); OPF-specific edits in the parser (rejected: they belong to the book model).
**Consequences:** A book that uses internally declared entities reads with `&name;` left in text and attribute values; `P1-06` decides whether to offer replacing them. ATTLIST defaults, such as a defaulted `xmlns`, are not seen. EPUB-level rules on the DOCTYPE (which external identifiers are allowed, EPUB 3.3 Appendix B) and on the encoding declaration are left to `P1-06` and `P5-04`; the parser exposes `doctype` and `xmlDecl` for them. `xml-ast.js` is not loaded by `app.html` until a feature uses it (`P1-03`).
**Review trigger:** A real book that needs entity expansion or ATTLIST defaults; a file over the limits that is not hostile.

## D-012 The new-book template, and EPUBCheck as a local test oracle  (2026-11-03, status: accepted)
**Context:** `P1-02` needed a layout, defaults, and a way to meet its acceptance test ("passes EPUBCheck") before Export exists (`P5-01`). The maintainer chose each point below on 2026-11-03, after the agent re-read EPUB 3.3 §4.2 to §4.3, §5.4 to §5.7, and §7.2 to §7.4.
**Decision:** 1. `src/book-template.js` is a pure module: `BookTemplate.create({ title, language, creator })` returns the files keyed by container path, with `mimetype` first, plus the empty folders to show. It is not wired into the app until the book model and Reading Stage can open a book (`P1-03`, `P2-01`). 2. Layout: `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/nav.xhtml`, `OEBPS/text/chapter-1.xhtml`, `OEBPS/css/book.css`, and empty `OEBPS/images/` and `OEBPS/fonts/`. 3. Defaults: title "Untitled Book" and language `en` when not given; the language goes in `dc:language` and in `xml:lang` and `lang` on every XHTML file; `dc:creator` is written only when a creator is given. The identifier is `urn:uuid:` and a random version 4 UUID from `crypto` (never `Math.random`). `dcterms:modified` is the creation time in UTC. 4. Content: a `chapter` section with a heading and one paragraph; a few neutral CSS rules with no fonts or colours. The nav has the required toc and a landmarks list pointing at the start of the text. 5. No accessibility metadata yet: claims such as "no hazards" are about content the author has not written, so `P6-01` writes them. 6. EPUBCheck is downloaded by hand into the git-ignored `.tools/` folder (5.4.0 from `w3c/epubcheck` releases, checked against the release's SHA-256). `test/epubcheck.test.js` zips the template and runs it when Java and the jar are found, checks that a deliberately broken book fails, and otherwise prints "not run" and registers no test (D-005).
**Alternatives:** A "New Book" button now (rejected: the Stage and project model still assume a web page); a flat `OEBPS/` or an `EPUB/` root (rejected: subfolders are the common layout and match the fixtures); a placeholder author (rejected: it can reach a published book); EPUBCheck only at `P5-01` (rejected: `P1-02` could not be closed).
**Consequences:** `npm test` takes about 6 seconds with EPUBCheck instead of 1. Empty folders cannot go in a zip, so they exist only in the Studio's tree until something is put in them. EPUBCheck 5.4.0 validates "using EPUB version 3.4 rules"; a landmark linking to the nav itself, which is not in the spine, is an error there (RSC-011), so the template has none. The nav's own words ("Contents", "Start of content") are English whatever the book's language.
**Review trigger:** A new EPUBCheck release that reports anything on the template; a request for localised nav labels.

## Open questions

Questions requiring maintainer or stakeholder input. This is their one home: HANDOFF and the roadmap refer to them by ID. Numbers are
permanent; an answered question stays, with the answer and its date.

```
- **Q-NNN** The question. (asked YYYY-MM-DD, by whom; blocks P1-NN; recommendation: ...)
- **Q-NNN** ~~The question.~~ Answered YYYY-MM-DD: the answer, D-NNN.
```

- **Q-001** ~~What should Scribe look like: keep Plainchant Web's dark studio chrome and the sister sites' paper-on-an-EGA-desk home page, or give the book tool its own manuscript look?~~ Answered 2026-11-03: its own manuscript look with a light and a dark mode, D-008.
- **Q-002** ~~Keep the desktop network preview as "send to my reader"?~~ Answered 2026-11-03: keep it, D-009.
- **Q-003** ~~Which reading systems and devices does the maintainer own or want tested?~~ Answered 2026-11-03: Calibre and a legacy Kindle, D-010.
- **Q-004** Which Kindle model and firmware is it, and how do books reach it (USB with a Calibre-converted file, Send to Kindle, email)? (asked 2026-11-03, by the agent; deferred by the maintainer on 2026-11-03 as not important yet; it blocks nothing until a Kindle result is wanted in P5-06; recommendation: note the model and firmware version from the device's About screen, and say which route you use.)
