import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPreparedCabinAvailability } from '../scripts/prepared-cabin-availability.mjs';
const url='/models/r35-cabin-fine-roughness-ed88ad0e.glb';
const text='An original authored cabin, still in progress. Prepared with the vehicle so Interior opens directly when ready. Not a verified factory interior. Displays and dial faces are static illustrations.';
function fixture(o={}) {
 const requests=o.requests??[url]; const state={closed:0,clicked:0};
 const preview={isDisabled:async()=>o.disabled??false,getAttribute:async()=> 'cabin-preview-note',click:()=>state.clicked++};
 const page={locator:()=>({getAttribute:async name=>name==='data-cabin-preparation'?(o.phase??'ready'):name==='data-cabin-model-url'?(o.modelUrl??url):name==='data-cabin-entry-requested-at'?(o.entered?'123':null):null}),getByRole:role=>{assert.equal(role,'dialog');return {getByRole:(role,opts)=>{assert.equal(role,'button');assert.deepEqual(opts,{name:'Interior',exact:true});return preview;},locator:()=>({innerText:async()=>o.text??text})}},screenshot:async()=>{if(o.late)requests.push(url);if(o.error)throw o.error;}};
 return {page,cabinUrl:url,cabinRequests:requests,screenshotPath:'available.png',open:async()=>{if(o.eager)requests.push(url);},close:async()=>{state.closed++;if(o.closeRequest)requests.push(url);},state};
}
test('prepared availability preserves one exact request, disclosure and no entry',async()=>{const f=fixture();const r=await auditPreparedCabinAvailability(f);assert.equal(r.prepared,true);assert.equal(r.requestsAdded,0);assert.equal(f.state.closed,1);assert.equal(f.state.clicked,0);});
for(const [name,o] of Object.entries({unready:{phase:'loading'},wrongModel:{modelUrl:'/models/old.glb'},entered:{entered:true},disabled:{disabled:true},missing:{requests:[]},wrong:{requests:['/models/old.glb']},duplicate:{requests:[url,url]},disclosure:{text:'Original authored cabin, still in progress.'},staticDisclosure:{text:text.replace('Displays and dial faces are static illustrations.','')},eager:{eager:true},late:{late:true},closeRequest:{closeRequest:true}}))test('rejects '+name+' and closes',async()=>{const f=fixture(o);await assert.rejects(auditPreparedCabinAvailability(f));assert.equal(f.state.closed,1);assert.equal(f.state.clicked,0);});
test('preserves screenshot error and closes',async()=>{const error=new Error('capture failed');const f=fixture({error});await assert.rejects(auditPreparedCabinAvailability(f),e=>e===error);assert.equal(f.state.closed,1);});

test('driver request observer sees unexpected cabin URLs added during open and close',async()=>{
 const {observeCabinRequests}=await import('../scripts/prepared-cabin-availability.mjs');
 for(const phase of ['open','close']) {
  let listener;const observed=observeCabinRequests({on:(event,callback)=>{assert.equal(event,'request');listener=callback;}});
  const emit=path=>listener({url:()=> 'https://example.test'+path});
  emit('/models/r35-exterior-cabin-proxy-49d7c2ab.glb');emit(url);assert.deepEqual(observed,[url]);
  const f=fixture({requests:observed});const old=f[phase];f[phase]=async(...args)=>{await old(...args);emit('/models/r35-cabin-unexpected.glb');};
  await assert.rejects(auditPreparedCabinAvailability(f));assert.equal(f.state.closed,1);assert.deepEqual(observed,[url,'/models/r35-cabin-unexpected.glb']);
 }
});

test('rejects cached model identity changing during close without a request',async()=>{const o={};const f=fixture(o);const close=f.close;f.close=async()=>{await close();o.modelUrl='/models/r35-cabin-other.glb';};await assert.rejects(auditPreparedCabinAvailability(f),/model identity/);assert.deepEqual(f.cabinRequests,[url]);assert.equal(f.state.closed,1);});
