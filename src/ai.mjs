// 질문·문제 만들기: 각자 쓰는 AI를 고른다.
//  - Claude / ChatGPT / Gemini: 자기 API 키를 넣으면 이 기기에서 그 회사로 바로 보낸다(키는 이 기기에만 저장, 백업 파일에도 넣지 않음)
//  - 복사해서 쓰기: 키가 없어도 된다. 만든 요청문을 복사해 평소 쓰는 AI 앱에 붙여 넣고, 답을 다시 붙여 넣는다
export const PROVIDERS = {
  manual: { name: '복사해서 쓰기 (키 없이)', model: '' },
  claude: { name: 'Claude (Anthropic)', model: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { name: 'ChatGPT (OpenAI)', model: 'gpt-5.4-mini', keyUrl: 'https://platform.openai.com/api-keys' },
  gemini: { name: 'Gemini (Google)', model: 'gemini-flash-latest', keyUrl: 'https://aistudio.google.com/apikey' },
};
const K = 'lib.ai';
export function loadAI() {
  let v = {}; try { v = JSON.parse(localStorage.getItem(K) || '{}'); } catch {}
  return { provider: 'manual', keys: {}, models: {}, reader: '성경과 신학을 깊이 공부하려는 그리스도인', focus: '', ...v };
}
export function saveAI(v) { try { localStorage.setItem(K, JSON.stringify(v)); } catch {} }

const SHAPE = `{"summary":"이 장의 핵심 3~4문장(저자의 주장 중심, 자기 말로)",
 "reflect":["생각할 질문 1","생각할 질문 2","생각할 질문 3"],
 "quiz":[{"q":"객관식 문제","options":["보기1","보기2","보기3","보기4"],"answer":0,"why":"정답 해설 1~2문장, 본문 근거"}]}`;
function guide(cfg) {
  return `당신은 책 읽기를 돕는 선생님입니다. 읽는 사람: ${cfg.reader || '그리스도인 독자'}.
본문은 종이책을 스캔해 글자 인식(OCR)한 것이라 오탈자와 깨진 성경 장절 표기가 있을 수 있습니다. 흐름으로 바로잡아 이해하되, 확실하지 않은 장절은 문제에 쓰지 마세요.
생각할 질문 3개는 (1) 이 장에서 하나님에 대해 새롭게 알게 되는 것 (2) 읽는 사람의 삶과 사역에 이어지는 것 (3) 소그룹에서 함께 나눌 질문으로 만드세요.${cfg.focus ? `\n특별히 고려할 점: ${cfg.focus}` : ''}
확인 문제는 4개, 객관식 4지선다. answer는 정답 보기의 0부터 시작하는 번호이고 정답 위치를 골고루 섞으세요. 단순 암기보다 개념 이해를 묻고, 그럴듯한 오답을 만드세요.
하나님 중심·은혜 중심의 말을 쓰고, '~을 할 수 있게 됩니다' 같은 자기계발식 표현은 피하세요.`;
}
export function promptOne(book, ch, cfg, again) {
  return `${guide(cfg)}
반드시 아래 모양의 JSON 하나만 출력하세요. 다른 글은 쓰지 마세요.
${SHAPE}
${again ? '이전과 다른 새 질문과 문제로 만드세요.\n' : ''}
[책] 『${book.title || ''}』 ${book.author || ''}
[장] ${ch.no} ${ch.title || ''}${ch.subtitle ? ' — ' + ch.subtitle : ''}
[본문]
${(ch.text || []).join('\n\n').slice(0, 24000)}`;
}
// 여러 장을 한 번에(복사해서 쓰기용): 답은 {"장번호": {...}} 모양
export function promptMany(book, chs, cfg) {
  return `${guide(cfg)}
아래 ${chs.length}개 장마다 따로 만드세요. 반드시 JSON 하나만 출력하세요. 다른 글은 쓰지 마세요. 모양:
{"${chs[0].no}": ${SHAPE}, "${chs[1]?.no ?? chs[0].no + 1}": {…}, …}
[책] 『${book.title || ''}』 ${book.author || ''}
${chs.map((c) => `\n===== [장 ${c.no}] ${c.title || ''}${c.subtitle ? ' — ' + c.subtitle : ''}\n${(c.text || []).join('\n\n').slice(0, 9000)}`).join('\n')}`;
}
export function parseStudy(t) {
  const m = String(t || '').match(/\{[\s\S]*\}/);
  const S = JSON.parse(m ? m[0] : t);
  return S;
}
export function cleanStudy(S) {
  if (!S || !Array.isArray(S.quiz) || !Array.isArray(S.reflect)) throw new Error('답의 모양이 맞지 않아요');
  S.quiz = S.quiz.filter((q) => q && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length).slice(0, 6);
  S.reflect = S.reflect.filter((x) => typeof x === 'string').slice(0, 5);
  S.summary = String(S.summary || '');
  S.made = new Date().toISOString();
  return S;
}
// 한 번 묻기 → 글
export async function ask(cfg, prompt) {
  const p = cfg.provider, key = (cfg.keys || {})[p], model = (cfg.models || {})[p] || PROVIDERS[p]?.model;
  if (p === 'manual') throw Object.assign(new Error('manual'), { code: 'manual' });
  if (!key) throw Object.assign(new Error('AI 설정에서 API 키를 넣어 주세요.'), { code: 'nokey' });
  let r, j;
  if (p === 'claude') {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    });
    j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || r.status);
    return (j.content || []).map((c) => c.text || '').join('');
  }
  if (p === 'openai') {
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
    });
    j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || r.status);
    return j.choices?.[0]?.message?.content || '';
  }
  if (p === 'gemini') {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || r.status);
    return (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
  }
  throw new Error('AI를 골라 주세요.');
}
