// PDF 한 권을 쪽마다 글자로 읽는다(모두 이 기기 안에서).
//  - 글자가 들어 있는 PDF: pdf.js로 글자를 그대로 꺼낸다(인식 오류 없음)
//  - 스캔한 PDF: 그림으로 그려 tesseract.js(한국어)로 읽고, hwp2docx처럼
//      ① 숫자가 섞인 낱말(성경 장절)은 그 자리만 오려 두 배로 키워 영어로 다시 읽어 쌍점을 살리고
//      ② 영어로 보이는 조각도 영어로 다시 읽고
//      ③ 거꾸로 스캔된 쪽은 뒤집어 다시 읽는다
//  - 그다음 Kiwi 언어 모형(hwp2docx ko-fix)으로 줄마다 틀린 글자를 바로잡는다(띄어쓰기는 그대로)
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';
const KIWI = 'https://cdn.jsdelivr.net/npm/kiwi-nlp@0.21.0/dist/';

export async function openPdf(bytes) {
  return pdfjs.getDocument({ data: bytes, cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true }).promise;
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// 글자가 든 쪽이면 줄을 만들어 돌려주고, 아니면 null
export async function textLayer(page) {
  const tc = await page.getTextContent(); const vp = page.getViewport({ scale: 1 });
  const items = tc.items.filter((it) => it.str && it.str.trim());
  const letters = items.reduce((a, it) => a + (it.str.match(/[\p{L}]/gu) || []).length, 0);
  if (letters < 40) return null;
  const rows = [];
  for (const it of items) {
    const h = Math.abs(it.transform[3]) || it.height || 10, x = it.transform[4], y = vp.height - it.transform[5];
    let r = rows.find((r) => Math.abs(r.y - y) < h * 0.5);
    if (!r) rows.push((r = { y, h, items: [] }));
    r.items.push({ x, w: it.width, h, s: it.str });
  }
  rows.sort((a, b) => a.y - b.y);
  return {
    w: vp.width, h: vp.height, digital: true,
    lines: rows.map((r) => {
      r.items.sort((a, b) => a.x - b.x);
      let t = ''; let end = null;
      for (const it of r.items) { if (end != null && it.x - end > it.h * 0.25 && !t.endsWith(' ')) t += ' '; t += it.s; end = it.x + it.w; }
      const x0 = r.items[0].x, x1 = Math.max(...r.items.map((i) => i.x + i.w));
      return { text: t.replace(/\s+/g, ' ').trim(), x0, x1, y0: r.y - r.h, y1: r.y, h: med(r.items.map((i) => i.h)) };
    }).filter((l) => l.text),
  };
}

let T = null; const workers = {};
async function worker(lang, psm, slot = 0) {
  const k = lang + psm + '#' + slot;
  if (!workers[k]) workers[k] = (async () => {
    T = T || (await import(TESS)).default;
    const w = await T.createWorker(lang);
    await w.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
    return w;
  })();
  return workers[k];
}
export async function terminate() { for (const k in workers) { try { (await workers[k]).terminate(); } catch {} delete workers[k]; } }
function canvasOf(w, h) { const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return c; }
async function blobOf(c) { return c.convertToBlob ? c.convertToBlob({ type: 'image/png' }) : new Promise((r) => c.toBlob(r, 'image/png')); }
async function readLines(lang, psm, img, slot = 0) {
  const w = await worker(lang, psm, slot);
  const r = await w.recognize(img, {}, { blocks: true });
  const out = [];
  for (const b of r.data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const words = (l.words || []).filter((x) => x.text && x.text.trim()).map((x) => ({ text: x.text, conf: x.confidence, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 }));
    if (!words.length) continue;
    out.push({ text: String(l.text || '').replace(/\s+/g, ' ').trim(), words, conf: l.confidence, x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1, h: med(words.map((x) => x.y1 - x.y0)) });
  }
  return out;
}
async function cropEng(canvas, box, slot = 0) {
  const pad = 6, x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad), w = Math.min(canvas.width, box.x1 + pad) - x0, h = Math.min(canvas.height, box.y1 + pad) - y0;
  if (w < 4 || h < 4) return { text: '', conf: 0 };
  const c = canvasOf(w * 2, h * 2), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(canvas, x0, y0, w, h, 0, 0, w * 2, h * 2);
  const L = await readLines('eng', '7', await blobOf(c), slot);
  const ws = L.flatMap((l) => l.words); const al = ws.filter((x) => /[A-Za-z]{2}/.test(x.text)).map((x) => x.conf);
  return { text: ws.map((x) => x.text).join(' '), conf: (al.length ? al : ws.map((x) => x.conf)).reduce((a, b) => a + b, 0) / Math.max(1, (al.length || ws.length)) };
}
const garbage = (s) => { if (s.length < 3) return false; const han = (s.match(/[가-힣]/g) || []).length, jamo = (s.match(/[ㄱ-ㅣ]/g) || []).length, dig = (s.match(/\d/g) || []).length, lat = (s.match(/[A-Za-z]/g) || []).length; return dig + lat + jamo >= Math.max(3, s.length * 0.5) && han <= s.length * 0.4; };
const REFOK = /^\d{1,3}:\d{1,3}([\-–~]\d{1,3}(:\d{1,3})?)?$/;
async function reread(canvas, lines, log, slot = 0, lang = 'kor') {
  for (const l of lines) {
    const ws = l.words; let line = l.text;
    for (let i = 0; i < ws.length; i++) {
      const s = ws[i].text, digs = s.match(/\d/g) || [];
      if (digs.length >= 2 && !s.includes(':') && !/[A-Za-zㄱ-ㅣ]/.test(s)) {
        const e = await cropEng(canvas, ws[i], slot); const m = e.text.match(/\d[\d:\-–~,]*\d/); const c = m ? m[0].replace(/,$/, '') : '';
        if (REFOK.test(c) && c.replace(/\D/g, '').length === digs.length) {
          const tail = s.match(/\d[\d\-–~]*\d/);
          if (tail) { const nw = s.slice(0, tail.index) + c + s.slice(tail.index + tail[0].length); if (nw !== s && line.includes(s)) { line = line.replace(s, nw); log.push([s, nw]); continue; } }
        }
        if (!garbage(s) || lang !== 'kor') continue;
      }
      if (lang === 'kor' && garbage(s)) {
        let j = i; const isG = (k) => k < ws.length && garbage(ws[k].text), br = (k) => k < ws.length && (isG(k) || (ws[k].text.length <= 3 && !/^[가-힣]{2,3}$/.test(ws[k].text)));
        while (br(j + 1) && (isG(j + 1) || isG(j + 2))) j++;
        const span = ws.slice(i, j + 1), box = { x0: Math.min(...span.map((x) => x.x0)), y0: Math.min(...span.map((x) => x.y0)), x1: Math.max(...span.map((x) => x.x1)), y1: Math.max(...span.map((x) => x.y1)) };
        let { text: e, conf } = await cropEng(canvas, box, slot);
        if (/\)[.,]*$/.test(span[span.length - 1].text) && e.includes(')')) e = e.slice(0, e.lastIndexOf(')') + 1);
        e = e.replace(/[^A-Za-z)\]'’”.]+$/, '');
        const letters = (e.match(/[A-Za-z]/g) || []).length;
        if (letters >= 3 && letters >= e.replace(/\s/g, '').length * 0.6 && conf >= 20) {
          const pre = (span[0].text.match(/^['"‘“(]*/) || [''])[0], post = (span[span.length - 1].text.match(/[)'"’”.,]*$/) || [''])[0];
          const nw = pre + e.replace(/^['"‘“(]+|['"’”)]+$/g, '') + post;
          const re = new RegExp(span.map((x) => x.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'));
          if (re.test(line)) { line = line.replace(re, nw); log.push([span.map((x) => x.text).join(' '), nw]); }
        }
        i = j;
      }
    }
    l.text = line;
  }
}
// 스캔한 쪽 하나 읽기
export async function ocrPage(page, { dpi = 300, onStep, slot = 0, lang = 'kor' } = {}) {
  const vp = page.getViewport({ scale: dpi / 72 });
  const c = canvasOf(Math.round(vp.width), Math.round(vp.height));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  return ocrCanvas(c, { onStep, slot, lang });
}
// 사진(jpg·png) 한 장 = 한 쪽. 너무 크면 긴 변 3500px로 줄인다
export async function ocrImage(file, opts = {}) {
  const bm = await createImageBitmap(file); const k = Math.min(1, 3500 / Math.max(bm.width, bm.height));
  const c = canvasOf(Math.round(bm.width * k), Math.round(bm.height * k)); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0, c.width, c.height);
  return ocrCanvas(c, opts);
}
export async function ocrCanvas(c, { onStep, slot = 0, lang = 'kor' } = {}) {
  let lines = await readLines(lang, '6', await blobOf(c), slot);
  const conf = (L) => { const w = L.flatMap((l) => l.words); return w.length ? w.reduce((a, x) => a + x.conf, 0) / w.length : 0; };
  // 거꾸로 스캔된 쪽: 믿음직하지 않으면 뒤집어 다시 읽어 더 나은 쪽을 쓴다
  if (conf(lines) < 60) {
    const r = canvasOf(c.width, c.height), rg = r.getContext('2d'); rg.translate(c.width, c.height); rg.rotate(Math.PI); rg.drawImage(c, 0, 0);
    const L2 = await readLines(lang, '6', await blobOf(r), slot);
    if (conf(L2) > conf(lines) + 8) { lines = L2; c = r; }
  }
  const log = [];
  // 장절 다시 읽기는 모든 언어, 영어 조각 다시 읽기는 한국어 책에서만(reread 안에서 한글 기준으로 판단)
  onStep?.('reread');
  await reread(c, lines, log, slot, lang);
  return { w: c.width, h: c.height, lines: lines.map(({ text, x0, y0, x1, y1, h }) => ({ text, x0, y0, x1, y1, h })), fixes: log };
}

// Kiwi(맞춤법) — 처음 한 번 약 28MB를 받는다
let kiwiP = null;
async function gunzip(buf) { const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')); return new Uint8Array(await new Response(ds).arrayBuffer()); }
export function loadSpell() {
  if (kiwiP) return kiwiP;
  kiwiP = (async () => {
    const { loadKiwiScorer, makeKoFixer } = await import('./ko-fix.mjs');
    const base = new URL('../vendor/kiwi/', import.meta.url).href;
    const man = await (await fetch(base + 'manifest.json')).json();
    const kiwi = await loadKiwiScorer({
      importKiwi: () => import(/* @vite-ignore */ KIWI + 'index.js'), wasmUrl: KIWI + 'kiwi-wasm.wasm',
      fetchModel: async (f) => {
        const parts = man[f] || [f];
        const bufs = await Promise.all(parts.map(async (x) => { const r = await fetch(base + x); if (!r.ok) throw new Error(x + ' ' + r.status); return new Uint8Array(await r.arrayBuffer()); }));
        const all = new Uint8Array(bufs.reduce((a, b) => a + b.length, 0)); let o = 0; for (const b of bufs) { all.set(b, o); o += b.length; }
        return /\.gz(\.\d+)?$/.test(parts[0]) ? gunzip(all) : all;
      },
    });
    const fx = makeKoFixer(kiwi); fx.score = (t) => kiwi.score(t); return fx;
  })();
  kiwiP.catch(() => { kiwiP = null; });
  return kiwiP;
}
// 신학 낱말을 흔한 말로 잘못 바꾸는 것을 막는다
const KEEP = ['변호자', '인치', '속량', '의로', '대속', '구속', '칭의', '성화', '화목', '중보', '예정', '섭리', '경륜', '언약', '통회', '인쳐', '유업', '목양', '감람', '대언', '긍', '거듭', '하나님', '그리스도', '성령', '성경', '예수'];
export function spellLines(fixer, lines) {
  const geo = { joinOk: () => false, splitOk: () => false };
  const out = [];
  lines.forEach((l, i) => {
    const t = l.text; if (!/[가-힣]{2}/.test(t)) return;
    let ws; try { ws = fixer.fixLine(t.split(/\s+/).map((text) => ({ text })), geo, [], { before: lines[i - 1]?.text || '', after: lines[i + 1]?.text || '' }); } catch { return; }
    const ow = t.split(/\s+/), nw = ws.map((w) => w.text);
    if (ow.length !== nw.length) return;
    const nt = nw.map((w, k) => (w !== ow[k] && (KEEP.some((s) => ow[k].includes(s)) || ow[k].length < 2) ? ow[k] : w)).join(' ');
    if (nt !== t.replace(/\s+/g, ' ')) { out.push([t, nt]); l.text = nt; }
  });
  return out;
}
