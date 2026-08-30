const $ = id => document.getElementById(id);
const DB_NAME = 'blexo-check-documents-v4';
const STORE = 'documents';
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const blankDocument = () => ({id:newId(),name:'Novo documento',company:'',reference:'',responsible:'',notes:'',mode:'gray',cleanLevel:55,pages:[],updatedAt:new Date().toISOString()});
let currentDocument = blankDocument(), saveTimer, pendingScan = null;
let lastPdfFile = null, lastPdfName = '', lastPdfBlob = null;
function renderModuleColors(){}
function saveModuleColors(){}

function openDatabase(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function saveDocument(){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(currentDocument);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
async function saveNow(){syncFields();currentDocument.updatedAt=new Date().toISOString();await saveDocument()}
async function getDocuments(){const db=await openDatabase();return new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>{db.close();resolve(r.result||[])};r.onerror=()=>{db.close();reject(r.error)}})}
function syncFields(){currentDocument.name=$('documentName').value.trim();currentDocument.company=$('company').value.trim();currentDocument.reference=$('reference').value.trim();currentDocument.responsible=$('responsible').value.trim();currentDocument.notes=$('notes').value.trim();currentDocument.mode=document.querySelector('input[name="scanMode"]:checked')?.value||'gray';currentDocument.cleanLevel=Number($('cleanLevel').value);$('documentHeading').textContent=currentDocument.name||'Novo documento'}
function scheduleSave(msg='Salvo neste aparelho'){clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{syncFields();currentDocument.updatedAt=new Date().toISOString();await saveDocument();$('feedback').textContent=msg}catch(err){console.error(err);$('feedback').textContent='Não foi possível salvar neste aparelho.'}},350)}
function escapeHtml(v=''){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function render(){syncFields();$('documentName').value=currentDocument.name||'';$('company').value=currentDocument.company||'';$('reference').value=currentDocument.reference||'';$('responsible').value=currentDocument.responsible||'';$('notes').value=currentDocument.notes||'';const radio=document.querySelector(`input[name="scanMode"][value="${currentDocument.mode||'gray'}"]`);if(radio)radio.checked=true;$('cleanLevel').value=currentDocument.cleanLevel??55;updateCleanLabel();$('documentHeading').textContent=currentDocument.name||'Novo documento';renderPages()}
function renderPages(){
  if($('sharePdfButton')){lastPdfBlob=null;lastPdfFile=null;lastPdfName='';$('sharePdfButton').disabled=true;} if($('savePdfButton')) $('savePdfButton').disabled=true;
  const pages=currentDocument.pages;
  $('pageCount').textContent=`${pages.length} ${pages.length===1?'página':'páginas'}`;
  $('generateButton').disabled=!pages.length;
  $('pagesList').innerHTML=pages.length?pages.map((p,i)=>{
    const landscape=p.orientation==='landscape';
    return `<article class="document-page ${landscape?'orientation-landscape':'orientation-portrait'}">
      <button type="button" class="page-remove" data-remove-page="${p.id}" aria-label="Excluir página">×</button>
      <img src="${p.src}" alt="Página ${i+1}">
      <div class="page-number">Página ${String(i+1).padStart(2,'0')}</div>
      <div class="page-mode">${p.mode==='document'?'Documento':p.mode==='gray'?'Tons de cinza':'Original'}${p.corrected?' · perspectiva corrigida':''}</div>
      <div class="page-orientation"><span>Orientação</span>
        <button type="button" class="orientation-btn ${!landscape?'selected':''}" data-set-orientation="${p.id}" data-orientation="portrait" aria-pressed="${!landscape}">↕ Retrato</button>
        <button type="button" class="orientation-btn ${landscape?'selected':''}" data-set-orientation="${p.id}" data-orientation="landscape" aria-pressed="${landscape}">↔ Paisagem</button>
      </div>
      <input class="page-title" data-page-title="${p.id}" value="${escapeHtml(p.title||'')}" placeholder="Identificação da página (opcional)">
    </article>`;
  }).join(''):'<div class="empty-pages">Nenhuma página adicionada. Use “Fotografar página” ou escolha imagens da galeria.</div>';

  document.querySelectorAll('[data-remove-page]').forEach(b=>b.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
    const id=b.dataset.removePage;
    currentDocument.pages=currentDocument.pages.filter(p=>p.id!==id);
    renderPages();
    scheduleSave('Página excluída.');
    $('feedback').textContent='Página excluída.';
  }));
  document.querySelectorAll('[data-page-title]').forEach(f=>f.addEventListener('input',()=>{
    const p=currentDocument.pages.find(x=>x.id===f.dataset.pageTitle);
    if(p){p.title=f.value;scheduleSave();}
  }));
  document.querySelectorAll('[data-set-orientation]').forEach(b=>b.addEventListener('click',()=>setPageOrientation(b.dataset.setOrientation,b.dataset.orientation)));
}

