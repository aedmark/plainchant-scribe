# Architecture

**Status: mixed.** The inherited Plainchant Web code is in the repository (`P0-02`), renamed (`P0-03`), and trimmed of its web-only features (`P0-04`: Live JS and the Console, the Insert palette, breakpoints, flex and grid handles, the pseudo-state bar); the rows marked New or Adapted are planned, and each says which roadmap item delivers it. When an item ships, rewrite its row as current fact. The inherited parts are not re-documented here; their structure is described in the lineage digest and Plainchant Web's own architecture document.

## The shape, in one paragraph

A book is a set of files in the Studio's working copy: `mimetype`, `META-INF/container.xml`, a package document (`content.opf`), a nav document (`nav.xhtml`), XHTML chapters, CSS, images, and fonts (D-002, D-004). Every edit, whether made on the Reading Stage, in the code editor, or in a form, is a non-destructive splice into one of those files; the Book panel reads and writes the OPF the same way the Stage writes a chapter. The working copy lives in IndexedDB and is written to disk only on Export (inherited, web D6). Export zips the files into a `.epub` with `mimetype` first and stored (`P5-01`). The browser build and the Tauri v2 desktop build share the same static files (D-001).

## Code map

| Area | Files | Source | Delivers |
| --- | --- | --- | --- |
| XML parsing and splicing | `src/xml-ast.js` | New (done, D-011) | `P1-01` |
| New-book template | `src/book-template.js` | New (done, D-012) | `P1-02` |
| Book model (OPF, manifest, spine) | `src/book.js` | New | `P1-03`, `P1-04` |
| Nav document | `src/nav.js` | New | `P1-05`, `P3-04` |
| XHTML checks and normalising | `src/xhtml.js` | New | `P1-06` |
| Reading Stage and reader controls | `src/app/reader-*.js` | Adapted from Plainchant Web's Stage | `P2-01` to `P2-06` |
| Book panel, spine organiser, cover | `src/app/book-ui.js`, `src/app/spine-ui.js` | New | `P3-01` to `P3-06` |
| Style presets, fonts, footnotes | `src/styles-book.js`, `src/app/layout-ui.js` | New | `P4-01` to `P4-06` |
| Export and import of `.epub` | `src/epub.js`, `src/zip.js` | New, on Plainchant Web's zip code | `P5-01`, `P5-02` |
| Markdown import | `src/markdown-import.js` | New | `P5-03` |
| Problems (book rules, EPUBCheck) | `src/book-checks.js`, `src/app/problems-ui.js` | Adapted | `P5-04`, `P5-05` |
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
Import: .epub -> Epub.read() (path and size checks) -> working-copy files
```

| Interface | Producer | Consumer | Contract |
| --- | --- | --- | --- |
| `XmlAst.parse(text, options)` | `src/xml-ast.js` | Book, nav, XHTML checks, Stage bridge | Nodes carry string offsets into the text and namespace-resolved names; a document that is not well-formed returns every error (code, offset, line, column), a best-effort tree, and `wellFormed: false`, and never throws; the text is never modified (D-011) |
| `XmlAst.setAttr`, `removeAttr`, `setText`, `insert`, `remove`, `applyEdits` | `src/xml-ast.js` | Book model edits (`P1-04`), nav (`P1-05`), Stage | Each returns `{ start, end, text }` splices for one parse; they refuse a document that is not well-formed or a node from another parse, escape what they write, and `insert` refuses markup that would break well-formedness |
| `BookTemplate.create(options)` | `src/book-template.js` | New-book command (after `P1-03`), tests | Returns `{ files, dirs, paths, identifier, modified }`; `files` lists `mimetype` first; the files pass EPUBCheck with no messages (`test/epubcheck.test.js`, D-012) |
| `Book.read(files)` | `src/book.js` | Book panel, Problems, Export | Returns metadata, manifest, spine, cover, and problems from the OPF as it is on disk |
| `Epub.build(files)` | `src/epub.js` | Export | Output opens in EPUBCheck without errors when `Book.check()` reports none |
| `Epub.read(bytes)` | `src/epub.js` | Import | Refuses unsafe paths, absolute paths, duplicate names, and over-limit sizes (see SECURITY) |

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
| Book content on the Reading Stage | XHTML, CSS, images, fonts | Stage iframe sandbox, script stripping | Rendered, never executed |
| Export to disk | Relative paths from the working copy | Inherited path guard | Never writes outside the chosen folder; never deletes (web D24) |

## State and failure modes

- **State:** working copy in IndexedDB (files, assets, tree), settings in `localStorage`, folder links per project (inherited). Every store has a Scribe name (`plainchant_scribe`, `plainchant_scribe_settings`, `plainchant_scribe_emergency`, `plainchant-scribe-library`, `plainchant-scribe-v1`), the service worker touches only `plainchant-scribe-` caches, and the dev server uses port 8081, so nothing is shared with Plainchant Web (D-013). The OPF and nav are files like any other, so undo and versions cover them.
- **A hand-edited OPF that is not well-formed:** the Book panel is disabled with the parser's message and offset; the code editor still works.
- **An imported book with features Scribe does not support (fixed layout, scripts, media overlays):** the files are kept and exported unchanged; the Problems tab says what is not previewed.
- **EPUBCheck missing:** only the built-in rules run, and the Problems tab says so (D-005).
