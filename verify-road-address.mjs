import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {addressParts,roadCandidates,resolveRoadAddress} from './dist/road-address.js';
import {normalizeAddress,excludedAddress,photonPoints,parseMatrix,exportRecords,coordinateSummary,parseRoute} from './dist/core.js';
import {addressKey} from './dist/address-review.js';
import handler from './netlify/functions/road-address.mjs';

// Deliberately synthetic fixtures; these do not assert real parcel locations.
const parcel='단원구 고잔동 518',road='경기도 안산시 단원구 시험로 10';
const official={sggNm:'안산시 단원구',emdNm:'고잔동',liNm:'',lnbrMnnm:'518',lnbrSlno:'0',mtYn:'0',hstryYn:'0',roadAddrPart1:road,jibunAddr:'경기도 안산시 단원구 고잔동 518',bdNm:'테스트 건물'};
assert.equal(addressParts(parcel).type,'parcel');
assert.equal(addressParts('고잔동 산 518-1번지').mountain,true);
assert.equal(addressParts('경기도 안산시 단원구 시험로10 (고잔동)').query,road);
assert.equal(addressParts('단원구 원고잔로 25-1').sub,'1');
assert.equal(addressParts('안산시청').type,'place');
assert.equal(roadCandidates([official],parcel).length,1);
for(const change of [{lnbrSlno:'1'},{lnbrMnnm:'519'},{mtYn:'1'},{emdNm:'초지동'},{sggNm:'안산시 상록구'},{sggNm:'시흥시'},{hstryYn:'1'},{roadAddrPart1:'경기도 안산시 대부북동 1'}])assert.equal(roadCandidates([{...official,...change}],parcel).length,0,JSON.stringify(change));
assert.equal(roadCandidates([{...official,sggNm:'시흥시',emdNm:'정왕동',lnbrMnnm:'1351',roadAddrPart1:'경기도 시흥시 시험로 1'}],'시흥시 정왕동 1351').length,1);
assert.equal(roadCandidates([{...official,lnbrMnnm:'520',relJibun:'경기도 안산시 단원구 고잔동 518'}],parcel).length,1);
assert.equal(roadCandidates([official,official],parcel).length,1);
const two=roadCandidates([official,{...official,roadAddrPart1:road+'-1'}],parcel);
assert.equal(two.length,2);

let conversions=0;const cache=new Map(),api={roadAddressApi:'https://site.test/api/road-address'};
let response={candidates:roadCandidates([official],parcel)};
const request=async(url,options)=>{conversions++;assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).address,normalizeAddress(parcel));return response;};
let endpoint={address:parcel};assert.equal(await resolveRoadAddress(endpoint,api,request,cache),road);assert.equal(endpoint.address,parcel);
await resolveRoadAddress({address:parcel},api,request,cache);assert.equal(conversions,1);
await resolveRoadAddress(endpoint,api,request,cache,true);assert.equal(conversions,2);
assert.equal(await resolveRoadAddress({address:road},api,request,cache),road);
assert.equal(await resolveRoadAddress({address:'안산시청'},api,request,cache),'안산시청');assert.equal(conversions,2);
response={candidates:two};endpoint={address:parcel};assert.equal(await resolveRoadAddress(endpoint,api,request,cache,true),null);assert.match(endpoint.roadStatus,/선택 필요/);
endpoint.roadSelected=true;endpoint.roadAddress=two[1].roadAddress;assert.equal(await resolveRoadAddress(endpoint,api,request,cache,true),two[1].roadAddress);
response={candidates:[]};endpoint={address:parcel};assert.equal(await resolveRoadAddress(endpoint,api,request,cache,true),null);assert.equal(endpoint.roadAddress,'');

// Real server handler, fake upstream and fake key. Neither leaves this process.
const originalFetch=globalThis.fetch,previousKey=process.env.JUSO_API_KEY,previousURL=process.env.URL;
delete process.env.JUSO_API_KEY;process.env.URL='https://site.test';
const req=(address,origin='https://site.test')=>new Request('https://site.test/api/road-address',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({address})});
let upstreamCalls=0,upstreamMode='ok';
globalThis.fetch=async url=>{
 upstreamCalls++;assert.equal(url.origin,'https://www.juso.go.kr');assert.equal(url.searchParams.get('confmKey'),'FAKE_UNIT_TEST_SECRET');assert.equal(url.searchParams.get('resultType'),'json');
 if(upstreamMode==='error')throw Error('do not return FAKE_UNIT_TEST_SECRET');
 const data={results:{common:{errorCode:upstreamMode==='key'?'E0001':'0',errorMessage:'FAKE_UNIT_TEST_SECRET',totalCount:upstreamMode==='many'?'101':'1'},juso:[official]}};
 return Response.json(data);
};
try{
 let result=await handler(req(parcel));assert.equal(result.status,503);assert.match((await result.json()).message,/JUSO_API_KEY/);
 process.env.JUSO_API_KEY='FAKE_UNIT_TEST_SECRET';
 result=await handler(req(parcel));assert.equal(result.status,200);assert.equal((await result.json()).candidates[0].roadAddress,road);
 await handler(req(parcel));assert.equal(upstreamCalls,1);
 result=await handler(req(parcel,'https://localhost'));assert.equal(result.headers.get('access-control-allow-origin'),'https://localhost');
 assert.equal((await handler(req(parcel,'https://untrusted.test'))).status,403);
 assert.equal((await handler(new Request('https://site.test/api/road-address',{method:'OPTIONS',headers:{origin:'https://localhost'}}))).status,204);
 assert.equal((await handler(new Request('https://site.test/api/road-address'))).status,405);
 assert.equal((await handler(req('대부북동 1'))).status,400);
 assert.equal((await handler(req('x'.repeat(251)))).status,400);
 assert.equal((await handler(req(null))).status,400);
 upstreamMode='key';result=await handler(req('단원구 고잔동 519'));assert.equal(result.status,502);assert.ok(!(await result.text()).includes('FAKE_UNIT_TEST_SECRET'));
 upstreamMode='error';result=await handler(req('단원구 고잔동 520'));assert.equal(result.status,502);assert.ok(!(await result.text()).includes('FAKE_UNIT_TEST_SECRET'));
 upstreamMode='many';result=await handler(req('단원구 고잔동 521'));assert.deepEqual((await result.json()).candidates,[]);
}finally{globalThis.fetch=originalFetch;if(previousKey===undefined)delete process.env.JUSO_API_KEY;else process.env.JUSO_API_KEY=previousKey;if(previousURL===undefined)delete process.env.URL;else process.env.URL=previousURL;}

