# SiteTrace user documentation

27 October 2026 revision (v1.1): restored the original Add Account form on the main People & Accountability page, removed invitation instructions/figures, and refreshed the account screenshot. Original source-baseline and validation reports describe the 12 October capture run; they do not certify the current application tree. No hosted configuration changed.


Version 1.0 · 12 October 2026 · Asia/Manila

The reviewed construction equipment application is branded **MCPA** in its interface. These manuals retain the requested SiteTrace titles and explain the naming difference.

| Manual | Editable document | PDF | Genuine screenshots |
| --- | --- | --- | --- |
| Administrator | [DOCX](SiteTrace_Admin_User_Manual.docx) | [41-page PDF](SiteTrace_Admin_User_Manual.pdf) | 22 |
| Engineer and Architect | [DOCX](SiteTrace_Engineer_Architect_User_Manual.docx) | [36-page PDF](SiteTrace_Engineer_Architect_User_Manual.pdf) | 19 |

Start with the relevant PDF for training or the DOCX for future revisions. Both include covers, contents, role boundaries, module instructions, numbered procedures, figures, troubleshooting, FAQs, glossary and revision information. DOCX page-number fields update in a compatible editor; its pagination may differ from PDF.

The [system review](SiteTrace_System_Module_and_Role_Review.md) documents **14 primary modules**, the permission matrix for **Admin, Engineer, Architect, Secretary and Tool Handler**, implementation gaps and source evidence. Engineer and Architect have the same permissions. Additional role navigation captures are available for [Secretary](screenshots/secretary-navigation.png) and [Tool Handler](screenshots/handler-navigation.png).

All screenshots show the repository's actual interface against an **isolated local fixture**, with Auth/Edge capability transport modeled and external HTTPS blocked. The original capture run issued **zero business writes**; the updated People figure comes from regression tests that mutate only disposable local fixtures. The live application, configuration and records were not changed; **REQ-00001 was not accessed**. Production state was not compared independently.

Limits: deployed Supabase migrations/RPCs, private Storage, scheduler execution, QR bitmaps and optical camera scanning remain unverified. The manuals explain incomplete workflows and list the exact remaining staging captures. Word automation was unavailable; DOCX structure, embedded images/relationships and page fields were validated, and PDFs were independently loaded/rendered by Windows PDFium.

Supporting files:

- Matching `.md` and `.html` files contain the editable manual text and print sources.
- `screenshots/` contains 42 genuine PNG captures; [capture manifest](screenshot-manifest.json) records roles, routes and image hashes.
- [Original validation report](validation-report.json) records the 12 October document structure, media counts, PDF pages and tracked-file hashes. Current outputs are described in document-build.json and pdf-build.json.
- `source/` contains documentation-only capture, build, print and validation scripts plus actual PDF-page previews. It does not participate in the application runtime.

Local regeneration, after reviewing any source changes:

```powershell
node documentation\user-manuals\source\capture.cjs
node documentation\user-manuals\source\build.cjs
node documentation\user-manuals\source\render-pdf.cjs
```

For structural/PDF validation without changing Windows execution-policy settings:

```powershell
$documentationValidationSource = Get-Content -LiteralPath 'documentation\user-manuals\source\validate.ps1' -Raw -Encoding UTF8
& ([scriptblock]::Create($documentationValidationSource)) -DocumentationScriptRoot (Resolve-Path -LiteralPath 'documentation\user-manuals\source').Path
```

The capture uses the existing PGlite test dependency and installed Chrome, initializes disposable in-memory records and a new temporary browser profile, and denies business writes from its browser. No network connection to production or reuse of existing browser sessions is needed.
