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
const OUTLANG = { ko: 'Korean', en: 'English', zh: 'Simplified Chinese', ja: 'Japanese' };
let UIL = 'ko'; export function setPromptLang(l) { UIL = l; }
export function loadAI() {
  let v = {}; try { v = JSON.parse(localStorage.getItem(K) || '{}'); } catch {}
  return { provider: 'manual', keys: {}, models: {}, reader: '', focus: '', ...v };
}
export function saveAI(v) { try { localStorage.setItem(K, JSON.stringify(v)); } catch {} }

const SHAPE = `{"summary":"이 장의 핵심 3~4문장(저자의 주장 중심, 자기 말로)",
 "reflect":["생각할 질문 1","생각할 질문 2","생각할 질문 3"],
 "quiz":[{"q":"객관식 문제","options":["보기1","보기2","보기3","보기4"],"answer":0,"why":"정답 해설 1~2문장, 본문 근거"}]}`;
const SHAPE_EN = `{"summary":"the chapter's core in 3-4 sentences, in your own words",
 "reflect":["reflection question 1","reflection question 2","reflection question 3"],
 "quiz":[{"q":"multiple-choice question","options":["option 1","option 2","option 3","option 4"],"answer":0,"why":"1-2 sentence explanation grounded in the text"}]}`;
const shape = () => (UIL === 'ko' ? SHAPE : SHAPE_EN);
const lab = (k) => (UIL === 'ko' ? { book: '[책]', ch: '[장]', body: '[본문]' } : { book: '[Book]', ch: '[Chapter]', body: '[Text]' })[k];
function guide(cfg) {
  if (UIL !== 'ko') return `You are a teacher helping someone read a book. The reader: ${cfg.reader || 'a Christian reader'}.
The text was scanned from a paper book and read by OCR, so it may contain typos and broken Bible references. Understand it from the flow, but do not use any reference you are unsure of in the questions.
Make 3 reflection questions: (1) what this chapter shows anew about God, (2) how it connects to the reader's life and ministry, (3) one for a small group to discuss together.${cfg.focus ? `\nAlso consider: ${cfg.focus}` : ''}
Make 4 multiple-choice check questions with 4 options each. "answer" is the 0-based index of the correct option; vary its position. Test understanding of ideas rather than rote recall, with plausible wrong options.
Use God-centred, grace-centred language and avoid self-help phrasing.
Write every value (summary, questions, options, explanations) in ${OUTLANG[UIL] || 'English'}. Keep the JSON keys exactly as shown.`;
  return `당신은 책 읽기를 돕는 선생님입니다. 읽는 사람: ${cfg.reader || '성경과 신학을 깊이 공부하려는 그리스도인'}.
본문은 종이책을 스캔해 글자 인식(OCR)한 것이라 오탈자와 깨진 성경 장절 표기가 있을 수 있습니다. 흐름으로 바로잡아 이해하되, 확실하지 않은 장절은 문제에 쓰지 마세요.
생각할 질문 3개는 (1) 이 장에서 하나님에 대해 새롭게 알게 되는 것 (2) 읽는 사람의 삶과 사역에 이어지는 것 (3) 소그룹에서 함께 나눌 질문으로 만드세요.${cfg.focus ? `\n특별히 고려할 점: ${cfg.focus}` : ''}
확인 문제는 4개, 객관식 4지선다. answer는 정답 보기의 0부터 시작하는 번호이고 정답 위치를 골고루 섞으세요. 단순 암기보다 개념 이해를 묻고, 그럴듯한 오답을 만드세요.
하나님 중심·은혜 중심의 말을 쓰고, '~을 할 수 있게 됩니다' 같은 자기계발식 표현은 피하세요.`;
}
export function promptOne(book, ch, cfg, again) {
  return `${guide(cfg)}
${UIL === 'ko' ? '반드시 아래 모양의 JSON 하나만 출력하세요. 다른 글은 쓰지 마세요.' : 'Output only one JSON object of the shape below, and nothing else.'}
${shape()}
${again ? (UIL === 'ko' ? '이전과 다른 새 질문과 문제로 만드세요.\n' : 'Make new questions, different from before.\n') : ''}
${lab('book')} 『${book.title || ''}』 ${book.author || ''}
${lab('ch')} ${ch.no} ${ch.title || ''}${ch.subtitle ? ' — ' + ch.subtitle : ''}
${lab('body')}
${(ch.text || []).join('\n\n').slice(0, 24000)}`;
}
// 여러 장을 한 번에(복사해서 쓰기용): 답은 {"장번호": {...}} 모양
export function promptMany(book, chs, cfg) {
  return `${guide(cfg)}
${UIL === 'ko' ? `아래 ${chs.length}개 장마다 따로 만드세요. 반드시 JSON 하나만 출력하세요. 다른 글은 쓰지 마세요. 모양:` : `Make one set for each of the ${chs.length} chapters below. Output only one JSON object, nothing else. Shape:`}
{"${chs[0].no}": ${shape()}, "${chs[1]?.no ?? chs[0].no + 1}": {…}, …}
${lab('book')} 『${book.title || ''}』 ${book.author || ''}
${chs.map((c) => `\n===== ${lab('ch').slice(0, -1)} ${c.no}] ${c.title || ''}${c.subtitle ? ' — ' + c.subtitle : ''}\n${(c.text || []).join('\n\n').slice(0, 9000)}`).join('\n')}`;
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

