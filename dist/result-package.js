import {escapeHtml,statusLabel} from './core.js';
import {hasMapImage,mapFilename} from './route-export.js';

const utf8=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,n)=>{
 for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;
 return n>>>0;
});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}

// PNG and XLSX are already compressed. Store their bytes in a standard ZIP
// without another library, network request, or 50 individual download dialogs.
export function createZip(files){
 if(files.length>65535)throw new Error('ZIP 파일 수가 너무 많습니다.');
 const body=[],directory=[],names=new Set();let offset=0,directorySize=0;
 for(const file of files){
   if(!file.name||file.name.startsWith('/')||file.name.includes('\\')||file.name.split('/').includes('..')||names.has(file.name))throw new Error('ZIP 파일 이름이 올바르지 않습니다.');
   names.add(file.name);
   const name=utf8.encode(file.name),data=typeof file.data==='string'?utf8.encode(file.data):file.data instanceof Uint8Array?file.data:new Uint8Array(file.data);
   if(name.length>65535||data.length>0xffffffff||offset+30+name.length+data.length>0xffffffff)throw new Error('ZIP 파일 용량이 너무 큽니다. 구간을 나눠 저장해 주세요.');
   const crc=crc32(data),local=new Uint8Array(30+name.length),l=new DataView(local.buffer);
   l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);
   l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,name.length,true);local.set(name,30);
   const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);
   c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);
   c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);
   body.push(local,data);directory.push(central);offset+=local.length+data.length;directorySize+=central.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,directorySize,true);e.setUint32(16,offset,true);
 return new Blob([...body,...directory,end],{type:'application/zip'});
}

export function mapImageBytes(row){
 if(!hasMapImage(row))throw new Error(`구간 ${row.id}의 지도 그림을 다시 준비해 주세요.`);
 const bytes=Uint8Array.from(atob(row.mapImage.dataUrl.split(',')[1]),c=>c.charCodeAt(0));
 if(bytes.length<24||![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))throw new Error(`구간 ${row.id}의 지도 그림 파일이 올바르지 않습니다.`);
 return bytes;
}

export function createMapReport(rows){
 const done=rows.filter(r=>r.route).length;
 const cards=rows.map(r=>`<article><h2>구간 ${escapeHtml(String(r.id))} · ${escapeHtml(statusLabel(r))}${r.route?` · ${(r.route.distance/1000).toFixed(2)} km`:''}</h2><p>A 출발: ${escapeHtml(r.origin.address)}<br>B 도착: ${escapeHtml(r.destination.address)}</p>${r.route?`<img src="${mapFilename(r)}" alt="구간 ${r.id} 경로 지도"><p><a href="${mapFilename(r)}" download>지도 PNG 열기·저장</a></p>`:`<p class="pending">${escapeHtml(r.error||'거리 계산 전입니다. 앱에서 위치 확인 후 다시 계산해 주세요.')}</p>`}</article>`).join('');
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>경로노트 · 거리와 경로 지도</title><style>body{font-family:system-ui,sans-serif;margin:24px auto;padding:0 18px;max-width:1000px;color:#14223b;line-height:1.7}article{border:1px solid #d6deec;padding:18px;margin:20px 0;break-inside:avoid}h1{font-size:26px}h2{font-size:20px}img{display:block;max-width:100%;height:auto}a{color:#2154d8}.pending{color:#975b16}@media print{article{page-break-inside:avoid}}</style></head><body><h1>거리와 경로 지도</h1><p>전체 ${rows.length}구간 · 계산 완료 ${done}구간 · 미계산 ${rows.length-done}구간</p><p>자동차 편도 도로거리 · 실시간 교통 미반영<br>지도: © OpenStreetMap contributors · 경로: OSRM</p><p><a href="results.xlsx" download>지도 포함 결과 엑셀</a></p>${cards}</body></html>`;
}

export function createResultPackage(rows,workbookBytes){
 if(!rows.length)throw new Error('저장할 이동 구간이 없습니다.');
 const done=rows.filter(r=>r.route);
 const files=[{name:'results.xlsx',data:workbookBytes},{name:'index.html',data:createMapReport(rows)},{name:'README.txt',data:`경로노트 결과\n\n전체 ${rows.length}구간 / 계산 완료 ${done.length}구간 / 미계산 ${rows.length-done.length}구간\n\nresults.xlsx: 지도 그림이 삽입된 엑셀. Excel 앱에서 열어 주세요.\nmaps 폴더: 계산 완료 구간별 지도 PNG. 번호는 엑셀의 구간 번호와 같습니다.\nindex.html: 컴퓨터 브라우저에서 여는 지도 모음. maps 폴더와 함께 두세요.\n\niPad에서는 파일 앱에서 ZIP을 눌러 압축을 푼 뒤 maps 폴더의 PNG를 열어 주세요.\n일부 엑셀 미리보기는 삽입된 그림을 표시하지 않을 수 있습니다.\n미계산 구간은 엑셀에 상태를 남기며 지도 PNG는 만들어지지 않습니다.\n\n지도: © OpenStreetMap contributors · https://www.openstreetmap.org/copyright\n경로: OSRM · 자동차 편도 도로거리, 실시간 교통 미반영\n`}];
 for(const r of done)files.push({name:mapFilename(r),data:mapImageBytes(r)});
 return createZip(files);
}
