import { db as store, persist, dumpAll, loadAll, delPrefix, putRaw, getRaw, delRaw } from './store.mjs';
import * as AI from './ai.mjs';
import { renderAdd, renderImport } from './importer.mjs';

const view=document.getElementById("view"),statusEl=document.getElementById("status"),crumb=document.getElementById("crumb");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
let db=store,books=[],progress={},cache={},ready=false,skipRoute=false;
let AIC=AI.loadAI();
const setx=()=>{try{return JSON.parse(localStorage.getItem("lib.set")||"{}")}catch(e){return {}}};
const ctx={crumb:t=>{crumb.textContent=t},settings:setx};

function prog(bid){const p=JSON.parse(JSON.stringify(progress[bid]||{}));p.read=p.read||{};if(p.bookmark===undefined)p.bookmark=null;return p}
async function saveProg(bid){const p=prog(bid);try{await db.collection("progress").doc(bid).set(p)}catch(e){statusEl.textContent="진도를 저장하지 못했어요."}}

function route(){
  const h=(location.hash||"#lib").slice(1);
  if(!ready)return;
  document.body.classList.toggle("reading",h.startsWith("r-"));closeBar();document.getElementById("sheetHost").innerHTML="";
  if(h==="add")return renderAdd(view,ctx);
  if(h.startsWith("imp-"))return renderImport(view,ctx,h.slice(4));
  if(h==="set")return renderSettings();
  if(h.startsWith("gen-"))return renderGenAll(h.slice(4));
  if(h.startsWith("edit-"))return renderEdit(h.slice(5));
  if(h==="hl"||h.startsWith("hl-"))return renderHL(h.startsWith("hl-")?h.slice(3):"");
  if(h.startsWith("b-"))return renderBook(h.slice(2));
  if(h.startsWith("r-")){let k=h.slice(2),jump=-1;const at=k.indexOf("@");if(at>0){jump=parseInt(k.slice(at+1),10);k=k.slice(0,at)}const i=k.lastIndexOf("-");return renderChapter(k.slice(0,i),parseInt(k.slice(i+1),10),jump)}
  renderLib();
}

function renderLib(){
  crumb.textContent="";
  if(!books.length){view.innerHTML=`<h1>내 서재</h1><p class="sub">가지고 있는 책의 PDF를 넣으면 장별로 나눠 읽고, 읽은 곳 표시·책갈피·형광펜·메모·질문과 문제로 익힐 수 있어요. 모든 것은 이 기기 안에만 저장돼요.</p><div class="row"><a class="btn" href="#add">첫 책 추가하기</a><a class="btn ghost" href="#set">설정·AI·백업</a></div>`;return}
  const cov=B=>{const src=String(B.cover||"");return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src)?`<img src="${esc(src)}" alt="${esc(B.title)} 표지">`:`<div class="gen"><span>${esc(B.title)}</span><small>${esc(B.author||"")}</small></div>`};
  view.innerHTML=`<h1>내 서재</h1><p class="sub">읽고 싶은 책 표지를 누르면 목차가 열려요. 한 장씩 읽고, 책갈피를 꽂고, 질문과 문제로 익혀 가요.</p>
  <div class="covers">${books.map(B=>{const p=prog(B.id),n=(B.toc||[]).length,r=Object.keys(p.read||{}).length,pc=n?Math.round(r/n*100):0;
    return `<a class="cv" href="#b-${esc(B.id)}" style="--c:${esc(B.color||"")};--rb:${p.bookmark?1:0}"><div class="img">${cov(B)}</div><div class="meta"><b>${esc(B.title)}</b><span class="note">${esc(B.author||"")}</span><span class="bar"><i style="width:${pc}%"></i></span><span class="note">${r}/${n}장${p.bookmark?` · 책갈피 ${pad(p.bookmark.no)}장`:""}</span></div></a>`}).join("")}
    <a class="cv add" href="#add"><div class="img">＋<br>책 추가</div></a></div>`;
}

function renderBook(bid){
  const B=books.find(x=>x.id===bid);if(!B){view.innerHTML=`<p class="empty">책을 찾을 수 없어요. <a href="#lib">서재로</a></p>`;return}
  crumb.textContent=B.title;
  const p=prog(bid),toc=B.toc||[],r=Object.keys(p.read||{}).length,pc=toc.length?Math.round(r/toc.length*100):0;
  const next=toc.find(c=>!(p.read||{})[c.no]);
  let html=`<div class="cover"><h1>${esc(B.title)}</h1><p class="sub">${esc(B.author||"")}${B.publisher?" · "+esc(B.publisher):""}${B.year?" · "+esc(B.year):""}</p>
  <div class="bar"><i style="width:${pc}%"></i></div><p class="note">${toc.length}장 중 ${r}장 읽음 (${pc}%)</p>
  <div class="row">${p.bookmark?`<a class="btn" href="#r-${esc(bid)}-${p.bookmark.no}"><span class="mark"></span> 책갈피에서 이어 읽기 · ${pad(p.bookmark.no)}장</a>`:""}${next?`<a class="btn ${p.bookmark?"ghost":""}" href="#r-${esc(bid)}-${next.no}">${r?"다음 안 읽은 장":"처음부터 읽기"} · ${esc(next.title)}</a>`:""}<a class="btn ghost" href="#hl-${esc(bid)}">형광펜·메모 모아 보기 (${HL.filter(h=>h.bid===bid).length})</a><a class="btn ghost" href="#gen-${esc(bid)}">모든 장 질문·문제 한꺼번에 만들기</a><a class="btn ghost" href="#edit-${esc(bid)}">책 정보·장 나누기 고치기</a></div>
  ${B.note?`<p class="note" style="margin-top:12px">${esc(B.note)}</p>`:""}</div>`;
  let part=null;html+=`<ul class="toc">`;
  for(const c of toc){
    if(c.part&&c.part!==part){part=c.part;html+=`</ul><div class="part">${esc(part)}</div><ul class="toc">`}
    const rd=(p.read||{})[c.no],bm=p.bookmark&&p.bookmark.no===c.no;
    html+=`<li><a href="#r-${esc(bid)}-${c.no}" class="${rd?"read":""}"><span class="n">${c.no?pad(c.no):"·"}</span><span class="t"><b>${esc(c.title)}</b>${c.subtitle?`<span>${esc(c.subtitle)}</span>`:""}</span><span class="s">${bm?`<span class="mark" title="책갈피"></span>`:""}${rd?`<span class="check">읽음</span>`:""}</span></a></li>`;
  }
  view.innerHTML=html+`</ul>`;
}

async function getChapter(bid,no){
  const id=`${bid}-${no}`;if(cache[id])return cache[id];
  const raw=await getRaw(`chapters/${bid}-${no}`);if(!raw)return null;
  const C={id,...raw};
  if(db){try{const s=await db.doc("study/"+id).get();if(s.exists)C.study=JSON.parse(JSON.stringify(s.data()))}catch(e){}}
  cache[id]=C;return C;
}

