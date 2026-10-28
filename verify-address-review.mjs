import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseMatrix,escapeHtml,coordinateSummary} from './dist/core.js';
import {addressKey,needsLocation,pendingAddresses,matchingEndpoints,applyManualPoint} from './dist/address-review.js';

assert.equal(addressKey('단원구  고잔동 518'),'안산시 단원구 고잔동 518');
assert.equal(addressKey('경기 안산시 단원구 고잔동 518'),addressKey('단원구 고잔동 518'));
assert.equal(addressKey('정왕동 1351 - 1번지'),addressKey('경기도 시흥시 정왕동 1351-1'));
assert.notEqual(addressKey('정왕동 1351'),addressKey('정왕동 1351-1'));
assert.notEqual(addressKey('정왕동 산 1351'),addressKey('정왕동 1351'));
assert.notEqual(addressKey('서울시 고잔동 518'),addressKey('단원구 고잔동 518'));
assert.notEqual(addressKey('상록구 고잔동 518'),addressKey('단원구 고잔동 518'));
assert.equal(addressKey('지도에서 지정한 출발지'),'');
assert.equal(addressKey('대부북동 1'),'');
assert.equal(addressKey('정왕동'),'');assert.equal(addressKey('안산시 단원구 화랑로'),'');
const rows=parseMatrix([['출발지','도착지'],...Array.from({length:200},(_,i)=>[
 i%2?'경기도 안산시 단원구 고잔동 518':'단원구 고잔동 518',
 i===199?'시흥시 정왕동 1351-1':'시흥시 정왕동 1351'
])]);
assert.equal(pendingAddresses(rows).length,3);
assert.equal(matchingEndpoints(rows,'단원구 고잔동 518').length,200);
for(const r of rows){r.route={distance:111};r.mapImage={old:true};}
let changed=applyManualPoint(rows,1,'origin',{lat:37.32,lng:126.83});
assert.equal(changed.applied,200);assert.equal(changed.changed.length,200);
assert.ok(rows.every(r=>r.origin.confirmed&&r.route===null&&r.mapImage===null));
assert.ok(rows.every(r=>r.destination.point===null));
assert.equal(pendingAddresses(rows).length,2);
assert.notEqual(rows[0].origin.point,rows[1].origin.point);
changed=applyManualPoint(rows,1,'destination',{lat:37.34,lng:126.71});
assert.equal(changed.applied,199);assert.equal(rows[199].destination.point,null);
assert.equal(pendingAddresses(rows).length,1);
changed=applyManualPoint(rows,2,'origin',{lat:37.321,lng:126.831});
assert.equal(changed.applied,200);assert.ok(rows.every(r=>r.origin.point.lat===37.321));

// Independently confirmed Excel/user pins cannot be silently overwritten.
rows[2].origin.point={lat:37.33,lng:126.84,source:'엑셀 좌표'};
rows[3].origin.point={lat:37.34,lng:126.85,source:'지도 지정'};
changed=applyManualPoint(rows,1,'origin',{lat:37.322,lng:126.832});
assert.equal(changed.applied,198);assert.equal(changed.protectedCount,2);
assert.equal(rows[2].origin.point.lat,37.33);assert.equal(rows[3].origin.point.lat,37.34);
changed=applyManualPoint(rows,1,'origin',{lat:37.323,lng:126.833},{share:false});
assert.equal(changed.applied,1);assert.equal(rows[1].origin.point.lat,37.322);
assert.throws(()=>applyManualPoint(rows,1,'origin',{lat:38,lng:127}),/지도 범위/);
assert.throws(()=>applyManualPoint(rows,1,'bad',{lat:37.32,lng:126.83}),/구간/);
assert.equal(needsLocation({point:{requiresMapSelection:true},confirmed:true}),true);
const blanks=parseMatrix([['출발지','도착지'],['','시흥시 정왕동 1351'],['','시흥시 정왕동 1351']]);
assert.equal(applyManualPoint(blanks,1,'origin',{lat:37.32,lng:126.83}).applied,1);
assert.equal(blanks[1].origin.point,null);

const source=fs.readFileSync('dist/app.js','utf8');
const html=fs.readFileSync('dist/index.html','utf8');
for(const id of ['address-review','review-count','review-toggle','next-review','pending-addresses'])assert.ok(html.includes(`id="${id}"`));
assert.match(source,/applyManualPoint\(rows/);assert.match(source,/downloads.clear\(\);cancelPin\(\);render\(\)/);
assert.match(source,/shareSameAddress=e.target.checked/);

// The batch only searches each unique unresolved address once, but a fresh run
// retries it. Failed requests are not mistaken for a successful empty result.
const batchRows=parseMatrix([['출발지','도착지'],...Array(200).fill(['단원구 고잔동 518','시흥시 정왕동 1351'])]);
const elements={};let requests=0;
const c={coordinateSummary,downloads:{clear(){}},addressKey,rows:batchRows,config:{},busy:false,stopRequested:false,notify(){},render(){},setBusy:v=>c.busy=v,$:id=>elements[id]??={},
 searchEndpoint:async(r,k)=>{requests++;r[k].searched=true;return false;},routeRow:async()=>{throw Error('Unverified endpoints must not route');}};
vm.createContext(c);vm.runInContext(source.slice(source.indexOf('async function runBatch('),source.indexOf('async function searchOne(')),c);
await c.runBatch();assert.equal(requests,2);assert.equal(elements.progress.value,100);assert.ok(batchRows.every(r=>!r.route));
await c.runBatch();assert.equal(requests,4);
c.searchEndpoint=async()=>{throw Error('network');};await c.runBatch();assert.ok(batchRows.every(r=>r.error==='network'));

// Group selection navigates to the right endpoint, supports next/wrap, escapes
// user address text, and ignores all actions during a calculation/export.
const uiRows=parseMatrix([['출발지','도착지'],['단원구 고잔동 518','시흥시 정왕동 1351'],['단원구 고잔동 518','<img onerror=1>']]);
const uiElements={},pins=[];
const u={rows:uiRows,selectedId:1,reviewFocusKey:'',reviewOnly:false,busy:false,pendingAddresses,esc:escapeHtml,
 $:id=>uiElements[id]??={setAttribute(){},scrollIntoView(){}},cancelPin(){},render(){},notify(){},beginPin:kind=>pins.push({id:u.selectedId,kind})};
vm.createContext(u);vm.runInContext(source.slice(source.indexOf('function renderAddressReview('),source.indexOf('function endpointEditor(')),u);
u.renderAddressReview();assert.ok(uiElements['pending-addresses'].innerHTML.includes('&lt;img'));assert.ok(!uiElements['pending-addresses'].innerHTML.includes('<img'));
u.nextPendingAddress();assert.deepEqual(pins.at(-1),{id:1,kind:'origin'});
u.nextPendingAddress();assert.deepEqual(pins.at(-1),{id:1,kind:'destination'});
u.nextPendingAddress();assert.deepEqual(pins.at(-1),{id:2,kind:'destination'});
u.nextPendingAddress();assert.deepEqual(pins.at(-1),{id:1,kind:'origin'});
u.busy=true;u.selectPendingAddress(2);assert.equal(pins.length,4);
console.log('Address review: 200-row shared corrections, exact parcel identity, protected confirmed coordinates, stale output invalidation, unique-address batching, retry, review navigation and escaped labels passed.');
