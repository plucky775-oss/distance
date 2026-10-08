// Keep the actual save/share action on a fresh user tap. Automatic downloads
// after async rendering can instead navigate Safari to a spreadsheet preview.
export function createDownloadController({panel,link,shareButton,nameLabel,notify},platform=globalThis){
 let current=null;
 function clear(){if(current)platform.URL.revokeObjectURL(current.url);current=null;panel.hidden=true;link.removeAttribute('href');shareButton.hidden=true;}
 function prepare(blob,name){
   clear();
   const url=platform.URL.createObjectURL(blob);
   const file=typeof platform.File==='function'?new platform.File([blob],name,{type:blob.type}):null;
   current={url,file};link.href=url;link.download=name;link.target='_blank';link.rel='noopener';nameLabel.textContent=name;panel.hidden=false;
   let canShare=false;try{canShare=!!file&&typeof platform.navigator?.share==='function'&&!!platform.navigator?.canShare?.({files:[file]});}catch{}
   shareButton.hidden=!canShare;shareButton.disabled=false;
   panel.scrollIntoView?.({block:'nearest',behavior:'smooth'});
 }
 link.onclick=()=>notify('파일 다운로드를 요청했습니다. 기기의 다운로드 목록에서 확인해 주세요.');
 shareButton.onclick=async()=>{
   if(!current?.file)return;
   const file=current.file;shareButton.disabled=true;
   try{await platform.navigator.share({files:[file],title:file.name});notify('공유 창을 닫았습니다. 선택한 저장 위치에서 파일을 확인해 주세요.');}
   catch(e){if(e.name!=='AbortError')notify('공유 창을 열지 못했습니다. ‘파일 내려받기’를 눌러 주세요.',true);}
   finally{shareButton.disabled=false;}
 };
 return {prepare,clear};
}
