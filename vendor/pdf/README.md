# SiteTrace PDF assets

Committed browser assets; no CDN or external service is used at export time.
The small shared `js/pdf-reports.js` loader resolves assets relative to itself,
so both portal entry points and GitHub Pages project subpaths work.

- jsPDF 4.2.1: https://github.com/parallax/jsPDF/releases/tag/v4.2.1 (MIT)
- jsPDF-AutoTable 5.0.8: https://github.com/simonbengtsson/jsPDF-AutoTable/releases/tag/v5.0.8 (MIT)
- Noto Sans regular/bold: https://github.com/notofonts/noto-fonts/tree/ffebf8c1ee449e544955a7e813c54f9b73848eac (SIL OFL 1.1)

Licenses and a SHA-256 manifest accompany these files. Rebuild with
`npm ci --ignore-scripts` and `npm run bundle:pdf` from `scripts/`.
Only this development step downloads public font files. Never edit minified
assets by hand. Font data is embedded in the PDF and subset to used glyphs.

Noto Sans supports Filipino names, accents, peso signs, common punctuation,
Greek and Cyrillic. Unsupported glyphs (such as emoji/CJK) are preserved as
explicit `[U+XXXX]` code points, with a note in the PDF, instead of disappearing.
