# Plainchant Web lineage

A digest of the history Scribe inherits, so a session can start from what was learned without reading 37 commits and 34 decisions. It is history, not current truth: for the live rules read [../../AGENTS.md](../../AGENTS.md) and [../DECISIONS.md](../DECISIONS.md). The full record is in `aedmark/plainchant-web`.

Plainchant Web decisions are written here as "web D3" (not with the project's own numbering format) so this file does not claim Scribe's decision IDs; roadmap items as "web P7/14".

## Provenance

- Source: `aedmark/plainchant-web`, branch `master`, commit `4c30d7b934c771104bf3252e49807e95a5d95bdd` (2026-11-03). 103 passing Node tests, 7 Rust tests, about 10,300 lines of JavaScript in 23 pure modules and 40 app scripts.
- Plainchant Web was itself spun off from `aedmark/plainchant` (the Fountain screenwriting app). The two sites' paper-on-an-EGA-desk home page style comes from that line.

## What was built, in order

| Phase | Result |
| --- | --- |
| Foundations | HTML and CSS parsers that keep byte ranges, the syntax-colour overlay, multi-file projects in IndexedDB, undo across files |
| Stage | Click, inline text edit, drag reorder, the Inspector and CSS Designer, responsive previews |
| Desktop | Tauri shell, folder open and export, a localhost asset server, the Explorer |
| Quality | Documentation schemes (Manifold, 3x), structural tests, offline cache |
| Console and links | Live JS console, link following across pages |
| Ergonomics | Line numbers, find and replace, file operations, project-wide search, pseudo-states, drag-to-insert |
| Backlog (all done) | Layout handles, binary assets, shared parts, link checker, accessibility hints, zip export, folders and moves, breakpoints, network preview, formatter, shortcut sheet, File and Edit menus, folder links ("one folder, one project"), Prism syntax colours |

## Decisions that still shape Scribe

| Web decision | Summary | Scribe status |
| --- | --- | --- |
| web D1 | Zero-build vanilla JS; UMD modules in `src/`, classic scripts in `src/app/`, 500-line limit | Kept (D-001) |
| web D2 | Transparent textarea over a coloured layer, no heavy editor library | Kept; see the shade gotcha below |
| web D3 | Non-destructive byte-offset splicing for edits | Kept and extended to XML (D-002) |
| web D4, D13 | Multi-file project stored in IndexedDB; binary assets as Blobs in their own store | Kept; images and fonts need this |
| web D5, D6 | Tauri v2 with a staged `dist`; opened folders become isolated Studio projects, never written until Export; a loopback asset server | Kept |
| web D8, D20 | Pointer events instead of HTML5 drag and drop (WebKitGTK is unreliable) | Kept |
| web D10 | One undo stack across all files, assets, and tree changes | Kept |
| web D15 | Gutter measured from a hidden mirror; find highlights on a separate layer | Kept |
| web D17, D27 | Explorer operations rewrite links; folders and moves; "dirty" means changed since last explicit save | Kept; spine and manifest edits follow the same retargeting idea |
| web D18, D28 | Static link checker, accessibility and markup hints, one Problems tab | Kept and retargeted at books (P5-04) |
| web D22 | Hand-written stored zip writer and reader | Kept; EPUB needs `mimetype` first and stored (P5-01) |
| web D24 | Export never deletes or moves a file on disk | Kept |
| web D29 | Opt-in, token-gated LAN preview server | Candidate (Q-002) |
| web D30 | Conservative formatter: only whitespace changes, JavaScript re-indent only | Kept for XHTML and CSS; JavaScript is dropped |
| web D32, D33 | File and Edit menus; saved folder links, one folder = one project | Kept |
| web D34 | Prism vendored for colours, the single dependency exception | Kept (D-001) |
| web D11, D12, D25, D26 | Live JS console, link bridge, gap handles, breakpoints | Dropped with the web-only features (P0-04) |

## Gotchas that cost time

- **Service worker is cache-first.** After changing any file, an installed browser build serves old scripts. In testing, unregister the worker and re-fetch changed files with `cache: 'reload'`. The cache name has never been bumped, which is still an open weakness.
- **The coloured overlay can drift.** The incremental painter once kept old lines when the language changed, drawing the previous file's text under the new one. The fix is to clear the layer on a language change and whenever its line count disagrees with its keys; keep that guard.
- **Prism is regex-based.** It can take seconds on adversarial input (a long run of unclosed tags) and about a second on a 250 KB single-line file, so files over 150,000 characters are not coloured.
- **`window.prompt` and `confirm` work in the Tauri window**, but they are blocking and not themeable; an in-app dialog is the better long-term answer.
- **Browser-pane testing quirks.** No `requestAnimationFrame` in some panes, synthetic pointer events need `pointerId: 1`, there is no real file chooser, and `pkill` can kill the agent's shell.
- **Every file in `src/app/` must stay at or under 500 lines.** New behaviour usually means a new file; the structure test enforces this and the service worker list.
- **Real desktop behaviour was never driven by agent sessions.** The maintainer tested the desktop paths by hand. Treat anything desktop-specific as unverified until the maintainer has run it.
- **HTML is forgiving, EPUB is not.** Plainchant Web's HTML parser repairs bad markup silently; XHTML and OPF must be well-formed XML, so Scribe cannot reuse that parser for them (D-002, `P1-01`).

## Where to look upstream

| Need | Upstream file |
| --- | --- |
| The splicing approach | `src/html-ast.js`, `src/css-ast.js` |
| Project model, tree, rename and move rules | `src/project.js` |
| Zip writer and reader | `src/zip.js` |
| Problems checkers | `src/links.js`, `src/hints.js`, `src/app/problems-ui.js` |
| Asset handling | `src/imagelib.js`, `src/app/assets.js`, `src/app/asset-ui.js` |
| Folder links and export | `src/projectlink.js`, `src/app/project-links.js`, `src/app/tauri-files.js`, `src-tauri/src/main.rs` |
| Colours | `src/code-shade.js`, `src/vendor/prism/` |
| Structural tests | `test/structure.test.js` |
