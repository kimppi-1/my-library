// 쪽마다 읽어 낸 줄(글자와 자리·크기)로 장을 나누고 문단을 만든다.
// page = { w, h, lines: [{ text, x0, y0, x1, y1 }] }   (줄은 읽는 차례대로)
const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
// 줄의 글자 크기: 낱말 상자 높이의 가운데값(따옴표·괄호에 덜 흔들림). 없으면 줄 상자 높이
const hgt = (l) => Math.max(1, l.h || (l.y1 - l.y0));
// 성경 인용 출처 줄: "시편 119:34", "로마서 1:18-20, 새번역", "요한복음 3장"
export const REF = /^[가-힣 ]{1,12}\s?\d[\dㄱ:,\-–~ ]*(편|장|절)?(,\s?[가-힣 ]{2,14})?[^가-힣]{0,3}$/;
const NUMLINE = /^[\dIVXivxl|.\-–·\s]{1,6}$/;
const CHAPTER_PAT = /^(第\s*[\d一二三四五六七八九十百]+\s*[章节節回課课]|제\s*\d{1,3}\s*[장과강부]|\d{1,3}\s*[장강과]|chapter\s+\d{1,3}|part\s+\d{1,2}|제\s*[일이삼사오육칠팔구십]+\s*[장부])\b/i;
const PART_PAT = /^(第\s*[\d一二三四五六七八九十]+\s*[部篇編编]|제?\s*\d{1,2}\s*부|part\s+\d|[일이삼사오육칠팔구십]+\s*부)\b/i;

export function clean(s) { return String(s || '').replace(/ /g, ' ').replace(/\s{2,}/g, ' ').trim(); }

// 1) 머리말·쪽 번호 같은 되풀이 줄 표시
export function markFurniture(pages) {
  const norm = (t) => clean(t).replace(/\d+/g, '#');
  const top = new Map(), bot = new Map();
  for (const p of pages) {
    const L = p.lines.filter((l) => clean(l.text)); if (!L.length) continue;
    const a = norm(L[0].text), b = norm(L[L.length - 1].text);
    top.set(a, (top.get(a) || 0) + 1); bot.set(b, (bot.get(b) || 0) + 1);
  }
  const many = Math.max(4, pages.length * 0.12);
  for (const p of pages) {
    const L = p.lines; const ph = p.h || Math.max(1, ...L.map((l) => l.y1));
    L.forEach((l, i) => {
      const t = clean(l.text); l.text = t;
      if (!t) { l.skip = true; return; }
      const edge = l.y1 < ph * 0.09 || l.y0 > ph * 0.91;
      const first = L.findIndex((x) => clean(x.text)) === i, last = L.length - 1 - [...L].reverse().findIndex((x) => clean(x.text)) === i;
      if (edge && NUMLINE.test(t)) l.skip = true;                         // 쪽 번호
      else if (first && (top.get(norm(t)) || 0) >= many && t.length < 40) l.skip = true;   // 머리말(책 제목·장 제목이 쪽마다)
      else if (last && (bot.get(norm(t)) || 0) >= many && t.length < 40) l.skip = true;
      else if (last && edge && /^\d{1,4}$/.test(t.replace(/[^\d]/g, '')) && t.length <= 8 && !/[가-힣]{2}/.test(t)) l.skip = true;
    });
  }
}

