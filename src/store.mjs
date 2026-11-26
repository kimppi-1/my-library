// 이 기기 안(브라우저 IndexedDB)에 모든 것을 저장한다. 서버로 보내는 것은 없다.
// 문서 하나 = "모음/이름" 경로 하나. 읽기·쓰기·지우기와, 모음이 바뀌면 알려 주는 onSnapshot을 제공한다.
const DBN = 'my-library', VER = 1;
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DBN, VER);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction('docs', mode), s = t.objectStore('docs');
    let out; Promise.resolve(fn(s, (v) => { out = v; })).catch(rej);
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const listeners = new Map();   // 모음 이름 → Set(callback)
function changed(path) {
  const col = path.slice(0, path.lastIndexOf('/'));
  const set = listeners.get(col); if (!set) return;
  list(col).then((docs) => { for (const cb of set) try { cb(snap(docs)); } catch (e) { console.error(e); } });
}
const snap = (docs) => ({ docs: docs.map((d) => ({ id: d.id, exists: true, data: () => clone(d.data) })) });
export async function list(col) {
  const lo = col + '/', hi = col + '/￿';
  return tx('readonly', async (s, done) => {
    const keys = await req(s.getAllKeys(IDBKeyRange.bound(lo, hi)));
    const vals = await req(s.getAll(IDBKeyRange.bound(lo, hi)));
    done(keys.map((k, i) => ({ id: k.slice(lo.length), data: vals[i] })).filter((x) => !x.id.includes('/')));
  });
}
export async function getRaw(path) { return tx('readonly', async (s, done) => done(await req(s.get(path)))); }
export async function putRaw(path, v) { await tx('readwrite', (s) => { s.put(v, path); }); changed(path); }
export async function delRaw(path) { await tx('readwrite', (s) => { s.delete(path); }); changed(path); }
export async function delPrefix(prefix) {
  await tx('readwrite', async (s) => { const keys = await req(s.getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿'))); for (const k of keys) s.delete(k); });
  for (const col of listeners.keys()) if (col.startsWith(prefix) || prefix.startsWith(col + '/')) changed(col + '/x');
}
export async function dumpAll() { return tx('readonly', async (s, done) => { const k = await req(s.getAllKeys()), v = await req(s.getAll()); done(k.map((x, i) => [x, v[i]])); }); }
export async function loadAll(pairs, { replace = false } = {}) {
  await tx('readwrite', (s) => { if (replace) s.clear(); for (const [k, v] of pairs) s.put(v, k); });
  for (const col of listeners.keys()) changed(col + '/x');
}

function docRef(path) {
  return {
    async get() { const v = await getRaw(path); return { exists: v !== undefined, id: path.split('/').pop(), data: () => clone(v) }; },
    async set(v) { await putRaw(path, clone(v)); },
    async update(p) { const v = (await getRaw(path)) || {}; await putRaw(path, { ...v, ...clone(p) }); },
    async delete() { await delRaw(path); },
  };
}
// 앞의 '내 서재'(claude.ai)와 같은 모양으로 쓰도록: db.doc("study/x"), db.collection("highlights").doc(id)
export const db = {
  doc: (p) => docRef(p),
  collection: (c) => ({
    doc: (id) => docRef(c + '/' + id),
    async get() { return snap(await list(c)); },
    onSnapshot(cb) {
      if (!listeners.has(c)) listeners.set(c, new Set());
      listeners.get(c).add(cb); list(c).then((d) => cb(snap(d)));
      return () => listeners.get(c).delete(cb);
    },
  }),
};
// 오래 쓰도록 브라우저에 '지우지 말아 달라'고 부탁한다(사진첩처럼 저장 공간이 부족해도 함부로 지우지 않게)
export async function persist() { try { return await navigator.storage?.persist?.(); } catch { return false; } }
