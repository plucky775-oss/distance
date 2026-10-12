import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {compressMap,MAP_MAX_BYTES} from './dist/route-export.js';
const canvas=createCanvas(1200,1300),ctx=canvas.getContext('2d');
const pixels=ctx.createImageData(canvas.width,canvas.height);let seed=19;
for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>>8)&255;pixels.data[i+2]=(seed>>>16)&255;pixels.data[i+3]=255;}
ctx.putImageData(pixels,0,0);
const dense=compressMap(canvas,createCanvas);const bytes=Buffer.from(dense.dataUrl.split(',')[1],'base64');
assert.equal(bytes.length,dense.byteLength);assert.ok(bytes.length<=MAP_MAX_BYTES);assert.ok(bytes.length>=200000);assert.ok(dense.width<canvas.width,'dense image uses resolution fallback');
const decoded=await loadImage(bytes);assert.equal(decoded.width,dense.width);assert.equal(decoded.height,dense.height);
ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='32px sans-serif';ctx.fillStyle='#14223b';ctx.fillText('Route 200 | 12.35 km | A to B',40,60);
const simple=compressMap(canvas,createCanvas);assert.ok(simple.byteLength<200000);assert.equal(simple.width,1200);
// A dense schematic road map checks linework and text at full resolution.
ctx.fillStyle='#e5efdf';ctx.fillRect(0,100,1200,1200);
for(let y=110;y<1250;y+=36){ctx.fillStyle='#fdfaf0';ctx.fillRect(0,y,1200,10);ctx.fillStyle='#465667';ctx.font='14px sans-serif';for(let x=20;x<1150;x+=130)ctx.fillText(`Street ${x/10}-${y}`,x,y+27);}
for(let x=20;x<1200;x+=47){ctx.fillStyle='#fff';ctx.fillRect(x,100,7,1200);}
ctx.strokeStyle='#2154d8';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(100,1100);ctx.lineTo(280,940);ctx.lineTo(700,720);ctx.lineTo(950,240);ctx.stroke();
const map=compressMap(canvas,createCanvas);assert.ok(map.byteLength<=300000);assert.equal(map.width,1200);
fs.writeFileSync(path.join(os.tmpdir(),'route-note-compression.jpg'),Buffer.from(map.dataUrl.split(',')[1],'base64'));
console.log(`JPEG bytes: detailed map ${map.byteLength}, noise ${dense.byteLength} (${dense.width}x${dense.height}), sparse ${simple.byteLength}; size cap and decoded dimensions passed.`);
