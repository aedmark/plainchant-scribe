# Plainchant Scribe

An EPUB studio spun off from Plainchant Web (`aedmark/plainchant-web`): make, lay out, check, and export reflowable EPUB 3.3 books from the book's own `.xhtml`, `.css`, and `content.opf` files, which stay the single source of truth. Built for authors and small presses who want visual control over a book without a tool rewriting their files. Static HTML, CSS, and vanilla JavaScript with no frontend build step, running in any modern browser or as a native desktop app via Tauri v2. **Status: early development.** Phases 0 to 6 are done, and of Phase 7 `.docx` import (`P7-03`): a book can be made or imported (from `.epub` or `.docx`), laid out, given front and back matter, given accessibility metadata, page numbers, languages, and roles, checked in the Problems tab, exported as a `.epub`, and sent to a phone or e-reader on the same network from the desktop app, and [docs/STORES.md](docs/STORES.md) has a checklist per store. Phase 7 is not committed; the maintainer chooses what comes next.

This is the canonical instruction file for coding agents. `CLAUDE.md` imports it; do not duplicate these rules in tool-specific files. Project facts belong in the documents linked below, not in an agent's private memory.

## Start here

1. Read [docs/HANDOFF.md](docs/HANDOFF.md) for the current state, active work, and gotchas.
2. Read the relevant item in [ROADMAP.md](ROADMAP.md) and the parts of [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/TESTING.md](docs/TESTING.md) that apply.
3. Inspect `git status` and recent history. Do not overwrite work you did not create.
4. Verify important inherited claims before relying on them. Use the fastest relevant check first.
5. State the intended scope briefly, then work on one independently reviewable change at a time.

If the repository is new or unfamiliar, read [README.md](README.md) and [docs/README.md](docs/README.md) first, then [docs/archive/plainchant-web-lineage.md](docs/archive/plainchant-web-lineage.md) for what this project inherited and what to avoid repeating. If the request conflicts with these instructions or the working tree contains overlapping edits, stop and ask the maintainer.

## While working

- Reference roadmap IDs (`P1-01`, etc.) where one exists. Do not invent an ID for an incidental, self-contained fix.
- Keep changes scoped. Do not mix opportunistic refactors with requested work.
- Preserve user changes. Never reset, clean, or rewrite history without explicit permission.
- Record a decision in [docs/DECISIONS.md](docs/DECISIONS.md) when reasonable maintainers could revisit the choice later.
- Update documentation in the same change when behaviour, interfaces, commands, risks, or project structure change.
- Distinguish observed facts from inference. Include the command, date, environment, or source behind volatile claims. EPUB rules come from the specifications; cite the spec and version when a rule drives code.
- Prefer enforcement to prose: important invariants should have a test. A generated book must pass the project's own validator, and the EPUBCheck oracle where it is available (D-005).
- Treat all external input as untrusted at its boundary, above all imported `.epub` archives (see [docs/SECURITY.md](docs/SECURITY.md)). Never expose secrets in logs, fixtures, prompts, or commits.
- Add newly discovered work to [ROADMAP.md](ROADMAP.md) only when it is genuinely out of scope for the current change.

## Finishing a change

1. Run the checks appropriate to the change, following [docs/TESTING.md](docs/TESTING.md). Record failures and anything not run.
2. Review the diff for unrelated edits, generated files, credentials, stale names (this project began as a copy of Plainchant Web), and documentation drift.
3. Update [docs/HANDOFF.md](docs/HANDOFF.md) if work will continue in another session or if the repository's current state changed.
4. Update the roadmap item, decision record, architecture, security notes, and changelog only when their documented update trigger applies (see [docs/README.md](docs/README.md)).
5. Run `python3 tools/check_docs.py` and report the result.

Do not manufacture ceremony: typo-only or mechanical changes do not need a decision, changelog entry, or handoff rewrite unless they alter a claim those documents make.

## Working agreement

Direct-to-`master` workflow with maintainer review in-session, as in Plainchant Web. Agents may commit and push when requested by the maintainer, but must never add runtime frontend dependencies (the one inherited, maintainer-approved exception is vendored Prism, D-001), delete user project data, or force-push.

