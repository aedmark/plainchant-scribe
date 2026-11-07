# Plainchant Scribe

**Make and lay out EPUBs without a tool rewriting your files.**

Plainchant Scribe is a planned spinoff of [Plainchant Web](https://github.com/aedmark/plainchant-web) that turns its round-trip HTML editor into an EPUB studio. A book is a folder of ordinary `.xhtml`, `.css`, and `content.opf` files; every change you make on the Reading Stage edits only the exact characters it touches, and **Export** zips the result into a valid EPUB 3.3.

**Status: early development (2026-11-06).** Scribe makes, imports, lays out, checks, and exports EPUB 3.3 books: New or Import opens a book, the Book panel edits its metadata, chapters, contents, and cover, style presets, fonts, notes, and figures lay it out, the Problems tab checks it, and Export saves a `.epub`. Its round trip has been checked on seven public-domain books, and the desktop app can send a book to a phone or e-reader on the same network. The Book tab writes the accessibility metadata EPUB Accessibility 1.1 asks for, and the studio adds page numbers, languages, ARIA roles, and alt text. Still to come are the store checklists; the plan ([ROADMAP.md](ROADMAP.md)) turns it into a book tool, and the decisions behind it are in [docs/DECISIONS.md](docs/DECISIONS.md). Run it with `python3 -m http.server 8081` and open `http://localhost:8081/app.html` (port 8081, so it never shares a browser origin, and with it storage and the offline cache, with Plainchant Web on 8080).

## What it will do

- Open or create a book; edit chapters visually or as code, with the same non-destructive splicing Plainchant Web uses.
- Show a reflowable reading view: paged or scrolled, light, sepia, or dark, with phone, e-ink, and tablet presets.
- Manage the book's structure: metadata, cover, reading order, and a generated table of contents.
- Lay the book out with plain-CSS presets for typography, chapter openers, scene breaks, footnotes, and embedded fonts.
- Import an existing `.epub` or Markdown, and export a valid EPUB, checked by the built-in rules and optionally by EPUBCheck.
- Help with accessibility metadata, then a checklist for each store.

Not planned: a Markdown-first writing app (that is a different product), `.mobi`/`.azw3` output, and scripted or interactive EPUBs.

## Where to start

| If you want to... | Read |
| --- | --- |
| Know what is planned and in what order | [ROADMAP.md](ROADMAP.md) |
| See why it is shaped this way | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Resume work | [docs/HANDOFF.md](docs/HANDOFF.md) |
| Understand the planned system | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Learn what came from Plainchant Web | [docs/archive/plainchant-web-lineage.md](docs/archive/plainchant-web-lineage.md) |
| Browse the 3x manual | [docs/manual.html](docs/manual.html) |

## Documentation schemes

The repository uses [the-manifold](https://github.com/aedmark/the-manifold) for agent-facing project memory and the [3x documentation scheme](https://github.com/aedmark/3x-documentation-scheme) for the What / How / Why manual. Check both with:

```bash
python3 tools/check_docs.py
python3 tools/manual.py check docs/plainchant-scribe.manual.json
```

## Licence

See [LICENSE](LICENSE).
