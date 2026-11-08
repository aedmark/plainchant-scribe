# Contributing

Workflow for human and agent contributors. Standing rules for agents live in [../AGENTS.md](../AGENTS.md); this file does not repeat them.

## Workflow

1. Pick an item from [../ROADMAP.md](../ROADMAP.md) or raise a question in [DECISIONS.md](DECISIONS.md) (open questions). Read the relevant part of [ARCHITECTURE.md](ARCHITECTURE.md) and [TESTING.md](TESTING.md), and for a first session the [Plainchant Web lineage digest](archive/plainchant-web-lineage.md). Verify the repository's actual conventions (no build step, classic scripts in one global scope, splices instead of reserialising) rather than importing training-distribution or external defaults (fore-conceptions).
2. Surface unstated assumptions. For ambiguous requirements or a large or irreversible change, ask clarifying questions (or record an open question in [DECISIONS.md](DECISIONS.md)) and agree on scope and rollback before implementation.
3. Work on one independently reviewable change on `master`, or on `feature/<topic>` when asked. If implementation or testing invalidates the agreed scope or exposes an unexpected architectural dependency, pause and re-scope before continuing.
4. Write the test with the change. For anything that touches an EPUB rule, cite the specification section in a comment and add a fixture that fails without the fix.
5. Run the checks in [TESTING.md](TESTING.md) and `python3 tools/check_docs.py`.
6. Update the documents whose triggers fired ([README.md](README.md) lists them), including the 3x manual when behaviour it describes changes; rebuild `docs/manual.html`.
7. Commit with a concise imperative summary and the roadmap ID. Push only when the maintainer asks.

## Review

The maintainer reviews in-session. Reports state what changed, which files were updated, and exact verification results, and name anything not run (for example EPUBCheck or a real reading system).

## Compatibility and migrations

- **Books:** Scribe never reserialises an author's files (D-002); an older or imported book opens as it is, and anything Scribe does not understand is kept and exported unchanged.
- **Saved projects:** the working copy in IndexedDB (`plainchant_scribe`) only gains object stores, created when missing, and a saved project without `META-INF/container.xml` still opens as a web project (`Project.isBookEntries`). A change to stored data must keep those opening; a test or a check by hand in the browser pane shows it.
- **Settings and the library:** unknown keys and invalid values are dropped and missing ones take their defaults (`readSettings` in `src/app/settings.js`); the library of saved pages is parsed and filtered again on every read (D-046).
- A change that cannot keep these promises needs a decision (D-NNN) with its migration and recovery path before it lands.

## Releases

SemVer. Cut a release by moving the changelog's Unreleased section under a dated version and tagging it. Nothing is published without the maintainer's explicit permission.
