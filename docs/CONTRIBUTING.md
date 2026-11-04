# Contributing

Workflow for human and agent contributors. Standing rules for agents live in [../AGENTS.md](../AGENTS.md); this file does not repeat them.

## Workflow

1. Pick an item from [../ROADMAP.md](../ROADMAP.md) or raise a question in [DECISIONS.md](DECISIONS.md) (open questions). Read the relevant part of [ARCHITECTURE.md](ARCHITECTURE.md) and [TESTING.md](TESTING.md), and for a first session the [Plainchant Web lineage digest](archive/plainchant-web-lineage.md).
2. Work on one independently reviewable change on `master`, or on `feature/<topic>` when asked.
3. Write the test with the change. For anything that touches an EPUB rule, cite the specification section in a comment and add a fixture that fails without the fix.
4. Run the checks in [TESTING.md](TESTING.md) and `python3 tools/check_docs.py`.
5. Update the documents whose triggers fired ([README.md](README.md) lists them), including the 3x manual when behaviour it describes changes; rebuild `docs/manual.html`.
6. Commit with a concise imperative summary and the roadmap ID. Push only when the maintainer asks.

## Review

The maintainer reviews in-session. Reports state what changed, which files were updated, and exact verification results, and name anything not run (for example EPUBCheck or a real reading system).

## Releases

SemVer. Cut a release by moving the changelog's Unreleased section under a dated version and tagging it. Nothing is published without the maintainer's explicit permission.