// 2) 쪽마다 '새 장 시작 / 부 표지 / 본문' 짐작
export function detect(pages) {
  markFurniture(pages);
  const body = pages.flatMap((p) => p.lines.filter((l) => !l.skip && l.text.length >= 10));
  const Hm = med(body.map(hgt)) || 20;
  const roles = [];
  let part = '';
  pages.forEach((p, pi) => {
    const L = p.lines.filter((l) => !l.skip);
    const ph = p.h || Math.max(1, ...p.lines.map((l) => l.y1));
    const role = { role: 'body', title: '', subtitle: '', part };
    if (!L.length) { role.role = 'skip'; roles.push(role); return; }
    const chars = L.reduce((a, l) => a + l.text.length, 0);
    const big = L.filter((l) => hgt(l) >= Hm * 1.6 && l.text.length <= 30);
    const headZone = L.filter((l) => l.y0 < ph * 0.5).slice(0, 7);
    const pat = headZone.find((l) => CHAPTER_PAT.test(l.text));
    const bigTop = headZone.filter((l) => big.includes(l));
    // 부 표지: 글이 아주 적고 큰 글씨가 있는 쪽
    if (chars < 80 && (bigTop.length || L.some((l) => PART_PAT.test(l.text)))) {
      const t = (L.find((l) => PART_PAT.test(l.text)) || bigTop[0] || L[0]).text;
      part = L.filter((l) => hgt(l) >= Hm * 1.1 || PART_PAT.test(l.text)).map((l) => l.text).join(' ').slice(0, 60) || t;
      const hn = (part.match(/[가-힣]/g) || []).length; if ((hn < 2 || hn < part.replace(/\s/g, '').length * 0.5) && !/part\s*\d/i.test(part)) { part = role.part; role.role = 'skip'; roles.push(role); return; }   // 그림뿐인 쪽
      role.role = 'part'; role.title = part; role.part = part; roles.push(role); return;
    }
    if (bigTop.length || pat) {
      // 첫 큰 줄이 숫자뿐이면 장 번호, 그다음 큰 줄이 제목
      const cand = (bigTop.length ? bigTop : [pat]).filter(Boolean);
      let ti = 0; let num = '';
      if (NUMLINE.test(cand[0].text) || /^\d{1,3}$/.test(cand[0].text.replace(/\s/g, ''))) { num = cand[0].text.replace(/[^\d]/g, ''); ti = 1; }
      const tl = cand[ti] || headZone[headZone.indexOf(cand[0]) + 1];
      if (tl && tl.text.length <= 40) {
        role.role = 'chapter'; role.num = num;
        role.title = CHAPTER_PAT.test(tl.text) && cand[ti + 1] ? cand[ti + 1].text : tl.text.replace(CHAPTER_PAT, '').trim() || tl.text;
        // 부제: 제목 바로 다음 줄이 짧고, 문장 부호로 끝나지 않고, 앞이나 뒤가 크게 떨어져 있으면
        const k = L.indexOf(tl), nx = L[k + 1], nx2 = L[k + 2];
        const gapB = nx ? nx.y0 - tl.y1 : 0, gapA = nx && nx2 ? nx2.y0 - nx.y1 : 1e9;
        // 다음 줄부터 성경 인용 출처 줄까지 촘촘히 이어지면 그것은 제사(인용문)이지 부제가 아니다
        const r = L.slice(k + 1, k + 12).findIndex((l) => REF.test(l.text));
        let epiBlock = false;
        if (r >= 0) { epiBlock = true; for (let q = k + 1; q < k + 1 + r; q++) if (L[q + 1].y0 - L[q].y1 >= Hm * 1.8) { epiBlock = false; break; } }
        const after = !epiBlock && nx && nx.text.length <= 45 && !/[.,;:]$/.test(nx.text) && !REF.test(nx.text) && nx.y0 < ph * 0.6 && (hgt(nx) >= Hm * 1.25 || Math.max(gapB, gapA) >= Hm * 1.8) ? nx : null;
        role.subtitle = after ? after.text : '';
        role.headLines = headZone.slice(0, headZone.indexOf(after || tl) + 1).map((l) => l.text);
      }
    }
    roles.push(role);
  });
  // 장이 하나도 안 잡히면(그림·크기 정보가 없는 PDF) 첫 줄 모양으로 다시
  if (!roles.some((r) => r.role === 'chapter')) pages.forEach((p, i) => {
    const L = p.lines.filter((l) => !l.skip);
    if (L[0] && CHAPTER_PAT.test(L[0].text)) Object.assign(roles[i], { role: 'chapter', title: L[1] && L[1].text.length < 40 ? L[1].text : L[0].text, headLines: [L[0].text, L[1]?.text || ''] });
  });
  return roles;
}

