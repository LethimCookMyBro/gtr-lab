/** Actual screenshot pixels only. No new screenshot, browser readback, provider
 * signal, response replacement or playback claim is made by this assessment. */
import assert from 'node:assert/strict';
export const posterRegion = Object.freeze({left:.12,top:.20,right:.88,bottom:.65,columns:48,rows:27});
export function heroPixelStatistics(png,{poster,overlays=[]}) {
  assert.ok(png.width>0&&png.height>0&&png.data.length===png.width*png.height*4,'Decoded original PNG required');
  assert.ok(poster&&[poster.x,poster.y,poster.width,poster.height].every(Number.isFinite)&&poster.width>0&&poster.height>0,'Actual image rectangle required');
  const luminances=[],colors=[];let excluded=0;
  for(let row=0;row<posterRegion.rows;row++)for(let column=0;column<posterRegion.columns;column++) {
    const x=Math.floor(poster.x+poster.width*(posterRegion.left+(column+.5)/posterRegion.columns*(posterRegion.right-posterRegion.left)));
    const y=Math.floor(poster.y+poster.height*(posterRegion.top+(row+.5)/posterRegion.rows*(posterRegion.bottom-posterRegion.top)));
    if(x<0||y<0||x>=png.width||y>=png.height||overlays.some(rect=>x>=rect.x&&x<rect.x+rect.width&&y>=rect.y&&y<rect.y+rect.height)){excluded++;continue;}
    const offset=(y*png.width+x)*4,r=png.data[offset]/255,g=png.data[offset+1]/255,b=png.data[offset+2]/255;
    luminances.push(.2126*r+.7152*g+.0722*b);colors.push(Math.max(r,g,b)-Math.min(r,g,b));
  }
  assert.ok(luminances.length>=144,'At least a quarter of the source-grounded region must remain visible outside real controls/text');
  const mean=luminances.reduce((sum,value)=>sum+value,0)/luminances.length,sorted=[...luminances].sort((a,b)=>a-b),quantile=p=>sorted[Math.floor((sorted.length-1)*p)];
  return {sampled:luminances.length,excluded,mean,stddev:Math.sqrt(luminances.reduce((sum,value)=>sum+(value-mean)**2,0)/luminances.length),p05:quantile(.05),p50:quantile(.5),p95:quantile(.95),brightFraction:luminances.filter(value=>value>.10).length/luminances.length,colorFraction:colors.filter(value=>value>.08).length/colors.length};
}
export function assessHeroPixels(png,geometry,reference) {
  const observed=heroPixelStatistics(png,geometry);
  assert.match(reference.sourceSha256??'',/^[a-f0-9]{64}$/,'Verified exact source poster calibration required');
  const source=reference.statistics;assert.ok(source.stddev>0&&source.p95>source.p05&&source.brightFraction>0);
  // Deliberately permissive compared with the unchanged real photograph: this
  // rejects a blank backing while tolerating shade and genuine provider imagery.
  // It does not assert pixel identity with the poster or a presented video frame.
  const minimum={stddev:Math.max(.012,source.stddev*.10),range:Math.max(.06,(source.p95-source.p05)*.10),brightFraction:Math.max(.04,source.brightFraction*.10)};
  const passed=observed.stddev>=minimum.stddev&&observed.p95-observed.p05>=minimum.range&&observed.brightFraction>=minimum.brightFraction;
  return {passed,observed,minimum,region:posterRegion,geometry,sourceSha256:reference.sourceSha256,scope:'Nonblank image content in actual PNG outside measured text/controls. Not poster pixel identity, provider playback or first-frame proof.'};
}
export function observeHeroPixelGeometry() {
  const poster=document.querySelector('.home-film--hero .home-film-backup');if(!poster)throw new Error('Real hero photograph missing');
  const rect=element=>{const box=element.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height};};
  const overlays=[...document.querySelectorAll('.home-header,.home-hero-copy,.home-film--hero .home-film-controls,.home-film--hero .home-film-entry,.home-menu-dialog[open],.home-loading-gate[open]')].filter(element=>{const css=getComputedStyle(element);return css.display!=='none'&&css.visibility!=='hidden'&&Number(css.opacity)>0;}).map(rect);
  return {poster:rect(poster),overlays,naturalWidth:poster.naturalWidth,naturalHeight:poster.naturalHeight,source:poster.currentSrc};
}