- Default branch: `master`.
- Working branch pattern: `feature/<topic>` when branching is requested; otherwise `master`.
- Commit format: concise imperative summary referencing roadmap IDs when applicable.
- Release/version scheme: SemVer in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` (`0.1.0`).

Never force-push, rewrite shared history, publish, or rotate/delete production data without explicit permission.

## Maintainer preferences

Carried over from Plainchant Web; record new durable ones here.

- **Writing:** Concise, direct explanations without fluff. Format file and symbol references as clickable links.
- **Code comments:** Self-documenting vanilla JS; comment only non-obvious invariants, parser edge cases, and the spec rule behind an EPUB check.
- **Asking vs. doing:** Ask before destructive actions or changing core product workflows; otherwise implement and verify end-to-end.
- **Reporting:** State what changed, which files were updated, and exact verification results (test counts, `check_docs.py`, build).

## Protected areas

Things an agent must not change without explicit permission. Every rule includes its reason or decision.

| Path or thing | Rule | Why |
| --- | --- | --- |
| `LICENSE`, `fonts/*.txt`, `src/vendor/*/LICENSE` | Do not edit, except to add a third-party notice the maintainer has approved | Legal and font licensing terms (D-001) |
| `tools/check_docs.py`, `tools/manual.py`, `tools/manual.LICENSE` | Do not edit; replace from `the-manifold` or `3x-documentation-scheme` | They are the shared schemes' own tools (D-007) |
| `test/structure.test.js` invariants | Do not weaken | They enforce the no-build, global-scope, line-limit, and offline-cache rules inherited from Plainchant Web (D-001) |

## Names and terms

| Canonical term | Meaning | Formerly / not to be confused with |
| --- | --- | --- |
| Plainchant Scribe | This EPUB studio (`aedmark/plainchant-scribe`) | Plainchant Web (`aedmark/plainchant-web`, the HTML/CSS/JS studio it was copied from); Plainchant (`aedmark/plainchant`, the Fountain screenwriting app) |
| Book | The project: an OCF container's files held in the Studio, exported as one `.epub` | Plainchant Web's "project" of web pages |
| Package document (OPF) | `content.opf`: metadata, manifest, spine. The book's source of truth for what it contains and in what order | `nav.xhtml` (the reader-facing table of contents) |
| Manifest / Spine | The OPF's list of every file in the book / the reading order of its content documents | The Explorer's alphabetical file tree |
| Nav document | `nav.xhtml`: table of contents, landmarks, and page list | `toc.ncx`, the EPUB 2 fallback (P7-04) |
| Reading Stage | The live reader view of a chapter (`#stageFrame`), reflowable, paged or scrolled, with device presets | Plainchant Web's Stage with Design and Live JS modes |
| Studio Book Environment | The in-app working copy (IndexedDB), isolated from disk until exported | Direct disk sync |

## Repository map

