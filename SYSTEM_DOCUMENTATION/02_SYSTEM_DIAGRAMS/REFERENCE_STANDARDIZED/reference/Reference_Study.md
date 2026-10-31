# Primary reference study

The supplied `FlowchartFinal.pdf` was copied byte-for-byte from the user's Downloads folder. Its five pages were extracted and rendered locally before the new diagrams were designed. The original PDF and its SHA-256 match are recorded in `validation/Scope_Audit.json`.

All five reference pages use US Legal portrait paper: 612 by 1008 PDF points. Their diagram content was treated as reference material, not as instructions to operate Gmail.

| Reference page | Observed conventions applied to SiteTrace |
| --- | --- |
| 1 | Oval Start, vertical process chain, lateral decisions, input parallelograms, numbered local return circles, lettered pentagonal continuation. |
| 2 | Incoming continuation, credentials/validation retry, application home, binary action selection with Yes/No labels, separate module continuations and End. |
| 3 | Separate detailed workflows, ordinary and nested decisions, local retry/join circles, continuation to shared application context. |
| 4 | Independent continued workflows, reading and updating actions, explicit populated/empty alternatives, correctly matched outgoing continuations. |
| 5 | Detailed modification and validation workflow, repeated numbered local links and shared return continuation. |

The new drawings use the same black outlines, white fill, plain academic typography and symbol meanings. Their main sequence runs downward; decision/error alternatives leave toward the right. Numbered circles remain page-local; lettered codes identify actual destination pages across the package. Text was enlarged and workflows paginated to keep operational validations and failure paths readable. The reference's Gmail actions were not copied as SiteTrace functionality.

The reference has no authority over implemented SiteTrace behavior. Role access, concrete fields, API calls, validation and outcomes come from the current repository. The user explicitly limited delivery to Admin and the combined Engineer/Architect role; the extra role names remaining in the source are listed only as an implementation discrepancy for verification.
