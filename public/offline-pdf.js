(function(){
  const encoder = new TextEncoder();
  const concat = chunks => {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  };
  const text = value => encoder.encode(String(value));
  const imageBytes = async src => new Uint8Array(await (await fetch(src)).arrayBuffer());
  const dimensions = bytes => {
    for (let i=2; i<bytes.length-9;) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i+1];
      if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
      const len = (bytes[i+2] << 8) | bytes[i+3];
      if (!len || i+2+len > bytes.length) break;
      if (marker >= 0xc0 && marker <= 0xc3) return { width:(bytes[i+7]<<8)|bytes[i+8], height:(bytes[i+5]<<8)|bytes[i+6] };
      i += 2 + len;
    }
    throw new Error('JPEG inválido para exportação.');
  };
  window.BlexoOfflinePdf = async function(images, name){
    if (!images?.length) throw new Error('Nenhuma página para exportar.');
    const objects = [];
    const add = chunks => (objects.push(chunks), objects.length);
    const font = add([text('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')]);
    const root = add([]);
    const pages = [];
    for (let index=0; index<images.length; index++) {
      const bytes = await imageBytes(images[index]);
      const d = dimensions(bytes);
      const img = add([text(`<< /Type /XObject /Subtype /Image /Width ${d.width} /Height ${d.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`), bytes, text('\nendstream')]);
      const stream = text(`q\n595.28 0 0 841.89 0 0 cm\n/Im${index+1} Do\nQ`);
      const content = add([text(`<< /Length ${stream.length} >>\nstream\n`), stream, text('\nendstream')]);
      pages.push(add([text(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im${index+1} ${img} 0 R >> >> /Contents ${content} 0 R >>`)]));
    }
    objects[root-1] = [text(`<< /Type /Pages /Kids [${pages.map(x=>x+' 0 R').join(' ')}] /Count ${pages.length} >>`)];
    const catalog = add([text(`<< /Type /Catalog /Pages ${root} 0 R >>`)]);
    const prefix = text('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const chunks=[prefix], offsets=[0]; let position=prefix.length;
    objects.forEach((parts,index)=>{
      offsets[index+1]=position;
      const objectBytes=concat([text(`${index+1} 0 obj\n`), ...parts, text('\nendobj\n')]);
      chunks.push(objectBytes); position += objectBytes.length;
    });
    const startXref=position;
    const xref=text(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${startXref}\n%%EOF`);
    chunks.push(xref);
    const blob=new Blob([concat(chunks)],{type:'application/pdf'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=name||'blexo-relatorio.pdf'; a.style.display='none'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    return blob;
  };
})();
