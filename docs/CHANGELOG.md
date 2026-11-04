# Changelog

User-visible changes by release. Internal refactors and doc-only edits belong in git history and [HANDOFF.md](HANDOFF.md), not here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/): `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## [Unreleased]

### Added

- **New makes an EPUB book**: the files of a reflowable EPUB 3 book (package document, contents, one chapter, a stylesheet), and **Load Example Book** opens a short three-chapter guide. The Stage shows the open chapter as a reading system parses it, with the book's own styles and images; a chapter that is not well-formed shows an error instead. Projects saved earlier still open as web pages (`P2-01`, `D-018`).
- **A manuscript look with light and dark modes**: warm paper and ink in light, lamplight in dark, with serif headings (EB Garamond) and typewriter code. Settings has Match system (the default), Light, and Dark; the old Retro theme is gone. The home page is rewritten to match and says plainly where the project stands (`P0-05`, `P0-06`, `D-008`).

### Removed

- Features the book tool will not use: the Live JS mode and Console, the Insert menu and drag-to-insert, the breakpoint switcher, flex and grid handles, and the pseudo-state bar. The Stage no longer runs scripts at all (`P0-04`).

### Changed

- The studio is now Plainchant Scribe: new name, bundle id, version (`0.1.0`), and separate browser storage. The editing features are still those of the web-page editor it was copied from; book features arrive phase by phase ([ROADMAP.md](../ROADMAP.md)).
