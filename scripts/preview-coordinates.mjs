// Local UI fixture only. No requests are sent to map/geocoding/routing services.
// Run: node scripts/preview-coordinates.mjs, then open http://localhost:4173/.
import http from 'node:http';
import fs from 'node:fs/promises';
const root=new URL('../dist/',import.meta.url);
const places={
 '안산시청':[126.831,37.322,'안산시청','안산시','단원구'],
 '상록구청':[126.846,37.301,'상록구청','안산시','상록구'],
 '정왕본동 행정복지센터':[126.746,37.347,'정왕본동 행정복지센터','시흥시','정왕본동'],
 '안산시 단원구 중앙역':[126.839,37.316,'중앙역','안산시','단원구']
};
const tile='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9eff5"/><path d="M0 128H256M128 0V256" stroke="#cbd7e5" stroke-width="4"/><text x="25" y="40" fill="#789" font-size="16">TEST MAP · 모의 지도</text></svg>';
http.createServer(async(req,res)=>{
 const url=new URL(req.url,`http://${req.headers.host||'localhost:4173'}`);
 const json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/config.json')return json({roadAddressApi:url.origin+'/mock-road',geocoder:url.origin+'/mock-search',router:url.origin+'/mock-route/',tiles:url.origin+'/mock-tile/{z}/{x}/{y}',maxRows:200,requestIntervalMs:1,bbox:[126.67,37.25,126.96,37.42]});
 if(url.pathname==='/mock-road'){
   let body='';for await(const chunk of req)body+=chunk;const {address}=JSON.parse(body);
   return json({candidates:address.includes('고잔동 518')?[{roadAddress:'경기도 안산시 단원구 시험로 10',buildingName:'검증용 가상 건물'}]:address.includes('정왕동 1351')?[{roadAddress:'경기도 시흥시 시험로 20',buildingName:'검증용 가상 건물 A'},{roadAddress:'경기도 시흥시 시험로 20-1',buildingName:'검증용 가상 건물 B'}]:[]});
 }
 if(url.pathname==='/mock-search'){
   const q=url.searchParams.get('q');
   if(q.includes('시험로'))return json({features:[{geometry:{coordinates:[q.includes('시흥시')?126.746:126.831,q.includes('시흥시')?37.347:37.322]},properties:{city:q.includes('시흥시')?'시흥시':'안산시',district:q.includes('시흥시')?'정왕동':'단원구',street:'시험로',housenumber:q.split(' ').at(-1),type:'house'}}]});
   const p=places[url.searchParams.get('q')];
   return json({features:p?[{geometry:{coordinates:p.slice(0,2)},properties:{name:p[2],city:p[3],district:p[4],type:'house'}}]:[]});
 }
 if(url.pathname.startsWith('/mock-route/')){
   const coordinates=url.pathname.split('/').at(-1).split(';').map(p=>p.split(',').map(Number));
   return json({code:'Ok',routes:[{distance:1234,duration:120,geometry:{type:'LineString',coordinates}}],waypoints:coordinates.map(location=>({distance:0,location}))});
 }
 if(url.pathname.startsWith('/mock-tile/')){res.setHeader('Content-Type','image/svg+xml');return res.end(tile);}
 if(url.pathname==='/phone'||url.pathname==='/tablet'){
   res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<p>모의 응답 UI 검사 · ${url.pathname}</p><iframe title="좌표 화면 검사" src="/" style="width:${url.pathname==='/phone'?390:820}px;height:1000px;border:1px solid #aaa"></iframe>`);
 }
 try{
   if(url.pathname.includes('..'))throw Error('Invalid path');
   const path=url.pathname==='/'?'index.html':url.pathname.slice(1);
   let data=await fs.readFile(new URL(path,root));
   if(path==='index.html')data=Buffer.from(data.toString().replace('<body>','<body><p style="margin:0;padding:8px;background:#fff4cf">UI 검증용 모의 데이터 · 실제 주소/도로 정확도 검증 아님</p>'));
   if(path==='style.css')data=Buffer.from(data.toString().replace(/^@import[^\n]+\n/,''));
   res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end('Not found');}
}).listen(Number(process.env.PORT)||4173,'0.0.0.0',()=>console.log('Coordinate UI fixture ready (mock services only)'));
