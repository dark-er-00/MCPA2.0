// Uses the existing test toolchain; originals are never overwritten or enlarged.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createCanvas, loadImage } = require('../tests/node_modules/@napi-rs/canvas');
const directory = path.resolve(__dirname, '../images/login-slideshow');
(async () => {
  let originals = 0, optimized = 0;
  const assets = [];
  // Project 10 is an existing JPEG: register it without rewriting the source
  // or manufacturing another photograph/variant.
  const featured = path.join(directory, 'project-10.jpg');
  const image = await loadImage(featured), size = fs.statSync(featured).size;
  assets.push({source:'project-10.jpg',output:'project-10.jpg',width:image.width,height:image.height,
    sourceBytes:size,outputBytes:size,sourceSha256:createHash('sha256').update(fs.readFileSync(featured)).digest('hex')});
  originals += size; optimized += size;
  for (let index = 1; index <= 9; index++) {
    const source = path.join(directory, `project-${index}.png`);
    const photo = await loadImage(source);
    const canvas = createCanvas(photo.width, photo.height);
    canvas.getContext('2d').drawImage(photo, 0, 0);
    const bytes = await canvas.encode('webp', 82);
    fs.writeFileSync(path.join(directory, `project-${index}.webp`), bytes);
    originals += fs.statSync(source).size;
    optimized += bytes.length;
    assets.push({ source: `project-${index}.png`, output: `project-${index}.webp`,
      width: photo.width, height: photo.height, sourceBytes: fs.statSync(source).size,
      outputBytes: bytes.length, sourceSha256: createHash('sha256').update(fs.readFileSync(source)).digest('hex') });
    console.log(`project-${index}: ${photo.width}x${photo.height}, ${bytes.length} bytes`);
  }
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({
    provenance: 'User-supplied cropped MCPA project photographs. Originals and embedded branding preserved; no generated imagery.',
    encoder: '@napi-rs/canvas WebP', quality: 82, assets
  }, null, 2) + '\n');
  console.log(JSON.stringify({ originals, optimized, reduction: `${(100 * (1 - optimized / originals)).toFixed(1)}%` }));
})().catch(error => { console.error(error); process.exitCode = 1; });
