import {normalizeAddress,excludedAddress} from '../../dist/core.js';
import {addressParts,roadCandidates} from '../../dist/road-address.js';

// No key, raw upstream URL, or upstream error body is returned or logged.
const cache=new Map();
export default async function handler(request){
 const origin=request.headers.get('origin'),siteOrigin=new URL(process.env.URL||request.url).origin;
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&![siteOrigin,new URL(request.url).origin,'https://localhost'].includes(origin))return reply({code:'ORIGIN_DENIED',message:'이 앱에서만 주소 변환을 사용할 수 있습니다.'},403);
 if(origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type';}
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({code:'METHOD',message:'POST 요청이 필요합니다.'},405);
 if(!request.headers.get('content-type')?.includes('application/json'))return reply({code:'FORMAT',message:'JSON 형식으로 주소를 보내 주세요.'},415);
 let input;try{const text=await request.text();if(text.length>1500)return reply({code:'SIZE',message:'주소가 너무 깁니다.'},413);input=JSON.parse(text);}catch{return reply({code:'FORMAT',message:'요청 형식이 올바르지 않습니다.'},400);}
 if(typeof input?.address!=='string'||input.address.length<3||input.address.length>250||/[\x00-\x1f]/.test(input.address))return reply({code:'ADDRESS',message:'주소를 확인해 주세요.'},400);
 const address=normalizeAddress(input.address);
 if(excludedAddress(address)||addressParts(address).type!=='parcel')return reply({code:'ADDRESS',message:'대상 지역의 지번주소를 입력해 주세요.'},400);
 const key=process.env.JUSO_API_KEY?.trim();
 if(!key)return reply({code:'JUSO_NOT_CONFIGURED',message:'Netlify의 JUSO_API_KEY를 Functions 범위에 등록하고 다시 배포해 주세요.',stopBatch:true},503);
 const saved=cache.get(address);if(saved&&saved.until>Date.now())return reply(saved.value);
 const url=new URL('https://www.juso.go.kr/addrlink/addrLinkApi.do');
 for(const [name,value] of Object.entries({confmKey:key,currentPage:'1',countPerPage:'100',keyword:address,resultType:'json',hstryYn:'N',addInfoYn:'Y'}))url.searchParams.set(name,value);
 let data;
 try{
   const upstream=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
   if(!upstream.ok)return reply({code:'JUSO_UNAVAILABLE',message:'공식 주소검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',stopBatch:true},502);
   data=await upstream.json();
 }catch{return reply({code:'JUSO_UNAVAILABLE',message:'공식 주소검색 서버 응답이 늦거나 올바르지 않습니다. 잠시 후 다시 시도해 주세요.',stopBatch:true},502);}
 const common=data?.results?.common;
 if(!common)return reply({code:'JUSO_RESPONSE',message:'공식 주소검색 응답 형식을 확인하지 못했습니다.',stopBatch:true},502);
 const errorCode=/^(?:E\d{4}|\d{1,4})$/.test(String(common.errorCode))?String(common.errorCode):'확인 불가';
 if(String(common.errorCode)!=='0')return reply({code:'JUSO_REJECTED',message:`공식 주소검색에서 요청을 거절했습니다 (코드 ${errorCode}). 검색 API 승인키 종류·유효기간·등록 상태를 확인해 주세요.`,stopBatch:true},502);
 const total=Number(common.totalCount);
 if(!Number.isInteger(total)||total<0||!Array.isArray(data.results.juso))return reply({code:'JUSO_RESPONSE',message:'공식 주소검색 결과 형식을 확인하지 못했습니다.',stopBatch:true},502);
 const value={candidates:total>100?[]:roadCandidates(data.results.juso,address),source:'행정안전부 주소검색',tooMany:total>100};
 if(cache.size>=1000)cache.delete(cache.keys().next().value);
 cache.set(address,{value,until:Date.now()+600000});
 return reply(value);
}
export const config={path:'/api/road-address',rateLimit:{action:'rate_limit',windowSize:60,windowLimit:60,aggregateBy:['ip','domain']}};
