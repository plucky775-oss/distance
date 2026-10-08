import {exportRecords,statusLabel} from './core.js';

export function imageKey(row){return JSON.stringify([row.origin.address,row.destination.address,row.origin.point?.lat,row.origin.point?.lng,row.destination.point?.lat,row.destination.point?.lng,row.route?.distance,row.route?.geometry]);}
export function hasMapImage(row){return !!row.route&&row.mapImage?.key===imageKey(row)&&/^data:image\/png;base64,/.test(row.mapImage.dataUrl);}
function ellipsis(ctx,text,width){let result=String(text);if(ctx.measureText(result).width<=width)return result;while(result.length&&ctx.measureText(result+'…').width>width)result=result.slice(0,-1);return result+'…';}

// Draw only the map tiles already loaded for the user's visible map. This makes
// no background tile requests and never prefetches maps for unseen routes.
export function renderMapCard(row,view,createCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;}){
 if(!row.route)throw new Error('거리 계산이 완료된 구간만 지도 그림으로 저장할 수 있습니다.');
 const width=1200,scale=width/view.width,header=158,footer=68,mapHeight=Math.round(view.height*scale),height=header+mapHeight+footer;
 const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
 ctx.fillStyle='#2154d8';ctx.fillRect(0,0,10,header);
 ctx.font='bold 31px sans-serif';ctx.fillStyle='#14223b';ctx.fillText(`구간 ${String(row.id).padStart(2,'0')}  ·  ${(row.route.distance/1000).toFixed(2)} km`,30,44);
 ctx.font='23px sans-serif';ctx.fillStyle='#2154d8';ctx.fillText(ellipsis(ctx,'A  '+row.origin.address,1140),30,89);
 ctx.fillStyle='#bf501c';ctx.fillText(ellipsis(ctx,'B  '+row.destination.address,1140),30,128);
 ctx.save();ctx.beginPath();ctx.rect(0,header,width,mapHeight);ctx.clip();ctx.translate(0,header);ctx.scale(scale,scale);
 ctx.fillStyle='#e9edf1';ctx.fillRect(0,0,view.width,view.height);
 for(const tile of view.tiles)ctx.drawImage(tile.image,tile.x,tile.y,tile.width,tile.height);
 const points=view.routePoints;
 if(points.length){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#ffffff';ctx.lineWidth=9;ctx.stroke();ctx.strokeStyle='#2154d8';ctx.lineWidth=5;ctx.stroke();}
 for(const [i,p]of view.endpoints.entries()){
   // Dotted connector identifies the distance between the selected point and the routed road.
   const snapped=i?points.at(-1):points[0];if(snapped){ctx.beginPath();ctx.setLineDash([3,4]);ctx.moveTo(p.x,p.y);ctx.lineTo(snapped.x,snapped.y);ctx.strokeStyle='#64748b';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);}
   const offset=i&&Math.hypot(p.x-view.endpoints[0].x,p.y-view.endpoints[0].y)<30?25:0;
   ctx.beginPath();ctx.arc(p.x+offset,p.y,15,0,Math.PI*2);ctx.fillStyle=i?'#d45d23':'#2154d8';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='white';ctx.stroke();ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='white';ctx.fillText(i?'B':'A',p.x+offset,p.y);ctx.textAlign='start';ctx.textBaseline='alphabetic';
 }
 ctx.restore();ctx.fillStyle='#ffffff';ctx.fillRect(0,header+mapHeight,width,footer);
 ctx.fillStyle='#425573';ctx.font='18px sans-serif';ctx.fillText('자동차 편도 도로거리 · 실시간 교통 미반영 · 점선 연결거리 제외',24,height-39);
 ctx.font='16px sans-serif';ctx.fillText('© OpenStreetMap contributors · openstreetmap.org/copyright · 경로: OSRM',24,height-13);
 return {dataUrl:canvas.toDataURL('image/png'),width,height,key:imageKey(row)};
}

