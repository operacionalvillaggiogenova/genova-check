// Fotos em PDF não precisam da resolução original da câmera. A4 em campo é
// legível com esta faixa e o ganho de tamanho/velocidade é significativo.
(function () {
  if (window.BlexoPhoto) return;
  const nativeToDataUrl = HTMLCanvasElement.prototype.toDataURL;
  const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
  function options() {
    const c = typeof blexoConfig === 'function' ? blexoConfig() : {};
    const quality = c.pdfImageQuality === 'high' ? .78 : c.pdfImageQuality === 'compact' ? .62 : .70;
    const maxSide = c.pdfImageQuality === 'high' ? 1440 : c.pdfImageQuality === 'compact' ? 960 : 1280;
    return { mode: c.pdfImageMode || 'color', quality, maxSide };
  }
  function apply(canvas, forced = {}) {
    const o = { ...options(), ...forced }, ctx = canvas.getContext('2d');
    if (o.mode === 'color') return canvas;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2];
      const value = o.mode === 'mono' ? (gray < 155 ? 0 : 255) : gray;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }
  function encode(canvas, forced = {}) { const o = { ...options(), ...forced }; apply(canvas, o); return nativeToDataUrl.call(canvas, 'image/jpeg', o.quality); }
  async function fromFile(file, forced = {}) {
    const o = { ...options(), ...forced }, bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, o.maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    return encode(canvas, o);
  }
  window.BlexoPhoto = { options, apply, encode, fromFile };
  // Módulos legados que já usam canvas passam a obedecer ao mesmo modo e
  // qualidade, sem alterar a forma como cada formulário armazena suas fotos.
  HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
    if (type === 'image/jpeg') { const o = options(); apply(this, o); return nativeToDataUrl.call(this, type, o.quality); }
    return nativeToDataUrl.call(this, type, quality);
  };
  HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
    if (type === 'image/jpeg') { const o = options(); apply(this, o); return nativeToBlob.call(this, callback, type, o.quality); }
    return nativeToBlob.call(this, callback, type, quality);
  };
})();
