/* Printable poster for one masjid: poster.html?m=<masjid code>.
 * Name and area come from the public `posterInfo` call; everything is set
 * with textContent. Download saves a 2480 × 3508 PNG (A4 at 300 dpi). */
(function () {
  'use strict';

  const PLAY = 'https://play.google.com/store/apps/details?id=com.salah_e_waqt.app';
  const GENERIC = ['masjid', 'masjide', 'masjid-e', 'mosque', 'jama', 'jamia', 'jame', 'jumma', 'the', 'shree', 'shri',
    'hazrat', 'sunni', 'trust', 'e'];
  const $ = (id) => document.getElementById(id);
  const msg = $('msg');
  const btn = $('dl');
  let fileName = 'masjid-poster.png';

  function fit() {
    const scaler = $('scaler');
    const poster = $('poster');
    const s = scaler.clientWidth / 1240;
    poster.style.transform = 'scale(' + s + ')';
    scaler.style.height = Math.round(1754 * s) + 'px';
  }

  // Word people type to find the masjid: its first distinctive word.
  function searchWord(name) {
    const words = name.replace(/[,.()]/g, ' ').split(/\s+/).filter(Boolean);
    return words.find((w) => w.length > 2 && !GENERIC.includes(w.toLowerCase())) || words[0] || name;
  }

  // Long names get smaller so they stay within two lines.
  function sizeName(el, text) {
    const len = text.length;
    el.style.fontSize = (len <= 20 ? 80 : len <= 28 ? 68 : len <= 38 ? 56 : len <= 52 ? 46 : 38) + 'px';
  }

  function drawQr() {
    const qr = qrcode(0, 'M');
    qr.addData(PLAY);
    qr.make();
    const n = qr.getModuleCount();
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + n + ' ' + n);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'QR code to download Salah-e-Waqt');
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#141a33');
    svg.appendChild(path);
    $('pQr').appendChild(svg);
  }

  async function load() {
    const id = new URLSearchParams(location.search).get('m');
    if (!id) { msg.textContent = 'This link is missing the masjid code.'; return; }
    let info;
    try {
      const res = await fetch(window.ADMIN_CONFIG.apiUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'posterInfo', id }),
      });
      info = await res.json();
      if (!res.ok || !info.ok) throw new Error(info.error || 'Not found');
    } catch (e) {
      msg.textContent = 'Could not load this masjid. ' + (e.message || '');
      return;
    }
    const name = info.name || id;
    const word = searchWord(name);
    $('barName').textContent = name;
    $('pName').textContent = name;
    sizeName($('pName'), name);
    $('pArea').textContent = info.area || '';
    $('pTyped').textContent = word;
    $('pWord').textContent = word;
    $('pResult').textContent = [name, info.area].filter(Boolean).join(', ');
    document.title = name + ' · Poster';
    fileName = 'Salah-e-Waqt poster - ' + name.replace(/[^\p{L}\p{N} ]/gu, '').trim() + '.png';
    drawQr();
    msg.hidden = true;
    $('stage').hidden = false;
    fit();
    window.addEventListener('resize', fit);
    await document.fonts.ready;
    btn.disabled = false;
  }

  btn.addEventListener('click', async () => {
    const label = btn.querySelector('span');
    btn.disabled = true;
    label.textContent = 'Preparing…';
    const poster = $('poster');
    const saved = poster.style.transform;
    try {
      poster.style.transform = 'none';
      const blob = await htmlToImage.toBlob(poster, { width: 1240, height: 1754, pixelRatio: 2, cacheBust: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      label.textContent = 'Downloaded';
    } catch (e) {
      label.textContent = 'Try again';
    }
    poster.style.transform = saved;
    btn.disabled = false;
    setTimeout(() => { label.textContent = 'Download'; }, 2500);
  });

  load();
})();
