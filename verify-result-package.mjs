import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {inflateRawSync} from 'node:zlib';
import {parseMatrix} from './dist/core.js';
import {imageKey,createResultWorkbook} from './dist/route-export.js';
import {createZip,createResultPackage,createMapReport} from './dist/result-package.js';
const require=createRequire(import.meta.url);
const ExcelJS=require('./dist/vendor/exceljs.min.js');
const {createCanvas}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas':'@napi-rs/canvas');

// Read the central directory independently, including DEFLATE from the XLSX.
function unzip(bytes){
 const data=Buffer.from(bytes),end=data.length-22;
 assert.equal(data.readUInt32LE(end),0x06054b50);
 let cursor=data.readUInt32LE(end+16);const files=new Map();
 for(let i=0;i<data.readUInt16LE(end+10);i++){
   assert.equal(data.readUInt32LE(cursor),0x02014b50);
   const method=data.readUInt16LE(cursor+10),size=data.readUInt32LE(cursor+20),nameLength=data.readUInt16LE(cursor+28),extraLength=data.readUInt16LE(cursor+30),commentLength=data.readUInt16LE(cursor+32),local=data.readUInt32LE(cursor+42);
   const name=data.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
   assert.equal(data.readUInt32LE(local),0x04034b50);
   const start=local+30+data.readUInt16LE(local+26)+data.readUInt16LE(local+28),compressed=data.subarray(start,start+size);
   const content=method===8?inflateRawSync(compressed):compressed;assert.ok(method===0||method===8);
   assert.equal(content.length,data.readUInt32LE(cursor+24));
   let crc=-1;for(const byte of content){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}assert.equal((~crc)>>>0,data.readUInt32LE(cursor+16));
   assert.ok(!files.has(name));files.set(name,content);cursor+=46+nameLength+extraLength+commentLength;
 }
 assert.equal(cursor,end);return files;
}
function complete(row,index){
 row.origin.point={lat:37.322,lng:126.831};row.destination.point={lat:37.349,lng:126.746};
 row.route={distance:1000+index,duration:300,geometry:{type:'LineString',coordinates:[[126.831,37.322],[126.746,37.349]]},snaps:[]};row.status='done';
 const canvas=createCanvas(120,80),ctx=canvas.getContext('2d');ctx.fillStyle=`rgb(${index*5},80,190)`;ctx.fillRect(0,0,120,80);
 row.mapImage={dataUrl:canvas.toDataURL('image/png'),width:120,height:80,key:imageKey(row)};
 return row;
}
const partial=parseMatrix([['출발지','도착지'],['안산시청','상록구청'],['안산시청','정왕본동 행정복지센터'],['중앙역','한양대학교 ERICA']]);complete(partial[2],3);
const partialBook=createResultWorkbook(ExcelJS,partial),partialBytes=await partialBook.xlsx.writeBuffer();
const partialZip=unzip(await createResultPackage(partial,partialBytes).arrayBuffer());
assert.deepEqual([...partialZip.keys()].filter(n=>n.endsWith('.png')),['maps/route-003.png']);
assert.deepEqual(partialZip.get('results.xlsx'),Buffer.from(partialBytes));
assert.match(partialZip.get('index.html').toString(),/전체 3구간 · 계산 완료 1구간 · 미계산 2구간/);
assert.match(partialBook.worksheets[0].getCell('F4').value,/maps\/route-003.png/);
const parts=unzip(partialBytes),drawing=parts.get('xl/drawings/drawing1.xml').toString();
assert.match(drawing,/<xdr:twoCellAnchor editAs="oneCell">/);
assert.ok(!drawing.includes('<xdr:oneCellAnchor'));
assert.match(drawing,/<xdr:row>3<\/xdr:row>/);
assert.deepEqual(parts.get('xl/media/image1.png'),partialZip.get('maps/route-003.png'));

const rows=parseMatrix([['출발지','도착지'],...Array.from({length:50},(_,i)=>[`출발 ${i+1}`,`도착 ${i+1}`])],50).map(complete);
const bytes=await createResultWorkbook(ExcelJS,rows).xlsx.writeBuffer();
const zip=await createResultPackage(rows,bytes).arrayBuffer(),files=unzip(zip),xlsx=unzip(bytes);
assert.equal(files.size,53);assert.equal([...files.keys()].filter(n=>n.endsWith('.png')).length,50);
assert.equal([...xlsx.keys()].filter(n=>n.startsWith('xl/media/')&&n.endsWith('.png')).length,50);
for(let i=0;i<50;i++)assert.deepEqual(files.get(`maps/route-${String(i+1).padStart(3,'0')}.png`),xlsx.get(`xl/media/image${i+1}.png`));
const reread=new ExcelJS.Workbook();await reread.xlsx.load(files.get('results.xlsx'));assert.equal(reread.worksheets[0].rowCount,51);assert.equal(reread.worksheets[0].getImages().length,50);assert.equal(reread.worksheets[1].rowCount,51);
const anchor=reread.worksheets[0].getImages()[49].range;assert.equal(anchor.tl.nativeRow,50);assert.equal(anchor.br.nativeRow,50);assert.ok(anchor.br.nativeRowOff>anchor.tl.nativeRowOff);assert.ok(anchor.br.nativeRowOff<320*12700);
const evil=structuredClone(partial);evil[0].origin.address='<img src=x onerror=alert(1)>';evil[0].error='</p><script>alert(1)</script>';const html=createMapReport(evil);assert.ok(!html.includes('<script>'));assert.match(html,/&lt;img/);
const stale=structuredClone(rows);stale[0].origin.address+=' changed';assert.throws(()=>createResultPackage(stale,bytes),/지도 그림/);
const broken=structuredClone(rows);broken[0].mapImage.dataUrl='data:image/png;base64,AAAA';assert.throws(()=>createResultPackage(broken,bytes),/올바르지/);
assert.throws(()=>createResultPackage([],bytes),/이동 구간/);assert.throws(()=>createZip([{name:'../bad',data:'bad'}]),/이름/);
assert.throws(()=>createZip([{name:'same',data:'a'},{name:'same',data:'b'}]),/이름/);
const unicode=unzip(await createZip([{name:'지도/한글.txt',data:'경로 확인'}]).arrayBuffer());assert.equal(unicode.get('지도/한글.txt').toString(),'경로 확인');
fs.writeFileSync(path.join(os.tmpdir(),'route-note-50-result-test.zip'),Buffer.from(zip));
fs.writeFileSync(path.join(os.tmpdir(),'route-note-partial-result-test.zip'),Buffer.from(await createResultPackage(partial,partialBytes).arrayBuffer()));
console.log('PASS: partial results (only route 003), 50 embedded images and 50 matching PNGs, ZIP CRC/directory, two-cell anchors, all-row preservation, HTML escaping, stale/corrupt image rejection.');
