// 화면 말 바꾸기(한국어·English·中文·日本語).
// 화면은 한국어로 그려 두고, 그려진 글자 가운데 사전에 있는 화면 말만 고른 언어로 바꾼다.
// 책 본문·제목·메모처럼 사용자의 글은 class="nt"(또는 translate="no") 안에 있어 건드리지 않는다.
// 숫자는 {0},{1}… 자리로 바꿔 찾는다: "4장 중 1장 읽음" → "{0}장 중 {1}장 읽음"
import { DICT } from './i18n-dict.mjs';

export const LANGS = { ko: '한국어', en: 'English', zh: '中文', ja: '日本語' };
const K = 'lib.lang';
export function getLang() {
  try { const v = localStorage.getItem(K); if (v && LANGS[v]) return v; } catch {}
  const n = (navigator.language || 'ko').slice(0, 2);
  return LANGS[n] ? n : 'en';
}
export function setLang(l) { try { localStorage.setItem(K, l); } catch {} location.reload(); }
let L = getLang();
document.documentElement.lang = L;

const NUM = /\d+(?:[.,]\d+)?/g;
const CORE = /^([\s『』「」“”"'()·…:,.\-–—→←＋+|/]*)([\s\S]*?)([\s『』「」“”"'()·…:,.\-–—→←|/]*)$/;
function lookup(s) {
  if (L === 'ko' || !s || !/[가-힣]/.test(s)) return null;
  const m = s.match(CORE); if (!m) return null;
  const [, pre, core, post] = m; if (!core) return null;
  const D = DICT[L] || {};
  // 중국어·일본어는 문장 끝 부호를 그 나라 꼴로
  const fix = (tr) => { let p = post; if (L === 'zh' || L === 'ja') { if (/（[^）]*$/.test(tr)) p = p.replace(')', '）'); p = p.replace(/\.(\s*)$/, '。$1'); } return pre + tr + p; };
  if (D[core] != null) return fix(D[core]);
  const nums = []; const key = core.replace(NUM, (x) => `{${nums.push(x) - 1}}`);
  if (nums.length && D[key] != null) return fix(D[key].replace(/\{(\d+)\}/g, (_, i) => nums[+i] ?? ''));
  if (COLLECT) { miss.add(nums.length ? key : core); try { localStorage.setItem('lib.miss', JSON.stringify([...miss])); } catch {} }
  return null;
}
// 코드에서 직접 쓰는 말(알림창·확인창)
export function t(s, vars) {
  let out = (L !== 'ko' && (DICT[L] || {})[s]) || lookup(s) || s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return out;
}
const SKIP = 'script,style,textarea,.nt,[translate="no"],pre';   // 글자를 건드리지 않을 곳
const SKIPEL = 'script,style,.nt,[translate="no"],pre';         // 안내 문구(placeholder 등)까지 건드리지 않을 곳
const ATTRS = ['placeholder', 'aria-label', 'title'];
function walk(root) {
  if (L === 'ko') return;
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1 || root.closest?.(SKIPEL)) return;
  for (const a of ATTRS) if (root.hasAttribute?.(a)) { const v = lookup(root.getAttribute(a)); if (v != null) root.setAttribute(a, v); }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIPEL) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let n; while ((n = tw.nextNode())) {
    if (n.nodeType === 3) fixText(n);
    else for (const a of ATTRS) if (n.hasAttribute(a)) { const v = lookup(n.getAttribute(a)); if (v != null) n.setAttribute(a, v); }
  }
}
function fixText(n) {
  if (n.parentElement?.closest(SKIP)) return;
  const v = lookup(n.nodeValue); if (v != null && v !== n.nodeValue) n.nodeValue = v;
}
export function startI18n() {
  if (L === 'ko' && !COLLECT) return;
  const go = () => walk(document.body);
  go();
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') fixText(m.target); else for (const a of m.addedNodes) walk(a); if (m.type === 'attributes') walk(m.target); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.title = t(document.title);
  const ac = window.alert.bind(window), cc = window.confirm.bind(window);
  window.alert = (m) => ac(t(String(m))); window.confirm = (m) => cc(t(String(m)));
}
export const lang = () => L;
// 개발용: ?i18n=collect 로 열면 사전에 없는 말을 모은다 (window.__miss)
const COLLECT = typeof location !== 'undefined' && /i18n=collect/.test(location.search);
let prevMiss = []; try { prevMiss = JSON.parse(localStorage.getItem('lib.miss') || '[]'); } catch {}
const miss = new Set(prevMiss); if (COLLECT) { window.__miss = miss; if (L === 'ko') L = 'en'; }