async function readImage(file){
  if(!file|| (file.type && !file.type.startsWith('image/')))throw new Error('Arquivo de imagem inválido.');
  if('createImageBitmap' in window){
    try{
      const bitmap=await createImageBitmap(file,{imageOrientation:'from-image',premultiplyAlpha:'none'});
      if(bitmap.width&&bitmap.height)return bitmap;
      bitmap.close?.();
    }catch(err){console.warn('createImageBitmap indisponível, usando Image:',err)}
  }
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);if(!img.naturalWidth||!img.naturalHeight)return reject(new Error('Imagem sem dimensões válidas.'));resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Falha ao decodificar a imagem.'))};
    img.src=url;
  });
}
function imageToCanvas(img,maxSide=1920){const w=img.width||img.naturalWidth,h=img.height||img.naturalHeight,s=Math.min(1,maxSide/Math.max(w,h));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*s));c.height=Math.max(1,Math.round(h*s));const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);img.close?.();return c}
function canvasData(c,q=.82){return c.toDataURL('image/jpeg',q)}
async function imageDimensions(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>reject(new Error('Não foi possível ler a página salva.'));img.src=src})}
async function rotateDataUrl90(src,clockwise=true){const dim=await imageDimensions(src);const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=src});const c=document.createElement('canvas');c.width=dim.height;c.height=dim.width;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.translate(c.width/2,c.height/2);ctx.rotate((clockwise?1:-1)*Math.PI/2);ctx.drawImage(img,-dim.width/2,-dim.height/2);return c.toDataURL('image/jpeg',.82)}
async function setPageOrientation(id,target){const page=currentDocument.pages.find(p=>p.id===id);if(!page)return;const current=page.orientation==='landscape'?'landscape':'portrait';if(current===target)return;try{page.src=await rotateDataUrl90(page.src,target==='landscape');page.orientation=target;await saveNow();renderPages();$('feedback').textContent=`Página ${target==='landscape'?'girada para paisagem':'girada para retrato'}.`;}catch(err){console.error('Blexo orientação:',err);$('feedback').textContent=`Não foi possível ajustar a orientação: ${err?.message||'erro desconhecido'}`}}
function updateCleanLabel(){$('cleanValue').textContent=`${$('cleanLevel').value}%`}
function defaultCorners(c){const m=Math.max(1,Math.min(c.width,c.height)*.0015);return [{x:m,y:m},{x:c.width-m,y:m},{x:c.width-m,y:c.height-m},{x:m,y:c.height-m}]}
function orderPoints(p){const sum=p.map(a=>a.x+a.y),dif=p.map(a=>a.x-a.y);return [p[sum.indexOf(Math.min(...sum))],p[dif.indexOf(Math.max(...dif))],p[sum.indexOf(Math.max(...sum))],p[dif.indexOf(Math.min(...dif))]]}
function solve8(A,b){const n=8;for(let i=0;i<n;i++){let max=i;for(let r=i+1;r<n;r++)if(Math.abs(A[r][i])>Math.abs(A[max][i]))max=r;[A[i],A[max]]=[A[max],A[i]];[b[i],b[max]]=[b[max],b[i]];const pivot=A[i][i]||1e-12;for(let j=i;j<n;j++)A[i][j]/=pivot;b[i]/=pivot;for(let r=0;r<n;r++){if(r===i)continue;const f=A[r][i];for(let j=i;j<n;j++)A[r][j]-=f*A[i][j];b[r]-=f*b[i]}}return b}
function homography(src,dst){const A=[],b=[];for(let i=0;i<4;i++){const x=src[i].x,y=src[i].y,u=dst[i].x,v=dst[i].y;A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v)}const h=solve8(A,b);return [...h,1]}
function warpPerspectiveJS(srcCanvas,points){
  const p=orderPoints(points),[tl,tr,br,bl]=p;
  const topW=Math.hypot(tr.x-tl.x,tr.y-tl.y), bottomW=Math.hypot(br.x-bl.x,br.y-bl.y);
  const leftH=Math.hypot(bl.x-tl.x,bl.y-tl.y), rightH=Math.hypot(br.x-tr.x,br.y-tr.y);
  const pageW=Math.max(1,(topW+bottomW)/2), pageH=Math.max(1,(leftH+rightH)/2);
  const orientation=pageH>=pageW?'portrait':'landscape';

  // Preserve the actual selected page proportion. The result is later fitted
  // inside an A4 sheet by the PDF generator. This avoids forcing every photo
  // into a 210:297 ratio and prevents visible content from being cropped.
  const longSide=1600;
  let outW,outH;
  if(orientation==='portrait'){
    outH=longSide;
    outW=Math.max(800,Math.round(longSide*(pageW/pageH)));
    if(outW>longSide){outW=longSide;outH=Math.max(800,Math.round(longSide*(pageH/pageW)));}
  }else{
    outW=longSide;
    outH=Math.max(800,Math.round(longSide*(pageH/pageW)));
    if(outH>longSide){outH=longSide;outW=Math.max(800,Math.round(longSide*(pageW/pageH)));}
  }

  const dstQuad=[{x:0,y:0},{x:outW-1,y:0},{x:outW-1,y:outH-1},{x:0,y:outH-1}];
  const H=homography(dstQuad,p); // output -> source for inverse sampling
  const c=document.createElement('canvas');c.width=outW;c.height=outH;
  const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,outW,outH);
  const src=srcCanvas.getContext('2d').getImageData(0,0,srcCanvas.width,srcCanvas.height),dst=ctx.createImageData(outW,outH);
  const [a,b,c1,d,e,f,g,h1]=H;
  for(let y=0;y<outH;y++)for(let x=0;x<outW;x++){
    const den=g*x+h1*y+1;
    if(Math.abs(den)<1e-10)continue;
    const sx=(a*x+b*y+c1)/den,sy=(d*x+e*y+f)/den;
    const ix=Math.round(sx),iy=Math.round(sy),di=(y*outW+x)*4;
    if(ix<0||iy<0||ix>=srcCanvas.width||iy>=srcCanvas.height){
      dst.data[di]=dst.data[di+1]=dst.data[di+2]=255;dst.data[di+3]=255;continue;
    }
    const si=(iy*srcCanvas.width+ix)*4;
    dst.data[di]=src.data[si];dst.data[di+1]=src.data[si+1];dst.data[di+2]=src.data[si+2];dst.data[di+3]=255;
  }
  ctx.putImageData(dst,0,0);return {canvas:c,orientation};
}
function processCanvas(c,mode,level){if(mode==='original')return c;const ctx=c.getContext('2d'),d=ctx.getImageData(0,0,c.width,c.height),o=new ImageData(c.width,c.height),data=d.data,out=o.data;for(let i=0;i<data.length;i+=4){let y=.299*data[i]+.587*data[i+1]+.114*data[i+2];if(mode==='gray'){y=Math.min(255,Math.max(0,(y-128)*(1.15+level*.003)+128));out[i]=out[i+1]=out[i+2]=y}else{const threshold=128-(level-50)*.55,v=y<threshold?0:255;out[i]=out[i+1]=out[i+2]=v}out[i+3]=255}ctx.putImageData(o,0,0);return c}

