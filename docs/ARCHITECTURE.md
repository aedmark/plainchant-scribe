# Architecture

**Status: mixed.** The inherited Plainchant Web code is in the repository (`P0-02`), renamed (`P0-03`), and trimmed of its web-only features (`P0-04`: Live JS and the Console, the Insert palette, breakpoints, flex and grid handles, the pseudo-state bar); the rows marked New or Adapted are planned, and each says which roadmap item delivers it. When an item ships, rewrite its row as current fact. The inherited parts are not re-documented here; their structure is described in the lineage digest and Plainchant Web's own architecture document.

## The shape, in one paragraph

A book is a set of files in the Studio's working copy: `mimetype`, `META-INF/container.xml`, a package document (`content.opf`), a nav document (`nav.xhtml`), XHTML chapters, CSS, images, and fonts (D-002, D-004). Every edit, whether made on the Reading Stage, in the code editor, or in a form, is a non-destructive splice into one of those files; the Book panel reads and writes the OPF the same way the Stage writes a chapter. The working copy lives in IndexedDB and is written to disk only on Export (inherited, web D6). Export zips the files into a `.epub` with `mimetype` first and stored (`P5-01`). The browser build and the Tauri v2 desktop build share the same static files (D-001).

## Code map

| Area | Files | Source | Delivers |
| --- | --- | --- | --- |
| XML parsing and splicing | `src/xml-ast.js` | New (done, D-011) | `P1-01` |
| New-book template | `src/book-template.js` | New (done, D-012) | `P1-02` |
| Book model (OPF, manifest, spine) | `src/book.js`, `src/opf-edit.js` | New (reading done, D-014; edits done, D-015) | `P1-03`, `P1-04` |
| Nav document | `src/nav.js`, `src/book-contents.js` | New (read and edit done, D-016; generated from headings, D-028) | `P1-05`, `P3-04` |
| XHTML checks and normalising | `src/xhtml.js` | New (done, D-017) | `P1-06` |
| Reading Stage and reader controls | `src/book-stage.js`, `src/app/stage-book.js`, `src/app/reader-ui.js`, `src/app/reader-device.js`, `src/app/stage-nav.js` | Chapter display (D-018), reader settings (D-020), paged mode (D-021), device presets (D-022), navigation (D-023), and Stage editing (D-024) done; adapted from Plainchant Web's Stage | `P2-01` to `P2-06` |
| Example book | `src/example-book.js` | New (done, D-018) | `P2-01` |
| Book panel, spine organiser, cover | `src/book-meta.js`, `src/app/book-ui.js`, `src/book-chapters.js`, `src/app/spine-ui.js`, `src/book-cover.js`, `src/app/cover-ui.js` | Book panel (D-025), chapters organiser (D-026), split and merge (D-027), cover (D-029), and series and contributors (D-030) done | `P3-01` to `P3-06` |
| Style presets, fonts, footnotes | `src/book-style.js`, `src/app/style-ui.js`, `src/font-info.js`, `src/book-fonts.js`, `src/app/fonts-ui.js`, `src/book-notes.js`, `src/app/notes-ui.js`, `src/book-blocks.js`, `src/app/blocks-ui.js` | Layout presets (D-031), openers, breaks, small caps (D-032), embedded fonts (D-033), notes (D-034), and figures, tables, poems, and quotes (D-035) done | `P4-01` to `P4-06` |
| Export and import of `.epub` | `src/book-export.js`, `src/epub.js`, `src/zip.js`, `src/app/epub-export-ui.js`, `src/app/import.js` | Export (D-037) and import (D-038) done | `P5-01`, `P5-02` |
| Markdown import | `src/markdown-import.js`, Import text… in `src/app/spine-ui.js` | Done (D-039) | `P5-03` |
| Problems (book rules, EPUBCheck) | `src/book-check.js`, `src/app/problems-ui.js` | Book rules done (D-040); EPUBCheck run planned | `P5-04`, `P5-05` |
| Accessibility metadata | `src/a11y.js`, `src/app/a11y-ui.js` | New | `P6-01`, `P6-02` |
| CSS splicing, colours, find, formatter, undo, library, versions, assets, folder links, menus | as in Plainchant Web | Inherited | `P0-02` |
| Send to reader (preview server) | `src-tauri/src/preview.rs`, `src/app/preview-ui.js` | Inherited, adapted | `P5-07` |
| Manuscript look (colour and type variables, light and dark) | `src/styles.css`, `src/home.css`, `fonts/`, `src/app/settings.js` | Rewritten (done, D-008) | `P0-06` |
| Desktop shell | `src-tauri/` | Inherited, renamed | `P0-02`, `P0-03` |

