import {imageKey,hasMapImage,captureVisibleMap,createResultWorkbook,imageFormat} from './route-export.js';
import {createResultPackage} from './result-package.js';
import {createDownloadController} from './download.js';
import {AREA,clean,escapeHtml as esc,insideBox,excludedAddress,parseCSV,parseMatrix,normalizeAddress,photonPoints,parseRoute,statusLabel,coordinateSummary,mapPointGroups,exportRecords} from './core.js';
import {addressKey,needsLocation,pendingAddresses,matchingEndpoints,applyManualPoint} from './address-review.js';
import {resolveRoadAddress} from './road-address.js';
const $=id=>document.getElementById(id);
let config,rows=[],selectedId=null,busy=false,stopRequested=false,map,layer,pinMode=null,activeController=null,lastRequest=0,lastViewKey='',sheets=[],fileName='',tileLayer=null,capturing=false,exporting=false;
const searchCache=new Map(),routeCache=new Map();
const roadCache=new Map();
let reviewOnly=false,reviewFocusKey='',shareSameAddress=true;
let showAllPoints=false;
const downloads=createDownloadController({panel:$('download-ready'),link:$('download-link'),shareButton:$('share-file'),nameLabel:$('download-name'),notify});
const emptyInspector=$('inspector').innerHTML,emptyList=$('route-list').innerHTML;
function notify(message,error=false){$('notice').textContent=message;$('notice').className=error?'error':'';$('notice').hidden=!message;}
function selected(){return rows.find(r=>r.id===selectedId);}
function km(m){return (m/1000).toLocaleString('ko-KR',{minimumFractionDigits:1,maximumFractionDigits:2});}
function minutes(s){const m=Math.max(1,Math.round(s/60));return m>=60?`${Math.floor(m/60)}시간 ${m%60}분`:`${m}분`;}
function clearRoute(r){r.mapImage=null;r.route=null;r.error='';r.status='review';downloads.clear();}
function validateRow(r){const problems=[];for(const k of ['origin','destination']){if(!r[k].address)problems.push(k==='origin'?'출발지 주소를 입력해 주세요.':'도착지 주소를 입력해 주세요.');if(excludedAddress(r[k].address))problems.push('대부도 지역은 대상에서 제외됩니다.');}r.invalid=!!problems.length;r.error=problems.join(' ');if(r.invalid)r.status='error';return !r.invalid;}
function setBusy(value){busy=value;if(value)cancelPin();render();}
function renderList(){
 $('row-count').textContent=rows.length;
 $('file-line').textContent=fileName||'등록된 파일이 없습니다';
 const visibleRows=reviewOnly?rows.filter(r=>needsLocation(r.origin)||needsLocation(r.destination)||r.invalid):rows;
 $('route-list').innerHTML=rows.length?(visibleRows.map(r=>`<button class="route-item ${r.id===selectedId?'selected':''}" data-id="${r.id}" aria-pressed="${r.id===selectedId}"><div class="route-meta"><span class="number">${String(r.id).padStart(2,'0')} <span class="source-row">· 엑셀 ${r.sourceRow}행</span></span><span class="status ${r.status}">${statusLabel(r)}</span></div><div class="route-point"><span class="point-dot">A</span><span>${esc(r.origin.address)||'출발지 미입력'}</span></div><div class="route-point end"><span class="point-dot">B</span><span>${esc(r.destination.address)||'도착지 미입력'}</span></div>${r.route?`<div class="route-result">${km(r.route.distance)}<small>km · ${minutes(r.route.duration)}</small></div>`:''}</button>`).join('')||'<div class="empty-state"><h3>위치 확인을 마쳤습니다</h3><p>전체 거리 계산을 눌러<br>아직 계산하지 않은 구간을 처리하세요.</p></div>'):emptyList;
 renderAddressReview();
 const coords=coordinateSummary(rows);
 $('coordinate-count').textContent=`좌표 ${coords.located} / ${coords.total}곳 · 변환 실패 ${coords.failed}곳`;
 $('coordinate-count').hidden=!rows.length;
 $('geocode-btn').disabled=busy||!rows.length||!config;
 $('coordinate-export-btn').disabled=busy||!rows.length;
 $('all-points-btn').disabled=busy||!coords.located;
 $('all-points-btn').setAttribute('aria-pressed',String(showAllPoints));
 $('all-points-btn').textContent=showAllPoints?'선택 구간 보기':'전체 좌표 보기';
 const done=rows.filter(r=>r.route);
 $('done-count').textContent=done.length;$('total-km').textContent=done.length?km(done.reduce((a,r)=>a+r.route.distance,0)):'—';
 $('batch-btn').disabled=busy||!rows.length||!config;
 $('clear-btn').disabled=busy||!rows.length;$('export-btn').disabled=busy||!rows.length;$('zip-btn').disabled=busy||!rows.length;
 for(const id of ['upload-btn','sample-btn','empty-sample','sheet-select'])if($(id))$(id).disabled=busy;
 $('stop-btn').hidden=!busy||(capturing&&!exporting);$('stop-btn').disabled=stopRequested;
}
function renderAddressReview(){
 const groups=pendingAddresses(rows);
 $('address-review').hidden=!rows.length;
 $('review-count').textContent=`위치 미확인 ${groups.length}개 주소 · ${groups.reduce((n,g)=>n+g.refs.length,0)}곳`;
 $('review-toggle').textContent=reviewOnly?'전체 구간 보기':'위치 미확인만 보기';
 $('review-toggle').setAttribute('aria-pressed',String(reviewOnly));$('review-toggle').disabled=busy;
 $('next-review').disabled=busy||!groups.length;
 $('pending-addresses').innerHTML=groups.map((g,i)=>`<button class="pending-address" data-review="${i}" ${busy?'disabled':''}><span>${esc(g.address)||'주소 미입력 · 지도에서 지정'}</span><small>${g.refs.length}곳 · ${g.refs.some(ref=>ref.missing)?'위치 지정 필요':'검색 위치 확인 필요'}</small></button>`).join('')||'<p class="review-empty">확인할 주소가 없습니다.</p>';
}
function selectPendingAddress(index){
 if(busy)return;
 const group=pendingAddresses(rows)[index];if(!group)return;
 const ref=group.refs.find(x=>x.missing)||group.refs[0];
 selectedId=ref.id;reviewFocusKey=group.key;showAllPoints=false;cancelPin();render();
 if(ref.missing)beginPin(ref.kind);
 else{$('inspector').scrollIntoView?.({block:'nearest',behavior:'smooth'});notify('검색으로 찾은 핀 위치를 확인하세요. 맞으면 ‘위치 확인·거리 계산’, 다르면 ‘지도에서 지정’을 눌러 주세요.');}
}
function nextPendingAddress(){
 const groups=pendingAddresses(rows);if(!groups.length||busy)return;
 const current=groups.findIndex(g=>g.key===reviewFocusKey);
 selectPendingAddress((current+1)%groups.length);
}
function endpointEditor(r,k,label){const e=r[k];const point=e.point;
 const opts=(e.candidates.length&&!point?'<option value="-1" selected>위치 확인 후 후보 선택 또는 지도에서 지정</option>':'')+e.candidates.map((p,i)=>`<option value="${i}" ${p.requiresMapSelection?'disabled':''} ${point&&point.lng===p.lng&&point.lat===p.lat?'selected':''}>${esc(p.label)}${p.matchNote?' ['+esc(p.matchNote)+']':''}${p.kind==='bus_stop'?' [버스정류장]':''}</option>`).join('');
 const matches=matchingEndpoints(rows,e.address).length;
 const roads=e.roadCandidates||[];
 const roadInfo=e.roadStatus||e.roadAddress?`<div class="road-address-result"><small>${esc(e.roadStatus||'저장된 도로명주소')}</small>${e.roadAddress?`<p>${esc(e.roadAddress)}</p>`:''}${roads.length>1?`<label for="${k}-road">같은 지번의 도로명주소 선택</label><select id="${k}-road" data-road-candidate="${k}" ${busy?'disabled':''}><option value="-1" ${!e.roadSelected?'selected':''}>건물·도로명주소를 확인해 선택하세요</option>${roads.map((p,i)=>`<option value="${i}" ${e.roadSelected&&e.roadAddress===p.roadAddress?'selected':''}>${esc(p.roadAddress)}${p.buildingName?' · '+esc(p.buildingName):''}</option>`).join('')}</select>`:''}</div>`:'';
 return `<div class="point-editor"><label for="${k}-address">${label} · 원본 주소</label><input id="${k}-address" data-address="${k}" value="${esc(e.address)}" maxlength="250" ${busy?'disabled':''} aria-label="${label} 주소"><div class="edit-actions"><button data-search="${k}" class="text-button" ${busy?'disabled':''}>주소 찾기</button><button data-pin="${k}" class="text-button" ${busy?'disabled':''}>지도에서 ${k==='origin'?'출발지':'도착지'} 지정</button></div>${roadInfo}${matches>1?`<label class="share-address"><input type="checkbox" data-share-address ${shareSameAddress?'checked':''} ${busy?'disabled':''}>지도 지정 시 같은 주소 ${matches}곳에 적용</label>`:''}${opts?`<select data-candidate="${k}" aria-label="${label} 검색 결과" ${busy?'disabled':''}>${point?.source==='지도 지정'?'<option value="-1" selected>지도에서 지정한 위치</option>':''}${opts}</select>`:''}<div class="coordinate">${point?`${point.source==='지도 지정'?'지도에서 직접 지정 · ':''}${esc(point.label)}<br>${point.lat.toFixed(6)}, ${point.lng.toFixed(6)} · ${e.confirmed?'위치 확인됨':'위치 확인 필요'}`:e.searched?'정확한 주소가 확인되지 않았습니다. 후보를 확인하거나 지도에서 직접 찍어 주세요.':'주소를 검색하거나 지도에서 지정하세요.'}</div></div>`;
}
function renderInspector(){const r=selected();if(!r){$('inspector').innerHTML=emptyInspector;return;}
 const pointsReady=!!(r.origin.point&&r.destination.point);
 $('inspector').innerHTML=`<div class="inspector-header"><div><span class="eyebrow">ROUTE ${String(r.id).padStart(2,'0')}</span><h3>${r.route?'도로 경로를 계산했습니다':'출발·도착 위치를 확인하세요'}</h3></div>${r.route?`<div class="route-measure">${km(r.route.distance)} <small>km</small></div>`:''}</div><div class="point-editors">${endpointEditor(r,'origin','A 출발지')}${endpointEditor(r,'destination','B 도착지')}</div>${r.error?`<div class="row-error" role="status">${esc(r.error)}</div>`:''}${r.route?`<div class="snap-note">예상 ${minutes(r.route.duration)} · 실시간 교통 미반영 · 지점에서 도로까지: 출발 ${Math.round(r.route.snaps[0]?.distance||0)}m / 도착 ${Math.round(r.route.snaps[1]?.distance||0)}m (합계 제외)</div>`:''}<div class="inspector-actions"><p>${r.route?'지점을 옮기면 기존 계산 결과가 지워집니다. 다시 계산해 주세요.':'지도 핀의 위치와 대상 권역을 확인해 주세요. 핀을 끌어서 옮길 수도 있습니다.'}</p><button id="calculate-selected" class="primary" ${busy||!pointsReady||r.invalid?'disabled':''}>${r.route?'경로 다시 계산':'위치 확인·거리 계산'}</button></div>${r.route?`<div class="map-export-actions"><span>${hasMapImage(r)?'✓ 엑셀에 넣을 지도 준비됨':'엑셀에 넣을 지도 그림을 저장할 수 있습니다.'}</span><button id="png-btn" class="secondary" ${busy?'disabled':''}>경로 지도 JPG 저장</button></div>`:''}`;
 if(pendingAddresses(rows).length)$('inspector').insertAdjacentHTML('beforeend',`<button id="inspector-next" class="secondary review-next-action" ${busy?'disabled':''}>다음 미확인 주소로 이동</button>`);
}
function render(){renderList();renderInspector();drawMap();}
function icon(kind,id=null,extra=0){return id===null?L.divIcon({className:'custom-pin',html:`<div class="pin-body ${kind==='destination'?'end':''}"><span>${kind==='origin'?'A':'B'}</span></div>`,iconSize:[32,40],iconAnchor:[16,39]}):L.divIcon({className:'custom-pin',html:`<div class="numbered-pin ${kind==='destination'?'end':''}">${id}${kind==='origin'?'A':'B'}${extra?` <small>+${extra}</small>`:''}</div>`,iconSize:[66,36],iconAnchor:[33,36]});}
function drawAllPoints(fit){
 const groups=mapPointGroups(rows),bounds=[];
 for(const g of groups){const p=g.point,first=g.refs[0];bounds.push([p.lat,p.lng]);
   const marker=L.marker([p.lat,p.lng],{icon:icon(first.kind,first.id,g.refs.length-1),draggable:false,title:g.refs.map(ref=>`${ref.id}${ref.kind==='origin'?'A':'B'} ${ref.address}`).join(' / ')}).addTo(layer);
   const popup=document.createElement('div');popup.className='coordinate-popup';
   popup.innerHTML=`<strong>${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</strong><p>${esc(p.source)} · ${g.refs.every(ref=>ref.confirmed)?'위치 확인됨':'위치 확인 필요'}</p>`+g.refs.map(ref=>`<button class="text-button" data-route="${ref.id}">${ref.id}${ref.kind==='origin'?'A 출발':'B 도착'} · ${esc(ref.address)}</button>`).join('');
   popup.addEventListener('click',event=>{const button=event.target.closest('[data-route]');if(button&&!busy){selectedId=+button.dataset.route;showAllPoints=false;cancelPin();render();}});
   marker.bindPopup(popup);
 }
 const viewKey='all:'+JSON.stringify(bounds);
 if((fit||viewKey!==lastViewKey)&&bounds.length)map.fitBounds(bounds,{paddingTopLeft:[40,75],paddingBottomRight:[40,110],maxZoom:16,animate:false});
 else if((fit||viewKey!==lastViewKey)&&!bounds.length)map.fitBounds([[37.275,126.705],[37.405,126.92]],{padding:[16,16],animate:false});
 lastViewKey=viewKey;
 $('map-hint').hidden=!!pinMode;
 $('map-hint').textContent=`좌표 ${coordinateSummary(rows).located}곳 · 구간 번호 + A 출발 / B 도착`;
}
function drawMap(fit=false){if(!map)return;layer.clearLayers();const r=selected();let bounds=[];
 if(showAllPoints&&!capturing&&!pinMode){drawAllPoints(fit);return;}
 if(r?.route){const line=L.geoJSON(r.route.geometry,{style:{color:'#fff',weight:9,opacity:.93}}).addTo(layer);L.geoJSON(r.route.geometry,{style:{color:'#2459d6',weight:5,opacity:.95}}).addTo(layer);bounds=line.getBounds();}
 if(r)for(const k of ['origin','destination']){const e=r[k],p=e.point;if(!p)continue;const marker=L.marker([p.lat,p.lng],{icon:icon(k),draggable:!busy,title:`${k==='origin'?'출발':'도착'}: ${p.label}`}).addTo(layer);marker.bindPopup(`${k==='origin'?'출발':'도착'} · ${esc(p.label)}`);marker.on('dragend',ev=>setPoint(k,ev.target.getLatLng()));if(!r.route)bounds.push([p.lat,p.lng]);}
 const viewKey=r?`${r.id}:${r.origin.point?.lat}:${r.origin.point?.lng}:${r.destination.point?.lat}:${r.destination.point?.lng}:${r.route?.distance}`:'empty';
 if(fit||viewKey!==lastViewKey){lastViewKey=viewKey;if(r?.route||bounds.length){map.fitBounds(bounds,{padding:[48,60],maxZoom:16,animate:false});}else if(fit||!r){map.fitBounds([[37.275,126.705],[37.405,126.92]],{padding:[16,16],animate:false});}}
 $('map-hint').hidden=!!pinMode||!!r?.route;
 $('map-hint').textContent=r?(r.origin.point||r.destination.point?'A 출발 · B 도착 — 위치를 확인한 뒤 거리 계산을 눌러주세요.':'주소 찾기 또는 지도에서 지정으로 두 지점을 선택하세요.'):AREA.label;
}
function beginPin(kind){
 if(busy||!map||!selected()||!['origin','destination'].includes(kind))return;
 showAllPoints=false;drawMap(true);
 pinMode=kind;$('pin-banner').hidden=false;
 $('pin-message').textContent=`지도를 확대·이동한 뒤 ${kind==='origin'?'출발지 A':'도착지 B'}를 손가락으로 한 번 찍어 주세요.`;
 $('map-hint').hidden=true;$('map').classList.add('pin-mode');
 map.doubleClickZoom.disable();
 $('map').scrollIntoView?.({block:'center',behavior:'smooth'});
 notify(`${kind==='origin'?'출발지':'도착지'} 지정 중입니다. 원하는 위치를 누르면 핀이 표시됩니다.`);
}
function cancelPin(){pinMode=null;$('pin-banner').hidden=true;$('map').classList.remove('pin-mode');if(map)map.doubleClickZoom.enable();}
function setPoint(kind,latlng){const r=selected();if(!r||busy||!['origin','destination'].includes(kind))return;
 if(!insideBox(latlng.lng,latlng.lat)){notify('안산 본토와 정왕동을 포함하는 지도 범위 안에서 지점을 선택해 주세요. 대부도는 제외됩니다.',true);drawMap(true);return;}
 const result=applyManualPoint(rows,r.id,kind,latlng,{share:shareSameAddress});
 result.changed.forEach(validateRow);downloads.clear();cancelPin();render();
 const ready=r.origin.point&&r.destination.point&&!r.invalid;
 const shared=result.applied>1?`같은 주소 ${result.applied}곳에 위치를 적용했습니다. 변경된 구간은 다시 계산해야 합니다. `:'위치를 지정했습니다. ';
 const protectedNote=result.protectedCount?`별도로 확인된 ${result.protectedCount}곳은 변경하지 않았습니다. `:'';
 notify(shared+protectedNote+(ready?'A·B 핀이 맞으면 ‘위치 확인·거리 계산’을 눌러주세요. 전체 구간은 ‘전체 거리 계산’으로 계산할 수 있습니다.':'‘다음 미확인 주소’를 누르거나 나머지 지점도 지정해 주세요.'));
 if(ready)$('calculate-selected')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function requestJSON(url,options={}){if(stopRequested)throw new Error('작업을 중지했습니다.');await delay(Math.max(0,lastRequest+(config.requestIntervalMs||1200)-Date.now()));if(stopRequested)throw new Error('작업을 중지했습니다.');lastRequest=Date.now();const controller=new AbortController();activeController=controller;const timer=setTimeout(()=>controller.abort(),20000);
 try{const res=await fetch(url,{method:options.method,body:options.body,headers:options.headers,signal:controller.signal,referrerPolicy:'strict-origin-when-cross-origin',credentials:'omit'});if(!res.ok){
   let data={};if(options.service==='road')try{data=await res.json();}catch{}
   throw Object.assign(new Error(data.message||(res.status===429?'주소·지도 서버의 요청 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요.':`주소·지도 서버에서 응답하지 못했습니다 (${res.status}). 잠시 뒤 다시 시도해 주세요.`)),{stopBatch:options.service==='road'||res.status===429});
 }return await res.json();}
 catch(e){if(e.name==='AbortError')throw new Error(stopRequested?'작업을 중지했습니다.':'지도 서버 응답이 늦습니다. 잠시 뒤 다시 시도해 주세요.');if(e instanceof TypeError)throw new Error('지도 서버에 연결할 수 없습니다. 인터넷 연결을 확인하거나 지도에서 위치를 지정해 주세요.');throw e;}
 finally{clearTimeout(timer);if(activeController===controller)activeController=null;}
}
async function searchEndpoint(r,kind,force=false){const e=r[kind];if(excludedAddress(e.address))throw new Error('대부도 지역은 대상에서 제외됩니다.');if(!e.address)throw new Error('주소를 입력해 주세요.');
 e.point=null;e.candidates=[];e.searched=true;e.confirmed=false;
 let query;
 try{query=await resolveRoadAddress(e,config,requestJSON,roadCache,force);}catch(error){e.roadStatus='도로명주소 변환 오류';error.stopBatch=true;throw error;}
 if(!query)return false;
 const cacheKey=normalizeAddress(query);let points=force?undefined:searchCache.get(cacheKey);
 if(!points){const url=new URL(config.geocoder);url.searchParams.set('q',cacheKey);url.searchParams.set('limit','6');url.searchParams.set('bbox',config.bbox.join(','));
 points=photonPoints(await requestJSON(url,{headers:{'Accept-Language':'ko'}}),query);if(points.length)searchCache.set(cacheKey,points);}
 e.candidates=points;e.searched=true;e.confirmed=false;
 const matched=points.filter(p=>p.autoSelectable===true);
 e.point=matched.length===1?matched[0]:null;
 return !!e.point;
}
async function routeRow(r){const a=r.origin.point,b=r.destination.point;if(!a||!b)throw new Error('출발지와 도착지 위치를 먼저 지정해 주세요.');
 if([a,b].some(p=>p.source==='주소검색'&&p.requiresMapSelection))throw new Error('정확한 주소가 확인되지 않았습니다. 지도에서 위치를 직접 지정해 주세요.');
 r.status='routing';render();const coordinates=`${a.lng},${a.lat};${b.lng},${b.lat}`;
 if(routeCache.has(coordinates))r.route=routeCache.get(coordinates);
 else{const url=new URL(config.router+coordinates);url.searchParams.set('overview','full');url.searchParams.set('geometries','geojson');url.searchParams.set('steps','false');url.searchParams.set('radiuses','300;300');r.route=parseRoute(await requestJSON(url));routeCache.set(coordinates,r.route);}
 r.error='';r.status='done';
}
async function runBatch(calculate=true){if(busy||!rows.length||!config)return;stopRequested=false;
 if(!calculate)showAllPoints=true;
 downloads.clear();notify(calculate?'확인 가능한 좌표로 전체 구간의 도로거리를 계산합니다.':'엑셀 주소를 좌표로 변환해 지도에 표시합니다. 거리 계산은 별도로 실행할 수 있습니다.');setBusy(true);$('progress-wrap').hidden=false;
 let processed=0,fatalMessage='';
 // Only reuse successful search responses in this batch. Network failures are
 // not cached, and a later batch can retry addresses that returned no match.
 const batchSearches=new Map();
 const progress=()=>{$('progress').value=processed/rows.length*100;$('progress-label').textContent=`${processed} / ${rows.length}구간 처리`;};progress();
 try{for(const r of rows){if(stopRequested)break;if(r.invalid||r.route){processed++;progress();continue;}
   r.status='searching';r.error='';render();const errors=[];
   for(const kind of ['origin','destination']){if(stopRequested)break;if(r[kind].point)continue;try{
     const e=r[kind],key=(addressKey(e.address)||`row:${r.id}:${kind}`)+(e.roadSelected?`|road:${e.roadAddress}`:'');
     if(batchSearches.has(key)){
       const saved=batchSearches.get(key);e.point=saved.point?{...saved.point}:null;e.candidates=saved.candidates.map(p=>({...p}));e.searched=true;e.confirmed=false;e.roadAddress=saved.roadAddress;e.roadStatus=saved.roadStatus;e.roadCandidates=saved.roadCandidates.map(p=>({...p}));
     }else{await searchEndpoint(r,kind);batchSearches.set(key,{point:e.point?{...e.point}:null,candidates:e.candidates.map(p=>({...p})),roadAddress:e.roadAddress||'',roadStatus:e.roadStatus||'',roadCandidates:(e.roadCandidates||[]).map(p=>({...p}))});}
     if(!e.point)errors.push(`${kind==='origin'?'출발지':'도착지'} ${e.roadStatus==='도로명주소 선택 필요'?'도로명주소 후보를 선택해 주세요.':e.roadAddress?'도로명주소는 확인했지만 정확한 좌표를 찾지 못했습니다. 지도에서 지정해 주세요.':'정확한 주소가 확인되지 않았습니다. 도로명주소 후보를 확인하거나 지도에서 지정해 주세요.'}`);
   }catch(e){errors.push(e.message);if(e.stopBatch){fatalMessage=e.message;stopRequested=true;break;}}}
   if(stopRequested){r.status=fatalMessage?'error':'pending';r.error=fatalMessage;break;}
   if(!errors.length&&r.origin.point&&r.destination.point&&calculate){try{await routeRow(r);
     if(!r.origin.confirmed||!r.destination.confirmed)errors.push('검색 결과로 자동 계산했습니다. 출발·도착 위치를 확인해 주세요.');
     if(['origin','destination'].some(k=>!r[k].confirmed&&r[k].candidates.length>1))errors.push('검색 후보가 여러 개입니다. 선택된 위치가 맞는지 확인해 주세요.');
   }catch(e){if(stopRequested){r.status='pending';r.error='';break;}errors.push(e.message);r.status='error';}}
   else r.status=!errors.length&&r.origin.point&&r.destination.point?'located':'review';
   r.error=[...new Set(errors)].join(' ');processed++;progress();render();
 }}finally{setBusy(false);$('progress-wrap').hidden=true;const done=rows.filter(r=>r.route).length;const remaining=rows.length-done;const coords=coordinateSummary(rows);notify(fatalMessage?`${fatalMessage} 처리를 중지했으며 완료한 결과는 유지됩니다.`:stopRequested?`중지했습니다. 변환된 좌표 ${coords.located}곳과 계산 완료 ${done}구간은 유지됩니다.`:calculate?`전체 ${rows.length}구간 중 ${done}구간 계산 완료${remaining?` · ${remaining}구간 확인 필요`:''}. 자동 계산된 위치를 확인해 주세요.`:`좌표 변환 완료: ${coords.located} / ${coords.total}곳 · 미변환 ${coords.total-coords.located}곳. 핀 위치를 확인한 뒤 ‘전체 거리 계산’을 누르세요. 좌표 엑셀은 지금 저장할 수 있습니다.`,!!fatalMessage);stopRequested=false;}
}
async function searchOne(kind){const r=selected();if(!r||busy||!config)return;stopRequested=false;clearRoute(r);if(!validateRow(r)){render();return;}setBusy(true);r.status='searching';try{const found=await searchEndpoint(r,kind,true);r.status='review';r.error=found?'':'정확한 주소·번호를 확인하지 못했습니다. 후보를 확인하거나 지도에서 직접 지정해 주세요.';}catch(e){r.status='error';r.error=e.message;}finally{setBusy(false);}}
async function calculateSelected(){const r=selected();if(!r||busy||!config||!validateRow(r))return;stopRequested=false;r.origin.confirmed=true;r.destination.confirmed=true;setBusy(true);try{await routeRow(r);notify('도로거리 계산을 완료했습니다. 결과 엑셀 저장으로 내려받을 수 있습니다.');}catch(e){r.status='error';r.error=e.message;notify(e.message,true);}finally{setBusy(false);}if(r.route&&selectedId===r.id){try{await prepareMap(r);}catch(e){notify('거리 계산은 완료했습니다. '+e.message,true);}}}
function loadMatrix(matrix,name){const parsed=parseMatrix(matrix,config.maxRows);rows=parsed;reviewOnly=false;reviewFocusKey='';showAllPoints=true;downloads.clear();selectedId=rows[0].id;fileName=name;cancelPin();lastViewKey='';render();notify(`${rows.length}구간을 불러왔습니다. 주소를 좌표로 변환해 지도에 표시합니다. 같은 주소는 한 번만 검색합니다.`);}
function excelValue(cell){const v=cell.value;if(v===null||v===undefined)return '';if(typeof v==='object'){if('formula'in v||'sharedFormula'in v){if(v.result===undefined)throw new Error('결과값이 없는 수식 셀이 있습니다. 엑셀에서 계산 후 값으로 붙여넣어 주세요.');return v.result;}if(v.richText)return v.richText.map(x=>x.text).join('');if(v.text)return v.text;if(v.error)return v.error;if(v instanceof Date)return v.toISOString();}return v;}
function sheetMatrix(sheet){if(sheet.rowCount>1020)throw new Error('행이 너무 많습니다. 필요한 주소 행만 새 파일에 복사해 주세요.');if(sheet.columnCount>100)throw new Error('열이 너무 많습니다. 필요한 열만 새 파일에 복사해 주세요.');const matrix=[];sheet.eachRow({includeEmpty:true},row=>{const values=[];for(let c=1;c<=Math.min(sheet.columnCount,100);c++)values.push(excelValue(row.getCell(c)));matrix.push(values);});return matrix;}
async function importFile(file){if(!file||busy)return;if(!config){notify('지도 설정을 불러오는 중입니다. 잠시 뒤 다시 시도해 주세요.');return;}if(!/\.(xlsx|csv)$/i.test(file.name)){notify('XLSX 또는 CSV 파일을 선택해 주세요. XLS는 엑셀에서 XLSX로 저장해 주세요.',true);return;}if(file.size>5*1024*1024){notify('5MB 이하의 파일을 사용해 주세요. 필요한 주소 행만 새 파일에 복사하면 용량을 줄일 수 있습니다.',true);return;}
 let imported=false;setBusy(true);try{
   if(/\.csv$/i.test(file.name)){const buffer=await file.arrayBuffer();let text=new TextDecoder('utf-8').decode(buffer);if(text.includes('\uFFFD'))text=new TextDecoder('euc-kr').decode(buffer);loadMatrix(parseCSV(text),file.name);sheets=[];removeSheetPicker();}
   else{if(!window.ExcelJS)throw new Error('엑셀 읽기 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());const usable=book.worksheets.filter(s=>s.state!=='veryHidden');if(!usable.length)throw new Error('읽을 수 있는 시트가 없습니다.');sheets=usable;let initial=0;for(let i=0;i<usable.length;i++){try{parseMatrix(sheetMatrix(usable[i]),config.maxRows);initial=i;break;}catch{}}
     renderSheetPicker(file.name,initial);loadMatrix(sheetMatrix(sheets[initial]),`${file.name} · ${sheets[initial].name}`);
   }
   imported=true;
 }catch(e){notify(e.message||'엑셀을 읽지 못했습니다. 파일 형식을 확인해 주세요.',true);}finally{setBusy(false);$('file-input').value='';}
 if(imported)await runBatch(false);
}
function removeSheetPicker(){$('sheet-picker')?.remove();}
function renderSheetPicker(name,initial){removeSheetPicker();if(sheets.length<2)return;const wrap=document.createElement('div');wrap.id='sheet-picker';wrap.className='sheet-picker';const label=document.createElement('label');label.htmlFor='sheet-select';label.textContent='사용할 시트';const select=document.createElement('select');select.id='sheet-select';sheets.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=s.name;o.selected=i===initial;select.append(o);});select.addEventListener('change',async()=>{if(busy)return;try{loadMatrix(sheetMatrix(sheets[+select.value]),`${name} · ${sheets[+select.value].name}`);await runBatch(false);}catch(e){notify(e.message,true);}});wrap.append(label,select);document.querySelector('.intro').append(wrap);}
async function sample(){if(busy||!config)return;sheets=[];removeSheetPicker();loadMatrix([['출발지','도착지'],['안산시청','상록구청'],['안산시청','정왕본동 행정복지센터'],['안산시 단원구 중앙역','안산시 상록구 한양대학교 ERICA']], '예시 · 안산과 정왕 3구간');await runBatch(false);}
async function saveCoordinates(){
 if(busy||!rows.length)return;
 setBusy(true);
 try{await saveWorkbook(exportRecords(rows).map(record=>({번호:record.번호,...record})),`경로노트_주소좌표_${new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})}.xlsx`,'좌표 엑셀이 준비됐습니다. 변환되지 않은 주소는 빈 좌표와 상태로 표시됩니다. 파일 내려받기를 눌러 주세요.');}
 finally{setBusy(false);}
}
async function saveWorkbook(data,name,message='엑셀 양식이 준비됐습니다. 파일 저장 버튼을 눌러 주세요.'){if(!window.ExcelJS){notify('엑셀 저장 기능을 불러오지 못했습니다.',true);return;}try{const book=new ExcelJS.Workbook();book.creator='경로노트';const sheet=book.addWorksheet('이동구간');const keys=Object.keys(data[0]);sheet.columns=keys.map(k=>({header:k,key:k,width:/주소|출발지$|도착지$|확인/.test(k)?38:20}));sheet.addRows(data);sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:keys.length}};const header=sheet.getRow(1);header.height=28;header.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2154D8'}};c.alignment={vertical:'middle'};});sheet.eachRow((row,i)=>{if(i>1){row.height=30;row.eachCell(c=>{c.alignment={vertical:'middle',wrapText:true};if(i%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5FC'}};});}});const bytes=await book.xlsx.writeBuffer();downloadBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name);notify(message);}catch(e){notify('엑셀 저장에 실패했습니다. '+e.message,true);}}
function downloadBlob(blob,name){downloads.prepare(blob,name);}
async function prepareMap(r){
 if(hasMapImage(r))return r.mapImage;
 if(selectedId!==r.id||!r.route)throw new Error('지도 그림을 저장할 구간을 먼저 선택해 주세요.');
 const key=imageKey(r);showAllPoints=false;capturing=true;setBusy(true);document.querySelector('.map-shell').classList.add('is-capturing');map.dragging.disable();map.touchZoom.disable();map.scrollWheelZoom.disable();map.doubleClickZoom.disable();map.keyboard.disable();map.zoomControl?.disable?.();
 notify(`구간 ${r.id}의 지도 그림을 준비하고 있습니다…`);
 try{drawMap(true);r.mapImage=await captureVisibleMap(r,map,tileLayer,()=>selectedId===r.id&&imageKey(r)===key&&(!exporting||!stopRequested));notify(`구간 ${r.id}의 지도 그림이 준비되었습니다. 지도 포함 엑셀 또는 JPG로 저장할 수 있습니다.`);return r.mapImage;}
 finally{capturing=false;document.querySelector('.map-shell').classList.remove('is-capturing');map.dragging.enable();map.touchZoom.enable();map.scrollWheelZoom.enable();map.doubleClickZoom.enable();map.keyboard.enable();setBusy(exporting);}
}
async function saveSelectedMap(){const r=selected();if(busy||!r?.route)return;try{const img=await prepareMap(r);const bytes=Uint8Array.from(atob(img.dataUrl.split(',')[1]),c=>c.charCodeAt(0));downloadBlob(new Blob([bytes],{type:`image/${imageFormat(img)}`}),`경로노트_구간${String(r.id).padStart(2,'0')}.${imageFormat(img)==='jpeg'?'jpg':'png'}`);notify('지도 JPG가 준비됐습니다. 아래 ‘파일 내려받기’ 또는 ‘공유·파일에 저장’을 눌러 주세요.');}catch(e){notify(e.message,true);}}
async function exportWithMaps(format='xlsx'){
 if(busy||!rows.length)return;
 const previousSelection=selectedId;
 exporting=true;stopRequested=false;setBusy(true);
 $('progress-wrap').hidden=false;
 try{
   downloads.clear();
   const missing=rows.filter(r=>r.route&&!hasMapImage(r));
   const total=rows.filter(r=>r.route).length;
   let prepared=total-missing.length;
   const progress=()=>{$('progress').value=total?prepared/total*100:100;$('progress-label').textContent=`지도 ${prepared} / ${total}개 준비`;};
   progress();
   for(const r of missing){
     if(stopRequested)break;
     selectedId=r.id;render();
     notify(`지도 ${prepared+1} / ${total}개 준비 중 · 완료 후 저장 파일을 만듭니다. 화면을 켜 두세요.`);
     try{await prepareMap(r);}catch(e){if(stopRequested)break;throw new Error(`구간 ${r.id}: ${e.message} 준비된 지도는 유지됩니다. 저장을 다시 누르면 이어서 진행합니다.`);}
     prepared++;progress();
     // Display and capture one map at a time; no parallel tile prefetch.
     if(prepared<total)await delay(1200);
   }
   if(stopRequested){notify(`지도 준비를 중지했습니다. ${prepared}개는 유지됩니다. 저장 버튼을 누르면 이어서 진행합니다.`);return;}
   capturing=true;renderList();notify('지도 준비 완료. 저장 파일을 만드는 중입니다…');
   const book=createResultWorkbook(ExcelJS,rows);const bytes=await book.xlsx.writeBuffer();
   if(stopRequested){notify('파일 생성을 중지했습니다. 준비된 지도는 유지됩니다.');return;}
   const date=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),done=rows.filter(r=>r.route).length;
   if(format==='zip')downloadBlob(createResultPackage(rows,bytes),`경로노트_엑셀과지도_${date}.zip`);
   else downloadBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`경로노트_지도포함_거리결과_${date}.xlsx`);
   notify(`${format==='zip'?'엑셀·지도 ZIP':'지도 포함 엑셀'} 준비 완료 · 지도 ${done}개, 미계산 ${rows.length-done}개. 아래 ‘파일 내려받기’ 또는 ‘공유·파일에 저장’을 눌러 주세요.`);
 }catch(e){notify('결과 저장: '+e.message,true);}
 finally{exporting=false;capturing=false;stopRequested=false;selectedId=previousSelection;$('progress-wrap').hidden=true;setBusy(false);}
}
function bindEvents(){
 $('upload-btn').onclick=()=>$('file-input').click();$('file-input').onchange=e=>importFile(e.target.files[0]);$('sample-btn').onclick=sample;
 $('template-btn').onclick=()=>saveWorkbook([{출발지:'안산시 단원구 화랑로 387',도착지:'안산시 상록구 석호로 110'},{출발지:'안산시 단원구 고잔동 중앙역',도착지:'시흥시 정왕동 정왕역'}],'경로노트_주소입력양식.xlsx');
 $('route-list').onclick=e=>{const item=e.target.closest('[data-id]');if(item&&!busy){selectedId=+item.dataset.id;showAllPoints=false;cancelPin();render();}else if(e.target.closest('#empty-sample'))sample();};
 $('batch-btn').onclick=()=>runBatch(true);$('geocode-btn').onclick=()=>runBatch(false);$('coordinate-export-btn').onclick=saveCoordinates;
 $('all-points-btn').onclick=()=>{if(busy)return;showAllPoints=!showAllPoints;cancelPin();render();drawMap(true);};
 $('stop-btn').onclick=()=>{stopRequested=true;activeController?.abort();$('stop-btn').disabled=true;};
 $('review-toggle').onclick=()=>{if(busy)return;reviewOnly=!reviewOnly;renderList();};
 $('next-review').onclick=nextPendingAddress;
 $('pending-addresses').onclick=e=>{const b=e.target.closest('[data-review]');if(b)selectPendingAddress(+b.dataset.review);};
 $('clear-btn').onclick=()=>{rows=[];selectedId=null;fileName='';sheets=[];reviewOnly=false;reviewFocusKey='';showAllPoints=false;downloads.clear();removeSheetPicker();cancelPin();render();notify('');};
 $('export-btn').onclick=()=>exportWithMaps('xlsx');$('zip-btn').onclick=()=>exportWithMaps('zip');
 $('fit-btn').onclick=()=>{if(!busy)drawMap(true);};$('cancel-pin').onclick=()=>{cancelPin();drawMap();};
 $('inspector').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||busy)return;if(b.dataset.search)searchOne(b.dataset.search);else if(b.dataset.pin)beginPin(b.dataset.pin);else if(b.id==='calculate-selected')calculateSelected();else if(b.id==='inspector-next')nextPendingAddress();else if(b.id==='png-btn')saveSelectedMap();});
 $('inspector').addEventListener('input',e=>{if(busy)return;const r=selected(),kind=e.target.dataset.address;if(!r||!kind)return;const address=clean(e.target.value);if(address===r[kind].address)return;r[kind]={address,point:null,candidates:[],confirmed:false,searched:false};clearRoute(r);validateRow(r);renderList();drawMap();const editor=e.target.closest('.point-editor');editor.querySelector('.road-address-result')?.remove();editor.querySelector('select')?.remove();editor.querySelector('.coordinate').textContent='주소를 검색하거나 지도에서 지정하세요.';$('calculate-selected').disabled=true;$('calculate-selected').textContent='위치 확인·거리 계산';document.querySelector('.route-measure')?.remove();document.querySelector('.snap-note')?.remove();document.querySelector('.row-error')?.remove();});
 $('inspector').addEventListener('change',e=>{if(busy)return;const kind=e.target.dataset.roadCandidate,r=selected();if(!r||!kind)return;const index=Number(e.target.value),p=Number.isInteger(index)?r[kind].roadCandidates?.[index]:null;if(!p)return;r[kind].roadSelected=true;r[kind].roadAddress=p.roadAddress;r[kind].roadStatus='도로명주소 직접 선택';searchOne(kind);});
 $('inspector').addEventListener('change',e=>{if(busy)return;if(e.target.matches('[data-share-address]')){shareSameAddress=e.target.checked;renderInspector();return;}const r=selected();if(!r)return;const candidate=e.target.dataset.candidate;if(candidate){const p=r[candidate].candidates[+e.target.value];if(p&&!p.requiresMapSelection){r[candidate].point=p;r[candidate].confirmed=false;clearRoute(r);render();}}});
 document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();document.body.classList.add('drop-active');}});document.addEventListener('dragleave',e=>{if(!e.relatedTarget)document.body.classList.remove('drop-active');});document.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('drop-active');if(e.dataTransfer?.files.length)importFile(e.dataTransfer.files[0]);});document.addEventListener('keydown',e=>{if(e.key==='Escape'){cancelPin();drawMap();}});
}
function registerAgentTools(){if(!document.modelContext?.registerTool)return;const controller=new AbortController();window.addEventListener('pagehide',()=>controller.abort(),{once:true});
 const tools=[{name:'read_route_results',title:'거리 계산 결과 읽기',description:'현재 불러온 구간의 주소, 계산 완료 여부, 도로거리와 확인사항을 읽습니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>exportRecords(rows)},
 {name:'select_route',title:'구간 지도 보기',description:'현재 불러온 구간 중 하나를 선택해 지도와 위치 확인 화면을 표시합니다. 거리 계산을 실행하지 않습니다.',inputSchema:{type:'object',properties:{id:{type:'integer',minimum:1}},required:['id'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(busy)throw new Error('작업 중에는 구간을 변경할 수 없습니다.');if(!input||!Number.isInteger(input.id)||!rows.some(r=>r.id===input.id))throw new Error('존재하는 구간 번호를 입력해 주세요.');selectedId=input.id;showAllPoints=false;cancelPin();render();return {selectedId,status:statusLabel(selected())};}}];
 for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:controller.signal})).catch(()=>{});}catch{}}
}
async function init(){bindEvents();try{const res=await fetch('./config.json');if(!res.ok)throw new Error('지도 설정을 읽을 수 없습니다.');config=await res.json();config.bbox=config.bbox||AREA.bbox;$('limit-text').textContent=config.maxRows;
 if(!window.L)throw new Error('지도를 불러오지 못했습니다. 새로고침해 주세요.');map=L.map('map',{zoomControl:false,scrollWheelZoom:true,minZoom:10,maxBounds:[[37.25,126.67],[37.42,126.96]],maxBoundsViscosity:1}).setView([37.337,126.812],12);L.control.zoom({position:'bottomleft'}).addTo(map);L.control.scale({position:'bottomleft',imperial:false}).addTo(map);const tiles=L.tileLayer(config.tiles,{maxZoom:19,crossOrigin:'anonymous',attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors · <a href="https://project-osrm.org" target="_blank">OSRM</a>'}).addTo(map);tileLayer=tiles;let tileFailures=0;tiles.on('tileerror',()=>{if(++tileFailures===5)notify('배경지도를 불러오지 못하고 있습니다. 인터넷 연결을 확인해 주세요.',true);});layer=L.featureGroup().addTo(map);map.on('click',e=>{if(pinMode)setPoint(pinMode,e.latlng);});new ResizeObserver(()=>map.invalidateSize()).observe($('map'));render();registerAgentTools();
 }catch(e){notify(e.message,true);$('upload-btn').disabled=true;$('sample-btn').disabled=true;}}
if(document.readyState==='complete')init();else window.addEventListener('load',init,{once:true});