// 3) 역할 표대로 장을 만든다.  roles[i] = { role:'chapter'|'part'|'body'|'skip', title, subtitle, part }
export function build(pages, roles, { joinScore } = {}) {
  const body = pages.flatMap((p, i) => roles[i]?.role === 'skip' ? [] : p.lines.filter((l) => !l.skip && l.text.length >= 10));
  const Hm = med(body.map(hgt)) || 20;
  const chapters = []; let cur = null, part = '';
  const vocab = new Map();
  const words = [];
  pages.forEach((p, i) => {
    const r = roles[i] || { role: 'body' };
    if (r.role === 'skip') return;
    if (r.role === 'part') { part = r.title || part; return; }
    let L = p.lines.filter((l) => !l.skip && l.text);
    if (r.role === 'chapter' || !cur) {
      cur = { no: chapters.length, title: r.role === 'chapter' ? (r.title || `${chapters.length}장`) : '앞부분', subtitle: r.subtitle || '', part, epigraph: '', lines: [], startPage: i };
      chapters.push(cur);
      if (r.role === 'chapter') {
        // 제목 부분 줄 걷어 내기
        const head = new Set((r.headLines || []).map(clean));
        let k = 0; while (k < L.length && k < 8 && (head.has(L[k].text) || L[k].text === r.title || L[k].text === r.subtitle || NUMLINE.test(L[k].text))) k++;
        L = L.slice(k);
        // 성경 인용(제사): 앞 12줄 안에 출처 줄이 있으면 거기까지
        const j = L.slice(0, 12).findIndex((l) => REF.test(l.text));
        if (j >= 0 && j <= 10) { cur.epigraph = L.slice(0, j + 1).map((l) => l.text).join('\n'); L = L.slice(j + 1); }
      }
    }
    // 쪽 안의 왼쪽 여백·오른쪽 끝
    const xs = L.filter((l) => l.text.length >= 10);
    const left = pct(xs.map((l) => l.x0), 0.2), right = pct(xs.map((l) => l.x1), 0.8);
    for (const l of L) { l.indent = l.x0 > left + Hm * 0.7; l.short = l.x1 < right - Hm * 2.2; cur.lines.push(l); }
  });
  for (const c of chapters) for (const l of c.lines) { const ws = l.text.split(' '); for (const w of ws.slice(1, -1)) { const k = w.replace(/[^\w가-힣]/g, ''); vocab.set(k, (vocab.get(k) || 0) + 1); } }
  const V = (k) => vocab.get(k.replace(/[^\w가-힣]/g, '')) || 0;
  function join(a, b) {
    if (!a) return b; if (!b) return a;
    const la = a.split(' ').pop(), fb = b.split(' ')[0];
    if (/[가-힣]$/.test(la) && /^[가-힣]/.test(fb)) {
      // 언어 모형이 있으면 '붙인 꼴'과 '띄운 꼴' 가운데 더 자연스러운 쪽
      if (joinScore) {
        try {
          const j = joinScore(la + fb), sp = joinScore(la + ' ' + fb);
          if (j - sp > 0.8) return a + b;                              // 낱말 가운데서 줄이 바뀐 것
          if (Math.abs(j - sp) > 0.01) return a + ' ' + b;
          // 모형이 어느 쪽도 괜찮다고 보면, 이 책에서 붙인 꼴이 실제로 자주 나오는지로
          const m = V(la + fb); return m >= 2 && m >= V(fb) ? a + b : a + ' ' + b;
        } catch {}
      }
      const m = V(la + fb), s1 = V(fb), s2 = V(la);
      if (m > 0 && m >= Math.min(s1, s2)) return a + b;
      if (s1 === 0 || s2 === 0) return a + b;
      return a + ' ' + b;
    }
    // 중국어·일본어: 줄이 바뀌어도 띄우지 않는다
    if (/[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef。、，」』]$/.test(a) && /^[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef「『]/.test(b)) return a + b;
    // 영어: 줄 끝 붙임표로 나뉜 낱말은 잇는다
    if (/[a-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b;
    if (/[(\[“"‘·\-]$/.test(a) || /^[).,;:”"’]/.test(b)) return a + b;
    return a + ' ' + b;
  }
  for (const c of chapters) {
    const paras = []; let buf = '';
    c.lines.forEach((l, k) => {
      if (buf && l.indent) { paras.push(buf); buf = ''; }
      buf = join(buf, l.text);
      const next = c.lines[k + 1];
      if (l.short && /[.!?”"’)\]…。！？」』]$/.test(l.text) && (!next || !next.short || next.indent)) { paras.push(buf); buf = ''; }
    });
    if (buf) paras.push(buf);
    c.text = paras.filter((t) => t.trim());
    delete c.lines;
  }
  return chapters.filter((c) => c.text.length || c.epigraph);
}