let lastCh=null;
async function renderChapter(bid,no,jump=-1){
  const B=books.find(x=>x.id===bid);if(!B){view.innerHTML=`<p class="empty">책을 찾을 수 없어요.</p>`;return}
  const toc=B.toc||[],i=toc.findIndex(c=>c.no===no),meta=toc[i];
  crumb.textContent=B.title;
  view.innerHTML=`<p class="empty">펼치는 중…</p>`;
  let C=null;try{C=await getChapter(bid,no)}catch(e){}
  if(!C||!meta){view.innerHTML=`<p class="empty">이 장을 불러오지 못했어요. <a href="#b-${esc(bid)}">목차로</a></p>`;return}
  const p=prog(bid),rd=(p.read||{})[no],bmPara=p.bookmark&&p.bookmark.no===no?p.bookmark.para:-1;
  const prev=toc[i-1],next=toc[i+1];
  view.innerHTML=`<article class="page">${p.bookmark&&p.bookmark.no===no?`<span class="ribbon" title="책갈피"></span>`:""}
    <p class="note" style="margin:0 0 6px">${esc(meta.part||"")}</p>
    ${no?`<div class="chno">${pad(no)}</div>`:""}
    <h1>${esc(C.title||meta.title)}</h1>${(C.subtitle||meta.subtitle)?`<p class="sub" style="font-size:19px;font-family:'Gowun Batang',serif">${esc(C.subtitle||meta.subtitle)}</p>`:""}
    ${C.epigraph?`<div class="epi">${esc(C.epigraph)}</div>`:""}
    <div class="txt" id="txt" data-bid="${esc(bid)}" data-no="${no}">${(C.text||[]).map((t,k)=>`<p class="${k===bmPara?"here":""}" id="p${k}" data-k="${k}">${paraHTML(t,bid,no,k)}<button class="bm" data-k="${k}" aria-label="여기에 책갈피 꽂기"><i></i></button></p>`).join("")}</div>
    <p class="note">스캔한 책을 글자 인식으로 옮긴 본문이라 오탈자, 특히 성경 장절 표기가 틀린 곳이 있어요. 인용할 때는 종이책으로 확인하세요.</p>
    <p class="note" id="hlInfo"></p>
    <div class="row" style="margin-top:14px"><button id="readBtn" class="${rd?"ghost":""}">${rd?"읽음 표시됨 · 취소":"다 읽었어요"}</button><button class="ghost" id="bmEnd">이 장에 책갈피</button></div>
    <section class="study" id="study"></section>
    <div class="nav2">${prev?`<a class="btn ghost" id="prevA" href="#r-${esc(bid)}-${prev.no}">← ${esc(prev.title)}</a>`:"<span></span>"}<a class="btn ghost" href="#b-${esc(bid)}">목차</a>${next?`<a class="btn ghost" id="nextA" href="#r-${esc(bid)}-${next.no}">${esc(next.title)} →</a>`:"<span></span>"}</div>
  </article>`;
  const pg=view.querySelector(".page");
  if(lastCh&&lastCh.bid===bid&&lastCh.no!==no&&RS.turn!=="none")pg.classList.add(RS.turn==="flip"?(no>lastCh.no?"flip":"flipback"):"x");else pg.classList.add("nofx");
  lastCh={bid,no};hlInfo(bid,no);
  if(jump>=0){const el=document.getElementById("p"+jump);if(el){el.scrollIntoView({block:"center"});el.querySelectorAll("mark.hl").forEach(m=>{m.classList.add("flash");setTimeout(()=>m.classList.remove("flash"),2200)})}}
  else if(bmPara>=0){const el=document.getElementById("p"+bmPara);if(el)el.scrollIntoView({block:"center"})}else window.scrollTo(0,0);
  view.querySelectorAll(".bm").forEach(b=>b.addEventListener("click",()=>setBookmark(bid,no,+b.dataset.k)));
  document.getElementById("bmEnd").addEventListener("click",()=>setBookmark(bid,no,0));
  document.getElementById("readBtn").addEventListener("click",async()=>{const P=prog(bid);P.read=P.read||{};if(P.read[no])delete P.read[no];else P.read[no]=new Date().toISOString();progress[bid]=P;await saveProg(bid);skipRoute=false;renderChapter(bid,no).then(()=>{const s=document.getElementById("study");if(s)s.scrollIntoView({block:"start"})})});
  renderStudy(bid,no,C);
}

async function setBookmark(bid,no,k){
  const P=prog(bid);P.bookmark={no,para:k,at:new Date().toISOString()};progress[bid]=P;await saveProg(bid);
  view.querySelectorAll(".txt p").forEach((el,j)=>el.classList.toggle("here",j===k));
  if(!view.querySelector(".ribbon")){const r=document.createElement("span");r.className="ribbon";view.querySelector(".page").prepend(r)}
  statusEl.textContent=`${pad(no)}장에 책갈피를 꽂았어요.`;
}

async function renderStudy(bid,no,C){
  const box=document.getElementById("study");if(!box)return;
  const S=C.study;
  if(!S){
    box.innerHTML=`<h2>생각할 질문과 확인 문제</h2><p class="note">이 장의 질문과 문제가 아직 없어요.</p><div class="row"><button id="gen">AI로 질문·문제 만들기</button><a class="btn ghost" href="#set">AI 고르기</a><span class="note" id="genNote"></span></div>`;
    document.getElementById("gen").addEventListener("click",()=>generate(bid,no,C));return;
  }
  let N={answers:[],picked:[]};if(db)try{const s=await db.doc(`notes/${bid}-${no}`).get();if(s.exists)N={answers:[],picked:[],...JSON.parse(JSON.stringify(s.data()))}}catch(e){}
  box.innerHTML=`<h2>한눈에 보기</h2><div class="summary">${esc(S.summary||"")}</div>
    <h2>생각할 질문</h2>${(S.reflect||[]).map((q,k)=>`<div class="q"><label for="a${k}">${k+1}. ${esc(q)}</label><textarea id="a${k}">${esc(N.answers[k]||"")}</textarea></div>`).join("")}
    <p class="note" id="saveNote">쓰고 나서 칸 밖을 누르면 저장돼요.</p>
    <h2>확인 문제</h2><ol class="quiz">${(S.quiz||[]).map((Q,k)=>`<li data-k="${k}"><b>${esc(Q.q)}</b><div class="opts">${(Q.options||[]).map((o,j)=>`<button data-j="${j}">${"①②③④⑤"[j]||""} ${esc(o)}</button>`).join("")}</div><div class="why" hidden></div></li>`).join("")}</ol>
    <p class="note" id="score"></p>
    <div class="row" style="margin-top:12px"><button class="ghost" id="regen">질문·문제 새로 만들기</button></div>`;
  const saveAns=async()=>{const answers=(S.reflect||[]).map((_,k)=>document.getElementById("a"+k).value);if(JSON.stringify(answers)===JSON.stringify(N.answers))return;N.answers=answers;N.updatedAt=new Date().toISOString();try{await db.doc(`notes/${bid}-${no}`).set(N);document.getElementById("saveNote").textContent="저장했어요."}catch(e){document.getElementById("saveNote").textContent="저장하지 못했어요. 다시 시도해 주세요."}};
  (S.reflect||[]).forEach((_,k)=>document.getElementById("a"+k).addEventListener("blur",saveAns));
  const showQ=(li,Q,j)=>{li.querySelectorAll(".opts button").forEach((b,x)=>{b.disabled=true;if(x===Q.answer)b.classList.add("right");else if(x===j)b.classList.add("wrong")});const w=li.querySelector(".why");w.hidden=false;w.textContent=(j===Q.answer?"맞았어요. ":"정답은 "+("①②③④⑤"[Q.answer]||"")+"번이에요. ")+(Q.why||"")};
  const scoreUpd=()=>{const done=(N.picked||[]).filter(x=>x!=null).length,ok=(N.picked||[]).filter((x,k)=>x!=null&&x===(S.quiz[k]||{}).answer).length;document.getElementById("score").textContent=done?`${done}문제 중 ${ok}문제 맞힘`:""};
  box.querySelectorAll(".quiz li").forEach(li=>{const k=+li.dataset.k,Q=S.quiz[k];if(N.picked&&N.picked[k]!=null)showQ(li,Q,N.picked[k]);
    li.querySelectorAll(".opts button").forEach(b=>b.addEventListener("click",async()=>{const j=+b.dataset.j;showQ(li,Q,j);N.picked=N.picked||[];N.picked[k]=j;for(let x=0;x<S.quiz.length;x++)if(N.picked[x]===undefined)N.picked[x]=null;scoreUpd();try{await db.doc(`notes/${bid}-${no}`).set(N)}catch(e){}}))});
  scoreUpd();
  document.getElementById("regen").addEventListener("click",()=>generate(bid,no,C,true));
}