File names are proposals; the roadmap items own the interfaces.

## Interfaces and data flow

```text
Reading Stage / code editor / Book panel -> XmlAst or CssAst character-range splice -> working-copy files -> render + undo snapshot + IndexedDB auto-save
Export: working-copy files -> Book.check() -> Epub.build() (mimetype first, stored) -> .epub
Import: .epub -> Epub.read() (directory, name, size, DRM checks; capped inflate; CRC) -> new project (text entries + binary assets)
```

| Interface | Producer | Consumer | Contract |
| --- | --- | --- | --- |
| `XmlAst.parse(text, options)` | `src/xml-ast.js` | Book, nav, XHTML checks, Stage bridge | Nodes carry string offsets into the text and namespace-resolved names; a document that is not well-formed returns every error (code, offset, line, column), a best-effort tree, and `wellFormed: false`, and never throws; the text is never modified (D-011) |
| `XmlAst.setAttr`, `removeAttr`, `setText`, `insert`, `remove`, `applyEdits` | `src/xml-ast.js` | Book model edits (`P1-04`), nav (`P1-05`), Stage | Each returns `{ start, end, text }` splices for one parse; they refuse a document that is not well-formed or a node from another parse, escape what they write, and `insert` refuses markup that would break well-formedness |
| `BookTemplate.create(options)` | `src/book-template.js` | New-book command (after `P1-03`), tests | Returns `{ files, dirs, paths, identifier, modified }`; `files` lists `mimetype` first; the files pass EPUBCheck with no messages (`test/epubcheck.test.js`, D-012) |
| `Book.read(files, { assets })` | `src/book.js` | Book panel, Problems, Export, OPF edits (`P1-04`) | Finds the OPF through `container.xml` and returns `{ model, problems }`: metadata (with refinements), manifest, spine, nav, cover, and EPUB 2 leftovers, each entry with its XmlAst node; `model` is null when the container or OPF cannot be read. Problems are package rules only, each `{ severity, code, message, path, start, end, line }` (D-014) |
| `OpfEdit.*(model, ...)` | `src/opf-edit.js` | Book panel, spine organiser, importers | Each op takes a fresh `Book.read` model and returns XmlAst edits for the OPF; nothing outside the edited ranges changes; structural breakage throws an Error with a `.code`, rule gaps are left for `Book.read` to report; only `touchModified` changes `dcterms:modified` (D-015) |
| `Nav.read(files, bookModel)`, `Nav.*(nav, ...)` | `src/nav.js` | Book panel, TOC generator (`P3-04`), Reading Stage navigation (`P2-05`) | `read` returns `{ nav, problems }`: toc, landmarks, page list, and other typed navs as entry trees with XmlAst nodes; problems are §7 rules plus links into the spine, and four EPUBCheck rules stricter than §7. Edit ops take a fresh nav model and return XmlAst edits for the nav file, as `OpfEdit` does (D-016) |
| `Xhtml.check(text, { path })`, `Xhtml.fixEntities(text)`, `Xhtml.normalize(node)`, `Xhtml.fromHtml(html)` | `src/xhtml.js` | Problems, paste on the Stage and in the code editor, importers | `check` returns `{ ast, problems }` (XML, §3.9, document shape, §6.1.3 and §6.1.4); `fixEntities` returns splices for HTML 4 named entities and works on files that are not well-formed; `normalize` walks a DOM-like tree and returns `{ xhtml, images, ids, dropped }`, an XHTML fragment with presentation, scripts, and unsafe URLs removed (D-017) |
| `BookStage.chapterFor(entries, preferred)`, `BookStage.assemble(entries, path, assetUrls)` | `src/book-stage.js` | Reading Stage (`src/app/stage-book.js`) | `assemble` returns `{ ok, xhtml }`, a copy of the chapter with the book's CSS inlined, assets at Blob URLs, and scripts, event handlers, and `javascript:` URLs removed, or `{ ok: false, errors }` when it is not well-formed; `options.css` (from `readerCss(prefs)`) goes last in `<head>` and `options.script` (the Design bridge) last in `<body>`, in CDATA; the book's files are not changed (D-018, D-020) |
| `BookStage.neighbour`, `linkTarget`, `contents` | `src/book-stage.js` | Stage navigation (`src/app/stage-nav.js`) | The previous or next linear spine chapter (null at the ends); what a link leads to (`fragment`, `chapter`, `file`, `missing`, `external`, `invalid`); the toc as a plain tree (D-023) |
| `BookMeta.fields(model)`, `BookMeta.set*`, `addPerson`, `movePerson`, `removePerson`, `setSeries`, `check` | `src/book-meta.js` | Book panel (`src/app/book-ui.js`) | `fields` gives the panel's values; each change is a list of ops, `(model) => edits`, applied to fresh reads of the OPF and committed as one undo step; `check(name, value)` returns an error or ''; creators and contributors share the person ops; the series keeps Calibre's tags in step (D-025, D-030) |
| `BookChapters.list`, `add`, `rename`, `remove`, `move`, `split`, `merge`, `incomingLinks` | `src/book-chapters.js` | Chapters tab (`src/app/spine-ui.js`) | Each operation takes the text files and returns `{ entries, path, removed }`: the chapter, `content.opf`, and `nav.xhtml` changed together by splices, or an Error with a `.code`; `split` and `merge` also rewrite links across the book's XHTML files (D-026, D-027) |
| `BookContents.plan(entries, depth)`, `apply(entries, plan)` | `src/book-contents.js` | Generate contents (`src/app/contents-ui.js`) | `plan` reads the linear chapters and returns `{ tree, ids, landmarks, skipped }` without changing anything; `apply` adds the ids, replaces the toc list, and refreshes the landmarks (D-028) |
| `BookCover.set`, `remove`, `current`, `layout` | `src/book-cover.js` | Book tab's Cover section (`src/app/cover-ui.js`) | `set` marks an image `cover-image` and keeps a cover page first in the spine with a landmark; `remove` undoes it and keeps the image; `layout(title, author, palette, measure)` gives canvas steps for a generated cover (D-029) |
| `BookStyle.apply(css, settings, language)`, `read(css)`, `stylesheet(entries)` | `src/book-style.js` | Layout tab (`src/app/style-ui.js`) | `apply` writes, replaces, or removes the marked layout block at the end of a stylesheet and nothing else; `read` takes the settings back from it; `stylesheet` finds the book's main stylesheet; `sceneBreakAfter` inserts an `<hr/>` after a block (D-031, D-032) |
| `FontInfo.read(bytes, fileName)`, `BookFonts.add`, `remove`, `list` | `src/font-info.js`, `src/book-fonts.js` | Layout tab's Fonts section (`src/app/fonts-ui.js`) | `read` gives a font's family, weight, italic, and embedding flag (TTF and OTF from their tables, WOFF and WOFF2 guessed), never trusting the file's offsets; `add` and `remove` change the manifest item and the `@font-face` rule together (D-033) |
| `BookNotes.add(entries, path, start, text, mode)`, `remove`, `renumber`, `notesDoc` | `src/book-notes.js` | Layout tab's Notes section (`src/app/notes-ui.js`) | `add` puts a noteref at the end of the block at `start` and its footnote or endnote, making the Notes chapter (manifest, spine, toc) for the first endnote; every change renumbers in reading order, ids, hrefs, and back links together (D-034) |
| `BookExport.plan(entries, assets)`, `pack(entries, binaries, options)`, `fileName(title)` | `src/book-export.js` (with `src/zip.js`) | Export dialog's .epub section (`src/app/epub-export-ui.js`); desktop saves through the Rust `save_book_file` command | `pack` writes `mimetype` first, stored and exact, then META-INF, the OPF, and the manifest's files, deflating text that shrinks; returns the bytes with the files left out and missing (D-037) |
| `BookCheck.check(entries, { assets, heads })`, `createChecker()`, `sniff(head)`, `scan(path, text)` | `src/book-check.js` (with `Book`, `Nav`, `Xhtml`, `Links`) | Problems tab for books, Export's errors check (`bookProblems` in `src/app/problems-ui.js`) | `{ problems }` with file, offsets, a line counted from 1, code, severity, and category (package, links, accessibility, markup); errors are rules EPUBCheck 5.4.0 enforces, warnings advice; chapter scans are cached by text (D-040) |
| `CssLint.checkCss(text)`, `checkInline(xhtml)`, `createChecker()` | `src/css-lint.js` | Problems panel's Stylesheets category, books only (`src/app/problems-ui.js`) | Problems with offsets into the file: `direction` and `unicode-bidi` as errors (EPUB 3.3 §6.3.1.2), layout breakers, setting overrides, and poorly supported features as warnings; report only (D-036) |
| `BookBlocks.insert(entries, path, start, kind, opts, assets)`, `figure`, `table`, `poem`, `quote` | `src/book-blocks.js` | Layout tab's blocks section and the Assets panel's Insert in a book (`src/app/blocks-ui.js`) | `insert` splices a figure, table, poem, or quote after the block at `start` (or into a selected section or body), adding a figure's image to the manifest; the builders escape all text (D-035) |
| `ExampleBook.create(options)` | `src/example-book.js` | Load Example Book, first run | The three-chapter guide, made with `BookTemplate`, `OpfEdit`, and `Nav`; passes `Book`, `Nav`, `Xhtml`, and EPUBCheck with no problems |
| `Epub.build(files)` | `src/epub.js` | Export | Output opens in EPUBCheck without errors when `Book.check()` reports none |
| `MarkdownImport.importInto(entries, files, after, options)`, `toXhtml`, `smart` | `src/markdown-import.js` | Chapters tab's Import text… (`src/app/spine-ui.js`) | Adds chapters through `BookChapters.add`, fills them with XHTML from the Markdown core (raw HTML escaped), attaches footnotes with `BookNotes.insertAt` and numbers them once, and lists matched images with `BookBlocks.listImage` (D-039) |
| `Epub.read(bytes, { limits })` (async) | `src/epub.js` | Open file… and drag-and-drop (`src/app/import.js`) | Returns `{ entries, binaries, skipped, warnings, title, problems }`, or throws an error with a `code` and the entry's name: unsafe or duplicate names, limits, damage, ZIP encryption, DRM, not a book (D-038, SECURITY) |

