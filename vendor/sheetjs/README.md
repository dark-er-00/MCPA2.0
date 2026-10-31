SheetJS Community Edition 0.20.3, vendored from the official distribution:
https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js

License: Apache-2.0, copied from the same package to LICENSE.
SHA-256 of xlsx.full.min.js: cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41

Used only in the equipment import worker and on demand for XLSX template creation.
No runtime CDN or third-party service is required. The importer restricts input to
CSV and ordinary XLSX, checks archive limits/active content, never evaluates formulas,
and imposes a worker timeout. Updating this dependency requires repeating import tests.

Official browser installation/version guidance:
https://docs.sheetjs.com/docs/getting-started/installation/standalone/
