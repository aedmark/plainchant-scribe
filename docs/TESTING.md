# Testing

**Status:** the inherited Plainchant Web suites run (`npm test`, now 153 with the XML parser's, the template's, the book model's, the OPF edits', the nav's, the XHTML checker's, and EPUBCheck's, and 7 Rust tests), minus the tests of the features removed in `P0-04`. The first book-format suite is the XML parser and splicer (`test/xml-ast.test.js`, `P1-01`); the rest are planned below and arrive with their roadmap items.

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
- **The book model** (`test/book.test.js`, done): reads the template and the hand-edited fixture with no problems; each package rule has a case built by editing the template's OPF, with its exact problem codes; covers, assets, remote resources, fallback chains, EPUB 2 leftovers, and a splice through a model node. Cross-check recipe, run by hand on 2026-11-03: wrap `Book.read` to record each book the tests pass it, zip each one, run EPUBCheck, and compare "Scribe reports an error" with "EPUBCheck reports an error or fatal". 45 of 49 agreed. Three of the other four came from stand-in content (one-byte images, an empty NCX) or a cross-file nav link, which `P5-04` owns. The fourth was a `mimetype` item in the manifest, which EPUB 3.3 forbids and EPUBCheck 5.4.0 accepts (D-014).
- **OPF edits** (`test/opf-edit.test.js`, done): each op's exact before-and-after text on the hand-edited fixture (only the expected ranges change), CRLF files, prefixed and undeclared namespaces, every refusal code, and a seven-step sequence that leaves the template with no problems. `test/epubcheck.test.js` runs a ten-step edited book through EPUBCheck. Mutation check, by hand on 2026-11-04: four deliberate bugs in `src/opf-edit.js` (spine chunks, removal cascade, rename of refines, placement after refinements) each failed at least one test.
- **The nav document** (`test/nav.test.js`, done): the template and fixture read clean; nesting, spans, image labels, other navs, and fragments; each §7 and link rule has a case with its exact codes; every edit op's exact text, in tabs, spaces, one-line navs, and CRLF; prefixes in scope; refusals. `test/epubcheck.test.js` runs a nav after five edits through EPUBCheck. Cross-check recipe, run by hand on 2026-11-04 (as for the book model, wrapping `Nav.read` and keeping only books whose package `Book.read` passes): 43 of 64 agreed. Every other book differed only through stand-in content: fragments that name no element (RSC-012), empty stand-in chapters (RSC-016), a missing image, and the fixture OPF's `opf:role` (RSC-005), all `P5-04`'s. Four earlier differences were EPUBCheck rules stricter than §7, now followed (D-016). Mutation check: five deliberate bugs in `src/nav.js` each failed a test.
- **XHTML checks and the paste normaliser** (`test/xhtml.test.js`, done): the template and fixture chapters check clean; each rule has a case with its exact codes; `fixEntities` on attributes, comments, CDATA, declared names, broken files, and 300 entities; the normaliser on hand-built DOM-like trees for Word, Docs, scripts, unsafe URLs, styles, lists, tables, `pre`, and images, with the result parsed back as XHTML. `test/epubcheck.test.js` runs a chapter with fixed entities and a pasted fragment through EPUBCheck. Cross-check, by hand on 2026-11-04: each full document the tests check, put in the template as chapter 1 and run through EPUBCheck; 25 of 26 agreed, and the other has a stand-in image. Four earlier differences were aligned with EPUBCheck (D-017). The real parse was checked in the browser pane: Word-, Docs-, and web-style pastes written for the purpose went through Chromium's `DOMParser` and `Xhtml.fromHtml`, and all three outputs were well-formed. Mutation check: six deliberate bugs in `src/xhtml.js` each failed a test.
- **Golden books** in `test/fixtures/`: small hand-written EPUBs, valid and deliberately broken, each with the expected findings.
- **EPUBCheck as the oracle** where Java is available: every exported fixture must pass, and a deliberately broken one must fail. When EPUBCheck is not available the test report says "not run", never "passed" (D-005). Built for the template (`test/epubcheck.test.js`, D-012): it finds `EPUBCHECK_JAR` or the newest `.tools/epubcheck-<version>/epubcheck.jar`, needs `java` on the PATH, and prints `skip epubcheck: not run (reason)` otherwise.
- **Setting up EPUBCheck** (Linux, 2026-11-03, Java 27, EPUBCheck 5.4.0): `gh release download v5.4.0 --repo w3c/epubcheck --pattern 'epubcheck-*.zip'`, check the file's SHA-256 against the release asset's digest (`gh release view v5.4.0 --repo w3c/epubcheck --json assets`), and unzip it into `.tools/`, which git ignores. Any later release works the same way.
- **Real reading systems are manual.** Per release, open the sample books in Calibre and record the result and date in HANDOFF. The legacy Kindle is reached through Calibre's conversion, so its results are labelled as such and trusted only once the model is known (D-010, Q-004). No other reader is available to the project. A passing unit suite says nothing about how a reader paginates.
- **Theme tests** (`test/theme.test.js`) check contrast (4.5:1) for every text, button, and syntax pair in both modes, identical variable sets across themes, no colour outside the theme blocks, and that the home page palette matches the studio's.
- **Structure tests** keep the inherited rules (no inline script, 500-line limit, no duplicate globals, offline cache list) and a rename guard that fails if the old product name returns (`P0-03`).

## Known pitfalls

- The 3x tools read `docs/plainchant-scribe.manual.json`; renaming the manual means updating `tools/test_manual.py`.
- EPUB rules are easy to remember wrongly. A check that cites a spec section is stronger than one written from memory (see HANDOFF, "Not verified").