// Production frontend functions: official conversion -> Photon -> OSRM,
// original address preserved, ambiguity does not send a Photon request.
const source=fs.readFileSync('dist/app.js','utf8'),part=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const elements={},calls=[],notices=[];
const c={resolveRoadAddress,normalizeAddress,excludedAddress,photonPoints,parseRoute,addressKey,coordinateSummary,URL,
 rows:parseMatrix([['출발지','도착지'],[parcel,parcel]]),config:{...api,geocoder:'https://photon.test/api',router:'https://route.test/',bbox:[126.67,37.25,126.96,37.42]},searchCache:new Map(),roadCache:new Map(),routeCache:new Map(),busy:false,stopRequested:false,
 render(){},setBusy:value=>c.busy=value,downloads:{clear(){}},$:id=>elements[id]??={},notify:(...args)=>notices.push(args),
 requestJSON:async(url,options)=>{calls.push(String(url));if(options?.service==='road')return {candidates:roadCandidates([official],parcel)};
 if(String(url).includes('route.test'))return {code:'Ok',routes:[{distance:10,duration:1,geometry:{type:'LineString',coordinates:[[126.83,37.32],[126.83,37.32]]}}],waypoints:[]};
 assert.equal(new URL(url).searchParams.get('q'),road);return {features:[{properties:{city:'안산시',district:'단원구',street:'시험로',housenumber:'10',type:'house'},geometry:{coordinates:[126.83,37.32]}}]};}
};
vm.createContext(c);vm.runInContext(part('async function searchEndpoint','async function searchOne'),c);
await c.runBatch();assert.equal(calls.length,3);assert.equal(c.rows[0].route.distance,10);assert.equal(c.rows[0].origin.roadAddress,road);assert.equal(c.rows[0].destination.roadAddress,road);assert.ok(c.rows[0].origin.point);assert.equal(c.rows[0].origin.address,parcel);
await c.runBatch();assert.equal(c.rows[0].route.distance,10);
const records=exportRecords(c.rows);assert.equal(records[0].출발지,parcel);assert.equal(records[0].출발도로명주소,road);
const ExcelJS=createRequire(import.meta.url)('./dist/vendor/exceljs.min.js'),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('주소');
sheet.addRows([Object.keys(records[0]),...records.map(r=>Object.values(r))]);const read=new ExcelJS.Workbook();await read.xlsx.load(await book.xlsx.writeBuffer());
const matrix=[];read.worksheets[0].eachRow(row=>matrix.push(row.values.slice(1)));assert.equal(parseMatrix(matrix)[0].origin.roadAddress,road);
c.rows=parseMatrix([['출발지','도착지'],[parcel,parcel]]);c.roadCache.clear();let tries=0;
c.requestJSON=async()=>{tries++;throw Object.assign(Error('JUSO_API_KEY 설정 확인'),{stopBatch:true});};
await c.runBatch();assert.equal(tries,1);assert.equal(c.rows[0].status,'error');assert.match(notices.at(-1)[0],/JUSO_API_KEY/);assert.equal(c.busy,false);assert.equal(c.stopRequested,false);
c.requestJSON=async()=>({candidates:two});await c.runBatch();assert.equal(c.rows[0].origin.point,null);assert.match(c.rows[0].origin.roadStatus,/선택 필요/);assert.equal(c.rows[0].route,null);
assert.ok(!fs.readFileSync('dist/config.json','utf8').includes('JUSO_API_KEY'));
assert.match(source,/data-road-candidate/);
console.log('Road addresses: exact parcel/region/mountain matching, no fuzzy fallback, ambiguity choice, cache, server key isolation/CORS/errors, frontend conversion before Photon/routing, fatal stop, original + road XLSX round trip passed.');
