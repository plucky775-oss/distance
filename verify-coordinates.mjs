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
await c.runBatch();
assert.equal(calls.length,201);assert.equal(routes.length,200);assert.ok(rows.every(r=>r.status==='done'&&r.route));
assert.deepEqual(coordinateSummary(rows),{total:400,located:400,failed:0});
assert.equal(mapPointGroups(rows).length,201);assert.equal(mapPointGroups(rows)[0].refs.length,200);
assert.match(coordinateStatus(rows[0].origin),/위치 확인 필요/);
await c.runBatch();assert.equal(calls.length,201);assert.equal(routes.length,200);
await c.runBatch();assert.equal(routes.length,200);assert.equal(calls.length,201);
await c.runBatch();assert.equal(routes.length,200);assert.ok(rows.every(r=>r.route));

// Partial failures keep successful endpoints internally, export blank distances, and
// never fabricate a point from a street/locality center or calculate a route.
c.rows=parseMatrix([['출발지','도착지'],['안산시청','없는 주소'],['안산시청','다른 주소']]);
const search=c.searchEndpoint;c.searchEndpoint=async(r,k)=>{if(k==='destination'){r[k].searched=true;return false;}return search(r,k);};
await c.runBatch();assert.equal(routes.length,200);assert.equal(coordinateSummary(c.rows).located,2);assert.equal(coordinateSummary(c.rows).failed,2);
const records=exportRecords(c.rows);assert.ok(!('도착위도' in records[0]));assert.match(records[0].도착위치상태,/검색 실패/);assert.equal(records[0]['편도도로거리(km)'],'');
c.rows[0].destination.point={lat:37.31,lng:126.84,requiresMapSelection:true};assert.equal(mapPointGroups(c.rows).length,1);

// CSV and XLSX uploads trigger search AND routing after the file has been
// parsed and the busy state has ended. Existing coordinates are preserved.
const ui={},downloads=[],batchArgs=[];
const u={config:{maxRows:200},rows:[],busy:false,parseMatrix,parseCSV,clean,TextDecoder,ExcelJS,Blob,window:{ExcelJS},Date,
 exportRecords,notify:m=>notices.push(m),render(){},cancelPin(){},downloads:{clear(){}},setBusy:v=>u.busy=v,
 $:id=>ui[id]??={remove(){}},runBatch:async arg=>{assert.equal(u.busy,false);batchArgs.push(arg);},
 downloadBlob:(blob,name)=>downloads.push({blob,name})};
vm.createContext(u);vm.runInContext(part('function loadMatrix(', 'function downloadBlob('),u);
const csv=new TextEncoder().encode('출발지,도착지,출발위도,출발경도\n안산시청,상록구청,37.32,126.83');
await u.importFile({name:'coords.csv',size:csv.length,arrayBuffer:async()=>csv.buffer});
assert.deepEqual(batchArgs,[undefined]);assert.equal(u.rows[0].origin.point.lat,37.32);assert.equal(u.rows[0].origin.confirmed,true);
const input=new ExcelJS.Workbook();input.addWorksheet('주소').addRows(matrix);const bytes=await input.xlsx.writeBuffer();
await u.importFile({name:'coords.xlsx',size:bytes.length,arrayBuffer:async()=>bytes});
assert.deepEqual(batchArgs,[undefined,undefined]);assert.equal(u.rows.length,200);
await u.importFile({name:'bad.csv',size:5,arrayBuffer:async()=>new TextEncoder().encode('bad').buffer});
assert.equal(batchArgs.length,2);assert.equal(u.busy,false);

// No separate coordinate workflow in UI, messages or exported Excel.
const html=fs.readFileSync('dist/index.html','utf8');
assert.doesNotMatch(html,/coordinate-export-btn|geocode-btn|all-points-btn|좌표|위도|경도/);
assert.doesNotMatch(source,/saveCoordinates|showAllPoints|runBatch\(false\)|좌표/);
assert.match(html,/전체 새주소 검색·거리 계산/);
assert.match(source,/await runBatch\(\)/);
const data=exportRecords(rows);
assert.ok(Object.keys(data[0]).every(k=>!/위도|경도|좌표/.test(k)));
rows[0].origin.roadAddress='경기도 안산시 단원구 시험로 10';
rows[0].destination.roadAddress='경기도 시흥시 시험로 20';
await u.saveWorkbook(exportRecords(rows),'address-results.xlsx');
const output=new ExcelJS.Workbook();await output.xlsx.load(await downloads[0].blob.arrayBuffer());
const sheet=output.worksheets[0],headers=sheet.getRow(1).values;
assert.equal(sheet.rowCount,201);assert.equal(sheet.getCell('A1').value,'번호');assert.equal(sheet.getCell('A201').value,200);
assert.equal(sheet.getRow(2).getCell(headers.indexOf('출발지')).value,'안산시청');
assert.equal(sheet.getRow(2).getCell(headers.indexOf('출발도로명주소')).value,'경기도 안산시 단원구 시험로 10');
assert.equal(sheet.getRow(2).getCell(headers.indexOf('편도도로거리(km)')).value,.1);
assert.ok(headers.every(h=>!/위도|경도|좌표/.test(h)));
const exported=[];sheet.eachRow({includeEmpty:true},row=>exported.push(row.values.slice(1)));
const reloaded=parseMatrix(exported);assert.equal(reloaded.length,200);
assert.equal(reloaded[0].origin.roadAddress,'경기도 안산시 단원구 시험로 10');
assert.ok(reloaded.every(r=>!r.origin.point&&!r.destination.point));
console.log('Road-only workflow: 200-row one-pass search+routing, deduplicated searches, CSV/XLSX auto-start, partial failures, internal input compatibility, no coordinate UI/Excel, original + road address and distance export passed.');
