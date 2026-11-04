# Changelog

User-visible changes by release. Internal refactors and doc-only edits belong in git history and [HANDOFF.md](HANDOFF.md), not here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/): `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## [Unreleased]

### Removed

- Features the book tool will not use: the Live JS mode and Console, the Insert menu and drag-to-insert, the breakpoint switcher, flex and grid handles, and the pseudo-state bar. The Stage no longer runs scripts at all (`P0-04`).

### Changed

- The studio is now Plainchant Scribe: new name, bundle id, version (`0.1.0`), and separate browser storage. The editing features are still those of the web-page editor it was copied from; book features arrive phase by phase ([ROADMAP.md](../ROADMAP.md)).
