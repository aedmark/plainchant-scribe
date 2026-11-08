# Store checklists

A checklist for each store Scribe authors upload to: Kobo, Apple Books, Amazon (KDP, uploading an EPUB), and Google Play Books (`P6-03`). Each rule was taken from the store's own published pages on **2026-11-06**, and each section links the pages read. Stores change their rules without notice, so check the linked page before you upload, and update this file when a rule has changed.

This is documentation only. Scribe has not been tested on any store's reader or ingestion pipeline, so it makes no claim that a book will display or be accepted anywhere (D-010). What Scribe does check is EPUB 3.3 itself: EPUBCheck 5.4.0 passes the books it writes, and the Problems tab reports what it can find (D-040, D-041).

Each line says who handles the rule:

- **Scribe**: what Scribe writes or checks, and where.
- **You**: the author's job. Scribe neither writes it nor checks it.
- **Store**: done at upload, in the store's dashboard, not in the file.

## Before any store

- [ ] **Scribe** Problems tab shows no errors. Export warns before it packs a book that has any (D-040).
- [ ] **Scribe** In the desktop app, Run EPUBCheck in the Problems tab reports nothing (D-041). In the browser, run EPUBCheck yourself.
- [ ] **Scribe** Book tab: title, language, author, and an identifier. Put the ISBN in the identifier if you have one.
- [ ] **Scribe** A cover image in the Book tab, which also puts a cover page first in the reading order (D-029).
- [ ] **Scribe** Review alt text… in the Book tab: every image is described or marked decorative (D-045).
- [ ] **Scribe** A fixed-layout book (Book tab, Page layout; D-052) meets EPUB 3.3's fixed-layout rules, which the Problems tab checks. The stores' own fixed-layout rules were not read for this checklist.
- [ ] **You** Open the exported `.epub` on a real device or reader app for each store you upload to. Scribe's Stage is not any store's reader.

## Kobo (Kobo Writing Life)

