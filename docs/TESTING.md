# Testing

**Status:** the project has no application code yet, so the only suites are the documentation checks. Plainchant Web's test strategy comes with the port (`P0-02`) and is rewritten here then.

## Commands

| What | Command | Time |
| --- | --- | --- |
| Documentation consistency | `python3 tools/check_docs.py` | under a second |
| 3x manual validates | `python3 tools/manual.py check docs/plainchant-scribe.manual.json` | under a second |
| 3x manual tool tests | `python3 -m unittest tools/test_manual.py` | under a second |
| Rebuild the manual | `python3 tools/manual.py build docs/plainchant-scribe.manual.json --output docs/manual.html` | under a second |
| Full checks today | `python3 tools/check_docs.py && python3 -m unittest tools/test_manual.py` | under a second |

After `P0-02`: `npm test` (Node, no install) and `cargo build --manifest-path src-tauri/Cargo.toml`.

## What each suite proves, and what it does not

| Suite | Proves | Does not prove |
| --- | --- | --- |
| `check_docs.py` | The documents agree with each other: IDs exist, links resolve, the layout table's paths exist | That any statement is true of the code |
| `tools/manual.py check`, `test_manual.py` | The manual source is valid against the schema and builds | That its claims are accurate |

## Planned strategy for the book code

- **Unit tests in Node** for every pure module: the XML splicer (round trip and every splice operation on OPF, nav, and XHTML samples), the book model, the zip and EPUB code, the checks, and the importers.
- **Golden books** in `test/fixtures/`: small hand-written EPUBs, valid and deliberately broken, each with the expected findings.
- **EPUBCheck as the oracle** where Java is available: every exported fixture must pass, and a deliberately broken one must fail. When EPUBCheck is not available the test report says "not run", never "passed" (D-005).
- **Real reading systems are manual.** Per release, open the sample books in Calibre and record the result and date in HANDOFF. The legacy Kindle is reached through Calibre's conversion, so its results are labelled as such and trusted only once the model is known (D-010, Q-004). No other reader is available to the project. A passing unit suite says nothing about how a reader paginates.
- **Structure tests** keep Plainchant Web's rules (no inline script, 500-line limit, offline cache list) once ported.

## Known pitfalls

- The 3x tools read `docs/plainchant-scribe.manual.json`; renaming the manual means updating `tools/test_manual.py`.
- EPUB rules are easy to remember wrongly. A check that cites a spec section is stronger than one written from memory (see HANDOFF, "Not verified").