export async function captureVisibleMap(row,map,tileLayer,isCurrent){
 const deadline=Date.now()+15000;
 while(Date.now()<deadline){
   if(!isCurrent())throw new Error('선택 구간이 바뀌어 지도 저장을 중지했습니다.');
   const box=map.getContainer().getBoundingClientRect();
   if(box.width<1||box.height<1)throw new Error('지도 화면이 보일 때 다시 저장해 주세요.');
   const tiles=Object.values(tileLayer._tiles||{}).filter(t=>t.coords.z===map.getZoom()).map(t=>({image:t.el,box:t.el.getBoundingClientRect()})).filter(t=>t.box.right>box.left&&t.box.left<box.right&&t.box.bottom>box.top&&t.box.top<box.bottom);
   const coverage=tiles.reduce((a,t)=>a+Math.max(0,Math.min(t.box.right,box.right)-Math.max(t.box.left,box.left))*Math.max(0,Math.min(t.box.bottom,box.bottom)-Math.max(t.box.top,box.top)),0);
   if(!tileLayer.isLoading()&&tiles.length&&coverage>=box.width*box.height*.995&&tiles.every(t=>t.image.complete&&t.image.naturalWidth>0)){
     const project=([lng,lat])=>map.latLngToContainerPoint([lat,lng]);
     const routePoints=row.route.geometry.coordinates.map(project),endpoints=[row.origin.point,row.destination.point].map(p=>project([p.lng,p.lat]));
     if([...routePoints,...endpoints].some(p=>p.x<0||p.y<0||p.x>box.width||p.y>box.height))throw new Error('경로 일부가 지도 밖에 있습니다. ‘경로 전체 보기’를 누른 뒤 다시 저장해 주세요.');
     try{return renderMapCard(row,{width:box.width,height:box.height,routePoints,endpoints,tiles:tiles.map(t=>({image:t.image,x:t.box.left-box.left,y:t.box.top-box.top,width:t.box.width,height:t.box.height}))});}
     catch(e){if(e.name==='SecurityError')throw new Error('지도 이미지 저장이 차단되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');throw e;}
   }
   await new Promise(resolve=>setTimeout(resolve,180));
 }
 throw new Error('배경지도를 완전히 불러오지 못했습니다. 지도가 표시된 뒤 다시 저장해 주세요.');
}

function styleSheet(sheet){sheet.views=[{state:'frozen',ySplit:1}];sheet.getRow(1).height=28;sheet.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2154D8'}};c.alignment={vertical:'middle',wrapText:true};});sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:sheet.columnCount}};}
export function createResultWorkbook(ExcelJS,rows){
 const missing=rows.filter(r=>r.route&&!hasMapImage(r));if(missing.length)throw new Error(`${missing.length}개 구간의 지도 그림이 아직 준비되지 않았습니다.`);
 const book=new ExcelJS.Workbook();book.creator='경로노트';book.created=new Date();
 const report=book.addWorksheet('거리·경로지도');report.columns=[{header:'번호',key:'id',width:8},{header:'출발지',key:'origin',width:32},{header:'도착지',key:'destination',width:32},{header:'도로거리(km)',key:'km',width:16},{header:'상태',key:'status',width:17},{header:'경로 지도 (A 출발 · B 도착)',key:'map',width:88}];
 for(const r of rows){const row=report.addRow({id:r.id,origin:r.origin.address,destination:r.destination.address,km:r.route?r.route.distance/1000:'',status:statusLabel(r),map:r.route?'':(r.error||'거리 계산 후 지도가 포함됩니다.')});row.height=r.route?280:62;row.getCell(4).numFmt='0.00';row.eachCell({includeEmpty:true},c=>{c.alignment={vertical:'middle',wrapText:true};c.font={size:11};c.border={bottom:{style:'thin',color:{argb:'FFDDE5F0'}}};if(row.number%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF5F8FD'}};});
   if(r.route){const image=r.mapImage;const factor=Math.min(600/image.width,350/image.height);const width=image.width*factor,height=image.height*factor;const id=book.addImage({base64:image.dataUrl,extension:'png'});report.addImage(id,{tl:{col:5.04,row:row.number-1+.025},ext:{width,height},editAs:'oneCell'});}
 }
 styleSheet(report);report.pageSetup={paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1',margins:{left:.25,right:.25,top:.4,bottom:.4,header:.15,footer:.15}};report.headerFooter={oddFooter:'&L경로노트 · OpenStreetMap / OSRM&R&P / &N'};
 const details=book.addWorksheet('상세결과');const data=exportRecords(rows);const keys=Object.keys(data[0]);details.columns=keys.map(k=>({header:k,key:k,width:/주소|출발지$|도착지$|확인/.test(k)?38:23}));details.addRows(data);styleSheet(details);details.eachRow((r,i)=>{if(i>1){r.height=35;r.eachCell(c=>c.alignment={vertical:'middle',wrapText:true});}});
 return book;
}
