# Security

Security model, trust boundaries, and known limitations for Plainchant Scribe. **Status: planned**; the boundaries below describe the intended design, and Plainchant Web's boundaries (the sandboxed Stage, the loopback asset server, the opt-in preview server, folder export path checks) are inherited at `P0-02`.

## Threat model and trust boundaries

Scribe is a local web and desktop application. It opens books the user made and books other people made.

1. **Imported `.epub` archives are untrusted.** An archive can contain path-traversal names (`../`), absolute paths, duplicate names, enormous or highly compressed entries, millions of entries, and files whose declared type does not match their content. `Epub.read()` (`P5-02`) must reject unsafe names, cap entry count, entry size, and total size, and read the central directory before inflating anything. Stored and deflated entries are both possible in the wild; the reader must handle what it accepts and refuse what it does not.
2. **Book content is untrusted and is never executed.** Scripts in imported XHTML are kept in the files but stripped from the Reading Stage, which also renders in a sandboxed iframe (inherited). External references (remote images, fonts, stylesheets) are flagged in Problems and not fetched silently by the Studio.
3. **XML parsing has no DTD or external entity support.** `src/xml-ast.js` is hand-written, ignores DOCTYPE internal subsets, and never resolves entities from outside the document, so XXE-style attacks do not apply. It also needs depth and size limits so a hostile file cannot exhaust memory.
4. **Export never writes outside the target folder and never deletes** (inherited, web D24).
5. **Fonts carry licences.** Embedding a font in a book redistributes it; the Studio reminds the author (`P4-03`) but cannot check the licence.
6. **Vendored third-party code:** Prism, unmodified, tokenize only, never used for HTML output (inherited, D-001).
7. **Send to reader (`D-009`, `P5-07`)** is the inherited opt-in preview server: off until started, an unguessable path token, read-only, plain HTTP on the local network, stopped on request or quit. Serving the exported `.epub` for download is new; it must serve only the book the user chose to share and nothing else from the working copy.
8. **The optional EPUBCheck run** (`P5-05`) executes a local Java process on a book the user chose. It must be passed the path as an argument, never through a shell, and must show what it runs.

## Secrets and configuration

- Scribe needs no API keys, accounts, or cloud services. Do not add telemetry.
- Never commit `.env` files, private keys, or user books (`*.epub` is ignored except the fixtures in `test/fixtures/`).

## Reporting

Report security issues by opening a private security advisory on the GitHub repository (`https://github.com/aedmark/plainchant-scribe`).
