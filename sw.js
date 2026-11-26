// 한 번 열면 인터넷 없이도 열리도록 앱 파일을 저장해 둔다.
// 앱 파일은 '저장본을 먼저 보여 주고 뒤에서 새로 받기', 큰 자료(글자 인식·맞춤법 모형)는 '한 번 받으면 저장본만'.
const V = 'my-library-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'src/app.mjs', 'src/store.mjs', 'src/ai.mjs', 'src/importer.mjs', 'src/chapters.mjs', 'src/glossary.mjs', 'src/ocr.mjs', 'src/ko-fix.mjs', 'src/i18n.mjs', 'src/i18n-dict.mjs', 'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs', 'icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('my-library-') && k !== V && k !== 'my-library-big').map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const BIG = (u) => /\/vendor\/kiwi\/|cdn\.jsdelivr\.net\/npm\/(tesseract|kiwi-nlp|@tesseract)|tessdata|\.traineddata/.test(u);
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = r.url;
  if (/api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/.test(u)) return;
  if (BIG(u)) { e.respondWith(caches.open('my-library-big').then(async (c) => (await c.match(r)) || fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; }))); return; }
  if (new URL(u).origin !== location.origin && !/fonts\.(googleapis|gstatic)\.com/.test(u)) return;
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(r, { ignoreSearch: true });
    const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
