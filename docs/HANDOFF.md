# Session Handoff

Read this first when resuming unfinished work. Rewrite the top half whenever current state changes materially or work
pauses with context another session needs.
The session log below it is append-only history. "Current state" fits on a screen or two (about 80 lines);
what does not fit is history, and belongs in the session log.

Protocol: see [AGENTS.md](../AGENTS.md) (`CLAUDE.md` imports it). Plan: [ROADMAP.md](../ROADMAP.md).
Architecture: [ARCHITECTURE.md](ARCHITECTURE.md). Decisions: [DECISIONS.md](DECISIONS.md).
Tests: [TESTING.md](TESTING.md). Security: [SECURITY.md](SECURITY.md).
Changes: [CHANGELOG.md](CHANGELOG.md). Older sessions and the Plainchant Web history: [archive/](archive/README.md).

---

## Current state

_Last updated: 2026-11-03, session 1, on `master`: the repository was created from a plan agreed in conversation; the first commit holds everything._

**Where things stand, in one paragraph:** Plainchant Scribe exists as a planning repository only. It holds the roadmap (phases 0 to 7), seven recorded decisions, three open questions, the Manifold and 3x documentation schemes, and a digest of the Plainchant Web history. There is no application code. The next real work is copying Plainchant Web's source (`P0-02`) and renaming it (`P0-03`).

**Verified** (2026-11-03, Linux, Python 3)

| Suite | Result |
| --- | --- |
| `python3 tools/check_docs.py` | `0 error(s), 0 warning(s)` |
| `python3 -m unittest tools/test_manual.py` | `6/6` OK (manual: 2 sections, 4 entries, 0 warnings) |

**What works**
- **Documentation schemes** (`P0-01`, D-007). `tools/check_docs.py` checks the Manifold documents; `tools/manual.py` builds and checks the 3x manual (`docs/plainchant-scribe.manual.json`, `docs/manual.html`).

**Not verified**
- Every EPUB rule in this repository's plan comes from the maintainer's and the agent's knowledge of EPUB 3.3 and EPUB Accessibility 1.1, not from a re-read of the specifications. Re-read the relevant section when each phase starts (D-004).
- Nothing has been checked against EPUBCheck or a real reading system, and no sample book exists yet.

**Gotchas for the next session**
- The code to copy is `aedmark/plainchant-web` at commit `4c30d7b934c771104bf3252e49807e95a5d95bdd` (D-003). Read [archive/plainchant-web-lineage.md](archive/plainchant-web-lineage.md) first: it lists what to keep, what to drop, and the traps (cache-first service worker, the 500-line limit per app script, the HTML parser being too forgiving for XML).
- `tools/check_docs.py` and `tools/manual.py` are the shared schemes' own files; replace them from their source repositories instead of editing (D-007).
- Roadmap and decision IDs in `docs/archive/plainchant-web-lineage.md` are written in a form the checker ignores on purpose.

## Next steps (in order)

1. Answer Q-001 (look and feel), Q-002 (keep the network preview), and Q-003 (which readers to test on) when convenient; Q-001 and Q-002 block `P0-05` and `P0-04`.
2. `P0-02`: copy the Plainchant Web source at the commit named in D-003; run `npm test` and `cargo build` unchanged.
3. `P0-03`: rename the product, bundle id, storage names, cache name, and in-app copy.
4. `P0-04`: remove the web-only features once Q-002 is answered.
5. Start `P1-01`, the XML parser, which every later phase depends on.

## Open questions for maintainers

- Q-001 Look and feel (blocks P0-05).
- Q-002 Keep the network preview as "send to my reader" (blocks P0-04).
- Q-003 Which reading systems and devices to test on (blocks P5-06 and P6-03).

## Session log

Newest first. Copy the template for each new session. Work done between sessions (a maintainer's commits, another
agent) gets a short entry too, written by whoever notices it, so the log has no gaps. Past 10 entries, move the
oldest to `docs/archive/` and leave a pointer here.

### Session 1: 2026-11-03: create the repository and the plan

**Contributor:** Claude (Sonnet 5.5), with the maintainer
**Goal:** Turn the agreed Plainchant Scribe plan into a repository that the next session can start from.
**Done:** P0-01
**Changed:** new repository `plainchant-scribe`: `AGENTS.md`, `CLAUDE.md`, `README.md`, `ROADMAP.md`, `LICENSE`, `docs/*`, the lineage digest in `docs/archive/`, the shared tools in `tools/`, and the 3x manual source and build.
**Decisions:** D-001 to D-007; questions Q-001 to Q-003.
**Verified:** `python3 tools/check_docs.py` (0 errors, 0 warnings); `python3 tools/manual.py check` (2 sections, 4 entries); `python3 -m unittest tools/test_manual.py` (6/6).
