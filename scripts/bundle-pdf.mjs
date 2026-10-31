// Run after npm ci in scripts/. Only development needs external downloads.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const target = new URL('../vendor/pdf/', import.meta.url);
const revision = 'ffebf8c1ee449e544955a7e813c54f9b73848eac';
const fontSource = `https://raw.githubusercontent.com/notofonts/noto-fonts/${revision}/`;
await fs.mkdir(target, {recursive:true});
const hashes = {};
async function save(name, bytes) {
  await fs.writeFile(new URL(name,target),bytes);
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
}
for (const [source,destination] of [
  ['jspdf/dist/jspdf.umd.min.js','jspdf.umd.min.js'],
  ['jspdf/LICENSE','LICENSE-jspdf.txt'],
  ['jspdf-autotable/dist/jspdf.plugin.autotable.min.js','jspdf.plugin.autotable.min.js'],
  ['jspdf-autotable/LICENSE.txt','LICENSE-autotable.txt']
]) await save(destination,await fs.readFile(new URL('node_modules/'+source,import.meta.url)));
const fonts = {};
for (const [style,file] of [['normal','NotoSans-Regular.ttf'],['bold','NotoSans-Bold.ttf']]) {
  const response = await fetch(fontSource+'hinted/ttf/NotoSans/'+file);
  if(!response.ok)throw Error('Font download failed: '+response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  hashes[file] = createHash('sha256').update(bytes).digest('hex');
  fonts[style] = bytes.toString('base64');
}
await save('noto-sans.js','/* Noto Sans, SIL Open Font License 1.1. See LICENSE-NotoSans.txt. */\nwindow.SiteTracePDFFonts = '+JSON.stringify(fonts)+';\n');
const license=await fetch(fontSource+'LICENSE');
if(!license.ok)throw Error('Font license download failed');
await save('LICENSE-NotoSans.txt',await license.text());
await fs.writeFile(new URL('manifest.json',target),JSON.stringify({jspdf:'4.2.1',autotable:'5.0.8',notoRevision:revision,sha256:hashes},null,2)+'\n');
console.log('Bundled pinned PDF libraries, fonts, licenses and SHA-256 manifest.');
