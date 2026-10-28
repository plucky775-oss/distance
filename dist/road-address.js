import {clean,normalizeAddress,excludedAddress} from './core.js';

const compact=value=>clean(value).replace(/\s/g,'');
export function addressParts(value){
 const query=normalizeAddress(value).replace(/(\d)\s*-\s*(?=\d)/g,'$1-').replace(/\s*\([^)]*\)\s*$/,'').trim();
 const parcel=query.match(/(?:^|\s)([가-힣0-9·]+(?:동|읍|면|리))\s*(산\s*)?(\d+)(?:-(\d+))?\s*(?:번지)?$/);
 if(parcel)return {type:'parcel',query,locality:parcel[1],mountain:!!parcel[2],main:String(Number(parcel[3])),sub:String(Number(parcel[4]||0))};
 const road=query.match(/(?:^|\s)([가-힣A-Za-z0-9·.]+(?:로|길))\s*(지하\s*)?(\d+)(?:-(\d+))?$/);
 if(road){const name=road[1],number=String(Number(road[3]))+(Number(road[4])?'-'+Number(road[4]):'');return {type:'road',query:query.slice(0,road.index).trim()+' '+name+' '+(road[2]?'지하 ':'')+number,locality:name,underground:!!road[2],main:String(Number(road[3])),sub:String(Number(road[4]||0))};}
 return {type:'place',query};
}

// Validate the official address relation, not a fuzzy search's result order.
export function roadCandidates(data,keyword){
 const input=addressParts(keyword),seen=new Set();
 if(input.type!=='parcel')return [];
 return (data||[]).filter(item=>{
   const sgg=clean(item.sggNm),emd=clean(item.emdNm);
   if(excludedAddress([sgg,emd,item.jibunAddr,item.roadAddrPart1].join(' '))||item.hstryYn==='1')return false;
   if(!(/^안산시 (?:단원구|상록구)$/.test(sgg)||(sgg==='시흥시'&&emd==='정왕동')))return false;
   const city=input.query.match(/(?:^|\s)([가-힣]+시)(?:\s|$)/)?.[1];
   const district=input.query.match(/(?:^|\s)([가-힣]+구)(?:\s|$)/)?.[1];
   if(city&&!sgg.startsWith(city))return false;
   if(district&&!sgg.endsWith(district))return false;
   const primary=(emd===input.locality||clean(item.liNm)===input.locality)&&String(Number(item.lnbrMnnm))===input.main&&String(Number(item.lnbrSlno||0))===input.sub&&(String(item.mtYn)==='1')===input.mountain;
   const related=clean(item.relJibun||item.reljibun).split(/[,;\n]/).some(value=>{
     const p=addressParts(value),relatedCity=p.query.match(/(?:^|\s)([가-힣]+시)(?:\s|$)/)?.[1],relatedDistrict=p.query.match(/(?:^|\s)([가-힣]+구)(?:\s|$)/)?.[1];
     return (!relatedCity||sgg.startsWith(relatedCity))&&(!relatedDistrict||sgg.endsWith(relatedDistrict))&&p.type==='parcel'&&p.locality===input.locality&&p.main===input.main&&p.sub===input.sub&&p.mountain===input.mountain;
   });
   return (primary||related)&&addressParts(item.roadAddrPart1).type==='road';
 }).map(item=>({roadAddress:clean(item.roadAddrPart1),jibunAddress:clean(item.jibunAddr),buildingName:clean(item.bdNm),source:'행정안전부 주소검색'}))
 .filter(item=>{const key=compact(item.roadAddress);if(seen.has(key))return false;seen.add(key);return true;});
}

export async function resolveRoadAddress(endpoint,config,request,cache,force=false){
 const parts=addressParts(endpoint.address);
 if(parts.type==='road'){
   endpoint.roadAddress=parts.query.trim();endpoint.roadStatus='입력 도로명주소';endpoint.roadCandidates=[];
   return endpoint.roadAddress;
 }
 if(parts.type!=='parcel'){endpoint.roadAddress='';endpoint.roadCandidates=[];endpoint.roadStatus='장소명 검색';return parts.query;}
 // A choice among official exact-parcel candidates belongs only to this endpoint.
 if(endpoint.roadSelected&&endpoint.roadAddress)return endpoint.roadAddress;
 endpoint.roadAddress='';endpoint.roadStatus='도로명주소 변환 중';
 const key=parts.query;let result=force?undefined:cache.get(key);
 if(!result){
   if(!config.roadAddressApi)throw Object.assign(new Error('도로명주소 변환 서버가 설정되지 않았습니다.'),{stopBatch:true});
   result=await request(config.roadAddressApi,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:key}),service:'road'});
   if(!Array.isArray(result.candidates))throw Object.assign(new Error('도로명주소 변환 서버의 응답을 확인해 주세요.'),{stopBatch:true});
   cache.set(key,result);
 }
 endpoint.roadCandidates=result.candidates.map(p=>({...p}));
 if(result.candidates.length!==1){endpoint.roadStatus=result.tooMany?'검색 결과가 많아 상세 주소 필요':result.candidates.length?'도로명주소 선택 필요':'일치하는 도로명주소 없음';return null;}
 endpoint.roadAddress=result.candidates[0].roadAddress;endpoint.roadStatus='도로명주소 변환 완료';
 return endpoint.roadAddress;
}
