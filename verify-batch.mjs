import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {coordinateSummary} from './dist/core.js';
import {addressKey} from './dist/address-review.js';
const source=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('async function runBatch('),source.indexOf('async function searchOne('));
function fixture(n){
 const elements={};const routed=[];
 const rows=Array.from({length:n},(_,i)=>({id:i+1,origin:{point:null,confirmed:false,candidates:[]},destination:{point:null,confirmed:false,candidates:[]},status:'pending',route:null}));
 const c={coordinateSummary,downloads:{clear(){}},addressKey,rows,config:{},busy:false,stopRequested:false,notify:()=>{},render:()=>{},setBusy:v=>{c.busy=v},$:id=>elements[id]??=( {} ),searchEndpoint:async(r,k)=>{r[k].point={lat:37.3,lng:126.8};r[k].candidates=[r[k].point,{}];return true},routeRow:async r=>{routed.push(r.id);r.route={distance:100};r.status='done'}};
 vm.createContext(c);vm.runInContext(fn,c);return {c,routed,elements};
}
let f=fixture(200);await f.c.runBatch();assert.equal(f.routed.length,200);assert.equal(f.elements.progress.value,100);assert.ok(f.c.rows.every(r=>r.route&&!r.origin.confirmed&&r.error.includes('후보')));await f.c.runBatch();assert.equal(f.routed.length,200);
f=fixture(4);f.c.rows[0].invalid=true;const search=f.c.searchEndpoint;f.c.searchEndpoint=async(r,k)=>r.id===2?false:search(r,k);const route=f.c.routeRow;f.c.routeRow=async r=>{if(r.id===3)throw Error('network');return route(r)};await f.c.runBatch();assert.ok(f.c.rows[3].route);assert.equal(f.c.rows[2].status,'error');assert.equal(f.elements.progress.value,100);
f=fixture(3);const run=f.c.routeRow;f.c.routeRow=async r=>{if(r.id===2){f.c.stopRequested=true;throw Error('stop')}return run(r)};await f.c.runBatch();assert.ok(f.c.rows[0].route);assert.equal(f.c.rows[1].status,'pending');assert.equal(f.c.rows[2].status,'pending');assert.equal(f.c.busy,false);f.c.routeRow=run;await f.c.runBatch();assert.equal(f.routed.length,3);
console.log('Batch: 200 routes, ambiguity labels, per-row errors, stop/resume, completed-row preservation passed.');

