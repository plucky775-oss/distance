export const AREA = { bbox: [126.67, 37.25, 126.96, 37.42], label: '안산 단원구·상록구 / 시흥 정왕동 (대부도 제외)' };
export const clean = value => String(value ?? '').replace(/\uFEFF/g, '').trim();
export const escapeHtml = value => clean(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = value => clean(value).toLowerCase().replace(/[\s_()·\-]/g, '');
const aliases = {
  origin:['출발지','출발주소','출발지주소','출발','시작주소','origin','from','start'],
  destination:['도착지','도착주소','도착지주소','도착','목적지','destination','to','end'],
  originLat:['출발위도','출발지위도','originlat'],originLng:['출발경도','출발지경도','originlng','originlon'],
  destinationLat:['도착위도','도착지위도','destinationlat'],destinationLng:['도착경도','도착지경도','destinationlng','destinationlon']
};
export function insideBox(lng,lat,bbox=AREA.bbox){return Number.isFinite(lng)&&Number.isFinite(lat)&&lng>=bbox[0]&&lng<=bbox[2]&&lat>=bbox[1]&&lat<=bbox[3];}
export function excludedAddress(address){return /대부(?:도|동|북동|남동|동동)|선감동|풍도동/.test(address);}
export function parseCSV(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||field===''){quoted=!quoted;}else field+=c;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('CSV 따옴표가 닫히지 않았습니다. 엑셀에서 XLSX 형식으로 다시 저장해 주세요.');
  if(field.length||row.length){row.push(field);rows.push(row);}return rows;
}
export function parseMatrix(matrix,maxRows=20){
  let headerIndex=-1,columns={};
  for(let i=0;i<Math.min(matrix.length,10);i++){
    const normalized=matrix[i].map(key);const found={};
    for(const [name,list] of Object.entries(aliases)){found[name]=normalized.findIndex(v=>list.includes(v));}
    if(found.origin>=0&&found.destination>=0){headerIndex=i;columns=found;break;}
  }
  if(headerIndex<0)throw new Error('첫 10행 안에 ‘출발지’, ‘도착지’ 열 제목이 필요합니다. 엑셀 양식을 참고해 주세요.');
  const headers=matrix[headerIndex].map(clean);
  const data=matrix.slice(headerIndex+1).map((cells,i)=>({cells,sourceRow:i+headerIndex+2})).filter(({cells})=>cells.some(v=>clean(v)!==''));
  if(data.length===0)throw new Error('주소가 입력된 행이 없습니다.');
  if(data.length>maxRows)throw new Error(`이 시험 버전은 한 파일에 최대 ${maxRows}구간을 처리합니다. 현재 ${data.length}구간입니다. 나누어 불러와 주세요.`);
  return data.map(({cells,sourceRow},i)=>{
    const errors=[];
    function endpoint(kind){
      const address=clean(cells[columns[kind]]);let point=null;
      if(!address)errors.push(kind==='origin'?'출발지 주소 누락':'도착지 주소 누락');
      if(excludedAddress(address))errors.push('대부도 지역은 대상에서 제외됩니다.');
      const lat=clean(cells[columns[kind+'Lat']]),lng=clean(cells[columns[kind+'Lng']]);
      if(lat||lng){
        if(!lat||!lng||!insideBox(Number(lng),Number(lat)))errors.push('위도·경도가 없거나 대상 지도 범위를 벗어납니다.');
        else point={lat:Number(lat),lng:Number(lng),label:address,source:'엑셀 좌표'};
      }
      return {address,point,candidates:[],confirmed:!!point,searched:!!point};
    }
    const origin=endpoint('origin'),destination=endpoint('destination');
    return {id:i+1,sourceRow,original:headers.map((h,j)=>[h||`열${j+1}`,clean(cells[j])]),origin,destination,status:errors.length?'error':'pending',error:[...new Set(errors)].join(' / '),invalid:errors.length>0,route:null};
  });
}
export function photonPoints(data,query){
  return (data.features||[]).filter(f=>{
    const p=f.properties||{},c=f.geometry?.coordinates;
    if(!Array.isArray(c)||!insideBox(c[0],c[1]))return false;
    const location=[p.name,p.city,p.district,p.locality,p.street,p.county].filter(Boolean).join(' ');
    if(excludedAddress(location))return false;
    // Keep only the requested administrative names. A missing locality is left for manual map selection.
    return location.includes('안산') || (location.includes('시흥') && location.includes('정왕'));
  }).map(f=>{
    const p=f.properties,c=f.geometry.coordinates;
    const label=[...new Set([p.city,p.district,p.locality,p.street,p.housenumber,p.name].filter(Boolean))].join(' ');
    return {lat:c[1],lng:c[0],label:label||query,source:'주소검색',kind:p.osm_value||p.type||''};
  });
}
export function parseRoute(data){
  if(data.code!=='Ok'||!data.routes?.length)throw new Error(data.code==='NoSegment'?'선택한 지점 300m 안에 연결 가능한 도로가 없습니다. 가까운 도로 입구로 위치를 옮겨 주세요.':'자동차로 연결되는 경로를 찾지 못했습니다. 두 지점의 위치를 확인해 주세요.');
  const route=data.routes[0];
  if(!Number.isFinite(route.distance)||route.distance<0||!Number.isFinite(route.duration)||route.duration<0||route.geometry?.type!=='LineString'||!Array.isArray(route.geometry.coordinates)||route.geometry.coordinates.length<2||!route.geometry.coordinates.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])))throw new Error('경로 서버 응답이 올바르지 않습니다. 다시 시도해 주세요.');
  return {distance:route.distance,duration:route.duration,geometry:route.geometry,snaps:(data.waypoints||[]).map(w=>({distance:w.distance,location:w.location})),calculatedAt:new Date().toISOString()};
}
export const statusLabel = row => ({pending:'검색 대기',searching:'검색 중',review:'위치 확인',routing:'계산 중',done:'계산 완료',error:'확인 필요'}[row.status]||'대기');
export function exportRecords(rows){return rows.map(r=>({
  원본행:r.sourceRow,출발지:r.origin.address,도착지:r.destination.address,
  출발검색주소:r.origin.point?.label||'',도착검색주소:r.destination.point?.label||'',
  출발위도:r.origin.point?.lat??'',출발경도:r.origin.point?.lng??'',도착위도:r.destination.point?.lat??'',도착경도:r.destination.point?.lng??'',
  '편도도로거리(km)':r.route?Math.round(r.route.distance/10)/100:'',
  '예상시간(분·교통미반영)':r.route?Math.round(r.route.duration/6)/10:'',
  '출발지-도로간거리(m)':r.route?.snaps[0]?.distance!==undefined?Math.round(r.route.snaps[0].distance):'',
  '도착지-도로간거리(m)':r.route?.snaps[1]?.distance!==undefined?Math.round(r.route.snaps[1].distance):'',
  상태:statusLabel(r),확인사항:r.error||'',계산시각:r.route?.calculatedAt||'',경로출처:r.route?'OSRM / OpenStreetMap':''
}));}