## Invariants (target)

- **The author's files are never reserialised.** A change touches only the characters it must (D-002, D-011). Enforced by the round-trip and splice tests in `test/xml-ast.test.js` (`P1-01`).
- **The Reading Stage never changes a file by displaying it**, and reader controls (font size, theme) are overrides, not edits (`P2-02`).
- **Every file in the manifest exists, and every content file is in the manifest.** Enforced by `Book.check()` (`P5-04`) and by Export refusing a book with errors unless the author overrides.
- **Scripts in imported content are kept but never executed in the Studio.** Enforced in the Stage assembler (`P2-01`).
- **No network access at runtime**, except the opt-in send-to-reader server (D-009, `P5-07`).

Inherited structural invariants (global scope, line limits, offline cache list) come with the port and are enforced by `test/structure.test.js` (D-001).

## Boundaries

| Boundary | Comes in as | Checked by | Rule |
| --- | --- | --- | --- |
| Imported `.epub` | A zip archive from the user | `Epub.read()` | Untrusted: path, size, and count limits before anything is written to the working copy |
| Book content on the Reading Stage | XHTML, CSS, images, fonts | `BookStage.assemble` removes scripts, event handlers, and `javascript:` URLs, then adds the Studio's own bridge as the only script (D-024); the iframe sandbox (`allow-scripts allow-same-origin`) does not isolate on its own | Rendered, never executed |
| Export to disk | Relative paths from the working copy | Inherited path guard | Never writes outside the chosen folder; never deletes (web D24) |

## State and failure modes

- **State:** working copy in IndexedDB (files, assets, tree), settings in `localStorage`, folder links per project (inherited). Every store has a Scribe name (`plainchant_scribe`, `plainchant_scribe_settings`, `plainchant_scribe_emergency`, `plainchant-scribe-library`, `plainchant-scribe-v1`), the service worker touches only `plainchant-scribe-` caches and is network first, so an update shows on the next load and the cache serves only offline (D-019), and the dev server uses port 8081, so nothing is shared with Plainchant Web (D-013). The OPF and nav are files like any other, so undo and versions cover them.
- **A hand-edited OPF that is not well-formed:** the Book panel is disabled with the parser's message and offset; the code editor still works.
- **An imported book with features Scribe does not support (fixed layout, scripts, media overlays):** the files are kept and exported unchanged; the Problems tab says what is not previewed.
- **EPUBCheck missing:** only the built-in rules run, and the Problems tab says so (D-005).
