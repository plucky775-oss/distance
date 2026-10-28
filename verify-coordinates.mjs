import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {parseMatrix,parseCSV,clean,coordinateSummary,coordinateStatus,mapPointGroups,exportRecords} from './dist/core.js';
import {addressKey} from './dist/address-review.js';
const require=createRequire(import.meta.url),ExcelJS=require('./dist/vendor/exceljs.min.js');
const source=fs.readFileSync('dist/app.js','utf8');
const part=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const matrix=[['출발지','도착지'],...Array.from({length:200},(_,i)=>['안산시청',`목적지 ${i+1}`])];
const rows=parseMatrix(matrix),elements={},calls=[],routes=[],notices=[];
const c={rows,coordinateSummary,addressKey,config:{maxRows:200},downloads:{clear(){}},busy:false,stopRequested:false,
 notify:m=>notices.push(m),render(){},setBusy:v=>c.busy=v,$:id=>elements[id]??={},
 searchEndpoint:async(r,k)=>{calls.push(r[k].address);const p={lat:37.3+(k==='origin'?0:r.id/10000),lng:126.83,label:r[k].address,source:'주소검색'};Object.assign(r[k],{point:p,candidates:[p],searched:true,confirmed:false});return true;},
 routeRow:async r=>{routes.push(r.id);r.route={distance:100};r.status='done';}};
vm.createContext(c);vm.runInContext(part('async function runBatch(', 'async function searchOne('),c);
await c.runBatch(false);
assert.equal(calls.length,201);assert.equal(routes.length,0);assert.ok(rows.every(r=>r.status==='located'&&!r.route));
assert.equal(c.showAllPoints,true);assert.deepEqual(coordinateSummary(rows),{total:400,located:400,failed:0});
assert.equal(mapPointGroups(rows).length,201);assert.equal(mapPointGroups(rows)[0].refs.length,200);
assert.match(coordinateStatus(rows[0].origin),/위치 확인 필요/);
await c.runBatch(false);assert.equal(calls.length,201);assert.equal(routes.length,0);
await c.runBatch();assert.equal(routes.length,200);assert.equal(calls.length,201);
await c.runBatch(false);assert.equal(routes.length,200);assert.ok(rows.every(r=>r.route));

// Partial failures keep the successful endpoint, export blank coordinates, and
// never fabricate a point from a street/locality center or calculate a route.
c.rows=parseMatrix([['출발지','도착지'],['안산시청','없는 주소'],['안산시청','다른 주소']]);
const search=c.searchEndpoint;c.searchEndpoint=async(r,k)=>{if(k==='destination'){r[k].searched=true;return false;}return search(r,k);};
await c.runBatch(false);assert.equal(routes.length,200);assert.equal(coordinateSummary(c.rows).located,2);assert.equal(coordinateSummary(c.rows).failed,2);
const records=exportRecords(c.rows);assert.equal(records[0].도착위도,'');assert.match(records[0].도착위치상태,/변환 실패/);assert.equal(records[0]['편도도로거리(km)'],'');
c.rows[0].destination.point={lat:37.31,lng:126.84,requiresMapSelection:true};assert.equal(mapPointGroups(c.rows).length,1);

// CSV and XLSX uploads actually trigger geocoding only after the file has been
// parsed and the busy state has ended. Existing coordinates are preserved.
const ui={},downloads=[],batchArgs=[];
const u={config:{maxRows:200},rows:[],busy:false,parseMatrix,parseCSV,clean,TextDecoder,ExcelJS,Blob,window:{ExcelJS},Date,
 exportRecords,notify:m=>notices.push(m),render(){},cancelPin(){},downloads:{clear(){}},setBusy:v=>u.busy=v,
 $:id=>ui[id]??={remove(){}},runBatch:async arg=>{assert.equal(u.busy,false);batchArgs.push(arg);},
 downloadBlob:(blob,name)=>downloads.push({blob,name})};
vm.createContext(u);vm.runInContext(part('function loadMatrix(', 'function downloadBlob('),u);
const csv=new TextEncoder().encode('출발지,도착지,출발위도,출발경도\n안산시청,상록구청,37.32,126.83');
await u.importFile({name:'coords.csv',size:csv.length,arrayBuffer:async()=>csv.buffer});
assert.deepEqual(batchArgs,[false]);assert.equal(u.rows[0].origin.point.lat,37.32);assert.equal(u.rows[0].origin.confirmed,true);
const input=new ExcelJS.Workbook();input.addWorksheet('주소').addRows(matrix);const bytes=await input.xlsx.writeBuffer();
await u.importFile({name:'coords.xlsx',size:bytes.length,arrayBuffer:async()=>bytes});
assert.deepEqual(batchArgs,[false,false]);assert.equal(u.rows.length,200);
await u.importFile({name:'bad.csv',size:5,arrayBuffer:async()=>new TextEncoder().encode('bad').buffer});
assert.equal(batchArgs.length,2);assert.equal(u.busy,false);

// The dedicated coordinate export works without map tiles or route calculation.
u.rows=rows;rows.forEach(r=>{r.route=null;r.status='located';});
await u.saveCoordinates();assert.equal(u.busy,false);assert.equal(downloads.length,1);assert.match(downloads[0].name,/주소좌표.*xlsx$/);
const output=new ExcelJS.Workbook();await output.xlsx.load(await downloads[0].blob.arrayBuffer());const sheet=output.worksheets[0];
assert.equal(sheet.rowCount,201);assert.equal(sheet.getCell('A1').value,'번호');assert.equal(sheet.getCell('A201').value,200);
const headers=sheet.getRow(1).values;const lat=headers.indexOf('출발위도'),lng=headers.indexOf('출발경도');
assert.equal(sheet.getRow(2).getCell(lat).value,37.3);assert.equal(sheet.getRow(2).getCell(lng).value,126.83);
assert.equal(sheet.getImages().length,0);assert.match(notices.at(-1),/좌표 엑셀/);
const exported=[];sheet.eachRow({includeEmpty:true},row=>exported.push(row.values.slice(1)));
const reloaded=parseMatrix(exported);assert.equal(reloaded.length,200);assert.ok(reloaded.every(r=>r.origin.point&&r.destination.point));
assert.equal(coordinateSummary(reloaded).located,400);
console.log('Coordinates: 200 rows / 400 pins, deduplicated searches, no routing during geocoding, failure blanks, CSV/XLSX auto-start, numbered export round-trip, preserved input coordinates passed.');
