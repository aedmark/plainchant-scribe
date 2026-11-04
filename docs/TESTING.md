# Testing

**Status:** the inherited Plainchant Web suites run (`npm test`, now 114 with the XML parser's, the template's, and EPUBCheck's, and 7 Rust tests), minus the tests of the features removed in `P0-04`. The first book-format suite is the XML parser and splicer (`test/xml-ast.test.js`, `P1-01`); the rest are planned below and arrive with their roadmap items.

## Commands

| What | Command | Time |
| --- | --- | --- |
| Documentation consistency | `python3 tools/check_docs.py` | under a second |
| 3x manual validates | `python3 tools/manual.py check docs/plainchant-scribe.manual.json` | under a second |
| 3x manual tool tests | `python3 -m unittest tools/test_manual.py` | under a second |
| Rebuild the manual | `python3 tools/manual.py build docs/plainchant-scribe.manual.json --output docs/manual.html` | under a second |
| Full checks today | `python3 tools/check_docs.py && python3 -m unittest tools/test_manual.py` | under a second |

| Unit and structural tests | `npm test` (Node, no install) | about 1 second; about 6 with EPUBCheck |
| The same, without EPUBCheck | `SCRIBE_SKIP_EPUBCHECK=1 npm test` | about 1 second |
| Rust unit tests | `cargo test --manifest-path src-tauri/Cargo.toml` | 1 to 60 seconds |
| Desktop build | `cargo build --manifest-path src-tauri/Cargo.toml` | 1 to 60 seconds |

The full command is in `AGENTS.md`, Run and verify.

## What each suite proves, and what it does not

| Suite | Proves | Does not prove |
| --- | --- | --- |
| `check_docs.py` | The documents agree with each other: IDs exist, links resolve, the layout table's paths exist | That any statement is true of the code |
| `tools/manual.py check`, `test_manual.py` | The manual source is valid against the schema and builds | That its claims are accurate |

## Planned strategy for the book code

- **Unit tests in Node** for every pure module: the book model, the zip and EPUB code, the checks, and the importers.
- **The XML parser and splicer** (`test/xml-ast.test.js`, done): hand-written OPF, nav, XHTML, and `container.xml` fixtures in `test/fixtures/xml/` rebuild exactly from their node ranges; every splice operation is checked on them for the exact range it changes and for a well-formed result; well-formedness, namespace, and security errors each have a case. Cross-check recipe, run by hand on 2026-11-03 with 45 cases and 0 disagreements: write each case's `XmlAst.parse(src).wellFormed` to JSON with Node, then parse each case with Python's `xml.parsers.expat.ParserCreate(namespace_separator=' ')` and compare. Expat is a second opinion, not part of `npm test`.
- **Golden books** in `test/fixtures/`: small hand-written EPUBs, valid and deliberately broken, each with the expected findings.
- **EPUBCheck as the oracle** where Java is available: every exported fixture must pass, and a deliberately broken one must fail. When EPUBCheck is not available the test report says "not run", never "passed" (D-005). Built for the template (`test/epubcheck.test.js`, D-012): it finds `EPUBCHECK_JAR` or the newest `.tools/epubcheck-<version>/epubcheck.jar`, needs `java` on the PATH, and prints `skip epubcheck: not run (reason)` otherwise.
- **Setting up EPUBCheck** (Linux, 2026-11-03, Java 27, EPUBCheck 5.4.0): `gh release download v5.4.0 --repo w3c/epubcheck --pattern 'epubcheck-*.zip'`, check the file's SHA-256 against the release asset's digest (`gh release view v5.4.0 --repo w3c/epubcheck --json assets`), and unzip it into `.tools/`, which git ignores. Any later release works the same way.
- **Real reading systems are manual.** Per release, open the sample books in Calibre and record the result and date in HANDOFF. The legacy Kindle is reached through Calibre's conversion, so its results are labelled as such and trusted only once the model is known (D-010, Q-004). No other reader is available to the project. A passing unit suite says nothing about how a reader paginates.
- **Theme tests** (`test/theme.test.js`) check contrast (4.5:1) for every text, button, and syntax pair in both modes, identical variable sets across themes, no colour outside the theme blocks, and that the home page palette matches the studio's.
- **Structure tests** keep the inherited rules (no inline script, 500-line limit, no duplicate globals, offline cache list) and a rename guard that fails if the old product name returns (`P0-03`).

## Known pitfalls

- The 3x tools read `docs/plainchant-scribe.manual.json`; renaming the manual means updating `tools/test_manual.py`.
- EPUB rules are easy to remember wrongly. A check that cites a spec section is stronger than one written from memory (see HANDOFF, "Not verified").
