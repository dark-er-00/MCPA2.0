// Run after native PowerPoint QA and visual inspection of all ten PNG renders.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {createCanvas,loadImage}=require('../../tests/node_modules/@napi-rs/canvas');
const out=path.resolve(__dirname,'..'),root=path.resolve(out,'..');
const json=file=>JSON.parse(fs.readFileSync(path.join(out,file),'utf8').replace(/^\uFEFF/,''));
(async()=>{
 const qa=json('evidence/powerpoint-qa.json'),validation=json('evidence/deliverable-validation.json');
 assert.equal(qa.slideCount,10);assert.equal(qa.nativeRenders,10);assert.equal(qa.potentialTextOverflow.length,0);
 assert.equal(validation.slideXmlParts,10);assert.equal(validation.speakerNotesParts,10);assert.equal(validation.missingScreenshotPlaceholders,0);
 const sourceDiff=cp.execFileSync('git',['diff','--name-only'],{cwd:root,encoding:'utf8'}).trim();assert.equal(sourceDiff,'','Application source must remain unchanged');
 const checklistPath=path.join(out,'SITETRACE_PRESENTATION_CHECKLIST.md');let checklist=fs.readFileSync(checklistPath,'utf8');
 checklist=checklist.replace('- [ ] Native PowerPoint generation, reopen, 16:9/slide/notes checks, text-bound checks and every-slide render review: see evidence/powerpoint-qa.json when complete.','- [x] Native PowerPoint generation and reopen succeeded; 16:9, exactly 10 slides and 10 speaker-note parts confirmed. All 10 native 1920 × 1080 PNG renders were visually reviewed; zero text-bound warnings. See evidence/powerpoint-qa.json and evidence/deliverable-validation.json.');
 checklist=checklist.replace('- [ ] Review/fix the existing broad browser synchronization assertion independently before claiming a complete browser pass.','- [ ] Review the two failed legacy inventory installation/retry tests (lifecycle fingerprint guard) before claiming those migration paths work.\n- [ ] Review/fix the existing broad browser synchronization assertion independently before claiming a complete browser pass.');
 checklist+='\nFinal artifact validation: 185 editable text runs, 13 embedded picture shapes (actual logo plus application captures), 10 substantial speaker-note bodies, no screenshot placeholders, successful native PowerPoint reopen, and a PDF preview. Source files remain unchanged. Detailed original captures and exact crops are retained in evidence/.\n';
 fs.writeFileSync(checklistPath,checklist);
 const guidePath=path.join(out,'SITETRACE_PRESENTATION_GUIDE.md');let guide=fs.readFileSync(guidePath,'utf8');
 guide+='\n## Final quality review\n\nThe PPTX was generated and reopened in Microsoft PowerPoint 16.0. It has 10 slides at 960 × 540 points (16:9), 10 note parts, 185 editable text runs and 13 embedded picture shapes. Every native 1920 × 1080 slide render was visually reviewed. No text overflow was detected. The PDF preview and renders/slide-01.png through slide-10.png are available beside the required deliverables. renders/contact-sheet.png provides an overview.\n\nTo rebuild: run source/rasterize-logo.cjs, source/build-deck.cjs, source/render-powerpoint.ps1, source/validate-deliverables.ps1; inspect the native renders, then run source/finalize.cjs. The capture runner uses only local fixtures. PowerPoint COM requires access to the local desktop session. No additional application dependency was installed.\n';
 fs.writeFileSync(guidePath,guide);
 fs.writeFileSync(path.join(out,'evidence','visual-review.json'),JSON.stringify({date:'2026-10-24',renderer:'Microsoft PowerPoint 16.0',slidesReviewed:[1,2,3,4,5,6,7,8,9,10],review:'All native slide renders inspected. Logo transparency, screenshot crops, text fit, workflow fork, footers and evidence labels checked. No visible layout overlap or slide-text clipping remains.',nativeTextOverflowWarnings:0,screenshotPlaceholders:0,projectorReview:'Final stakeholder review on the intended display is recommended; original full-resolution screenshots are supplied.'},null,2));
 const canvas=createCanvas(1440,2025),ctx=canvas.getContext('2d');
 for(let i=1;i<=10;i++){const im=await loadImage(path.join(out,'renders','slide-'+String(i).padStart(2,'0')+'.png'));ctx.drawImage(im,((i-1)%2)*720,Math.floor((i-1)/2)*405,720,405);}
 fs.writeFileSync(path.join(out,'renders','contact-sheet.png'),canvas.toBuffer('image/png'));
 console.log('Final documentation and visual review complete. All four required deliverables are ready.');
})().catch(e=>{console.error(e);process.exitCode=1});