| Path | Purpose |
| --- | --- |
| `README.md` | Purpose, status, and where to start |
| `index.html`, `src/home.css` | Public landing page and its stylesheet (same palette as the studio, a test keeps them equal) |
| `app.html` | Studio application markup and script/style links (no inline script or style) |
| `src/*.js` | Pure UMD modules, no DOM: parsers, project model, checkers, zip, formatter, colour mapper, folder links, and the rest inherited from Plainchant Web |
| `src/app/` | Classic scripts sharing one global scope, loaded in order by `app.html` (`core.js` first, `main.js` last) |
| `src/styles.css` | Studio stylesheet: the manuscript look in a light and a dark palette as CSS variables (D-008) |
| `src/vendor/prism/` | Vendored, unmodified Prism 1.30.0 with its licence, credited in `LICENSE` |
| `src-tauri/` | Tauri v2 Rust desktop shell, folder and file access, asset server, and opt-in preview server |
| `test/` | Node unit and structural test runner (`test/run.js`, `test/*.test.js`) |
| `sw.js`, `manifest.webmanifest`, `package.json` | Offline cache, web app manifest, and scripts |
| `fonts/`, `icons/` | Bundled fonts (EB Garamond, Courier Prime, Inter) with their licences, and app icons (still Plainchant Web's) |
| `LICENSE` | Project licence |
| `.gitignore` | Ignored build output and local files |
| `AGENTS.md` | Canonical agent instructions |
| `CLAUDE.md` | Imports `AGENTS.md` for Claude/agent tooling |
| `ROADMAP.md` | Planned and completed work with stable IDs |
| `docs/README.md` | Documentation map and update triggers |
| `docs/HANDOFF.md` | Current state, next steps, gotchas, and bounded session history |
| `docs/ARCHITECTURE.md` | Planned components, boundaries, invariants, state, and failure modes |
| `docs/DECISIONS.md` | Append-only architectural and product decisions; open questions |
| `docs/TESTING.md` | Test strategy, commands, limitations, and environment recipes |
| `docs/SECURITY.md` | Assets, trust boundaries (imported EPUBs), secret handling, and reporting |
| `docs/STORES.md` | Publishing checklist per store (Kobo, Apple Books, KDP, Google Play), dated and cited |
| `docs/CONTRIBUTING.md` | Human and agent contribution workflow |
| `docs/CHANGELOG.md` | User-visible release notes |
| `docs/plainchant-scribe.manual.json`, `docs/manual.html` | 3x What / How / Why manual source and generated standalone HTML manual |
| `docs/manual.schema.json` | JSON Schema for the 3x manual source |
| `docs/archive/` | Historical material no longer current, including the Plainchant Web lineage digest |
| `tools/check_docs.py` | Documentation consistency checks (from `the-manifold`) |
| `tools/roundtrip.js`, `test/corpus.json` | Round-trip evidence on public-domain books (`npm run roundtrip`, D-042) |
| `tools/manual.py`, `tools/test_manual.py`, `tools/manual.LICENSE` | 3x manual generator (from `3x-documentation-scheme`), unit tests, and upstream licence |

## Engineering conventions

- Vanilla JavaScript (ES2020+), no frontend frameworks, no npm runtime dependencies. The only third-party runtime code is vendored, unmodified Prism, kept from Plainchant Web (D-001).
- Classic `<script>` files in `src/app/*.js` and UMD modules in `src/*.js` so Node tests can `require()` them (D-001). Every file in `src/app/*.js` must be listed in `app.html` in load order, stay at or under 500 lines, and not redeclare a top-level name from another; any asset linked in `app.html` must be in `sw.js` `APP_FILES` (`test/structure.test.js`).
- The book's files are the source of truth: edits are non-destructive splices of exact byte ranges, never a reserialisation of the file (D-002). Markdown is import-only.
- Target EPUB 3.3, reflowable first; fixed layout and the EPUB 2 NCX fallback are deferred (D-004). Scribe produces EPUB only, not `.mobi` or `.azw3` (D-006).
- Imported archives and files are untrusted input (see SECURITY).
- Generated files: `docs/manual.html` is built from the manual JSON and committed; `src-tauri/dist/` and `src-tauri/target/` are build output and stay ignored.

## Environments

| Environment | Can access | Cannot access / caveats |
| --- | --- | --- |
| Local development (Linux) | Node.js, Rust/Cargo (once `src-tauri` exists), Python 3, local filesystem, sibling repos under `~/PycharmProjects` | Headless CI may lack a display server for live GUI inspection |
| Browser | IndexedDB, Service Worker (over HTTP/HTTPS), Chromium File System Access API | No filesystem folder access outside Chromium; cannot run EPUBCheck |
| Tauri v2 Desktop | Native dialogs, folder and `.epub` read/write, optional EPUBCheck if Java is installed | Not verified in a real window from agent sessions |

## Run and verify

- Setup: no npm install is needed for tests; the Rust toolchain is needed only for desktop builds.
- Run in the browser: `python3 -m http.server 8081`, then open `http://localhost:8081/app.html`. Port 8081, not Plainchant Web's 8080: one origin would share one service worker scope and one storage quota between the two apps (D-013). Run the desktop app: `npm run tauri:dev`.
- EPUBCheck (optional, needs Java): unzip a release from `w3c/epubcheck` into the ignored `.tools/` folder and `npm test` runs it as the oracle; without it the suite prints "not run". The same goes for `qrencode` and `zbarimg` (ZBar), the QR code oracles, DAISY Ace, the accessibility oracle (`PUPPETEER_SKIP_DOWNLOAD=1 npm install --prefix .tools/ace @daisy/ace-cli`; it uses the installed Chrome), and LibreOffice (`soffice`), the `.docx` oracle ([docs/TESTING.md](docs/TESTING.md)).
- Round trip (P5-06): download the books in `test/corpus.json` into the ignored `.tools/corpus/`, then `npm run roundtrip`; it uses EPUBCheck and Calibre's `ebook-convert` when they are there.
- Fast checks: `npm test`, `python3 tools/check_docs.py`, and `python3 tools/manual.py check docs/plainchant-scribe.manual.json`.
- Rebuild the manual: `python3 tools/manual.py build docs/plainchant-scribe.manual.json --output docs/manual.html`.
- Full checks: `npm test && python3 tools/check_docs.py && python3 -m unittest tools/test_manual.py && cargo build --manifest-path src-tauri/Cargo.toml`.
- Detailed test guidance: [docs/TESTING.md](docs/TESTING.md).
