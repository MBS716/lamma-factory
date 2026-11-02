/* ================= REAL PHOTOS (spot the difference + puzzle) ================= */
const PW = 800;
const photoURL = (id, size = PW) => `https://picsum.photos/seed/lamma-${id}/${size}/${size}`;
const randPhotoId = () => 1 + Math.floor(Math.random() * 900000);
let PHOTOS_OK = null;
function loadImg(url, cors){
  return new Promise((res, rej) => {
    const im = new Image(); if (cors) im.crossOrigin = "anonymous";
    const t = setTimeout(() => { im.onload = im.onerror = null; rej(new Error("timeout")); }, 15000);
    im.onload = () => { clearTimeout(t); res(im); };
    im.onerror = () => { clearTimeout(t); rej(new Error("load")); };
    im.src = url;
  });
}
const photosReady = (async () => {
  try { const im = await loadImg(photoURL(7, 32), true); const c = document.createElement("canvas"); c.width = c.height = 4; const x = c.getContext("2d"); x.drawImage(im, 0, 0, 4, 4); x.getImageData(0, 0, 1, 1); PHOTOS_OK = true; }
  catch(e){ PHOTOS_OK = false; }
  return PHOTOS_OK;
})();