// AI 정밀 교정: 쪽 사진 + 글자 인식 결과(줄 번호)를 함께 보내, 사진에 찍힌 그대로 줄마다 고친 글을 받는다.
// 저자의 글을 다듬지 않도록 '보이는 그대로'만 요구하고, 받은 줄도 원래 줄과 너무 다르면 쓰지 않는다(지어내기 방지).
export const PROOF_MODEL = { claude: 'claude-haiku-5-5', openai: 'gpt-5.4-mini', gemini: 'gemini-flash-latest' };
export async function proofPage(cfg, jpegB64, lines, bookLang = 'kor') {
  const p = cfg.provider, key = (cfg.keys || {})[p], model = PROOF_MODEL[p];
  if (!key || !model) throw Object.assign(new Error('AI 설정에서 API 키를 넣어 주세요.'), { code: 'nokey' });
  const prompt = `This is a scanned page of a printed book (language: ${bookLang}) and an OCR transcription of it, one numbered line per printed line.
Correct every line so that it is EXACTLY what is printed on the page image: fix misread letters, digits, Bible references (book abbreviations, chapter:verse, hyphens), quotation marks and punctuation.
Rules: copy the printed text faithfully. Do NOT paraphrase, modernize, translate, or fix the author's own spelling or grammar. Keep the spacing between words as printed. Do not merge or split lines.
If a numbered line is noise that is not text on the page, return "" for it.
Return only JSON: {"lines": [ ...exactly ${lines.length} strings, in the same order... ]}

${lines.map((l, i) => `${i + 1}\t${l}`).join('\n')}`;
  let r, j, out;
  if (p === 'claude') {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegB64 } }, { type: 'text', text: prompt }] }] }),
    });
    j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || r.status);
    out = (j.content || []).map((c) => c.text || '').join('');
  } else if (p === 'openai') {
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + jpegB64, detail: 'high' } }, { type: 'text', text: prompt }] }], response_format: { type: 'json_object' } }),
    });
    j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || r.status);
    out = j.choices?.[0]?.message?.content || '';
  } else if (p === 'gemini') {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: 'image/jpeg', data: jpegB64 } }, { text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
    });
    j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || r.status);
    out = (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('');
  } else throw Object.assign(new Error('manual'), { code: 'manual' });
  const m = out.match(/\{[\s\S]*\}/); if (!m) throw new Error('AI 답을 읽지 못했어요');
  const arr = JSON.parse(m[0]).lines;
  if (!Array.isArray(arr) || arr.length !== lines.length) throw new Error('AI가 줄 수를 맞추지 못했어요');
  return arr.map((x) => String(x ?? ''));
}
// 두 줄이 얼마나 닮았는지(0~1): 띄어쓰기를 뺀 글자 편집 거리
export function likeness(a, b) {
  a = [...a.replace(/\s/g, '')]; b = [...b.replace(/\s/g, '')];
  if (!a.length && !b.length) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let k = 1; k <= b.length; k++) cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)); prev = cur; }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}
