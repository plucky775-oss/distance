import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {insideBox,excludedAddress,clean,escapeHtml,parseRoute} from './dist/core.js';
const s=fs.readFileSync('dist/app.js','utf8');
function part(from,to){return s.slice(s.indexOf(from),s.indexOf(to,s.indexOf(from)));}
const script=part('function clearRoute(', 'function setBusy(')+part('function endpointEditor(', 'function renderInspector(')+part('function beginPin(', 'const delay=')+part('async function routeRow(', 'async function runBatch(')+part('async function calculateSelected(', 'function loadMatrix(');
const endpoint=(address,point=null)=>({address,point,candidates:[],searched:true,confirmed:!!point});
const origin={lat:37.32,lng:126.83,label:'출발지'};
const row={id:1,origin:endpoint('출발지',origin),destination:endpoint('찾을 수 없는 종점'),route:{distance:999},mapImage:{old:true},status:'review',invalid:false};
const elements={},messages=[],requests=[],scrolls=[];
const c={busy:false,stopRequested:false,pinMode:null,selectedId:1,config:{router:'https://example.test/route/v1/driving/'},routeCache:new Map(),insideBox,excludedAddress,clean,esc:escapeHtml,parseRoute,URL,
 selected:()=>row,notify:m=>messages.push(m),render:()=>{},drawMap:()=>{},setBusy:v=>c.busy=v,prepareMap:async()=>{},
 $:id=>elements[id]??={classList:{add(){},remove(){}},scrollIntoView(){scrolls.push(id)}},
 map:{doubleClickZoom:{disable(){},enable(){}}},
 requestJSON:async url=>{requests.push(String(url));return {code:'Ok',routes:[{distance:1500,duration:120,geometry:{type:'LineString',coordinates:[[126.83,37.32],[126.84,37.33]]}}],waypoints:[]};}
};
vm.createContext(c);vm.runInContext(script,c);
c.beginPin('destination');assert.equal(c.pinMode,'destination');assert.ok(scrolls.includes('map'));assert.equal(elements['pin-banner'].hidden,false);
c.setPoint('destination',{lat:37.33,lng:126.84});
assert.equal(row.origin.point,origin);assert.equal(row.destination.point.source,'지도 지정');assert.equal(row.destination.confirmed,true);assert.equal(row.route,null);assert.equal(row.mapImage,null);assert.equal(c.pinMode,null);assert.ok(scrolls.includes('calculate-selected'));
await c.calculateSelected();assert.equal(requests.length,1);assert.ok(requests[0].includes('126.83,37.32;126.84,37.33'));assert.equal(row.route.distance,1500);
row.destination=endpoint('');row.invalid=true;c.beginPin('destination');c.setPoint('destination',{lat:37.34,lng:126.85});assert.equal(row.invalid,false);assert.equal(row.destination.address,'지도에서 지정한 도착지');await c.calculateSelected();assert.equal(requests.length,2);
const previous=row.destination.point;c.beginPin('destination');c.setPoint('destination',{lat:38,lng:127});assert.equal(row.destination.point,previous);assert.equal(c.pinMode,'destination');c.cancelPin();assert.equal(c.pinMode,null);
c.busy=true;c.beginPin('origin');assert.equal(c.pinMode,null);c.setPoint('destination',{lat:37.35,lng:126.86});assert.equal(row.destination.point,previous);c.busy=false;
row.destination=endpoint('대부북동 1');c.setPoint('destination',{lat:37.33,lng:126.84});assert.equal(row.invalid,true);
const html=c.endpointEditor(row,'destination','B 도착지');assert.match(html,/지도에서 도착지 지정/);assert.match(html,/지도에서 직접 지정/);
console.log('Manual pin: map navigation, destination coordinates used for route, preserved origin, blank address, old result invalidation, cancellation, busy guard and area exclusion passed.');
