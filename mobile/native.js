import {Capacitor,registerPlugin} from '@capacitor/core';
import {Filesystem,Directory} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
const DocumentSaver=registerPlugin('DocumentSaver');
const folder='route-note-exports';
function base64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('파일을 준비하지 못했습니다.'));reader.readAsDataURL(blob);});}
async function stage(blob,name){
 const safe=name.replace(/[\\/\u0000-\u001f]/g,'_');
 const path=`${folder}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
 await Filesystem.writeFile({path,data:'',directory:Directory.Cache,recursive:true});
 try{
   // Limit each bridge message instead of base64-encoding a 50-map ZIP at once.
   for(let start=0;start<blob.size;start+=262144)await Filesystem.appendFile({path,data:await base64(blob.slice(start,start+262144)),directory:Directory.Cache});
   const {uri}=await Filesystem.getUri({path,directory:Directory.Cache});return {path,uri,name:safe};
 }catch(error){await Filesystem.deleteFile({path,directory:Directory.Cache}).catch(()=>{});throw error;}
}
async function cleanOldFiles(){
 const {files}=await Filesystem.readdir({path:folder,directory:Directory.Cache});
 for(const file of files)if(file.type==='file'&&Date.now()-file.mtime>86400000)await Filesystem.deleteFile({path:`${folder}/${file.name}`,directory:Directory.Cache});
}
if(Capacitor.getPlatform()==='android'){
 globalThis.RouteNoteNative={
   async save(blob,name){const file=await stage(blob,name);try{return await DocumentSaver.save({uri:file.uri,name:file.name,mime:blob.type||'application/octet-stream'});}finally{await Filesystem.deleteFile({path:file.path,directory:Directory.Cache}).catch(()=>{});}},
   async share(blob,name){const file=await stage(blob,name);await Share.share({files:[file.uri],title:name,dialogTitle:'결과 파일 공유'});}
 };
 cleanOldFiles().catch(()=>{});
}
