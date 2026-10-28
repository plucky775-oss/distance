import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {photonPoints,normalizeAddress,excludedAddress,parseRoute} from './dist/core.js';
const f=(properties,coordinates=[126.83,37.32])=>({properties,geometry:{coordinates}});
assert.equal(normalizeAddress('단원구  고잔동 518'),'경기도 안산시 단원구 고잔동 518');
assert.equal(normalizeAddress('정왕동 1351'),'경기도 시흥시 정왕동 1351');
assert.equal(normalizeAddress('서울시 중구 1'),'서울시 중구 1');
const english={features:[
 f({city:'Ansan',name:'Gojan-dong',type:'locality',osm_key:'place'}),
 f({city:'Ansan',name:'Gojan',locality:'Gojan-dong',type:'house',osm_key:'railway'}),
 f({city:'Ansan',name:'고잔동 행정복지센터',street:'Hwajeongcheondong-ro',housenumber:'252',type:'house'})
]};
let candidates=photonPoints(english,'단원구 고잔동 518');assert.equal(candidates.length,3);assert.ok(candidates.every(p=>p.requiresMapSelection&&!p.autoSelectable));
const korean={features:[f({city:'안산시',name:'고잔동',type:'locality',osm_key:'place'}),f({city:'안산시',name:'고잔',type:'house'})]};
assert.ok(photonPoints(korean,'고잔동 518').every(p=>p.requiresMapSelection));
assert.ok(photonPoints({features:[f({city:'안산시',locality:'고잔동',housenumber:'518',type:'house'})]},'고잔동 518')[0].requiresMapSelection);
const road={features:[f({city:'안산시',street:'화랑로',housenumber:'387',type:'house',name:'안산시청'})]};
assert.equal(photonPoints(road,'안산시 화랑로 387')[0].autoSelectable,true);
assert.equal(photonPoints(road,'안산시 화랑로 387-1')[0].requiresMapSelection,true);
assert.equal(photonPoints(road,'안산시 다른로 387')[0].requiresMapSelection,true);
assert.equal(photonPoints(road,'안산시청')[0].autoSelectable,true);
assert.equal(photonPoints({features:[f({city:'Siheung',locality:'Jeongwang-dong',name:'Centre',type:'house'})]},'정왕동 1351').length,1);
assert.equal(photonPoints({features:[f({city:'Siheung',locality:'Sincheon-dong',name:'Centre'})]},'정왕동 1351').length,0);
assert.equal(photonPoints({features:[f({city:'Ansan',name:'Daebu-dong'})]},'센터').length,0);
assert.equal(photonPoints({features:[f({city:'Ansan'},[127,38])]},'센터').length,0);
const source=fs.readFileSync('dist/app.js','utf8');
const search=source.slice(source.indexOf('async function searchEndpoint'),source.indexOf('async function routeRow'));
let payload=english;
const calls=[];
// Isolate Photon safeguards here; official conversion is integrated in verify-road-address.
const c={resolveRoadAddress:async e=>normalizeAddress(e.address),roadCache:new Map(),normalizeAddress,excludedAddress,photonPoints,URL,searchCache:new Map(),config:{geocoder:'https://example.test/api/',bbox:[126.67,37.25,126.96,37.42]},requestJSON:async(url,options)=>{calls.push({url:String(url),options});return payload;}};
vm.createContext(c);vm.runInContext(search,c);
const r={origin:{address:'단원구 고잔동 518'}};
assert.equal(await c.searchEndpoint(r,'origin'),false);assert.equal(r.origin.point,null);assert.equal(r.origin.candidates.length,3);
assert.equal(new URL(calls[0].url).searchParams.get('q'),'경기도 안산시 단원구 고잔동 518');
assert.equal(calls[0].options.headers['Accept-Language'],'ko');
await c.searchEndpoint(r,'origin');assert.equal(calls.length,1);
await c.searchEndpoint(r,'origin',true);assert.equal(calls.length,2);
payload={features:[]};await c.searchEndpoint({origin:{address:'없는 주소'}},'origin');await c.searchEndpoint({origin:{address:'없는 주소'}},'origin');assert.equal(calls.length,4);
payload=road;const good={origin:{address:'안산시 화랑로 387'}};assert.equal(await c.searchEndpoint(good,'origin'),true);
payload={features:[...road.features,f({...road.features[0].properties},[126.84,37.33])]};assert.equal(await c.searchEndpoint(good,'origin',true),false);assert.equal(good.origin.point,null);
Object.assign(c,{parseRoute,render(){},routeCache:new Map()});
vm.runInContext(source.slice(source.indexOf('async function routeRow'),source.indexOf('async function runBatch')),c);
await assert.rejects(c.routeRow({origin:{point:{source:'주소검색',requiresMapSelection:true}},destination:{point:{}}}),/정확한 주소/);
assert.match(source,/p&&!p.requiresMapSelection/);
assert.match(source,/p.requiresMapSelection\?'disabled'/);
console.log('Address safeguards: Korean/English regions, parcel/center mismatch rejection, road name+number matching, ambiguous results, explicit retry, empty-cache retry, and routing guard passed.');

