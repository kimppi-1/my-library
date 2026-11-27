// 중요한 낱말 지키기: 하나님·성경·예수·그리스도·성령, 성경 66권 이름 등이 글자 인식에서 틀리지 않게 한다.
// 1) 흔한 오독 표(하나넘→하나님 …)는 언제나 바꾼다
// 2) 세 글자 이상인 핵심어는, 낱말 머리가 핵심어와 자모 하나만 다르고(다섯 글자 이상은 둘)
//    그 꼴이 책 전체에서 드물며 핵심어는 자주 나올 때 바꾼다
// 3) 두 글자 핵심어는 비슷한 진짜 낱말(사랑/사상, 성경/성격)이 많아 표에 있는 오독만 바꾼다
// 사용자는 설정에서 자기 책에 맞는 낱말을 더할 수 있다(extra).
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ', JONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
function jamo(s) {
  const o = [];
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xAC00;
    if (c >= 0 && c < 11172) { o.push(CHO[Math.floor(c / 588)], JUNG[Math.floor((c % 588) / 28)]); if (c % 28) o.push(JONG[c % 28]); } else o.push(ch);
  }
  return o;
}
function dist(a, b) {
  a = jamo(a); b = jamo(b);
  if (Math.abs(a.length - b.length) > 2) return 9;
  let d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let p = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] !== b[j - 1])); p = t; }
  }
  return d[b.length];
}
export const BIBLE_BOOKS = '창세기 출애굽기 레위기 민수기 신명기 여호수아 사사기 룻기 사무엘상 사무엘하 열왕기상 열왕기하 역대상 역대하 에스라 느헤미야 에스더 욥기 시편 잠언 전도서 아가 이사야 예레미야 예레미야애가 에스겔 다니엘 호세아 요엘 아모스 오바댜 요나 미가 나훔 하박국 스바냐 학개 스가랴 말라기 마태복음 마가복음 누가복음 요한복음 사도행전 로마서 고린도전서 고린도후서 갈라디아서 에베소서 빌립보서 골로새서 데살로니가전서 데살로니가후서 디모데전서 디모데후서 디도서 빌레몬서 히브리서 야고보서 베드로전서 베드로후서 요한일서 요한이서 요한삼서 유다서 요한계시록'.split(' ');
export const CORE = '하나님 예수 그리스도 예수님 성령 성경 말씀 복음 은혜 십자가 부활 구원 언약 율법 계시 교회 성도 제자 사도 선지자 예언자 아버지 주님 창조주 구속주 구세주 메시아 삼위일체 거룩 칭의 성화 회개 믿음 신앙 기도 예배 세례 성찬 성례 진리 영광 죄인 용서 속죄 화목 대제사장 제사장 이스라엘 예루살렘 바울 베드로 모세 다윗 아브라함 이삭 야곱 요한 신학 교리 섭리 예정 영생 천국 심판 재림 은사 성부 성자 사탄 마귀 천사 피조물 종말 고난 긍휼 자비 공의 순종 거듭남 중생 성결 할례 성전 회당 칼뱅 루터 아우구스티누스 웨스트민스터 신약 구약 종교개혁 청교도'.split(' ');
// 글자 인식이 자주 틀리는 꼴 → 바른 꼴 (낱말 머리에서만)
export const PAIRS = [['하나넘', '하나님'], ['하냐님', '하나님'], ['하나닙', '하나님'], ['그러스도', '그리스도'], ['그리스토', '그리스도'], ['그리스모', '그리스도'], ['에수님', '예수님'], ['교러', '교리'], ['진러', '진리'], ['재럼', '재림'], ['주남', '주님'], ['세려', '세례'], ['성렁', '성령'], ['긍흘', '긍휼'], ['긍홀', '긍휼'], ['긍율', '긍휼'], ['거듬남', '거듭남'], ['율럽', '율법'], ['선렉', '선택'], ['지헤', '지혜'], ['덤후', '딤후'], ['덤전', '딤전'], ['벨전', '벧전'], ['벨후', '벧후'], ['옮다', '옳다'], ['옮은', '옳은'], ['옮지', '옳지'], ['옮습니다', '옳습니다'], ['옮고', '옳고'], ['옮음', '옳음']];

// paras: 문단 문자열 배열(책 전체). 바꾼 표 {틀린 낱말: 바른 낱말}을 돌려준다.
export function buildFixes(paras, extra = []) {
  const TERMS = [...new Set([...CORE, ...BIBLE_BOOKS, ...extra.filter(Boolean)])].sort((a, b) => b.length - a.length);
  const LONG = TERMS.filter((t) => t.length >= 3);
  const words = new Map();
  for (const t of paras) for (const w of t.match(/[가-힣]+/g) || []) words.set(w, (words.get(w) || 0) + 1);
  const heads = new Map();
  for (const [w, n] of words) for (let L = 2; L <= w.length; L++) heads.set(w.slice(0, L), (heads.get(w.slice(0, L)) || 0) + n);
  const H = (k) => heads.get(k) || 0;
  const rep = {};
  for (const w of words.keys()) {
    const pr = PAIRS.find(([a]) => w.startsWith(a));
    if (pr) { rep[w] = pr[1] + w.slice(pr[0].length); continue; }
    if (TERMS.some((t) => w.startsWith(t))) continue;
    for (const T of LONG) {
      const L = T.length; if (L > w.length) continue;
      const h = w.slice(0, L);
      if (dist(h, T) > (L >= 5 ? 2 : 1)) continue;
      if (H(h) <= Math.max(3, Math.floor(H(T) / 25)) && H(T) >= 10) { rep[w] = T + w.slice(L); break; }
    }
  }
  return rep;
}
export function applyFixes(t, rep) {
  return String(t || '').replace(/[가-힣]+/g, (w) => { if (rep[w]) return rep[w]; const pr = PAIRS.find(([a]) => w.startsWith(a)); return pr ? pr[1] + w.slice(pr[0].length) : w; });
}
