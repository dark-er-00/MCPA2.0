# Manual PDF reference review

Rendered and visually inspected all six supplied PDF references. The source PDFs were read only.

| Reference | Pages |
| --- | ---: |
| 00_Main.drawio.pdf | 6 |
| 01_Authentication.drawio.pdf | 12 |
| 02_Masterlist.drawio.pdf | 14 |
| 03_Tool Profile.drawio.pdf | 5 |
| 04_Request.drawio.pdf | 15 |
| 05_Transfer.drawio.pdf | 6 |

All 58 PDF pages measure 594.95996 × 841.91998 points, consistent with A4 portrait. Every diagram is contained on one physical sheet; several short continuation pages intentionally leave substantial white space below.

The references use black outlines, white fills, sans serif text, centered shape labels, and a three-line header at upper left: system/role, module title, then page number and action title. There are no bottom footers. Circular reentry connectors sit to the left of the flow spine and point horizontally into it. Circular outgoing connectors sit directly below the corresponding response shapes. Main page 1 still contains an END oval beside an added XX example; Tool Profile page 5 still contains an END oval. The user's request explicitly supersedes those leftover END shapes.

Transfer page 2 has the clearest complete example of the desired action layout. Its body shapes use about 10.77-point text, with a long response reduced to 10.06 points. Yes/No labels measure 7.90 points. Connector IDs measure 9.34 points. Header text measures 7.90 points, title 15.08 points, and page subtitle 7.18 points. Side continuation descriptions measure 6.46 points, and small destination references measure 2.87 points. Those tiny destination labels are visibly much less readable than body text at actual A4 size; body text remains legible. Action selector pages use body text around 7.90 points.

The six contact sheets document every page. Full-page PNGs of Main page 1 and Transfer page 2 were rendered at 1.5× PDF scale. `reference-metadata.json` records each page's dimensions, extracted text, and font statistics. `inspect-pdf.cjs` regenerates these review artifacts using the repository's existing PDF.js and canvas packages.
