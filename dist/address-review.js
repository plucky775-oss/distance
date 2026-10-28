import {clean,normalizeAddress,insideBox,excludedAddress} from './core.js';

// Deliberately conservative: never drop a parcel sub-number, 산, dong or district.
// Short forms with an unambiguous city prefix share a key; other differences do not.
export function addressKey(address){
  let value=clean(address).normalize('NFC').replace(/\s+/g,' ');
  if(!value||excludedAddress(value)||/^지도에서 지정한 (?:출발지|도착지)$/.test(value))return '';
  value=value.replace(/^경기\s+/,'경기도 ');
  value=normalizeAddress(value).replace(/^경기도\s+/,'');
  // A dong/street alone is not a specific destination, even after a manual pin.
  if(/(?:^|\s)[가-힣0-9]+(?:시|구|동|읍|면|리|로|길)$/.test(value))return '';
  return value.replace(/(\d)\s*-\s*(?=\d)/g,'$1-').replace(/산\s+(?=\d)/g,'산').replace(/(\d)\s*번지$/,'$1');
}

export function needsLocation(endpoint){
  return !endpoint.point||!endpoint.confirmed||endpoint.point.requiresMapSelection===true;
}

export function pendingAddresses(rows){
  const groups=new Map();
  for(const row of rows)for(const kind of ['origin','destination']){
    const endpoint=row[kind];
    if(!needsLocation(endpoint))continue;
    const key=addressKey(endpoint.address)||`unshared:${row.id}:${kind}`;
    if(!groups.has(key))groups.set(key,{key,address:endpoint.address,refs:[]});
    groups.get(key).refs.push({id:row.id,kind,missing:!endpoint.point});
  }
  return [...groups.values()];
}

export function matchingEndpoints(rows,address){
  const key=addressKey(address);
  if(!key)return [];
  return rows.flatMap(row=>['origin','destination'].filter(kind=>addressKey(row[kind].address)===key).map(kind=>({row,kind})));
}

export function applyManualPoint(rows,id,kind,latlng,{share=true}={}){
  const row=rows.find(r=>r.id===id);
  if(!row||!['origin','destination'].includes(kind))throw new Error('지정할 구간을 찾지 못했습니다.');
  if(!insideBox(latlng.lng,latlng.lat))throw new Error('대상 지도 범위 안에서 지정해 주세요.');
  const endpoint=row[kind],key=addressKey(endpoint.address);
  const matches=share&&key?matchingEndpoints(rows,endpoint.address):[];
  const targets=[{row,kind},...matches.filter(ref=>ref.row!==row||ref.kind!==kind)];
  const changed=new Set();let applied=0,protectedCount=0;
  for(const ref of targets){
    const e=ref.row[ref.kind],isCurrent=ref.row===row&&ref.kind===kind;
    // Preserve independently confirmed/imported locations. Pins shared by this
    // feature follow later corrections of that same address.
    if(!isCurrent&&!needsLocation(e)&&!(e.point.source==='지도 지정'&&e.point.sharedAddressKey===key)){
      protectedCount++;continue;
    }
    if(!clean(e.address))e.address=ref.kind==='origin'?'지도에서 지정한 출발지':'지도에서 지정한 도착지';
    e.point={lat:latlng.lat,lng:latlng.lng,label:e.address,source:'지도 지정',sharedAddressKey:share?key:''};
    e.confirmed=true;e.searched=true;
    ref.row.route=null;ref.row.mapImage=null;ref.row.status='review';ref.row.error='';
    changed.add(ref.row);applied++;
  }
  return {changed:[...changed],applied,protectedCount};
}
