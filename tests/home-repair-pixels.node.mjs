import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {heroPixelStatistics,assessHeroPixels,observeHeroPixelGeometry,assessDetailPixels,detailPoster} from '../scripts/home-repair-pixels.mjs';
import vm from 'node:vm';
import {waitForDetailPoster,createHomeShot,bounded} from '../scripts/home-repair-browser.mjs';
const reference=JSON.parse(await readFile(new URL('../qa/home-repair-pixel-fixtures/reference.json',import.meta.url),'utf8'));
const geometry={poster:{x:0,y:0,width:320,height:180},overlays:[]};
const png=(pixel)=>{const data=new Uint8Array(320*180*4);for(let y=0;y<180;y++)for(let x=0;x<320;x++)data.set([...pixel(x,y),255],(y*320+x)*4);return {width:320,height:180,data};};
test('calibration remains bound to the unchanged actual source photograph',async()=>{const bytes=await readFile(new URL('../public/media/campaign-r35-orange-hero.webp',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),reference.sourceSha256);assert.ok(reference.statistics.stddev>.2);});
test('black backing and flat color cannot pass nonblank image-content minimums',()=>{for(const color of [[7,8,9],[0,0,0],[255,120,0],[200,200,200]])assert.equal(assessHeroPixels(png(()=>color),geometry,reference).passed,false);});
test('small synthetic nonblank color-detail regression passes source-calibrated minimums',()=>{const image=png((x,y)=>[(x*17+y*7)%255,(x*9+y*13)%190,(x*3+y*11)%140]);assert.equal(assessHeroPixels(image,geometry,reference).passed,true);});
test('actual text/control rectangles are excluded from the image-content decision',()=>{const overlay={x:100,y:40,width:110,height:70};const image=png((x,y)=>x>=100&&x<210&&y>=40&&y<110?[(x*17+y*7)%255,(x*9+y*13)%190,(x*3+y*11)%140]:[7,8,9]);assert.equal(assessHeroPixels(image,geometry,reference).passed,true);assert.equal(assessHeroPixels(image,{...geometry,overlays:[overlay]},reference).passed,false);});
test('a missing/covered/out-of-bounds region fails rather than making a visible-content claim',()=>{const image=png(()=>[80,90,100]);assert.throws(()=>heroPixelStatistics(image,{poster:geometry.poster,overlays:[geometry.poster]}),/quarter/);assert.throws(()=>heroPixelStatistics(image,{poster:{x:9999,y:0,width:320,height:180}}),/quarter/);});
test('PNG assessment uses original capture, no new screenshot or provider signal',async()=>{const source=await readFile(new URL('../scripts/home-repair-browser.mjs',import.meta.url),'utf8');assert.match(source,/assessHeroPixels\(PNG.sync.read\(bytes\),heroGeometry,posterReference\)/);assert.match(source,/timeout:budgets.screenshot,animations:'allow'/);assert.match(source,/heroReentryPixels.passed,true/);assert.ok(source.indexOf('row.provider=await sampleProviderPair(page)')<source.indexOf('assert.equal(row.heroPixels.passed,true'),'A failed pixel check must preserve the existing provider observation');const helper=await readFile(new URL('../scripts/home-repair-pixels.mjs',import.meta.url),'utf8');assert.doesNotMatch(helper,/\.screenshot\(|getImageData|readPixels|fetch\(/);assert.match(helper,/Not poster pixel identity, provider playback or first-frame proof/);});

test('source-derived contain positives survive actual viewport gradient and header exclusion',async()=>{
 const calibration=JSON.parse(await readFile(new URL('../qa/home-repair-pixel-fixtures/contain-calibration.json',import.meta.url),'utf8'));assert.equal(calibration.sourceSha256,reference.sourceSha256);
 const minimum=assessHeroPixels(png((x,y)=>[(x*17+y*7)%255,(x*9+y*13)%190,(x*3+y*11)%140]),geometry,reference).minimum;
 assert.deepEqual(calibration.cases.map(row=>row.viewport.width),[320,390,820,1024,1440]);
 for(const row of calibration.cases){const stats=row.statistics;assert.equal(row.poster.height,row.viewport.width*9/16);assert.equal(row.overlays[0].height,98);assert.ok(stats.sampled>=144);assert.ok(stats.excluded>0||row.viewport.width>=1024);assert.ok(stats.stddev>=minimum.stddev);assert.ok(stats.p95-stats.p05>=minimum.range);assert.ok(stats.brightFraction>=minimum.brightFraction);assert.equal(row.passed,true);}
});

const detailGeometry={...geometry,source:'https://gtr-lab-production.up.railway.app'+detailPoster.path};
test('detail photo uses exact original source bytes and rejects blank image regions',async()=>{
 const bytes=await readFile(new URL('../public'+detailPoster.path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),detailPoster.sha256);
 for(const color of [[7,8,9],[0,0,0],[255,255,255],[200,120,40]])assert.equal(assessDetailPixels(png(()=>color),detailGeometry).passed,false);
 assert.equal(assessDetailPixels(png((x,y)=>[(x*17+y*7)%255,(x*9+y*13)%190,(x*3+y*11)%140]),detailGeometry).passed,true);
 assert.throws(()=>assessDetailPixels(png(()=>[100,100,100]),{...detailGeometry,source:'https://example.test/other.webp'}),/Exact existing local detail/);
});
test('detail text/control contrast cannot substitute for nonblank source-photo region',()=>{
 const overlay={x:100,y:40,width:110,height:70},image=png((x,y)=>x>=100&&x<210&&y>=40&&y<110?[(x*17+y*7)%255,(x*9+y*13)%190,(x*3+y*11)%140]:[7,8,9]);
 assert.equal(assessDetailPixels(image,detailGeometry).passed,true);assert.equal(assessDetailPixels(image,{...detailGeometry,overlays:[overlay]}).passed,false);
});
function detailPage({ready=true,waitMs=10,decodeMs=10,replace=false}={}){
 let time=0,decodeCalls=0,owned;const image={complete:true,naturalWidth:1600,naturalHeight:900,isConnected:true,currentSrc:detailGeometry.source,decode:async()=>{decodeCalls++;time+=decodeMs;if(replace)owned=null;}};owned=image;
 const film={getAttribute:()=>ready?'decoded':'loading',querySelector:()=>owned};const sandbox=vm.createContext({document:{querySelector:selector=>selector==='.home-film--detail'?film:owned,querySelectorAll:()=>[]},Error});
 return {page:{waitForFunction:async(fn,_arg,options)=>{assert.equal(options.timeout,5000);time+=waitMs;if(!vm.runInContext('('+fn.toString()+')()',sandbox))throw new Error('Detail poster not decoded despite provider load');},evaluate:fn=>vm.runInContext('('+fn.toString()+')()',sandbox)},now:()=>time,decodeCalls:()=>decodeCalls};
}
test('detail barrier waits for actual local decoded state and decodes the same owned image',async()=>{
 const fixture=detailPage(),result=await waitForDetailPoster(fixture);assert.equal(fixture.decodeCalls(),1);assert.equal(result.decoded.sameImage,true);assert.equal(result.window.budget,5000);assert.equal(result.window.elapsedMs,20);
 const loading=detailPage({ready:false});await assert.rejects(waitForDetailPoster(loading),/not decoded despite provider load/);assert.equal(loading.decodeCalls(),0);
 const replaced=detailPage({replace:true});await assert.rejects(waitForDetailPoster(replaced));
});
test('detail decode shares the original5s hero-unmount command window without reset',async()=>{
 const late=detailPage({waitMs:4900,decodeMs:100});await assert.rejects(waitForDetailPoster(late),/Original5000ms detail transition deadline/);assert.equal(late.now(),5000);
});
test('same existing detail PNG carries geometry, source pin and pixel check inside original45s capture',async()=>{
 const source=await readFile(new URL('../scripts/home-repair-browser.mjs',import.meta.url),'utf8');assert.match(source,/row.detailPoster=await waitForDetailPoster/);assert.match(source,/assessDetailPixels\(PNG.sync.read\(bytes\),detailGeometry\)/);assert.match(source,/detailCaptureDeadline=label==='detail-film'\?Math.min\(deadline,performance.now\(\)\+budgets.screenshot\)/);assert.match(source,/captureBudget=detailGeometry\?detailLeft\(\)/);assert.match(source,/Actual original detail poster body required/);assert.equal((source.match(/\.screenshot\(/g)||[]).length,1);
});

function detailShotFixture({saveMs=0,screenshotMs=0}={}){
 let time=0,shots=0;const row={captures:[],dist:{files:[{path:'dist'+detailPoster.path,sha256:detailPoster.sha256}]}},page={evaluate:async()=>detailGeometry,screenshot:async()=>{shots++;time+=screenshotMs;return Buffer.from('original png');}};
 const factory=vm.runInNewContext('('+createHomeShot.toString()+')',{assert,performance:{now:()=>time},budgets:{command:5000,screenshot:45000},bounded,resolve:(...parts)=>parts.join('/'),observeHeroPixelGeometry:()=>{},observeDetailPixelGeometry:()=>{},detailPoster,assessDetailPixels,assessHeroPixels,sha256:()=> 'hash'});
 const shot=factory({getPage:()=>page,row,target:{viewport:{width:320,height:180}},deadline:300000,alive:()=>{},output:'/private',save:async()=>{time+=saveMs;},PNG:{sync:{read:()=>png((x,y)=>[(x*17+y*7)%255,(x*9+y*13)%190,(x*3+y*11)%140])}},posterReference:reference,lane:'candidate'});return {shot,row,shots:()=>shots,time:()=>time};
}
test('detail geometry plus report save cannot start a screenshot after its original45s deadline',async()=>{
 const fixture=detailShotFixture({saveMs:45000});await assert.rejects(fixture.shot('detail-film'),/Original45000ms detail capture/);assert.equal(fixture.shots(),0);assert.equal(fixture.row.captures[0].sha256,undefined);assert.equal(fixture.row.captures[0].detailPixels,undefined);
});
test('a screenshot returning after45s is rejected before late bytes or pixels are accepted',async()=>{
 const fixture=detailShotFixture({screenshotMs:45001});await assert.rejects(fixture.shot('detail-film'),/Original45000ms detail capture/);assert.equal(fixture.shots(),1);assert.equal(fixture.row.captures[0].sha256,undefined);assert.equal(fixture.row.captures[0].detailPixels,undefined);
});
