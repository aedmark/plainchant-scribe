# Session log, November 2026

Moved from `docs/HANDOFF.md` on 2026-11-08 (session 11) and 2026-11-27 (session 12), when the log passed ten entries. Entries are moved whole, newest first.

### Session 2: 2026-11-03: the maintainer answers Q-001 to Q-003

**Contributor:** Claude (Sonnet 5.5), with the maintainer
**Goal:** Record the answers so phase 0 is unblocked.
**Done:** none closed; P0-06 added, P5-07 added, P0-04 and P5-06 reworded
**Changed:** `docs/DECISIONS.md`, `ROADMAP.md`, `docs/HANDOFF.md`, `docs/TESTING.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`
**Decisions:** D-008 (manuscript look, light and dark), D-009 (keep the preview as send to reader), D-010 (Calibre and a legacy Kindle); question Q-004 added.
**Verified:** `python3 tools/check_docs.py` (0 errors, 0 warnings); `python3 tools/manual.py check` (2 sections, 4 entries); `python3 -m unittest tools/test_manual.py` (6/6).

### Session 1: 2026-11-03: create the repository and the plan

**Contributor:** Claude (Sonnet 5.5), with the maintainer
**Goal:** Turn the agreed Plainchant Scribe plan into a repository that the next session can start from.
**Done:** P0-01
**Changed:** new repository `plainchant-scribe`: `AGENTS.md`, `CLAUDE.md`, `README.md`, `ROADMAP.md`, `LICENSE`, `docs/*`, the lineage digest in `docs/archive/`, the shared tools in `tools/`, and the 3x manual source and build.
**Decisions:** D-001 to D-007; questions Q-001 to Q-003.
