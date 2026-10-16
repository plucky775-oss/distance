import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('async function exportWithMaps('),source.indexOf('function bindEvents()'));
function fixture(n){
 const elements={},captured=[],saved=[],messages=[];
 const c={rows:Array.from({length:n},(_,i)=>({id:i+1,route:{distance:100}})),selectedId:1,busy:false,exporting:false,capturing:false,stopRequested:false,ExcelJS:{},Blob,Date,
 $:id=>elements[id]??={},notify:m=>messages.push(m),render:()=>{},renderList:()=>{},setBusy:v=>{c.busy=v;},downloads:{clear:()=>{}},hasMapImage:r=>!!r.mapImage,
 delay:async()=>{assert.equal(c.busy,true);},prepareMap:async r=>{assert.equal(c.busy,true);assert.equal(c.selectedId,r.id);captured.push(r.id);r.mapImage={};},
 createResultWorkbook:(_,rows)=>{assert.ok(rows.every(r=>!r.route||r.mapImage));return {xlsx:{writeBuffer:async()=>new Uint8Array([1,2])}};},
 createResultPackage:()=>new Blob(['zip']),downloadBlob:(blob,name)=>saved.push({blob,name})};
 vm.createContext(c);vm.runInContext(fn,c);return {c,captured,saved,elements,messages};
}
let f=fixture(200);await f.c.exportWithMaps('zip');assert.equal(f.captured.length,200);assert.equal(f.saved.length,1);assert.match(f.saved[0].name,/zip$/);assert.equal(f.c.busy,false);assert.equal(f.c.selectedId,1);assert.equal(f.elements.progress.value,100);
await f.c.exportWithMaps();assert.equal(f.captured.length,200);assert.equal(f.saved.length,2);assert.match(f.saved[1].name,/xlsx$/);
f=fixture(5);const capture=f.c.prepareMap;f.c.prepareMap=async r=>{if(r.id===3)throw Error('tile failure');await capture(r);};await f.c.exportWithMaps();assert.equal(f.saved.length,0);assert.equal(f.captured.length,2);assert.equal(f.c.busy,false);assert.match(f.messages.at(-1),/구간 3/);f.c.prepareMap=capture;await f.c.exportWithMaps();assert.equal(f.captured.length,5);assert.equal(f.saved.length,1);
f=fixture(5);const cap=f.c.prepareMap;f.c.prepareMap=async r=>{await cap(r);if(r.id===2)f.c.stopRequested=true;};await f.c.exportWithMaps();assert.equal(f.captured.length,2);assert.equal(f.saved.length,0);assert.equal(f.c.stopRequested,false);f.c.prepareMap=cap;await f.c.exportWithMaps();assert.equal(f.saved.length,1);assert.equal(f.captured.length,5);
f=fixture(3);f.c.rows[1].route=null;f.c.rows[0].mapImage={};await f.c.exportWithMaps();assert.deepEqual(f.captured,[3]);assert.equal(f.saved.length,1);
f=fixture(2);const original=f.c.prepareMap;f.c.prepareMap=async r=>{await f.c.exportWithMaps();await original(r);};await f.c.exportWithMaps();assert.equal(f.saved.length,1);
f=fixture(2);f.c.createResultWorkbook=()=>({xlsx:{writeBuffer:async()=>{f.c.stopRequested=true;return [];}}});await f.c.exportWithMaps();assert.equal(f.saved.length,0);assert.equal(f.c.busy,false);
// Capture must keep the outer export locked, and cancellation must invalidate it.
const prep=source.slice(source.indexOf('async function prepareMap('),source.indexOf('async function saveSelectedMap('));
assert.match(prep,/setBusy\(exporting\)/);assert.match(prep,/!exporting\|\|!stopRequested/);
console.log('Export: 200 maps in one action, XLSX/ZIP, cached maps, failure/resume, stop/resume, uncalculated rows, reentry and cancellation passed.');
