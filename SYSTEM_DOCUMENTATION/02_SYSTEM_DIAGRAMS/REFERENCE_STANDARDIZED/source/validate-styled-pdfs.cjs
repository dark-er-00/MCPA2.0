/* Independently inspect the final exported PDFs. Does not modify flowcharts or exports. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const workspace = path.resolve(__dirname, '../../../..');
const canvas = require(path.join(workspace, 'tests/node_modules/@napi-rs/canvas'));
Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, ImageData: canvas.ImageData, Path2D: canvas.Path2D });
const destination = path.join(root, 'validation/manual-style-pdf-review');
const manifestFile = path.join(root, 'validation/Manual_Style_Manifest.json');
const safeName = value => String(value).replace(/[^a-zA-Z0-9._-]+/g, '_');

function locatePdf(entry) {
  const explicit = entry.pdf || entry.pdfPath;
  if (explicit) return path.resolve(root, explicit);
  const folder = path.resolve(root, entry.folder || '');
  if (/\.pdf$/i.test(folder)) return folder;
  const expected = path.join(folder, entry.id + '.pdf');
  if (fs.existsSync(expected)) return expected;
  const candidates = fs.existsSync(folder) ? fs.readdirSync(folder).filter(name => /\.pdf$/i.test(name)) : [];
  if (candidates.length === 1) return path.join(folder, candidates[0]);
  throw new Error('Cannot identify PDF for ' + entry.id + ': expected ' + expected);
}

function inkBounds(surface) {
  const { width, height } = surface;
  const pixels = surface.getContext('2d').getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    if (pixels[index + 3] > 0 && Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 220) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) return null;
  return { left, top, right, bottom, touchesPageEdge: left <= 0 || top <= 0 || right >= width - 1 || bottom >= height - 1 };
}

async function render(page, scale) {
  const viewport = page.getViewport({ scale });
  const surface = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = surface.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, surface.width, surface.height);
  await page.render({ canvasContext: context, viewport, canvas: surface }).promise;
  return surface;
}

function fullSamplePage(entry, count, atlas) {
  if (atlas) return null;
  if (entry.id === 'ADMIN_MAIN') return 1;
  if (entry.id === 'ADMIN_REPAIR') return Math.min(count, 2);
  if (entry.id === 'ADMIN_TOOL_PROFILE') return count;
  if (entry.id === 'ENGINEER_ARCHITECT_TRANSFER') return Math.min(count, 2);
  return null;
}

async function inspect(entry, atlas, getDocument) {
  const report = { id: entry.id, atlas, expectedPages: Number(entry.pages), expectedXX: entry.xxCount ?? null, errors: [], warnings: [], pages: [] };
  let pdf;
  try {
    report.file = locatePdf(entry);
    pdf = await getDocument({ data: new Uint8Array(fs.readFileSync(report.file)), isEvalSupported: false, useSystemFonts: true }).promise;
    report.actualPages = pdf.numPages;
    if (pdf.numPages !== Number(entry.pages)) report.errors.push(`Page count ${pdf.numPages}, expected ${entry.pages}`);
    const selected = atlas ? [...new Set([1, Math.ceil(pdf.numPages / 2), pdf.numPages])] : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
    const thumbWidth = 300, thumbHeight = 425, labelHeight = 24, gutter = 12, columns = Math.min(4, selected.length);
    const sheet = canvas.createCanvas(columns * (thumbWidth + gutter) + gutter, Math.ceil(selected.length / columns) * (thumbHeight + labelHeight + gutter) + gutter);
    const sheetContext = sheet.getContext('2d');
    sheetContext.fillStyle = '#e6e6e6'; sheetContext.fillRect(0, 0, sheet.width, sheet.height);
    let xxTotal = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const items = textContent.items.filter(item => 'str' in item && item.str.trim());
      const text = items.map(item => item.str).join(' ');
      const pageReport = { number, widthPt: viewport.width, heightPt: viewport.height, textItems: items.length, xxCount: items.filter(item => item.str.trim() === 'XX').length, endCount: items.filter(item => item.str.trim() === 'END').length, errors: [] };
      xxTotal += pageReport.xxCount;
      if (Math.abs(viewport.width - 595.276) > 1 || Math.abs(viewport.height - 841.89) > 1 || viewport.width >= viewport.height) pageReport.errors.push('Page is not A4 portrait');
      if (/\bLegal\s+portrait\b|Source[- ]verified\s+documentation/i.test(text)) pageReport.errors.push('Obsolete Legal/source-verified footer text remains');
      const datedFooter = items.filter(item => item.transform[5] < 100 && /\b(?:\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}|20\d{2}-\d{2}-\d{2})\b/i.test(item.str));
      if (datedFooter.length) pageReport.errors.push('Dated footer remains: ' + datedFooter.map(item => item.str).join(' / '));
      if (pageReport.endCount) pageReport.errors.push('END label remains');
      if (!items.length) pageReport.errors.push('Page contains no extractable text');
      const outside = items.filter(item => {
        const x = item.transform[4], y = item.transform[5], h = Math.hypot(item.transform[2], item.transform[3]);
        return x < -1 || x + item.width > viewport.width + 1 || y - h * 0.3 < -1 || y + h * 1.1 > viewport.height + 1;
      });
      if (outside.length) pageReport.errors.push('Text outside page bounds: ' + outside.map(item => item.str).join(' / '));
      const thumb = await render(page, thumbWidth / viewport.width);
      pageReport.inkBoundsThumbnail = inkBounds(thumb);
      if (!pageReport.inkBoundsThumbnail) pageReport.errors.push('Rendered page contains no visible ink');
      else if (pageReport.inkBoundsThumbnail.touchesPageEdge) pageReport.errors.push('Visible ink touches a physical page edge');
      const selectedIndex = selected.indexOf(number);
      if (selectedIndex >= 0) {
        const x = gutter + (selectedIndex % columns) * (thumbWidth + gutter), y = gutter + Math.floor(selectedIndex / columns) * (thumbHeight + labelHeight + gutter);
        sheetContext.fillStyle = '#222'; sheetContext.font = '12px Arial'; sheetContext.fillText(entry.id + ' / ' + number, x, y + 16);
        sheetContext.drawImage(thumb, x, y + labelHeight);
      }
      if (number === fullSamplePage(entry, pdf.numPages, atlas)) {
        const full = await render(page, 1.5), sample = safeName(entry.id) + '-page-' + number + '.png';
        fs.writeFileSync(path.join(destination, sample), full.toBuffer('image/png'));
        pageReport.fullSample = sample;
      }
      report.pages.push(pageReport);
      for (const error of pageReport.errors) report.errors.push(`Page ${number}: ${error}`);
      page.cleanup();
    }
    report.actualXX = xxTotal;
    if (entry.xxCount != null && xxTotal !== Number(entry.xxCount)) report.errors.push(`XX label count ${xxTotal}, expected ${entry.xxCount}`);
    report.contactSheet = safeName(entry.id) + (atlas ? '-atlas-contact.png' : '-contact.png');
    fs.writeFileSync(path.join(destination, report.contactSheet), sheet.toBuffer('image/png'));
  } catch (error) {
    report.errors.push(error.stack || String(error));
  } finally {
    if (pdf) await pdf.destroy();
  }
  report.passed = report.errors.length === 0;
  return report;
}

async function main() {
  if (!fs.existsSync(manifestFile)) throw new Error('Missing manifest: ' + manifestFile);
  fs.mkdirSync(destination, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^\uFEFF/, ''));
  const { getDocument } = await import(pathToFileURL(path.join(workspace, 'tests/node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
  const reports = [];
  for (const [entries, atlas] of [[manifest.flows || [], false], [manifest.atlases || [], true]]) for (const entry of entries) {
    const report = await inspect(entry, atlas, getDocument); reports.push(report);
    console.log(`${report.passed ? 'PASS' : 'FAIL'} ${entry.id}: ${report.actualPages ?? '?'} pages, ${report.actualXX ?? '?'} XX, ${report.errors.length} errors`);
  }
  const summary = { manifest: manifestFile, pdfs: reports.length, flowPdfs: reports.filter(report => !report.atlas).length, atlasPdfs: reports.filter(report => report.atlas).length, physicalPages: reports.reduce((sum, report) => sum + (report.actualPages || 0), 0), flowPages: reports.filter(report => !report.atlas).reduce((sum, report) => sum + (report.actualPages || 0), 0), allPassed: reports.every(report => report.passed), errorCount: reports.reduce((sum, report) => sum + report.errors.length, 0), reports };
  fs.writeFileSync(path.join(destination, 'PDF_Validation.json'), JSON.stringify(summary, null, 2));
  const lines = ['# Final PDF validation', '', `Checked ${summary.pdfs} PDFs (${summary.flowPdfs} modules and ${summary.atlasPdfs} atlases), ${summary.physicalPages} physical pages (${summary.flowPages} module pages).`, '', `Result: ${summary.allPassed ? 'PASS' : 'FAIL'}; ${summary.errorCount} errors.`, '', 'Every page is parsed and rendered independently. Checks cover expected page counts, A4 portrait geometry, old footer/END text, expected XX counts where supplied, text outside page bounds, and visible ink touching physical page edges. Module contact sheets include every page; atlas sheets show first, middle, and last pages. Four selected pages have full-size samples.', '', '| PDF | Pages | XX labels | Result |', '| --- | ---: | ---: | --- |'];
  for (const report of reports) lines.push(`| ${report.id} | ${report.actualPages ?? '?'} | ${report.actualXX ?? '?'} | ${report.passed ? 'PASS' : report.errors.join('; ').replace(/\|/g, '/')} |`);
  fs.writeFileSync(path.join(destination, 'PDF_Validation.md'), lines.join('\n') + '\n');
  console.log(JSON.stringify({ pdfs: summary.pdfs, physicalPages: summary.physicalPages, flowPages: summary.flowPages, allPassed: summary.allPassed, errorCount: summary.errorCount, output: destination }));
  if (!summary.allPassed) process.exitCode = 1;
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
