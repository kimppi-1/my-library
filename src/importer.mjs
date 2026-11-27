// 책 추가: PDF(또는 책 사진)를 넣으면 쪽마다 읽고 → 장을 나눠 보여 주고 → 고친 대로 서재에 꽂는다
import { list, putRaw, getRaw, delRaw, delPrefix } from './store.mjs';
import { detect, build } from './chapters.mjs';
import { buildFixes, applyFixes } from './glossary.mjs';
import { fixRefs, bookFreq } from './refs.mjs';
import { loadAI, proofPage, likeness, PROVIDERS } from './ai.mjs';
import { lang as uiLang, t } from './i18n.mjs';
const BOOKLANG = { kor: '한국어', eng: 'English', chi_sim: '中文(简体)', chi_tra: '中文(繁體)', jpn: '日本語' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (t) => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
let OCR = null; const ocr = async () => (OCR = OCR || await import('./ocr.mjs'));
let running = null;   // 지금 읽고 있는 작업 { id, stop }

function aiReady() { const c = loadAI(); return c.provider !== 'manual' && !!(c.keys || {})[c.provider]; }
export async function renderAdd(view, ctx) {
  ctx.crumb('책 추가');
  const jobs = (await list('imports')).map((d) => d.data).filter((j) => j && !j.done);
  view.innerHTML = `<h1>책 추가</h1>
  <p class="sub">가지고 있는 책의 PDF(스캔한 것도 됩니다)나 책장 사진을 넣으면, 이 기기 안에서 글자를 읽어 장별로 나눠 서재에 꽂아요. 파일은 어디로도 보내지 않아요.</p>
  ${jobs.length ? `<div class="cover"><h2 style="margin-top:0">읽다 만 책</h2>${jobs.map((j) => `<div class="row" style="margin:6px 0"><b class="nt">${esc(j.title)}</b><span class="note">${j.pages.filter(Boolean).length}/${j.total}쪽</span><a class="btn ghost" href="#imp-${esc(j.id)}">${j.pages.filter(Boolean).length >= j.total ? '장 나누기로' : '이어서 읽기'}</a><button class="ghost" data-del="${esc(j.id)}">지우기</button></div>`).join('')}</div>` : ''}
  <div class="cover">
    <label class="lab" for="f">1. 책 파일 고르기 <span class="note">PDF 여러 개(앞권·뒷권)나 사진 여러 장도 한 권으로 묶어요. 이름 순서대로 이어 붙여요.</span></label>
    <div class="drop" id="drop"><input type="file" id="f" accept="application/pdf,image/*" multiple><p>여기에 끌어다 놓거나 눌러서 고르세요</p><p class="note nt" id="fl"></p></div>
    <div class="grid2">
      <label>책 제목<input id="t" placeholder="예: 신학 한걸음"></label>
      <label>지은이<input id="a" placeholder="예: J. I. 패커"></label>
      <label>펴낸 곳 · 해<input id="p" placeholder="예: 복있는사람, 2026"></label>
      <label>표지 사진 (선택)<input type="file" id="cv" accept="image/*"></label>
    </div>
    <details style="margin-top:10px"><summary>읽기 설정</summary>
      <label class="lab" style="margin-top:8px">책의 언어 <select id="bl" class="chip" style="max-width:16em">${Object.entries(BOOKLANG).map(([k, v]) => `<option value="${k}" ${k === ({ ko: 'kor', en: 'eng', zh: 'chi_sim', ja: 'jpn' }[uiLang()] || 'kor') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" id="sp" checked> 틀린 글자 바로잡기 (한국어 책 · Kiwi 언어 모형 · 처음 한 번 약 28MB 받음)</label>
      <label class="chk"><input type="checkbox" id="hq"> 더 꼼꼼히 읽기 (느리지만 작은 글씨에 좋음)</label>
      ${aiReady() ? `<label class="chk"><input type="checkbox" id="ai" style="flex:none"> <span><b>AI로 한 번 더 바로잡기</b> <span class="nt">(${esc(PROVIDERS[loadAI().provider].name)})</span> — 쪽 사진을 AI가 직접 보고 오타를 고쳐요. 가장 정확하지만 쪽마다 AI 요금이 들어요(Gemini가 가장 저렴해요).</span></label>`
        : `<p class="note">AI로 한 번 더 바로잡기: <a href="#set">설정</a>에서 Claude·ChatGPT·Gemini 키를 넣으면 쓸 수 있어요. 쪽 사진을 AI가 직접 보고 오타를 고쳐 가장 정확해요.</p>`}
    </details>
    <div class="row" style="margin-top:14px"><button id="go" disabled>읽기 시작</button><span class="note">300쪽 책이면 컴퓨터에서 40분~2시간쯤 걸려요. 그동안 이 화면을 열어 두세요(다른 탭은 써도 돼요).</span></div>
  </div>`;
  view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('읽던 내용을 지울까요?')) { await delRaw('imports/' + b.dataset.del); renderAdd(view, ctx); } }));
  const f = view.querySelector('#f'), go = view.querySelector('#go'), drop = view.querySelector('#drop');
  let files = [];
  const setFiles = (fs) => {
    files = [...fs].filter((x) => /pdf$|^image\//.test(x.type) || /\.pdf$/i.test(x.name)).sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
    view.querySelector('#fl').textContent = files.map((x) => x.name).join(' · ');
    go.disabled = !files.length;
    const t = view.querySelector('#t'); if (!t.value && files[0]) t.value = files[0].name.replace(/\.[^.]+$/, '').replace(/[_\-\s]*\d+$/, '').replace(/[_]/g, ' ').trim();
  };
  f.onchange = () => setFiles(f.files);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('on'); };
  drop.ondragleave = () => drop.classList.remove('on');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('on'); setFiles(e.dataTransfer.files); };
  go.onclick = async () => {
    go.disabled = true;
    const id = slug();
    let cover = '';
    const cf = view.querySelector('#cv').files[0];
    if (cf) cover = await shrink(cf, 480);
    const [publisher, year] = view.querySelector('#p').value.split(/[,·]/).map((x) => x.trim());
    const job = { id, title: view.querySelector('#t').value.trim() || '제목 없는 책', author: view.querySelector('#a').value.trim(), publisher: publisher || '', year: year || '', cover,
      lang: view.querySelector('#bl').value, spell: view.querySelector('#sp').checked && view.querySelector('#bl').value === 'kor', dpi: view.querySelector('#hq').checked ? 500 : 400, ai: !!view.querySelector('#ai')?.checked, files: files.map((x) => x.name), total: 0, pages: [], at: new Date().toISOString() };
    // 원본 파일도 이 기기 안에 잠시 둔다(이어서 읽기용). 다 꽂으면 지운다
    const blobs = []; let total = 0;
    const O = await ocr();
    for (const x of files) {
      if (/^image\//.test(x.type)) { blobs.push({ name: x.name, type: x.type, data: await x.arrayBuffer(), pages: 1 }); total += 1; }
      else { const buf = await x.arrayBuffer(); const doc = await O.openPdf(buf.slice(0)); blobs.push({ name: x.name, type: 'pdf', data: buf, pages: doc.numPages }); total += doc.numPages; doc.destroy(); }
    }
    job.total = total; job.pages = new Array(total).fill(null);
    await putRaw('importfiles/' + id, blobs);
    await putRaw('imports/' + id, job);
    location.hash = '#imp-' + id;
  };
}

async function shrink(file, W) {
  const bm = await createImageBitmap(file); const k = Math.min(1, W / bm.width);
  const c = document.createElement('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k);
  c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.85);
}

// 읽는 중 화면 → 다 읽으면 장 나누기 화면
export async function renderImport(view, ctx, id) {
  const job = await getRaw('imports/' + id);
  if (!job) { view.innerHTML = `<p class="empty">이 작업을 찾을 수 없어요. <a href="#add">책 추가로</a></p>`; return; }
  ctx.crumb(job.title);
  const done = job.pages.filter(Boolean).length;
  if (done < job.total) return renderReading(view, ctx, job);
  return renderSplit(view, ctx, job);
}

async function renderReading(view, ctx, job) {
  view.innerHTML = `<h1 class="nt">${esc(job.title)}</h1><p class="sub">글자를 읽고 있어요. 이 화면을 닫아도 읽은 쪽은 저장돼 있어서, 다시 열면 이어서 읽어요.</p>
  <div class="cover"><div class="bar"><i id="pb" style="width:0"></i></div><p class="note" id="pn"></p><p class="note" id="ain">${job.ai ? 'AI로 한 번 더 바로잡는 중이에요.' : ''}</p><pre class="peek" id="peek"></pre>
  <div class="row"><button class="ghost" id="stop">잠시 멈추기</button></div></div>`;
  const pb = view.querySelector('#pb'), pn = view.querySelector('#pn'), peek = view.querySelector('#peek'), aiNote = view.querySelector('#ain');
  if (running && running.id !== job.id) { pn.textContent = '다른 책을 읽고 있어요. 그 책이 끝난 뒤에 이어서 읽을게요.'; return; }
  const O = await ocr();
  const blobs = await getRaw('importfiles/' + job.id);
  if (!blobs) { pn.textContent = '원본 파일을 찾을 수 없어요. 책 추가에서 다시 넣어 주세요.'; return; }
  let stop = false; view.querySelector('#stop').onclick = () => { stop = true; pn.textContent = '이 쪽까지 읽고 멈춰요…'; };
  running = { id: job.id };
  let fixer = null;
  if (job.spell) { pn.textContent = '틀린 글자 바로잡기 모형을 받는 중… (처음 한 번)'; try { fixer = await O.loadSpell(); } catch (e) { console.warn(e); pn.textContent = '바로잡기 모형을 받지 못해 그냥 읽어요.'; } }
  // 쪽 목록: [파일 번호, 그 파일의 쪽]
  const map = []; blobs.forEach((b, fi) => { for (let p = 1; p <= b.pages; p++) map.push([fi, p]); });
  const docs = {};
  const getDoc = async (fi) => (docs[fi] = docs[fi] || O.openPdf(blobs[fi].data.slice(0)));
  const t0 = Date.now(); let n0 = job.pages.filter(Boolean).length, made = 0;
  const slots = Math.min(2, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
  let next = 0, fails = 0, failed = false, lastErr = '';
  const todo = () => { while (next < map.length && job.pages[next]) next++; return next < map.length ? next++ : -1; };
  const show = () => {
    const d = job.pages.filter(Boolean).length; pb.style.width = (d / job.total * 100).toFixed(1) + '%';
    const per = made ? (Date.now() - t0) / made / slots : 0, left = per ? Math.round(per * (job.total - d) / 60000) : null;
    pn.textContent = `${d} / ${job.total}쪽 읽음${left != null ? ` · 남은 시간 약 ${left}분` : ''}`;
  };
  let saving = Promise.resolve();
  const save = () => (saving = saving.then(() => putRaw('imports/' + job.id, job)));
  // AI 정밀 교정: 받은 줄이 원래 줄과 충분히 닮았을 때만 쓴다(지어낸 글 막기)
  const cfg = loadAI(); let aiOn = !!job.ai && aiReady(), aiFails = 0;
  const proof = async (b64, lines) => {
    if (!aiOn) return false;
    try {
      const src = lines.map((l) => l.text), got = await proofPage(cfg, b64, src, job.lang || 'kor');
      const conf = (l) => (l.words?.length ? l.words.reduce((a, x) => a + x.conf, 0) / l.words.length : l.conf || 0);
      got.forEach((t, i) => {
        if (t === src[i]) return;
        if (!t.trim()) { if (conf(lines[i]) < 50) lines[i].text = ''; return; }
        const like = likeness(t, src[i]);
        if (like >= 0.6 || (conf(lines[i]) < 60 && like >= 0.3)) lines[i].text = t;
      });
      aiFails = 0; return true;
    } catch (e) {
      console.warn('AI 교정', e); lastErr = String(e?.message || e);
      if (++aiFails >= 3) { aiOn = false; aiNote.textContent = t('AI 바로잡기가 계속 실패해서 껐어요(글자 인식은 계속해요): {e}', { e: lastErr }); }
      return false;
    }
  };
  async function lane(slot) {
    for (let i; !stop && (i = todo()) >= 0;) {
      const [fi, p] = map[i], b = blobs[fi];
      let pg;
      try {
        if (b.type === 'pdf') {
          const doc = await getDoc(fi); const page = await doc.getPage(p);
          pg = await O.textLayer(page) || await O.ocrPage(page, { dpi: job.dpi, slot, lang: job.lang || 'kor', proof });
          page.cleanup();
        } else pg = await O.ocrImage(new Blob([b.data], { type: b.type }), { slot, lang: job.lang || 'kor', proof });
        if (fixer && !pg.digital && !pg.proofed) pg.spell = O.spellLines(fixer, pg.lines);
      } catch (e) {
        console.error(e); fails++;
        lastErr = String(e?.message || e);
        if (fails >= 3) { stop = true; failed = true; }
        continue;   // 이 쪽은 다음에 다시 읽는다
      }
      fails = 0;
      job.pages[i] = pg; made++;
      peek.textContent = pg.lines.slice(0, 8).map((l) => l.text).join('\n');
      show(); save();
    }
  }
  show();
  await Promise.all(Array.from({ length: slots }, (_, k) => lane(k)));
  await saving; running = null;
  for (const k in docs) (await docs[k]).destroy();
  if (failed) { await O.terminate(); pn.textContent = t('글자를 읽지 못해 멈췄어요') + ': ' + lastErr + '. ' + t('인터넷 연결을 확인하고 이 화면을 다시 열면 이어서 읽어요.'); view.querySelector('#stop').outerHTML = `<button onclick="location.reload()">다시 시도</button>`; return; }
  if (job.pages.filter(Boolean).length >= job.total) { await O.terminate(); renderSplit(view, ctx, job); }
  else pn.textContent = `멈췄어요. ${job.pages.filter(Boolean).length}/${job.total}쪽까지 읽었어요. 이 화면을 다시 열면 이어서 읽어요.`, view.querySelector('#stop').outerHTML = `<a class="btn" href="#imp-${esc(job.id)}" onclick="location.reload()">이어서 읽기</a>`;
}

// 장 나누기: 쪽마다 '본문 / 새 장 / 부 표지 / 빼기'를 고르고 제목을 고친다
async function renderSplit(view, ctx, job) {
  const pages = job.pages.map((p) => ({ w: p.w, h: p.h, lines: p.lines.map((l) => ({ ...l })) }));
  if (!job.roles) { job.roles = detect(pages).map(({ role, title, subtitle, part, num, headLines }) => ({ role, title, subtitle, part, num, headLines })); await putRaw('imports/' + job.id, job); }
  const roles = job.roles;
  const first = (i) => (job.pages[i].lines || []).filter((l) => l.text).slice(0, 3).map((l) => l.text).join(' / ').slice(0, 140);
  let onlyStarts = false;
  const draw = () => {
    const nCh = roles.filter((r) => r.role === 'chapter').length;
    view.innerHTML = `<h1>장 나누기</h1><p class="sub">『<span class="nt">${esc(job.title)}</span>』 ${job.total}쪽을 다 읽었어요. 장이 시작하는 쪽을 맞게 짚었는지 보고, 제목을 고친 뒤 서재에 꽂으세요.</p>
    <div class="cover"><p class="note">지금 <b>${nCh}개 장</b>. 큰 글씨 제목이 있는 쪽을 장 시작으로 짐작했어요. 차례·찾아보기·주처럼 읽지 않을 쪽은 '빼기'로 두세요.</p>
    <div class="row"><button class="ghost" id="only">${onlyStarts ? '모든 쪽 보기' : '장 시작 쪽만 보기'}</button><button class="ghost" id="redo">처음 짐작으로 되돌리기</button><button id="save">서재에 꽂기</button></div></div>
    <table class="split"><thead><tr><th>쪽</th><th>무엇</th><th>제목 · 부제</th><th>첫 줄</th></tr></thead><tbody>
    ${roles.map((r, i) => (onlyStarts && r.role === 'body') ? '' : `<tr class="r-${r.role}" data-i="${i}"><td>${i + 1}</td>
      <td><select data-k="role" aria-label="${i + 1}쪽은">${[['body', '본문'], ['chapter', '새 장 시작'], ['part', '부 표지'], ['skip', '빼기']].map(([v, l]) => `<option value="${v}" ${r.role === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td>${r.role === 'chapter' || r.role === 'part' ? `<input data-k="title" value="${esc(r.title)}" aria-label="제목" placeholder="제목">${r.role === 'chapter' ? `<input data-k="subtitle" value="${esc(r.subtitle)}" aria-label="부제" placeholder="부제 (없으면 비워 두기)">` : ''}` : ''}</td>
      <td class="note nt">${esc(first(i))}</td></tr>`).join('')}</tbody></table>`;
    view.querySelector('#only').onclick = () => { onlyStarts = !onlyStarts; draw(); };
    view.querySelector('#redo').onclick = async () => { if (!confirm('고친 것을 버리고 처음 짐작으로 되돌릴까요?')) return; delete job.roles; renderSplit(view, ctx, job); };
    view.querySelectorAll('tr[data-i]').forEach((tr) => {
      const i = +tr.dataset.i;
      tr.querySelectorAll('[data-k]').forEach((el) => (el.onchange = async () => {
        roles[i][el.dataset.k] = el.value;
        if (el.dataset.k === 'role' && el.value === 'chapter' && !roles[i].title) roles[i].title = (job.pages[i].lines.find((l) => l.text.length >= 2 && l.text.length <= 30) || {}).text || '';
        await putRaw('imports/' + job.id, job);
        if (el.dataset.k === 'role') draw();
      }));
    });
    view.querySelector('#save').onclick = () => finish(view, ctx, job, pages);
  };
  draw();
}

async function finish(view, ctx, job, pages) {
  const btn = view.querySelector('#save'); btn.disabled = true; btn.textContent = '꽂는 중…';
  const roles = job.roles.map((r) => ({ ...r }));
  let joinScore = null;
  if (job.spell) { try { btn.textContent = '낱말 잇기 모형 불러오는 중…'; const O = await ocr(); const fx = await O.loadSpell(); joinScore = fx.score; } catch (e) { console.warn(e); } btn.textContent = '꽂는 중…'; }
  const chs = build(pages, roles, { joinScore });
  if (!chs.length) { btn.disabled = false; btn.textContent = '서재에 꽂기'; alert('본문으로 쓸 쪽이 없어요. 쪽마다 \'본문\'이나 \'새 장 시작\'을 골라 주세요.'); return; }
  // 중요한 낱말 지키기
  const extra = (ctx.settings().extraWords || '').split(/[\s,]+/).filter(Boolean);
  const rep = (job.lang || 'kor') !== 'kor' ? {} : buildFixes(chs.flatMap((c) => [...c.text, c.epigraph, c.title, c.subtitle]), extra);
  for (const c of chs) { c.text = c.text.map((t) => applyFixes(t, rep)); c.epigraph = applyFixes(c.epigraph, rep); c.title = applyFixes(c.title, rep); c.subtitle = applyFixes(c.subtitle, rep); }
  // 성경 장절 바로잡기(한국어 책): 66권 1,189장의 절 수 표로 있을 수 있는 장절만 남긴다
  if ((job.lang || 'kor') === 'kor') {
    const freq = bookFreq(chs.flatMap((c) => [...c.text, c.epigraph || '']).join('\n'));
    for (const c of chs) { c.text = c.text.map((t) => fixRefs(t, freq)); if (c.epigraph) c.epigraph = fixRefs(c.epigraph, freq); }
  }
  const bid = job.id;
  const books = (await list('books')).map((d) => d.data);
  const colors = ['#8a7a5c', '#5c7a8a', '#7a5c8a', '#5c8a6a', '#8a5c5c', '#6a6a8a'];
  const old = books.find((b) => b.id === bid);
  const meta = { ...(old || {}), id: bid, title: old?.title || job.title, author: old?.author ?? job.author, publisher: old?.publisher ?? job.publisher, year: old?.year ?? job.year, cover: old?.cover || job.cover || '', color: old?.color || colors[books.length % colors.length], order: old?.order || books.length + 1,
    toc: chs.map((c) => ({ no: c.no, title: c.title, subtitle: c.subtitle, part: c.part })), added: new Date().toISOString(), fixed: Object.keys(rep).length };
  await delPrefix(`chapters/${bid}-`);
  for (const c of chs) await putRaw(`chapters/${bid}-${c.no}`, { no: c.no, title: c.title, subtitle: c.subtitle, part: c.part, epigraph: c.epigraph, text: c.text });
  await putRaw('books/' + bid, meta);
  job.done = true; await putRaw('imports/' + bid, job);   // 쪽 자료는 '장 나누기 다시'를 위해 남겨 둔다
  await delRaw('importfiles/' + bid);
  location.hash = '#b-' + bid;
}