async function saveStudy(bid,no,C,S,again){
  C.study=S;cache[C.id]=C;await db.doc("study/"+C.id).set(S);
  if(again){try{const s=await db.doc(`notes/${bid}-${no}`).get();if(s.exists)await db.doc(`notes/${bid}-${no}`).update({picked:[]})}catch(e){}}
}
async function generate(bid,no,C,again){
  const box=document.getElementById("study");AIC=AI.loadAI();
  const B=books.find(x=>x.id===bid)||{};
  const prompt=AI.promptOne(B,{...C,no},AIC,again);
  if(AIC.provider==="manual")return manualBox(box,prompt,t=>{const S=AI.cleanStudy(AI.parseStudy(t));return saveStudy(bid,no,C,S,again).then(()=>renderStudy(bid,no,C))});
  box.innerHTML=`<h2>생각할 질문과 확인 문제</h2><p class="note">${esc(AI.PROVIDERS[AIC.provider].name)}가 이 장을 읽고 질문과 문제를 만들고 있어요… (30초쯤)</p>`;
  try{const S=AI.cleanStudy(AI.parseStudy(await AI.ask(AIC,prompt)));await saveStudy(bid,no,C,S,again);renderStudy(bid,no,C)}
  catch(e){box.innerHTML=`<h2>생각할 질문과 확인 문제</h2><p class="note">만들지 못했어요: ${esc(e.message||e)}</p><div class="row"><button id="gen">다시 시도</button><a class="btn ghost" href="#set">AI 설정</a></div>`;document.getElementById("gen").addEventListener("click",()=>generate(bid,no,C,again))}
}
// 키 없이: 요청문을 복사해 평소 쓰는 AI 앱(Claude·ChatGPT·Gemini 등)에 붙여 넣고, 답을 붙여 넣는다
function manualBox(box,prompt,onAnswer){
  box.innerHTML=`<h2>질문·문제 만들기 (복사해서 쓰기)</h2>
  <ol class="steps"><li><button id="cp">요청문 복사</button> 를 누르고</li><li>평소 쓰는 AI 앱(Claude, ChatGPT, Gemini …)에 붙여 넣어 보내세요.</li><li>AI의 답을 통째로 복사해 아래 칸에 붙여 넣고 <b>넣기</b>를 누르세요.</li></ol>
  <textarea id="ans" placeholder="AI의 답을 여기에 붙여 넣기" style="min-height:140px"></textarea>
  <div class="row" style="margin-top:8px"><button id="put">넣기</button><span class="note" id="mn"></span></div>
  <details><summary class="note">요청문 보기</summary><pre class="peek">${esc(prompt)}</pre></details>`;
  box.querySelector("#cp").onclick=async()=>{try{await navigator.clipboard.writeText(prompt);box.querySelector("#mn").textContent="복사했어요. AI 앱에 붙여 넣으세요."}catch(e){box.querySelector("#mn").textContent="복사하지 못했어요. 아래 '요청문 보기'에서 직접 골라 복사하세요."}};
  box.querySelector("#put").onclick=async()=>{try{await onAnswer(box.querySelector("#ans").value)}catch(e){box.querySelector("#mn").textContent="답을 읽지 못했어요. AI의 답 전체(중괄호 { } 포함)를 붙여 넣었는지 확인해 주세요."}};
}
// 모든 장 한꺼번에
async function renderGenAll(bid){
  const B=books.find(x=>x.id===bid);if(!B){view.innerHTML=`<p class="empty">책을 찾을 수 없어요.</p>`;return}
  crumb.textContent=B.title;AIC=AI.loadAI();
  const toc=B.toc||[];const have=new Set((await db.collection("study").get()).docs.map(d=>d.id));
  const left=toc.filter(c=>!have.has(`${bid}-${c.no}`));
  view.innerHTML=`<h1>질문·문제 한꺼번에 만들기</h1><p class="sub">『${esc(B.title)}』 ${toc.length}장 가운데 ${toc.length-left.length}장은 이미 있어요. 남은 ${left.length}장을 만들어요.</p>
  <div class="cover"><p>지금 고른 AI: <b>${esc(AI.PROVIDERS[AIC.provider].name)}</b> <a href="#set">바꾸기</a></p><div id="ga"></div></div>`;
  const ga=view.querySelector("#ga");
  if(!left.length){ga.innerHTML=`<p class="note">모든 장에 질문과 문제가 있어요.</p><a class="btn ghost" href="#b-${esc(bid)}">목차로</a>`;return}
  if(AIC.provider==="manual"){
    // 몇 장씩 묶어 요청문을 만든다
    const groups=[];let g=[],len=0;
    for(const c of left){const C=await getChapter(bid,c.no);const n=(C.text||[]).join("").length;if(g.length&&(len+n>14000||g.length>=5)){groups.push(g);g=[];len=0}g.push({...C,no:c.no});len+=Math.min(n,9000)}
    if(g.length)groups.push(g);
    let gi=0;
    const step=()=>{if(gi>=groups.length){ga.innerHTML=`<p>다 만들었어요.</p><a class="btn" href="#b-${esc(bid)}">목차로</a>`;return}
      const G=groups[gi];ga.innerHTML=`<p class="note">묶음 ${gi+1} / ${groups.length} · ${G.map(c=>c.no+"장").join(", ")}</p><div id="mb"></div>`;
      manualBox(ga.querySelector("#mb"),AI.promptMany(B,G,AIC),async t=>{const all=AI.parseStudy(t);let ok=0;for(const c of G){const S=all[c.no]||all[String(c.no)];if(!S)continue;await saveStudy(bid,c.no,cache[`${bid}-${c.no}`]||await getChapter(bid,c.no),AI.cleanStudy(S));ok++}if(!ok)throw new Error("none");gi++;step()})};
    step();return;
  }
  let stop=false;ga.innerHTML=`<div class="bar"><i id="gb" style="width:0"></i></div><p class="note" id="gn"></p><div class="row"><button class="ghost" id="gs">멈추기</button></div><ul class="note" id="gl"></ul>`;
  ga.querySelector("#gs").onclick=()=>{stop=true};
  let done=0,fail=0;
  const lane=async()=>{while(!stop&&left.length){const c=left.shift();try{const C=await getChapter(bid,c.no);const S=AI.cleanStudy(AI.parseStudy(await AI.ask(AIC,AI.promptOne(B,{...C,no:c.no},AIC))));await saveStudy(bid,c.no,C,S);done++}catch(e){fail++;ga.querySelector("#gl").insertAdjacentHTML("beforeend",`<li>${c.no}장: ${esc(e.message||e)}</li>`);if(/key|401|403|인증|API/i.test(String(e.message)))stop=true}
    ga.querySelector("#gb").style.width=((done+fail)/(done+fail+left.length)*100)+"%";ga.querySelector("#gn").textContent=`${done}장 만듦${fail?` · ${fail}장 실패`:""} · 남은 ${left.length}장`}};
  await Promise.all([lane(),lane()]);
  ga.querySelector("#gn").textContent+=stop?" · 멈췄어요":" · 끝났어요";ga.insertAdjacentHTML("beforeend",`<a class="btn" href="#b-${esc(bid)}">목차로</a>`);
}