Read: [File Types & Sizes](https://kobowritinglife.zendesk.com/hc/en-us/articles/360059386271), [Cover Image Tips](https://kobowritinglife.zendesk.com/hc/en-us/articles/360059385711), [Validating and Testing Your eBooks](https://kobowritinglife.zendesk.com/hc/en-us/articles/360058976112), and Kobo's EPUB guide ([kobolabs/epub-spec](https://github.com/kobolabs/epub-spec)).

- [ ] **You** The `.epub` is under 100 MB (Kobo Writing Life's limit for any upload). Kobo's EPUB guide also advises at most 10 MB of embedded content per chapter file. Scribe's import limit of 200 MB per book (D-038) is higher.
- [ ] **Scribe** EPUB 3.3 is accepted (Kobo's guide supports 3.3 back to 2.0.1).
- [ ] **Scribe / You** Kobo validates every upload. Critical errors block publishing; non-critical ones do not, except for OverDrive, which needs none at all. Kobo's guide says it runs EPUBCheck 4.2.6, older than the 5.4.0 Scribe is tested with, so results may differ.
- [ ] **Scribe** The cover is in its own XHTML file (Kobo's guide requires this; Scribe's `cover.xhtml`, D-029).
- [ ] **Scribe** Kobo's guide shows the EPUB 2 `<meta name="cover" content="…"/>` pointing to the cover item. Setting a cover in the Book tab writes it, and removing the cover removes it (D-047).
- [ ] **Scribe** The cover image is JPG or PNG, portrait, and under 5 MB; the Problems tab's Images category warns when it is not (D-051). Kobo suggests a width of ¾ of the height (3:4). Scribe's generated cover is 1600 × 2560 (5:8), which is portrait but narrower.
- [ ] **Scribe** A `toc` nav. Kobo ignores an NCX in EPUB 3 books, so the nav is what it reads (P1-05).
- [ ] **You** Embedded fonts are TTF, OTF, or WOFF 1.0 (P4-03 embeds TTF and OTF). Kobo advises against naming fonts in CSS that the book does not embed.

## Apple Books

Read: [Apple Books Asset Guide 5.3.1](https://help.apple.com/itc/booksassetguide/en.lproj/static.html) (February 2025, the latest shown on 2026-11-06).

- [ ] **Scribe** EPUB 3 with `version="3.0"` on the package (required; Apple supports EPUB 3.3 and earlier EPUB 3, not EPUB 2). The template writes `3.0`, which is what EPUB 3.3 uses (P1-02).
- [ ] **Scribe** Every file is in the manifest (an unlisted file fails import). Export leaves out and names any file outside the manifest (D-037).
- [ ] **Scribe** Title, identifier, language, and `dcterms:modified` are present (required). Export sets `dcterms:modified` (D-037).
- [ ] **You** No leading or trailing spaces in metadata values (required since 5.3.1). Scribe does not trim what you type.
- [ ] **Scribe** A `toc` nav (required for every book). The page list is optional (D-045 builds one).
- [ ] **You** At least one spine item is in the reading order (`linear="yes"`, required). New books and chapters are linear, and Scribe does not check this.
- [ ] **Scribe** Images inside the book are JPEG or PNG in RGB (sRGB recommended) and at most 5.6 million pixels each; the Images category warns about GIF, WebP, CMYK, and larger images (D-051). **You** choose sRGB. Scribe's generated cover is 4.1 million. Apple says it rejects books whose images carry text that should be text.
- [ ] **Scribe** Every image has an `alt` attribute (required). Review alt text… and the Problems tab find the missing ones.
- [ ] **Store** The marketing cover, uploaded separately: JPEG or PNG, RGB, at least 1400 pixels on the shorter side, not enlarged from a smaller image. The generated cover is 1600 pixels wide.
- [ ] **You** Embedded fonts are OpenType, TrueType, or SVG and declared in both the manifest and the CSS (P4-03 does both). Apple also asks for its `ibooks:specified-fonts` meta set to `true`, which Scribe does not write.
- [ ] **You** Chinese books give both language and script (`zh-Hans`, `zh-Hant`), in the OPF and in each language tag (Language…, D-045, checks the tag's form only).
- [ ] **Store** The book's file is under 2 GB.

## Amazon (KDP, EPUB upload)

Scribe exports EPUB only; KDP converts it for Kindle (D-006). Read: [What file formats are supported for eBook manuscripts?](https://kdp.amazon.com/en_US/help/topic/G200634390), [Navigation Guidelines](https://kdp.amazon.com/en_US/help/topic/GY3AD8C6C6GAG42N), [Image Guidelines – Reflowable](https://kdp.amazon.com/en_US/help/topic/G75V4YX5X8GRGXWV), and [What criteria does my eBook's cover image need to meet?](https://kdp.amazon.com/en_US/help/topic/G200645690).

- [ ] **You** Open the `.epub` in Kindle Previewer before uploading (KDP's recommendation for EPUB). Calibre's `ebook-convert` is the project's own smoke test of this route (D-042), not a substitute.
- [ ] **Scribe** A logical table of contents, which KDP requires: a `toc` nav or an NCX. Scribe writes the nav (P1-05); KDP devices prefer it when it exists.
- [ ] **Scribe** An HTML table of contents near the start of the book, made of links, without page numbers (required by KDP's navigation guidelines). The nav document serves as one when it is in the spine: tick **Contents page in the reading order** in the Chapters tab, which puts it after the cover and front matter with a toc landmark (D-047). EPUBCheck 5.4.0 reports nothing on such a book.
- [ ] **You** Kindle shows two levels of contents; deeper entries are not reachable from its menu.
- [ ] **Scribe** The contents are in reading order (required). The Problems tab's `toc-order` warning catches one that is not (D-045).
- [ ] **Scribe** Cover and toc landmarks, which Kindle's menu uses; without them those entries are greyed out. Setting a cover adds the cover landmark (D-029). The contents switch above adds the toc landmark, and Generate contents… keeps it (D-028, D-047).
- [ ] **Scribe** No transparent images (made white) and no TIFF or animated GIF inside the book; the Images category warns about transparent pixels and animation (D-051), and TIFF is not an EPUB core media type, so the Package category reports it. Images of text are better as text.
- [ ] **Scribe** Every image has alt text; decorative images have `alt=""` (KDP's image guidelines). Review alt text… (D-045).
- [ ] **Store** The cover, uploaded separately: JPEG or TIFF, RGB, under 50 MB; ideally 2560 × 1600 (height × width), at least 1000 × 625. The generated cover is 2560 × 1600 but PNG: Save as JPEG… in the Cover section makes the copy for this upload (D-051).
- [ ] **Scribe** The cover inside the book is full-page and at least 1200 pixels in width or height; the Images category warns when it is smaller (D-051). The generated cover is.

## Google Play Books

Read: [EPUB files](https://support.google.com/books/partner/answer/3316879) and [Book file guidelines](https://support.google.com/books/partner/answer/3424254) (Play Books Partner Center Help).

- [ ] **Scribe** EPUB 3.3, the version Google prefers (it also takes EPUB 3 and 2).
- [ ] **Scribe** The book passes EPUBCheck (required). Google also suggests opening it in Adobe Digital Editions; that is your step.
- [ ] **Scribe** The cover image is inside the `.epub` (required; a separate cover file is optional).
- [ ] **You** Name the file after the electronic ISBN (`9781234567890.epub`). Scribe names it after the title (`BookExport.fileName`).
- [ ] **You** The whole book is in the file; no excerpts or samples.
- [ ] **Scribe** Images are static GIF, JPEG, PNG, or SVG, at most 3200 pixels wide or tall; the Images category warns about larger and animated ones (D-051). **You** check the `width` and `height` attributes, which Scribe does not. Scribe's generated cover is 2560 pixels tall.
- [ ] **Store** A separate cover file, if you send one: JPEG, PNG, TIFF, or PDF, from 640 to 7200 pixels; each file under 2 GB.
- [ ] **Scribe** Google's reader shows only the `toc` nav, not the landmarks or page list.
- [ ] **You** No JavaScript or MathML; Google does not support them. Scribe writes neither.

## Accessibility metadata

None of the pages above requires the accessibility metadata of `P6-01` (D-044); Apple and KDP ask only for alt text. It is still worth adding, since the EPUB Accessibility 1.1 terms are what libraries and accessible stores read.
