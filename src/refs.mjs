// 성경 장절 바로잡기
// 글자 인식은 작은 글씨인 장절 표기를 자주 깨뜨린다(쌍점이 빠지거나 숫자로 읽힘, 5↔3·1↔3 같은 숫자 혼동, 욥→읍·엡→웹·딤후→덤후).
// 성경 66권 1,189장의 절 수 표로 '실제로 있을 수 있는 장절'만 후보로 두고,
// 책 한 권(324쪽)에서 배운 숫자 오독 경향을 비용으로 삼아 가장 가까운 후보로 고친다.
// 어느 후보도 충분히 가깝지 않으면 손대지 않는다.
import { ABBR, FULL, VERSES } from './bible-meta.mjs';

const NAME = new Map();
ABBR.forEach((a, i) => NAME.set(a, i));
FULL.forEach((f, i) => NAME.set(f, i));
NAME.set('요한2서', 62); NAME.set('요한3서', 63);
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ', JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
const jamo = (s) => [...s].flatMap((ch) => { const c = ch.charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 ? [CHO[Math.floor(c / 588)], JUNG[Math.floor((c % 588) / 28)], JONG[c % 28]] : [ch]; });
// 눈으로 닮은 자모 짝(바뀌어도 싸게)
const SIM = new Set([['ㅔ', 'ㅞ'], ['ㅐ', 'ㅙ'], ['ㅓ', 'ㅣ'], ['ㅛ', 'ㅡ'], ['ㅗ', 'ㅛ'], ['ㅜ', 'ㅠ'], ['ㅡ', 'ㅜ'], ['ㅏ', 'ㅑ'], ['ㅓ', 'ㅕ'], ['ㅔ', 'ㅖ'], ['ㅐ', 'ㅔ'],
  ['ㄷ', 'ㄴ'], ['ㄷ', 'ㄹ'], ['ㅁ', 'ㅂ'], ['ㅂ', 'ㅍ'], ['ㅇ', 'ㅎ'], ['ㅈ', 'ㅊ'], ['ㄱ', 'ㅋ'], ['ㄷ', 'ㅌ'], [' ', 'ㄷ'], [' ', 'ㄴ']].map((p) => p.sort().join('')));
function jcost(a, b) {
  if (a.length !== b.length) return 9;
  const x = jamo(a), y = jamo(b); let c = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) c += SIM.has([x[i], y[i]].sort().join('')) ? 0.35 : 0.8;
  return c;
}
// 책 한 권에서 배운 숫자 오독 경향: 읽힌 숫자 → 참 숫자 (비용이 작을수록 흔함)
const SUBC = [['5', '3', 0.3], ['3', '1', 0.45], ['2', '1', 0.45], ['4', '1', 0.45], ['7', '1', 0.45], ['0', '1', 0.6], ['9', '5', 0.6], ['3', '5', 0.6], ['5', '9', 0.6],
  ['3', '4', 0.8], ['1', '4', 0.8], ['6', '0', 0.7], ['0', '6', 0.7], ['9', '6', 0.8], ['9', '3', 0.8], ['1', '7', 0.8], ['8', '3', 0.8], ['3', '8', 0.8], ['1', '0', 0.8], ['2', '7', 0.8]];
const COLONLIKE = { 3: 0.45, 1: 0.45, 2: 0.5, 5: 0.7 };   // 쌍점을 이 숫자로 읽은 경우
const ok = (b, c, v) => c >= 1 && c <= VERSES[b].length && (v == null || (v >= 1 && v <= VERSES[b][c - 1]));

