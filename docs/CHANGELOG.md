# Changelog

User-visible changes by release. Internal refactors and doc-only edits belong in git history and [HANDOFF.md](HANDOFF.md), not here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/): `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## [Unreleased]

### Added

- **Editing on the Stage for books**: click selects an element in a chapter, double-click edits its text, and dragging, the badge's buttons, the Inspector, and undo work as they do for web pages. Ctrl/Cmd+Click follows a link. An edit that would make a chapter invalid XHTML is refused with a notice (`P2-06`, `D-024`).
- **Moving through a book on the Stage**: « and » step between chapters, paging past the end of a chapter goes on to the next, Contents opens the table of contents over the Stage, and links between chapters work. Links that leave the book show their address instead of opening (`P2-05`, `D-023`).
- **Device presets for books**: Fit, Phone, E-ink 6", and Tablet on the Stage bar show the chapter at that screen's size, scaled to fit, with a rotate button for landscape; E-ink is greyscale with animation off (`P2-04`, `D-022`).
- **Paged and scroll layouts on the Stage**: paged (the default) splits the open chapter into pages the size of the Stage, like a reader, with ‹ Page n of m › on the Stage bar and the arrow and Page keys to turn them; Scroll in the Reader panel shows one continuous page (`P2-03`, `D-021`).
- **Reader settings on the Stage**: a Reader button sets text size, margins, and a light, sepia, or dark theme, the way a reading app does. They apply to every book, are remembered in this browser, and never change the book's files. The File menu's New is now New book (`P2-02`, `D-020`).
- **New makes an EPUB book**: the files of a reflowable EPUB 3 book (package document, contents, one chapter, a stylesheet), and **Load Example Book** opens a short three-chapter guide. The Stage shows the open chapter as a reading system parses it, with the book's own styles and images; a chapter that is not well-formed shows an error instead. Projects saved earlier still open as web pages (`P2-01`, `D-018`).
- **A manuscript look with light and dark modes**: warm paper and ink in light, lamplight in dark, with serif headings (EB Garamond) and typewriter code. Settings has Match system (the default), Light, and Dark; the old Retro theme is gone. The home page is rewritten to match and says plainly where the project stands (`P0-05`, `P0-06`, `D-008`).

### Fixed

- **Updates show on the next load.** The offline copy used to keep serving the old app after an update until the browser's site data was cleared; now the app is fetched fresh whenever the server can be reached, and the offline copy is used only when it cannot (`P0-07`, `D-019`).

### Removed

- Features the book tool will not use: the Live JS mode and Console, the Insert menu and drag-to-insert, the breakpoint switcher, flex and grid handles, and the pseudo-state bar. The Stage no longer runs scripts at all (`P0-04`).

### Changed

- The studio is now Plainchant Scribe: new name, bundle id, version (`0.1.0`), and separate browser storage. The editing features are still those of the web-page editor it was copied from; book features arrive phase by phase ([ROADMAP.md](../ROADMAP.md)).