/* ───── 보기 설정: 글꼴·크기·줄 간격·배경·글씨색·여백·장 넘김 ───── */
const FONTS=[["고운바탕","\"Gowun Batang\",serif"],["나눔명조","\"Nanum Myeongjo\",serif"],["본명조","\"Noto Serif KR\",serif"],["본고딕","\"Noto Sans KR\",sans-serif"],["나눔고딕","\"Nanum Gothic\",sans-serif"],["고운돋움","\"Gowun Dodum\",sans-serif"]];
const THEMES=[["종이","#ffffff","#1d1a1b"],["미색","#f5eedf","#3a2f22"],["연두","#e9f2e3","#22301f"],["하늘","#e8f0f7","#1f2a36"],["회색","#e6e6e4","#222222"],["밤","#1b1c1f","#d8d4cc"],["검정","#000000","#b9b9b9"]];
const RS0={font:0,size:18,lh:1.95,bg:"#ffffff",ink:"#1d1a1b",py:56,px:56,turn:"flip"};
let RS={...RS0};
try{const v=JSON.parse(localStorage.getItem("lib.reader")||"null");if(v)RS={...RS0,...v}}catch(e){}
function applyRS(){const b=document.body.style;b.setProperty("--rfont",(FONTS[RS.font]||FONTS[0])[1]);b.setProperty("--rsize",RS.size+"px");b.setProperty("--rlh",RS.lh);b.setProperty("--rbg",RS.bg);b.setProperty("--rink",RS.ink);b.setProperty("--rpy",RS.py+"px");b.setProperty("--rpx",RS.px+"px")}
let rsTimer=null;
function saveRS(){applyRS();try{localStorage.setItem("lib.reader",JSON.stringify(RS))}catch(e){}clearTimeout(rsTimer);rsTimer=setTimeout(async()=>{if(db)try{await db.doc("settings/reader").set(RS)}catch(e){}},900)}
applyRS();
function openSheet(){
  const host=document.getElementById("sheetHost");
  if(host.innerHTML){host.innerHTML="";return}
  const rng=(id,lab,min,max,step,val,unit)=>`<div class="rng"><span>${lab}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${lab}"><output id="${id}o">${val}${unit}</output></div>`;
  host.innerHTML=`<div class="sheet" role="dialog" aria-label="보기 설정"><h3>보기 설정<button class="hdbtn" id="shClose">닫기</button></h3>
  <div class="lab">글꼴</div><div class="chips">${FONTS.map((f,i)=>`<button class="chip" data-f="${i}" aria-pressed="${RS.font===i}" style="font-family:${f[1].replace(/"/g,"'")}">${f[0]}</button>`).join("")}</div>
  <div class="lab">글자 크기 · 줄 간격</div>${rng("rSize","크기",13,30,1,RS.size,"px")}${rng("rLh","줄 간격",1.4,2.6,0.05,RS.lh,"")}
  <div class="lab">배경 · 글씨</div><div class="chips">${THEMES.map((t,i)=>`<button class="chip sw" data-t="${i}" title="${t[0]}" aria-label="${t[0]}" aria-pressed="${RS.bg===t[1]&&RS.ink===t[2]}" style="background:${t[1]};color:${t[2]}">가</button>`).join("")}</div>
  <div class="colors" style="margin-top:10px"><label>배경색 <input type="color" id="rBg" value="${RS.bg}"></label><label>글씨색 <input type="color" id="rInk" value="${RS.ink}"></label></div>
  <div class="lab">여백</div>${rng("rPy","위·아래",0,140,4,RS.py,"px")}${rng("rPx","왼쪽·오른쪽",0,160,4,RS.px,"px")}
  <div class="lab">장 넘김</div><div class="chips">${[["flip","책장 넘김"],["fade","부드럽게"],["none","없음"]].map(([v,l])=>`<button class="chip" data-turn="${v}" aria-pressed="${RS.turn===v}">${l}</button>`).join("")}</div>
  <div class="row" style="margin-top:18px"><button class="ghost" id="rReset">처음 설정으로</button></div>
  <p class="note">이 기기에 저장돼요. 다른 기기로는 설정의 백업으로 옮길 수 있어요.</p></div>`;
  const q=s=>host.querySelector(s),press=(sel,el)=>host.querySelectorAll(sel).forEach(b=>b.setAttribute("aria-pressed",b===el));
  q("#shClose").onclick=()=>{host.innerHTML=""};
  host.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{RS.font=+b.dataset.f;press("[data-f]",b);saveRS()});
  host.querySelectorAll("[data-t]").forEach(b=>b.onclick=()=>{const t=THEMES[+b.dataset.t];RS.bg=t[1];RS.ink=t[2];q("#rBg").value=t[1];q("#rInk").value=t[2];press("[data-t]",b);saveRS()});
  host.querySelectorAll("[data-turn]").forEach(b=>b.onclick=()=>{RS.turn=b.dataset.turn;press("[data-turn]",b);saveRS()});
  const bind=(id,key,unit,num=parseFloat)=>{const el=q("#"+id);el.oninput=()=>{RS[key]=num(el.value);q("#"+id+"o").textContent=el.value+unit;saveRS()}};
  bind("rSize","size","px");bind("rLh","lh","");bind("rPy","py","px");bind("rPx","px","px");
  q("#rBg").oninput=e=>{RS.bg=e.target.value;press("[data-t]",null);saveRS()};
  q("#rInk").oninput=e=>{RS.ink=e.target.value;press("[data-t]",null);saveRS()};
  q("#rReset").onclick=()=>{RS={...RS0};saveRS();host.innerHTML="";openSheet()};
}
document.getElementById("aaBtn").addEventListener("click",openSheet);

/* ───── 형광펜·메모 ───── */
const HC={yellow:["노랑","#ffd43b"],green:["초록","#8ce99a"],pink:["분홍","#faa2c1"],blue:["하늘","#74c0fc"]};
let HL=[];
const hlOf=(bid,no)=>HL.filter(h=>h.bid===bid&&h.no===no);
function paraHTML(t,bid,no,k){
  const spans=[];for(const h of hlOf(bid,no))for(const s of h.spans||[])if(s.para===k&&s.end>s.start)spans.push({...s,h});
  spans.sort((a,b)=>a.start-b.start);
  let out="",pos=0;
  for(const s of spans){const a=Math.max(s.start,pos),b=Math.min(s.end,t.length);if(b<=a)continue;
    out+=esc(t.slice(pos,a))+`<mark class="hl${s.h.memo?" memo":""}" data-id="${esc(s.h.id)}" style="--hc:${(HC[s.h.color]||HC.yellow)[1]}" title="${esc(s.h.memo||"")}">${esc(t.slice(a,b))}</mark>`;pos=b}
  return out+esc(t.slice(pos));
}
function repaint(){const box=document.getElementById("txt");if(!box)return;const bid=box.dataset.bid,no=+box.dataset.no,C=cache[`${bid}-${no}`];if(!C)return;
  box.querySelectorAll("p[data-k]").forEach(p=>{const k=+p.dataset.k,bm=p.querySelector(".bm");p.innerHTML=paraHTML(C.text[k]||"",bid,no,k);p.appendChild(bm)});hlInfo(bid,no)}
function hlInfo(bid,no){const el=document.getElementById("hlInfo");if(!el)return;const n=hlOf(bid,no).length;
  el.innerHTML=n?`이 장에 형광펜 ${n}곳 · <a href="#hl-${esc(bid)}">모아 보기</a>`:`읽다가 마음에 닿는 곳을 손가락이나 마우스로 끌어 고르면 형광펜을 칠하고 메모를 달 수 있어요.`}
// 고른 글자의 자리(문단 안 몇 번째 글자)
function offIn(p,node,off){const r=document.createRange();r.setStart(p,0);try{r.setEnd(node,off)}catch(e){return null}const f=r.cloneContents();f.querySelectorAll(".bm").forEach(x=>x.remove());return f.textContent.length}
const paraOf=n=>{while(n&&!(n.nodeType===1&&n.matches&&n.matches(".txt p[data-k]")))n=n.parentNode;return n};
let pending=null,barFor=null,touchBar=0;
function readSel(){
  const sel=getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount)return null;
  const r=sel.getRangeAt(0),pa=paraOf(r.startContainer),pb=paraOf(r.endContainer),box=document.getElementById("txt");
  if(!pa||!pb||!box||!box.contains(pa))return null;
  const a=+pa.dataset.k,b=+pb.dataset.k,bid=box.dataset.bid,no=+box.dataset.no,C=cache[`${bid}-${no}`];if(!C)return null;
  const spans=[];
  for(let k=a;k<=b;k++){const t=C.text[k]||"";const s=k===a?offIn(pa,r.startContainer,r.startOffset):0;const e=k===b?offIn(pb,r.endContainer,r.endOffset):t.length;
    if(s==null||e==null)return null;let s2=s,e2=Math.min(e,t.length);while(s2<e2&&/\s/.test(t[s2]))s2++;while(e2>s2&&/\s/.test(t[e2-1]))e2--;if(e2>s2)spans.push({para:k,start:s2,end:e2})}
  if(!spans.length)return null;
  return {bid,no,spans,text:spans.map(s=>C.text[s.para].slice(s.start,s.end)).join(" … ")};
}
document.addEventListener("selectionchange",()=>{clearTimeout(readSel.t);readSel.t=setTimeout(()=>{const p=readSel();if(p){pending=p;showBar(null)}else if(barFor===null&&Date.now()-touchBar>700&&!document.querySelector(".memobox"))closeBar()},180)});
function closeBar(){document.getElementById("hlHost").innerHTML="";barFor=null;pending=null}
function showBar(id){
  barFor=id;const h=id?HL.find(x=>x.id===id):null,cur=h?h.color:null;
  const host=document.getElementById("hlHost");
  host.innerHTML=`<div class="hlbar" role="toolbar" aria-label="형광펜">${Object.entries(HC).map(([k,v])=>`<button class="dot" data-c="${k}" style="--hc:${v[1]}" aria-label="${v[0]} 형광펜" aria-pressed="${cur===k}"></button>`).join("")}
  <button class="act" data-a="memo">${h&&h.memo?"메모 보기":"메모"}</button>${h?`<button class="act" data-a="del">지우기</button>`:""}<button class="act" data-a="x" aria-label="닫기">✕</button></div>`;
  const bar=host.querySelector(".hlbar");
  bar.addEventListener("pointerdown",e=>{touchBar=Date.now();if(e.target.closest("button"))e.preventDefault()});
  bar.querySelectorAll("[data-c]").forEach(b=>b.onclick=async()=>{if(barFor){await updHL(barFor,{color:b.dataset.c});showBar(barFor)}else{const nid=await addHL(b.dataset.c);if(nid){getSelection().removeAllRanges();showBar(nid)}}});
  bar.querySelector('[data-a="memo"]').onclick=async()=>{let hid=barFor;if(!hid){hid=await addHL("yellow");if(!hid)return;getSelection().removeAllRanges();showBar(hid)}memoBox(hid)};
  const d=bar.querySelector('[data-a="del"]');if(d)d.onclick=async()=>{await delHL(barFor);closeBar()};
  bar.querySelector('[data-a="x"]').onclick=()=>{getSelection().removeAllRanges();closeBar()};
}
function memoBox(id){
  const h=HL.find(x=>x.id===id);if(!h)return;
  document.querySelector(".memobox")?.remove();
  const el=document.createElement("div");el.className="memobox";el.style.setProperty("--hc",(HC[h.color]||HC.yellow)[1]);
  el.innerHTML=`<blockquote>${esc(h.text)}</blockquote><label class="note" for="memoTa">메모 (설교·나눔에 쓸 생각, 질문 등)</label><textarea id="memoTa">${esc(h.memo||"")}</textarea><div class="row" style="margin-top:8px"><button id="memoSave">저장</button><button class="ghost" id="memoCancel">닫기</button></div>`;
  document.getElementById("hlHost").appendChild(el);
  const ta=el.querySelector("textarea");ta.focus();
  el.querySelector("#memoSave").onclick=async()=>{await updHL(id,{memo:ta.value.trim()});el.remove();statusEl.textContent="메모를 저장했어요.";closeBar()};
  el.querySelector("#memoCancel").onclick=()=>{el.remove()};
}
document.addEventListener("pointerdown",e=>{if(barFor&&!e.target.closest(".hlbar,.memobox,mark.hl"))setTimeout(()=>{if(getSelection().isCollapsed)closeBar()},50)});
document.getElementById("view").addEventListener("click",e=>{const m=e.target.closest("mark.hl");if(m&&getSelection().isCollapsed){e.preventDefault();showBar(m.dataset.id)}});
const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
async function addHL(color){
  if(!pending)return null;
  const B=books.find(x=>x.id===pending.bid)||{},t=(B.toc||[]).find(c=>c.no===pending.no)||{};
  const h={id:rid(),bid:pending.bid,no:pending.no,chTitle:t.title||"",spans:pending.spans,text:pending.text,color,memo:"",at:new Date().toISOString()};
  HL.push(h);repaint();pending=null;
  try{const {id,...d}=h;await db.collection("highlights").doc(id).set(d)}catch(e){statusEl.textContent="형광펜을 저장하지 못했어요."}
  return h.id;
}
async function updHL(id,patch){const h=HL.find(x=>x.id===id);if(!h)return;Object.assign(h,patch,{edited:new Date().toISOString()});repaint();if(location.hash.startsWith("#hl"))route();
  try{await db.collection("highlights").doc(id).update({...patch,edited:h.edited})}catch(e){statusEl.textContent="저장하지 못했어요."}}
async function delHL(id){HL=HL.filter(x=>x.id!==id);repaint();if(location.hash.startsWith("#hl"))route();try{await db.collection("highlights").doc(id).delete()}catch(e){statusEl.textContent="지우지 못했어요."}}

/* 모아 보기 */
let hlF={color:"",memo:false,q:""};
function renderHL(bidF){
  crumb.textContent="형광펜·메모";
  const B0=books.find(b=>b.id===bidF);
  let list=HL.filter(h=>(!bidF||h.bid===bidF)&&(!hlF.color||h.color===hlF.color)&&(!hlF.memo||h.memo)&&(!hlF.q||(h.text+" "+(h.memo||"")).includes(hlF.q)));
  const ord=(h)=>{const bi=books.findIndex(b=>b.id===h.bid);return [bi,h.no,(h.spans[0]||{}).para||0,(h.spans[0]||{}).start||0]};
  list.sort((a,b)=>{const x=ord(a),y=ord(b);for(let i=0;i<4;i++)if(x[i]!==y[i])return x[i]-y[i];return 0});
  let html=`<h1>형광펜·메모</h1><p class="sub">책을 읽으며 칠한 곳과 메모를 장 순서대로 모았어요. 글쓰기나 나눔을 준비할 때 꺼내 쓰세요.</p>
  <div class="hlfilter"><input type="search" id="hlQ" placeholder="낱말로 찾기" value="${esc(hlF.q)}" aria-label="형광펜과 메모에서 찾기">
  ${books.length>1?`<select id="hlB" class="chip"><option value="">모든 책</option>${books.map(b=>`<option value="${esc(b.id)}" ${b.id===bidF?"selected":""}>${esc(b.title)}</option>`).join("")}</select>`:""}
  ${Object.entries(HC).map(([k,v])=>`<button class="cdot" data-c="${k}" style="--hc:${v[1]}" aria-label="${v[0]}만 보기" aria-pressed="${hlF.color===k}"></button>`).join("")}
  <button class="chip" id="hlM" aria-pressed="${hlF.memo}">메모 있는 것만</button><button class="ghost" id="hlCopy">모두 복사</button></div>
  <p class="note">${list.length}곳${HL.length!==list.length?` (전체 ${HL.length}곳)`:""}</p>`;
  if(!HL.length)html+=`<p class="empty">아직 칠한 곳이 없어요. 책을 읽다가 글자를 끌어 고르면 형광펜 단추가 나타나요.</p>`;
  let key=null;
  for(const h of list){const B=books.find(b=>b.id===h.bid)||{},k=h.bid+"-"+h.no;
    if(k!==key){key=k;html+=`<div class="hlch"><a href="#r-${esc(h.bid)}-${h.no}">${books.length>1||!bidF?esc(B.title||"")+" · ":""}${h.no?pad(h.no)+"장 ":""}${esc(h.chTitle||"")}</a></div>`}
    html+=`<div class="hlitem" style="--hc:${(HC[h.color]||HC.yellow)[1]}" data-id="${esc(h.id)}"><q>${esc(h.text)}</q>${h.memo?`<div class="m">${esc(h.memo)}</div>`:""}
    <div class="ops"><a class="btn ghost" href="#r-${esc(h.bid)}-${h.no}@${(h.spans[0]||{}).para||0}">본문에서 보기</a><button class="ghost" data-op="memo">${h.memo?"메모 고치기":"메모 달기"}</button><button class="ghost" data-op="del">지우기</button><span class="note">${esc((h.at||"").slice(0,10))}</span></div></div>`}
  view.innerHTML=html;
  const q=document.getElementById("hlQ");q.oninput=()=>{hlF.q=q.value.trim();clearTimeout(q.t);q.t=setTimeout(()=>{renderHL(bidF);const n=document.getElementById("hlQ");n.focus();n.setSelectionRange(n.value.length,n.value.length)},250)};
  const sb=document.getElementById("hlB");if(sb)sb.onchange=()=>{location.hash=sb.value?"#hl-"+sb.value:"#hl"};
  view.querySelectorAll(".cdot").forEach(b=>b.onclick=()=>{hlF.color=hlF.color===b.dataset.c?"":b.dataset.c;renderHL(bidF)});
  document.getElementById("hlM").onclick=()=>{hlF.memo=!hlF.memo;renderHL(bidF)};
  view.querySelectorAll(".hlitem").forEach(el=>{const id=el.dataset.id;el.querySelector('[data-op="memo"]').onclick=()=>memoBox(id);el.querySelector('[data-op="del"]').onclick=async()=>{if(confirm("이 형광펜과 메모를 지울까요?"))await delHL(id)}});
  document.getElementById("hlCopy").onclick=async()=>{let t="",k0=null;for(const h of list){const B=books.find(b=>b.id===h.bid)||{},k=h.bid+"-"+h.no;if(k!==k0){k0=k;t+=`\n『${B.title||""}』 ${h.no?h.no+"장 ":""}${h.chTitle||""}\n`}t+=`· "${h.text}"\n${h.memo?"  → "+h.memo.replace(/\n/g,"\n    ")+"\n":""}`}
    try{await navigator.clipboard.writeText(t.trim());statusEl.textContent="복사했어요. 설교 원고나 메모장에 붙여 넣으세요."}catch(e){statusEl.textContent="복사하지 못했어요."}};
}

/* 읽는 자리 표시줄 · 키보드로 장 넘기기 */
addEventListener("scroll",()=>{const pr=document.getElementById("prog");if(!document.body.classList.contains("reading")){pr.style.width=0;return}const h=document.documentElement;pr.style.width=Math.min(100,h.scrollTop/Math.max(1,h.scrollHeight-h.clientHeight)*100)+"%"},{passive:true});
addEventListener("keydown",e=>{if(!document.body.classList.contains("reading")||e.target.closest("textarea,input,select")||e.altKey||e.ctrlKey||e.metaKey)return;
  const a=document.getElementById(e.key==="ArrowRight"?"nextA":e.key==="ArrowLeft"?"prevA":"_");if(a)location.hash=a.getAttribute("href")});

/* ───── 설정: AI · 중요한 낱말 · 백업 · 설치 ───── */
let installEv=null;addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEv=e});
async function renderSettings(){
  crumb.textContent="설정";AIC=AI.loadAI();const X=setx();
  const P=AI.PROVIDERS;
  let est="";try{const e=await navigator.storage.estimate();est=`이 기기에 쓰고 있는 공간: 약 ${Math.round((e.usage||0)/1048576)}MB`}catch(e){}
  view.innerHTML=`<h1>설정</h1>
  <div class="cover"><h2 style="margin-top:0">질문·문제를 만들 AI</h2>
    <div class="chips">${Object.entries(P).map(([k,v])=>`<button class="chip" data-p="${k}" aria-pressed="${AIC.provider===k}">${esc(v.name)}</button>`).join("")}</div>
    <div id="pv" style="margin-top:12px"></div>
    <label class="lab" for="rd">읽는 사람 소개 (AI가 질문을 맞춰 만들어요)</label><textarea id="rd" placeholder="예: 30~40대 부부 소그룹을 맡은 목회자">${esc(AIC.reader)}</textarea>
    <label class="lab" for="fc">질문에서 특별히 고려할 점 (선택)</label><textarea id="fc" placeholder="예: 설교 준비에 쓸 질문을 하나 넣어 주세요">${esc(AIC.focus)}</textarea>
    <p class="note" id="aiN"></p></div>
  <div class="cover"><h2 style="margin-top:0">중요한 낱말 지키기</h2>
    <p class="note">하나님·예수·그리스도·성령·성경과 성경 66권 이름, 주요 신학 낱말은 글자 인식이 틀려도 바로잡아요(예: 하나넘→하나님). 책에 자주 나오는 이름이나 낱말을 더하세요. 띄어쓰기나 쉼표로 나눠요.</p>
    <textarea id="xw" placeholder="예: 칼뱅 웨슬리 하이델베르크">${esc(X.extraWords||"")}</textarea></div>
  <div class="cover"><h2 style="margin-top:0">백업 · 다른 기기로 옮기기</h2>
    <p class="note">모든 것은 이 기기의 브라우저 안에만 있어요. 휴대폰과 컴퓨터를 오가려면 백업 파일을 내보내 다른 기기에서 불러오세요. AI 키는 백업에 들어가지 않아요.</p>
    <div class="row"><button id="ex">책과 기록 모두 내보내기</button><button class="ghost" id="exs">기록만 내보내기 (책 본문 빼고)</button><label class="btn ghost" for="im">불러오기</label><input type="file" id="im" accept="application/json" hidden></div>
    <p class="note" id="bkN">${esc(est)}</p></div>
  <div class="cover"><h2 style="margin-top:0">앱처럼 설치하기</h2>
    <p class="note">컴퓨터(크롬·엣지): 주소창 오른쪽의 설치 단추나 아래 단추를 누르면 바탕화면과 시작 메뉴에 생겨 따로 창으로 열려요. 아이폰: 사파리 공유 단추 → '홈 화면에 추가'. 안드로이드: 크롬 메뉴 → '앱 설치'.</p>
    <div class="row"><button id="inst">이 기기에 설치</button></div></div>`;
  const pv=view.querySelector("#pv");
  const drawP=()=>{const k=AIC.provider,v=P[k];
    pv.innerHTML=k==="manual"?`<p class="note">키가 없어도 돼요. 장마다 '요청문 복사'를 눌러 평소 쓰는 AI 앱에 붙여 넣고, 답을 다시 붙여 넣으면 돼요. 한꺼번에 만들 때는 몇 장씩 묶어 요청문을 만들어요.</p>`
    :`<div class="grid2"><label>API 키 <input type="password" id="key" value="${esc((AIC.keys||{})[k]||"")}" autocomplete="off" placeholder="키를 붙여 넣기"></label><label>모델 <input id="mdl" value="${esc((AIC.models||{})[k]||v.model)}"></label></div>
      <p class="note">키는 <a href="${v.keyUrl}" target="_blank" rel="noopener">여기</a>에서 만들 수 있어요(사용한 만큼 그 회사에 요금이 나가요). 키는 이 기기에만 저장되고, 질문을 만들 때 이 기기에서 그 회사로만 보내져요. 모델 이름이 바뀌었으면 그 회사 안내의 새 이름을 넣으세요.</p>
      <div class="row"><button class="ghost" id="tst">연결 시험</button></div>`;
    const key=pv.querySelector("#key"),mdl=pv.querySelector("#mdl");
    if(key)key.onchange=()=>{AIC.keys={...AIC.keys,[k]:key.value.trim()};AI.saveAI(AIC);note("저장했어요.")};
    if(mdl)mdl.onchange=()=>{AIC.models={...AIC.models,[k]:mdl.value.trim()};AI.saveAI(AIC);note("저장했어요.")};
    const t=pv.querySelector("#tst");if(t)t.onclick=async()=>{note("시험하는 중…");try{const r=await AI.ask(AIC,'{"ok":true} 라는 JSON만 그대로 답하세요.');note(/ok/.test(r)?"잘 연결됐어요.":"답은 왔지만 모양이 달라요: "+r.slice(0,80))}catch(e){note("연결하지 못했어요: "+(e.message||e))}};
  };
  const note=t=>{view.querySelector("#aiN").textContent=t};
  view.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>{AIC.provider=b.dataset.p;AI.saveAI(AIC);view.querySelectorAll("[data-p]").forEach(x=>x.setAttribute("aria-pressed",x===b));drawP()});
  drawP();
  view.querySelector("#rd").onchange=e=>{AIC.reader=e.target.value;AI.saveAI(AIC);note("저장했어요.")};
  view.querySelector("#fc").onchange=e=>{AIC.focus=e.target.value;AI.saveAI(AIC);note("저장했어요.")};
  view.querySelector("#xw").onchange=e=>{try{localStorage.setItem("lib.set",JSON.stringify({...setx(),extraWords:e.target.value}))}catch(x){}};
  const bk=t=>{view.querySelector("#bkN").textContent=t};
  const exp=async(withBooks)=>{const all=(await dumpAll()).filter(([k])=>!k.startsWith("importfiles/")&&!k.startsWith("imports/")&&(withBooks||!(k.startsWith("chapters/"))));
    const blob=new Blob([JSON.stringify({app:"my-library",v:1,at:new Date().toISOString(),withBooks,data:all})],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`내서재-백업-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);bk("백업 파일을 내려받았어요.")};
  view.querySelector("#ex").onclick=()=>exp(true);view.querySelector("#exs").onclick=()=>exp(false);
  view.querySelector("#im").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const j=JSON.parse(await f.text());if(j.app!=="my-library"||!Array.isArray(j.data))throw 0;
    const ok=j.data.filter(([k])=>typeof k==="string"&&/^(books|chapters|study|notes|progress|highlights|settings)\//.test(k));
    if(!confirm(`백업의 ${ok.length}개 항목을 이 기기에 합칠까요? 같은 항목은 백업 쪽으로 바뀌어요.`))return;await loadAll(ok);bk("불러왔어요.");}catch(x){bk("이 파일은 내 서재 백업 파일이 아니에요.")}};
  view.querySelector("#inst").onclick=async()=>{if(installEv){installEv.prompt();installEv=null}else alert("이 브라우저에서는 주소창이나 메뉴의 '설치'·'홈 화면에 추가'를 써 주세요. 이미 설치했으면 설치된 앱에서 열려요.")};
}
/* 책 정보 고치기 · 지우기 · 장 나누기 다시 */
async function renderEdit(bid){
  const B=books.find(x=>x.id===bid);if(!B){view.innerHTML=`<p class="empty">책을 찾을 수 없어요.</p>`;return}
  crumb.textContent=B.title;const job=await getRaw("imports/"+bid);
  view.innerHTML=`<h1>책 정보</h1><div class="cover"><div class="grid2">
    <label>제목<input id="t" value="${esc(B.title)}"></label><label>지은이<input id="a" value="${esc(B.author||"")}"></label>
    <label>펴낸 곳<input id="p" value="${esc(B.publisher||"")}"></label><label>펴낸 해<input id="y" value="${esc(B.year||"")}"></label>
    <label>표지 사진 바꾸기<input type="file" id="cv" accept="image/*"></label><label>소개 한 줄<input id="n" value="${esc(B.note||"")}"></label></div>
    <div class="row" style="margin-top:12px"><button id="sv">저장</button><a class="btn ghost" href="#b-${esc(bid)}">목차로</a></div></div>
  <div class="cover"><h2 style="margin-top:0">장 제목 고치기</h2>${(B.toc||[]).map((c,i)=>`<div class="grid2" style="margin:4px 0"><label>${c.no}장<input data-i="${i}" data-k="title" value="${esc(c.title)}"></label><label>부제<input data-i="${i}" data-k="subtitle" value="${esc(c.subtitle||"")}"></label></div>`).join("")}</div>
  <div class="cover"><h2 style="margin-top:0">장 나누기 다시</h2><p class="note">${job?"읽어 둔 쪽 자료로 장 시작 쪽을 다시 고를 수 있어요. 이미 칠한 형광펜은 자리가 어긋날 수 있어요.":"이 책은 쪽 자료가 없어 다시 나눌 수 없어요."}</p>${job?`<button class="ghost" id="rs">장 나누기 화면 열기</button>`:""}</div>
  <div class="cover"><h2 style="margin-top:0">책 지우기</h2><p class="note">이 책의 본문과 읽은 표시·책갈피·답·형광펜·메모가 모두 지워져요.</p><button class="ghost" id="del">이 책 지우기</button></div>`;
  view.querySelector("#sv").onclick=async()=>{const m={...B,title:view.querySelector("#t").value.trim()||B.title,author:view.querySelector("#a").value.trim(),publisher:view.querySelector("#p").value.trim(),year:view.querySelector("#y").value.trim(),note:view.querySelector("#n").value.trim()};
    view.querySelectorAll("[data-i]").forEach(el=>{m.toc[+el.dataset.i][el.dataset.k]=el.value.trim()});
    const f=view.querySelector("#cv").files[0];if(f){const bm=await createImageBitmap(f),k=Math.min(1,480/bm.width),c=document.createElement("canvas");c.width=Math.round(bm.width*k);c.height=Math.round(bm.height*k);c.getContext("2d").drawImage(bm,0,0,c.width,c.height);m.cover=c.toDataURL("image/jpeg",.85)}
    for(const c of m.toc){const raw=await getRaw(`chapters/${bid}-${c.no}`);if(raw&&(raw.title!==c.title||raw.subtitle!==c.subtitle)){await putRaw(`chapters/${bid}-${c.no}`,{...raw,title:c.title,subtitle:c.subtitle});delete cache[`${bid}-${c.no}`]}}
    await putRaw("books/"+bid,m);statusEl.textContent="저장했어요.";location.hash="#b-"+bid};
  const rs=view.querySelector("#rs");if(rs)rs.onclick=async()=>{job.done=false;await putRaw("imports/"+bid,job);location.hash="#imp-"+bid};
  view.querySelector("#del").onclick=async()=>{if(!confirm(`『${B.title}』과 그 기록을 모두 지울까요? 되돌릴 수 없어요.`))return;
    for(const p of [`chapters/${bid}-`,`study/${bid}-`,`notes/${bid}-`])await delPrefix(p);
    for(const h of HL.filter(h=>h.bid===bid))await delRaw("highlights/"+h.id);
    await delRaw("progress/"+bid);await delRaw("imports/"+bid);await delRaw("importfiles/"+bid);await delRaw("books/"+bid);location.hash="#lib"};
}

window.addEventListener("hashchange",()=>{if(skipRoute){skipRoute=false;return}route()});
(async()=>{
  persist();
  try{const r=await db.doc("settings/reader").get();if(r.exists){RS={...RS0,...r.data()};applyRS()}}catch(e){}
  let first=true;
  db.collection("books").onSnapshot(s=>{books=s.docs.map(d=>d.data()).filter(B=>B&&B.id).sort((x,y)=>(x.order||0)-(y.order||0));if(first){first=false;ready=true;statusEl.textContent="";route()}else if(!/^#(r-|imp-|add|set|edit-|gen-)/.test(location.hash))route()});
  db.collection("highlights").onSnapshot(s=>{HL=s.docs.map(d=>({id:d.id,...d.data()}));if(!ready)return;if(location.hash.startsWith("#hl"))route();else if(getSelection().isCollapsed)repaint()});
  db.collection("progress").onSnapshot(s=>{const n={};for(const d of s.docs)n[d.id]=d.data();progress=n;if(ready&&!/^#(r-|imp-|add|set|edit-|gen-)/.test(location.hash))route()});
  if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