function openReviewModal(){const modal=$('scanReview');modal.hidden=false;document.body.classList.add('scanner-modal-open');requestAnimationFrame(()=>{modal.classList.add('is-open');drawReview();$('reviewStatus').textContent='Arraste os quatro pontos para encaixar exatamente na folha.'})}
function closeReviewModal(){const modal=$('scanReview');modal.classList.remove('is-open');modal.hidden=true;document.body.classList.remove('scanner-modal-open');pendingScan=null;dragIndex=-1}
async function openReview(file){pendingScan={file};try{const img=await readImage(file);pendingScan.base=imageToCanvas(img);pendingScan.points=defaultCorners(pendingScan.base);openReviewModal()}catch(err){console.error('Blexo Scanner:',err);pendingScan=null;$('feedback').textContent=`Não foi possível abrir a imagem: ${err?.message||'arquivo inválido'}`}}
function drawReview(){if(!pendingScan)return;const c=$('reviewCanvas'),src=pendingScan.base;const wrap=$('reviewCanvasWrap');const maxW=Math.max(280,Math.min(window.innerWidth-28,1100));const maxH=Math.max(240,Math.min(window.innerHeight-250,760));const s=Math.min(maxW/src.width,maxH/src.height,1);c.width=Math.max(1,Math.round(src.width*s));c.height=Math.max(1,Math.round(src.height*s));const ctx=c.getContext('2d');ctx.drawImage(src,0,0,c.width,c.height);const pts=pendingScan.points.map(p=>({x:p.x*s,y:p.y*s}));ctx.strokeStyle='#24a7e8';ctx.lineWidth=3;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();pts.forEach((p,i)=>{ctx.beginPath();ctx.fillStyle='rgba(36,167,232,.18)';ctx.strokeStyle='transparent';ctx.arc(p.x,p.y,24,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.fillStyle='#fff';ctx.strokeStyle='#123047';ctx.lineWidth=3;ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#123047';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),p.x,p.y)});if(wrap)wrap.setAttribute('data-orientation',src.width>src.height?'landscape':'portrait')}
function reviewPointer(e){
  if(!pendingScan)return null;
  const c=$('reviewCanvas'),r=c.getBoundingClientRect();
  if(!r.width||!r.height)return null;
  const x=(e.clientX-r.left)*(pendingScan.base.width/r.width);
  const y=(e.clientY-r.top)*(pendingScan.base.height/r.height);
  return {x,y};
}
function findCornerIndex(p){
  if(!pendingScan||!p)return -1;
  const c=$('reviewCanvas'),r=c.getBoundingClientRect();
  const scaleX=r.width/pendingScan.base.width,scaleY=r.height/pendingScan.base.height;
  const hitBase=Math.max(42,34/Math.max(Math.min(scaleX,scaleY),0.01));
  let best=-1,bestDist=Infinity;
  pendingScan.points.forEach((q,i)=>{
    const d=Math.hypot(q.x-p.x,q.y-p.y);
    if(d<=hitBase&&d<bestDist){best=i;bestDist=d}
  });
  return best;
}
let dragIndex=-1;
let activePointerId=null;
const reviewCanvas=$('reviewCanvas');
reviewCanvas.addEventListener('pointerdown',e=>{
  const p=reviewPointer(e);
  const idx=findCornerIndex(p);
  if(idx<0)return;
  dragIndex=idx;activePointerId=e.pointerId;
  e.preventDefault();
  try{reviewCanvas.setPointerCapture(e.pointerId)}catch{}
  $('reviewStatus').textContent=`Ponto ${idx+1}: arraste para o canto exato da folha.`;
});
reviewCanvas.addEventListener('pointermove',e=>{
  if(dragIndex<0|| (activePointerId!==null&&e.pointerId!==activePointerId))return;
  const p=reviewPointer(e);if(!p)return;
  pendingScan.points[dragIndex].x=Math.max(0,Math.min(pendingScan.base.width,p.x));
  pendingScan.points[dragIndex].y=Math.max(0,Math.min(pendingScan.base.height,p.y));
  drawReview();
});
function endCornerDrag(e){
  if(activePointerId!==null&&e.pointerId!==undefined&&e.pointerId!==activePointerId)return;
  dragIndex=-1;activePointerId=null;
  $('reviewStatus').textContent='Arraste os quatro pontos para encaixar exatamente na folha.';
}
reviewCanvas.addEventListener('pointerup',endCornerDrag);
reviewCanvas.addEventListener('pointercancel',endCornerDrag);
reviewCanvas.addEventListener('lostpointercapture',()=>{dragIndex=-1;activePointerId=null});
// Fallback para Safari/iOS antigo ou ambientes em que Pointer Events sejam inconsistentes.
let touchDragging=false;
reviewCanvas.addEventListener('touchstart',e=>{
  if(!e.touches.length||dragIndex>=0)return;
  const t=e.touches[0],p=reviewPointer(t),idx=findCornerIndex(p);
  if(idx<0)return;
  touchDragging=true;dragIndex=idx;e.preventDefault();
  $('reviewStatus').textContent=`Ponto ${idx+1}: arraste para o canto exato da folha.`;
},{passive:false});
reviewCanvas.addEventListener('touchmove',e=>{
  if(!touchDragging||dragIndex<0||!e.touches.length)return;
  const p=reviewPointer(e.touches[0]);if(!p)return;
  pendingScan.points[dragIndex].x=Math.max(0,Math.min(pendingScan.base.width,p.x));
  pendingScan.points[dragIndex].y=Math.max(0,Math.min(pendingScan.base.height,p.y));
  drawReview();e.preventDefault();
},{passive:false});
reviewCanvas.addEventListener('touchend',e=>{if(touchDragging){touchDragging=false;dragIndex=-1;$('reviewStatus').textContent='Arraste os quatro pontos para encaixar exatamente na folha.';}},{passive:false});
reviewCanvas.addEventListener('touchcancel',e=>{touchDragging=false;dragIndex=-1},{passive:false});

async function confirmScan(){
  if(!pendingScan)return false;
  const mode=document.querySelector('input[name="scanMode"]:checked')?.value||'gray',level=Number($('cleanLevel').value);
  $('reviewStatus').textContent='Processando documento…';$('confirmScan').disabled=true;
  try{
    await new Promise(r=>setTimeout(r,30));
    const edgeLimit=Math.max(8,Math.min(pendingScan.base.width,pendingScan.base.height)*.008); const nearEdge=pendingScan.points.some(p=>p.x<=edgeLimit||p.y<=edgeLimit||p.x>=pendingScan.base.width-edgeLimit||p.y>=pendingScan.base.height-edgeLimit); let warped=warpPerspectiveJS(pendingScan.base,pendingScan.points); let result=processCanvas(warped.canvas,mode,level); if(nearEdge) console.info('Blexo Scanner: ponto de folha próximo à borda da foto; mantendo a área selecionada integralmente.');
    const page={id:newId(),src:canvasData(result,.82),title:'',mode,corrected:true,orientation:warped.orientation,warning:''};
    currentDocument.pages.push(page);await saveNow();renderPages();$('feedback').textContent=`Página A4 ${warped.orientation==='landscape'?'paisagem':'retrato'} corrigida e salva neste aparelho.`;closeReviewModal();return true;
  }catch(err){console.error('Blexo Scanner:',err);$('reviewStatus').textContent=`Não foi possível processar a imagem: ${err?.message||'erro desconhecido'}`;return false}
  finally{$('confirmScan').disabled=false}
}
async function addFiles(files){const list=[...files].filter(f=>f&&(!f.type||f.type.startsWith('image/')));if(!list.length){$('feedback').textContent='Selecione uma imagem válida.';return}for(const f of list){$('feedback').textContent='Abrindo e preparando a foto…';await new Promise(r=>setTimeout(r,20));await openReview(f);if(!pendingScan)continue;await new Promise(resolve=>{const onConfirm=async()=>{cleanup();await confirmScan();resolve()};const onCancel=()=>{cleanup();closeReviewModal();resolve()};const cleanup=()=>{$('confirmScan').removeEventListener('click',onConfirm);$('cancelScan').removeEventListener('click',onCancel);$('closeReview').removeEventListener('click',onCancel)};$('confirmScan').addEventListener('click',onConfirm);$('cancelScan').addEventListener('click',onCancel);$('closeReview').addEventListener('click',onCancel)})}}
function splitTextPdf(text,maxChars=90){
  const words=String(text||'').split(/\s+/); const lines=[]; let line='';
  for(const w of words){const test=line?line+' '+w:w;if(test.length>maxChars&&line){lines.push(line);line=w}else line=test} if(line)lines.push(line); return lines.length?lines:['—'];
}
function pdfEscape(text){return String(text??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[\r\n]+/g,' ')}
function dataUrlBytes(src){const comma=src.indexOf(',');const raw=atob(src.slice(comma+1));const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes}
function jpegSize(bytes){for(let i=2;i<bytes.length-9;){if(bytes[i]!==0xFF){i++;continue}const marker=bytes[i+1];const len=(bytes[i+2]<<8)|bytes[i+3];if(marker>=0xC0&&marker<=0xC3){return {height:(bytes[i+5]<<8)|bytes[i+6],width:(bytes[i+7]<<8)|bytes[i+8]}}i+=2+len}throw new Error('JPEG inválido.')}
function buildPdf(pages){
  const objects=[]; const add=o=>{objects.push(o);return objects.length};
  const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pagesRoot=add(null); const pageRefs=[];
  for(let i=0;i<pages.length;i++){
    const p=pages[i],landscape=p.orientation==='landscape'; const W=landscape?841.89:595.28,H=landscape?595.28:841.89;
    const imgBytes=dataUrlBytes(p.src), dim=jpegSize(imgBytes); const img=add(`<< /Type /XObject /Subtype /Image /Width ${dim.width} /Height ${dim.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`+imgBytesToBinary(imgBytes)+'\nendstream');
    const content=[];
    content.push('q');
    const hc=parseHeaderColor(typeof blexoConfig==='function'?(blexoConfig().scannerHeaderColor||'#123047'):'#123047');
    content.push(`${(hc[0]/255).toFixed(4)} ${(hc[1]/255).toFixed(4)} ${(hc[2]/255).toFixed(4)} rg 0 ${H-51.02} ${W} 51.02 re f`);
    content.push('BT /F1 40 Tf 1 1 1 rg 28.35 '+(H-34)+' Td ('+pdfEscape(typeof blexoConfig==='function'?(blexoConfig().scannerHeaderName||'Blexo-Scanner'):'Blexo-Scanner')+') Tj ET');
    let top=H-75; const identification=i===0?pages.identification:[]; if(i===0&&pages.documentTitle){content.push('BT /F1 28 Tf 0.16 0.20 0.23 rg 28.35 '+top+' Td ('+pdfEscape(pages.documentTitle)+') Tj ET');top-=24}
    if(i===0&&identification.length){for(const [label,value] of identification){content.push('BT /F1 24 Tf 0.16 0.20 0.23 rg 28.35 '+top+' Td ('+pdfEscape(label+': '+value)+') Tj ET');top-=18}}
    const left=28.35,right=28.35,bottom=28.35,availableW=W-left-right,availableH=top-bottom;
    const r=Math.min(availableW/dim.width,availableH/dim.height);const iw=dim.width*r,ih=dim.height*r;const x=left+(availableW-iw)/2;const y=bottom+(availableH-ih)/2;
    content.push(`${iw.toFixed(3)} 0 0 ${ih.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm /Im${i+1} Do`);
    if(p.title){content.push('BT /F1 20 Tf 0.35 0.35 0.35 rg 28.35 14 Td ('+pdfEscape(p.title)+') Tj ET')}
    content.push('Q');
    const stream=content.join('\n'); const contentRef=add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageRef=add(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im${i+1} ${img} 0 R >> >> /Contents ${contentRef} 0 R >>`); pageRefs.push(pageRef);
  }
  objects[pagesRoot-1]=`<< /Type /Pages /Kids [${pageRefs.map(r=>r+' 0 R').join(' ')}] /Count ${pageRefs.length} >>`;
  const catalog=add(`<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`);
  let out='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets[i+1]=byteLength(out);out+=`${i+1} 0 obj\n`;const obj=objects[i];out+=obj;out+='\nendobj\n'}
  const xref=byteLength(out);out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)out+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';out+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return binaryBlob(out);
}
function imgBytesToBinary(bytes){let s='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)s+=String.fromCharCode(...bytes.subarray(i,i+chunk));return s}
function byteLength(s){return s.length}
function binaryBlob(s){const bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i)&255;return new Blob([bytes],{type:'application/pdf'})}
function parseHeaderColor(value){
  const fallback=[18,48,71];
  const h=String(value||'#123047').trim().replace(/^#/,'');
  if(!/^[0-9a-fA-F]{6}$/.test(h)) return fallback;
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
}
function downloadPdf(){if(!lastPdfBlob){$('feedback').textContent='Gere o PDF antes de salvar.';return}const url=URL.createObjectURL(lastPdfBlob);const a=document.createElement('a');a.href=url;a.download=lastPdfName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);$('feedback').textContent='PDF salvo/baixado.'}
async function generatePdf(){
  if(!currentDocument.pages.length){$('feedback').textContent='Adicione pelo menos uma página antes de gerar o PDF.';return null}
  try{
    await saveNow();
    const title=currentDocument.name||'Documento digitalizado'; const cfg=typeof blexoConfig==='function'?blexoConfig():{};
    const prepared=currentDocument.pages.map(p=>({...p,orientation:p.orientation==='landscape'?'landscape':'portrait'}));
    prepared.documentTitle=title; prepared.identification=[['Apresentação',currentDocument.reference],['Empresa / condomínio',currentDocument.company],['Responsável',currentDocument.responsible]].filter(([,v])=>String(v||'').trim()).map(([a,b])=>[a,String(b)]);
    lastPdfName=`blexo-documento-${title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'digitalizado'}.pdf`;
    if(currentDocument.notes&&String(currentDocument.notes).trim()){
      const notesPage={src:makeNotesPageDataUrl(currentDocument.notes,title,cfg.scannerHeaderColor||'#123047',cfg.scannerHeaderName||'Blexo-Scanner'),orientation:'portrait',title:''};
      prepared.push(notesPage);
    }
    lastPdfBlob=buildPdf(prepared); try{lastPdfFile=new File([lastPdfBlob],lastPdfName,{type:'application/pdf'})}catch{lastPdfFile=null}
    $('savePdfButton').disabled=false;$('sharePdfButton').disabled=false;
    $('feedback').textContent='PDF gerado com sucesso. Você pode salvar ou enviar/compartilhar.'; return lastPdfBlob;
  }catch(err){console.error('Blexo PDF:',err);$('feedback').textContent=`Falha ao gerar PDF: ${err?.message||'erro desconhecido'}`;return null}
}
function makeNotesPageDataUrl(notes,title,color,name){const c=document.createElement('canvas');c.width=1240;c.height=1754;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle=color;x.fillRect(0,0,c.width,120);x.fillStyle='#fff';x.font='bold 32px Arial';x.fillText(name,60,78);x.fillStyle='#1e2e38';x.font='bold 28px Arial';x.fillText('Observações finais',60,190);x.font='24px Arial';let y=240;for(const line of String(notes).split(/\r?\n/)){x.fillText(line.slice(0,75),60,y);y+=36}return c.toDataURL('image/jpeg',.88)}
async function sharePdf(){
  if(!lastPdfBlob){$('feedback').textContent='Gere o PDF antes de enviá-lo.';return}
  const subject=currentDocument.name||'Relatório Blexo-Scanner'; const details=[];if(currentDocument.company)details.push(currentDocument.company);if(currentDocument.responsible)details.push(`Responsável: ${currentDocument.responsible}`);const text=`Segue o documento “${subject}”.${details.length?'\n'+details.join('\n'):''}`;
  try{if(lastPdfFile&&navigator.share&&(!navigator.canShare||navigator.canShare({files:[lastPdfFile]}))){await navigator.share({files:[lastPdfFile],title:subject,text});$('feedback').textContent='Compartilhamento aberto.';return} downloadPdf(); const mailto=`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text+'\n\nO PDF foi salvo no aparelho. Anexe o arquivo '+lastPdfName+' a esta mensagem.')}`;window.location.href=mailto;}catch(err){if(err?.name==='AbortError'){$('feedback').textContent='Compartilhamento cancelado.';return}console.error(err);$('feedback').textContent=`Não foi possível compartilhar: ${err?.message||'erro desconhecido'}`}}
['documentName','company','reference','responsible','notes'].forEach(id=>$(id).addEventListener('input',()=>{syncFields();scheduleSave()}));
$('cameraInput').addEventListener('change',e=>{const files=e.target.files;addFiles(files).catch(err=>{$('feedback').textContent=`Não foi possível abrir a foto: ${err?.message||'erro desconhecido'}`});e.target.value=''});
$('galleryInput').addEventListener('change',e=>{const files=e.target.files;addFiles(files).catch(err=>{$('feedback').textContent=`Não foi possível abrir as fotos: ${err?.message||'erro desconhecido'}`});e.target.value=''});
$('generateButton').onclick=generatePdf; if($('savePdfButton')) $('savePdfButton').onclick=downloadPdf;
if($('sharePdfButton')) $('sharePdfButton').onclick=sharePdf;$('cleanLevel').addEventListener('input',()=>{updateCleanLabel();syncFields();scheduleSave()});document.querySelectorAll('input[name="scanMode"]').forEach(r=>r.addEventListener('change',()=>{syncFields();scheduleSave('Modo de tratamento alterado.')}));
$('cancelScan').onclick=closeReviewModal;$('closeReview').onclick=closeReviewModal;
window.addEventListener('resize',()=>{if(!pendingScan||$('scanReview').hidden)return;drawReview()});window.addEventListener('orientationchange',()=>setTimeout(()=>{if(pendingScan&&!$('scanReview').hidden)drawReview()},250));
window.addEventListener('online',setOnlineStatus);window.addEventListener('offline',setOnlineStatus);function setOnlineStatus(){const on=navigator.onLine;$('offlineStatus').textContent=on?'● Online':'● Offline';$('offlineStatus').classList.toggle('offline',!on)}
function setProcessingStatus(){const el=$('opencvStatus');if(el)el.textContent='Processamento local pronto'}
window.__blexoScannerReady=true;
(async()=>{try{const docs=await getDocuments();if(docs.length)currentDocument=docs.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt))[0];render();setOnlineStatus();setProcessingStatus()}catch(err){console.error(err);render();setOnlineStatus();setProcessingStatus()}})();