function* variants(t) {   // [꼴, 비용, 쌍점 자리]
  yield [t, 0, null];
  for (let i = 0; i < t.length; i++) {
    for (const [x, y, c] of SUBC) if (x === t[i]) yield [t.slice(0, i) + y + t.slice(i + 1), c, null];
    if ('71'.includes(t[i]) && i > 0 && i < t.length - 1 && !t.includes('-')) yield [t.slice(0, i) + '-' + t.slice(i + 1), 0.5, null];
  }
  for (let i = 1; i < t.length - 1; i++) if (/\d/.test(t[i])) {
    const u = t.slice(0, i) + t.slice(i + 1), base = COLONLIKE[t[i]] ?? 0.9;
    yield [u, base, i];
    for (let j = 0; j < u.length; j++) for (const [x, y, c] of SUBC) if (x === u[j]) yield [u.slice(0, j) + y + u.slice(j + 1), base + c, i];
  }
  if (!t.includes('-')) for (let i = 1; i < t.length; i++) yield [t.slice(0, i) + '-' + t.slice(i), 0.5, null];
  // 군더더기 숫자 하나(쌍점이 이미 있을 때만): 18:391-53 → 18:31-33
  for (let i = 0; i < t.length; i++) if (/\d/.test(t[i])) {
    const u = t.slice(0, i) + t.slice(i + 1);
    yield [u, 0.8, -1];
    for (let j = 0; j < u.length; j++) for (const [x, y, c] of SUBC) if (x === u[j]) yield [u.slice(0, j) + y + u.slice(j + 1), 0.8 + c, -1];
  }
}
function parseItem(raw, b, curc, first) {
  // 장을 넘는 범위(1:18-3:20): 앞·뒤를 따로 읽는다
  const cross = raw.replace(/\s/g, '').match(/^([\d:/.;]+)[-–~](\d+[:/.;]\d+)$/);
  if (cross) {
    const L = parseItem(cross[1], b, curc, first), R = parseItem(cross[2], b, null, true);
    if (L && R && R[2] > L[2] && L[1].includes(':') && R[1].includes(':')) return [L[0] + R[0] + 0.03 * (R[2] - L[2]), L[1] + '-' + R[1], R[2]];
    return null;
  }
  const s = raw.replace(/\s/g, '').replace(/(?<=\d)[/.;](?=\d)/g, ':').replace(/[/.;]+(?=:)|(?<=:)[/.;]+/g, '');
  const hasColon = s.includes(':'), ci = s.indexOf(':');
  const base = s.replace(/:/g, '').replace(/[–~]/g, '-');
  if (!/^\d+(-\d+)?$/.test(base)) return null;
  let best = null;
  const put = (cost, text, c) => { if (!best || cost < best[0]) best = [cost, text, c]; };
  for (const [t, cost, ck0] of variants(base)) {
    if (ck0 === -1 && !hasColon) continue;
    const ck = ck0 === -1 ? null : ck0;
    const m = t.match(/^(\d+)(?:-(\d+))?$/); if (!m) continue;
    const a = m[1], bb = m[2];
    for (let k = 1; k < a.length; k++) {
      if (a[k] === '0') continue;
      if (ck != null && ck !== k) continue;
      const c = +a.slice(0, k), v = +a.slice(k);
      if (ok(b, c, v) && (bb == null || (ok(b, c, +bb) && +bb > v))) put(cost + ((hasColon && ci === k) || ck === k ? 0 : (first ? 0.3 : 0.6)), `${c}:${v}${bb ? '-' + bb : ''}`, c);
    }
    if (bb && bb.length >= 2 && ck == null) for (let k = 1; k < a.length; k++) for (let k2 = 1; k2 < bb.length; k2++) {
      const c = +a.slice(0, k), v = +a.slice(k), c2 = +bb.slice(0, k2), v2 = +bb.slice(k2);
      if (ok(b, c, v) && ok(b, c2, v2) && c2 > c) put(cost + (first ? 0.6 : 1.6), `${c}:${v}-${c2}:${v2}`, c2);
    }
    if (!first && curc && !hasColon && ck == null) { const v = +a; if (ok(b, curc, v) && (bb == null || (ok(b, curc, +bb) && +bb > v))) put(cost, a + (bb ? '-' + bb : ''), curc); }
    if (first && !hasColon && bb == null && ck == null && ok(b, +a)) put(cost + 0.45, a, +a);
  }
  return best;
}
const COUNTER = new Set([...'명개년분쪽절편세번배시일월권회차대가살킬톤원층장%']);
const PAT = /([가-힣]{1,7})(\s?)(\d[\d:/\-–~]*(?:\s*,\s*\d[\d:/\-–~]*)*)/g;
// 책 전체 글에서 자주 인용된 책(맞게 읽힌 것)을 세어, 헷갈릴 때 그쪽을 고른다
export function bookFreq(text) {
  const f = new Map();
  for (const m of text.matchAll(/(?<![가-힣])([가-힣]{1,7})\s?\d+:\d/g)) if (NAME.has(m[1])) f.set(NAME.get(m[1]), (f.get(NAME.get(m[1])) || 0) + 1);
  return f;
}
function bookOf(tok, freq) {
  if (NAME.has(tok)) return [[NAME.get(tok), 0]];
  const out = [];
  for (const [n, i] of NAME) { const c = jcost(tok, n); if (c <= 0.8) out.push([i, c + (freq.get(i) ? 0.1 / (1 + Math.log(freq.get(i))) : 0.15)]); }
  return out;
}
// text의 장절을 고쳐 돌려준다. log에 [전, 후]
export function fixRefs(text, freq = new Map(), log = null) {
  return text.replace(PAT, (all, name0, sp, nums, off, whole) => {
    const after = whole[off + all.length];
    if (after && COUNTER.has(after)) return all;
    const before = whole.slice(Math.max(0, off - 12), off);
    let name = name0, lead = '', bks = bookOf(name, freq);
    if (!bks.length) for (const L of [4, 3, 2, 1]) {
      if (name.length > L) { const bk = bookOf(name.slice(-L), freq); if (bk.length) { bks = bk; lead = name.slice(0, -L); name = name.slice(-L); break; } }
    }
    if (!bks.length) return all;
    // 줄임말은 괄호 안·쉼표 뒤·'참조.' 뒤이거나 숫자에 쌍점이 있을 때만 장절로 본다
    if (name.length <= 2 && !/[:/]/.test(nums)) {
      const pre = (before + lead).trimEnd();
      if (lead || !(/[(\[,;]$/.test(pre) || pre.endsWith('참조.') || /\([^)]*$/.test(before))) return all;
    }
    if (lead && name.length <= 2) return all;
    if (!NAME.has(name) && name.length >= 3 && !/[:/]/.test(nums)) return all;   // 이름이 틀리고 쌍점도 없으면 낱말(말하기 254)일 수 있다   // '…했다마' 처럼 앞말에 붙은 한두 글자는 책 이름이 아니다
    const items = nums.split(/(\s*,\s*)/);
    let best = null;
    for (const [bi, bcost] of bks) {
      let cur = null, total = bcost; const res = [];
      items.forEach((it, j) => {
        if (j % 2) { res.push(it); return; }
        const r = parseItem(it, bi, cur, j === 0);
        if (!r || (j > 0 && r[0] >= 1.3)) { total += 1; res.push(it); return; }
        total += r[0]; res.push(r[1]); cur = r[2];
      });
      if (!best || total < best[0]) best = [total, bi, res.join('')];
    }
    const [total, bi, fixed] = best;
    if (total > 1.2 + 0.6 * Math.ceil(items.length / 2)) return all;
    const newName = NAME.has(name) ? name : (name.length <= 2 ? ABBR[bi] : FULL[bi]);
    const out = lead + newName + sp + fixed;
    if (log && out !== all) log.push([all, out]);
    return out;
  });
}
