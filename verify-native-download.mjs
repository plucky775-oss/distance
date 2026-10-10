import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDownloadController} from './dist/download.js';
const messages=[],calls=[];
const panel={hidden:true},link={removeAttribute(k){delete this[k];},setAttribute(k,v){this[k]=v;}},shareButton={},nameLabel={};
let resolveSave,failSave=false;
const platform={File,URL:{createObjectURL:()=> 'blob:native',revokeObjectURL(){}},navigator:{},RouteNoteNative:{
 save:async(blob,name)=>{calls.push({kind:'save',blob,name});if(failSave)throw new Error('저장 위치 접근 실패');return new Promise(resolve=>resolveSave=resolve);},
 share:async(blob,name)=>calls.push({kind:'share',blob,name})
}};
const controller=createDownloadController({panel,link,shareButton,nameLabel,notify:(...args)=>messages.push(args)},platform);
const data=new Uint8Array([0,1,128,255]);controller.prepare(new Blob([data],{type:'application/zip'}),'경로지도.zip');
assert.equal(shareButton.hidden,false);assert.equal(link.textContent,'기기에 파일 저장');assert.equal(calls.length,0);
let prevented=0;const event={preventDefault(){prevented++;}};
const pending=link.onclick(event);await link.onclick(event);assert.equal(prevented,2);assert.equal(calls.length,1);assert.equal(shareButton.disabled,true);
assert.deepEqual(new Uint8Array(await calls[0].blob.arrayBuffer()),data);assert.equal(calls[0].name,'경로지도.zip');
resolveSave({cancelled:true});await pending;assert.match(messages.at(-1)[0],/취소/);assert.equal(shareButton.disabled,false);
const saved=link.onclick(event);resolveSave({cancelled:false});await saved;assert.match(messages.at(-1)[0],/선택한 위치에 파일을 저장/);
failSave=true;await link.onclick(event);assert.equal(messages.at(-1)[1],true);assert.match(messages.at(-1)[0],/접근 실패/);
await shareButton.onclick();assert.equal(calls.at(-1).kind,'share');assert.equal(calls.at(-1).name,'경로지도.zip');
const config=JSON.parse(fs.readFileSync('capacitor.config.json','utf8'));assert.equal(config.server.url,undefined);assert.equal(config.webDir,'mobile-www');assert.equal(config.android.webContentsDebuggingEnabled,false);
await import('./scripts/prepare-android.mjs');
const html=fs.readFileSync('mobile-www/index.html','utf8');assert.ok(html.indexOf('./native.js')<html.indexOf('./app.js'));assert.ok(!html.includes('distance-tau.vercel.app'));
for(const [,name] of html.matchAll(/(?:src|href)="\.\/([^"?]+)"/g))assert.ok(fs.existsSync('mobile-www/'+name),'Missing native asset '+name);
assert.ok(!fs.readFileSync('mobile-www/style.css','utf8').includes('fonts.googleapis.com'));
console.log('PASS: Android save/share bytes, names, cancellation, errors, duplicate-tap guard; bundled assets without hosted website URL.');
