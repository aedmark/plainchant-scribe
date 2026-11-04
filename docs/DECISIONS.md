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

## Open questions

Questions requiring maintainer or stakeholder input. This is their one home: HANDOFF and the roadmap refer to them by ID. Numbers are
permanent; an answered question stays, with the answer and its date.

```
- **Q-NNN** The question. (asked YYYY-MM-DD, by whom; blocks P1-NN; recommendation: ...)
- **Q-NNN** ~~The question.~~ Answered YYYY-MM-DD: the answer, D-NNN.
```

- **Q-001** What should Scribe look like: keep Plainchant Web's dark studio chrome and the sister sites' paper-on-an-EGA-desk home page, or give the book tool its own manuscript look? (asked 2026-11-03, by the agent; blocks P0-05; recommendation: keep the studio chrome, and give the home page and the Reading Stage a quieter paper look.)
- **Q-002** Keep the desktop network preview as "send to my reader" (a phone or e-reader browser opening the book over the LAN)? (asked 2026-11-03, by the agent; blocks P0-04; recommendation: keep it, because testing on a real device is the best check available and the code already exists.)
- **Q-003** Which reading systems and devices does the maintainer own or want tested (for example Calibre, Thorium, Apple Books, Kobo, KOReader, a physical e-ink reader)? (asked 2026-11-03, by the agent; blocks P5-06 and P6-03; recommendation: Calibre or Thorium on the desktop, plus one phone app, plus the e-ink device if there is one.)
