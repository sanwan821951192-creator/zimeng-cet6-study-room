'use strict';
const DATA=window.STUDY_DATA;
const days=DATA.curriculum.days, resources=DATA.resources.resources, content=DATA.content;
const STORE='zimeng-study-room-v2';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageFields=['records','notes','answers','drafts','hardWords','knownWords','settings','exerciseWords','lessonResults','reviewQueue','personalWords','highlights','listeningDrafts'];
function cleanMap(value){return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter(([key])=>!['__proto__','constructor','prototype'].includes(key))):{}}
function readStore(){try{const x=JSON.parse(localStorage.getItem(STORE)||'{}');return Object.fromEntries(storageFields.map(field=>[field,cleanMap(x?.[field])]))}catch{return Object.fromEntries(storageFields.map(field=>[field,{}]))}}
let saved=readStore();
const pendingListeningDrafts=new Set();
saved.exerciseWords=saved.exerciseWords||{};saved.lessonResults=saved.lessonResults||{};
const lessonBank={...content.inlineLessons,...DATA.lessons};
window.StudyLoader?.bind(lessonBank);
const clipBank=DATA.clips||{};
const openPanels={};let activeLesson=null,mockReview=false,renderedViewKey=null;
let practiceMode='exercise';
let pinnedQuestion=null,questionWindowCollapsed=false;
const dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
const today=`${dateParts.year}-${dateParts.month}-${dateParts.day}`;
let selected=days.find(d=>d.date===today)?.date||days[0].date;
if(today>days.at(-1).date)selected=days.at(-1).date;
let view='today',room=false,stepIndex=0,wordIndex=0,showMeaning=false,qIndex=0,paraIndex=0;
let materialLoadTicket=0,materialWaitKey='',materialLoadError='';
let revealAnswer=false,revealPrompt=false,difficulty='正好',writingIndex=0,showReference=false;
let timerLeft=0,timerEnd=null,timerRunning=false;
let audioId=null,pointA=null,pointB=null,loopOn=false;
const audio=$('#global-audio');
const audioDock=$('#audio-dock');
if(window.ResizeObserver){const dockSizeObserver=new window.ResizeObserver(()=>{if(!audioDock.hidden){const height=audioDock.getBoundingClientRect().height;if(height>0)document.documentElement.style.setProperty('--audio-height',Math.ceil(height)+'px')}});dockSizeObserver.observe(audioDock)}
const day=()=>days.find(d=>d.date===selected)||days[0];
const isFullMock=(d=day())=>['mock','mockPractice'].includes(d.mode);
const resource=id=>resources.find(r=>r.id===id);
function persist(){try{localStorage.setItem(STORE,JSON.stringify(saved));pendingListeningDrafts.clear();updateListeningScratchStatus();return true}catch{toast('浏览器暂时无法保存，请导出记录保留本次学习。');return false}}
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>t.hidden=true,3800)}
const done=d=>saved.records[d.date]?.status==='完成';
const pretty=d=>`${+d.slice(5,7)}月${+d.slice(8,10)}日`;
const dateFull=d=>`${d.date.slice(0,4)}年${pretty(d.date)} 星期${d.weekday}`;
function steps(d=day()){
  if(d.mode==='exam')return [{id:'exam',label:'考试日',minutes:20,task:'上午轻复习，按准考证要求准备，15:00—17:25参加考试。'}];
  if(isFullMock(d))return [{id:'warmup',label:'模考准备',minutes:(d.warmupMinutes||5)+(d.vocabMinutes||0),task:d.coachPrompt},{id:'mock-writing',label:'作文',minutes:30,task:'先完成原卷作文，30分钟。此时不播放录音、不翻看答案。'},{id:'listening',label:'听力',minutes:30,task:d.listening.task},{id:'collect',label:'收卷与切换',minutes:5,task:'录音结束立即停止听力作答，模拟收回答题卡1。后面的阅读与翻译填写答题卡2。'},{id:'reading',label:'阅读',minutes:40,task:d.reading.task},{id:'mock-translation',label:'翻译',minutes:30,task:'完成原卷翻译，30分钟。先译完信息点，再检查语法与遗漏。'},{id:'reflection',label:'记录与回顾',minutes:5,task:d.reflection}];
  const result=[{id:'warmup',label:'今天的开场',minutes:d.warmupMinutes||5,task:d.warmup},{id:'vocabulary',label:'词卡与复习',minutes:d.vocabMinutes||10,task:d.vocabTask}];
  if(d.listening)result.push({id:'listening',label:'听力练习',minutes:d.listening.minutes,task:d.listening.task});
  if(d.reading){for(const [i,item] of [...(d.reading.items||[])].sort((a,b)=>({matching:0,careful:1,cloze:2})[a.type]-({matching:0,careful:1,cloze:2})[b.type]).entries())result.push({id:'reading-'+i,label:({cloze:'选词填空',matching:'长篇匹配',careful:'仔细阅读'})[item.type],minutes:item.minutes,task:(item.knownReview?'回练：':'首做：')+d.reading.task,lessonId:item.lessonId,kind:'reading'});if(!d.reading.items)result.push({id:'reading',label:'阅读',minutes:d.reading.minutes,task:d.reading.task});}
  if(d.writing)result.push({id:'writing',label:'写译练习',minutes:d.writing.minutes,task:d.writing.task});
  result.push({id:'reflection',label:'记录今天的收获',minutes:d.reflectionMinutes||5,task:d.reflection});return result;
}
function chooser(){return `<div class="day-chooser"><button class="day-arrow" data-action="prev-day" aria-label="前一天" ${selected===days[0].date?'disabled':''}>‹</button><input type="date" id="date-select" aria-label="选择学习日期" min="${days[0].date}" max="${days.at(-1).date}" value="${selected}"><button class="day-arrow" data-action="next-day" aria-label="后一天" ${selected===days.at(-1).date?'disabled':''}>›</button></div>`}
function captureLearningFocus(node=document.activeElement,root=$('#app')){
  if(!node||!root?.contains?.(node)||!node.tagName)return null;
  const tag=node.tagName.toLowerCase(),panel=tag==='summary'?node.closest('details[data-panel]')?.dataset.panel:null;
  const attrs=Array.from(node.attributes||[]).filter(a=>a.name==='id'||/^data-(action|view|key|letter|step|id|index|word-action|word|answer-key|mark-action|mark-mode|annotation-key|highlight-ids)$/.test(a.name)).map(a=>[a.name,a.value]);
  const peers=Array.from(root.querySelectorAll(tag)).filter(el=>panel?el.closest('details[data-panel]')?.dataset.panel===panel:attrs.every(([name,value])=>el.getAttribute(name)===value));
  return {tag,attrs,panel,index:Math.max(0,peers.indexOf(node)),start:node.selectionStart,end:node.selectionEnd};
}
function restoreLearningFocus(snapshot,root=$('#app')){
  if(!snapshot||!root)return false;
  const peers=Array.from(root.querySelectorAll(snapshot.tag)).filter(el=>snapshot.panel?el.closest('details[data-panel]')?.dataset.panel===snapshot.panel:snapshot.attrs.every(([name,value])=>el.getAttribute(name)===value));
  let target=peers[snapshot.index];
  if(target?.disabled)target=root.querySelector('.word-en,h1,h2,h3');
  if(!target?.focus)return false;
  if(!target.matches('button,a[href],input,textarea,select,summary,[tabindex]'))target.setAttribute('tabindex','-1');
  target.focus({preventScroll:true});
  if(Number.isInteger(snapshot.start)&&target.setSelectionRange)try{target.setSelectionRange(snapshot.start,snapshot.end)}catch{}
  return true;
}
function materialsReadyForRender(){
  const loader=window.StudyLoader;
  const ids=room?[...new Set([...(loader?.lessonsForDay(selected)||[]),...(activeLesson&&lessonBank[activeLesson]?[activeLesson]:[])])]:[];
  if(!loader||loader.isReady(ids)){if(materialWaitKey){materialWaitKey='';materialLoadError='';materialLoadTicket++;}return true;}
  const key=selected+'|'+view+'|'+room+'|'+ids.join(',');
  if(materialWaitKey!==key){
    materialWaitKey=key;materialLoadError='';const id=++materialLoadTicket;
    loader.ensureLessons(ids).then(()=>{if(id===materialLoadTicket){materialWaitKey='';materialLoadError='';render();}}).catch(error=>{if(id===materialLoadTicket){materialLoadError=error.message;render();}});
  }
  $('#app').innerHTML=`<section class="empty-note"><h1 class="view-title">${pretty(selected)}的学习材料</h1><p role="${materialLoadError?'alert':'status'}">${esc(materialLoadError||'正在准备当天的题目和词义…')}</p>${materialLoadError?'<button class="primary-button" data-action="material-retry">重试加载</button>':''}<button class="text-button" data-action="material-return">返回今日学习</button></section>`;
  return false;
}
function render(){
  const focusBefore=captureLearningFocus();
  const viewKey=selected+'-'+view+'-'+room+'-'+(room?stepIndex:'');
  const pageChanged=renderedViewKey!==null&&renderedViewKey!==viewKey;
  const listeningExercise=room&&steps()[stepIndex]?.id==='listening'&&practiceMode==='exercise'&&(!isFullMock()||mockReview);
  document.body.classList.toggle('listening-exercise',listeningExercise);
  document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);if(active)b.setAttribute?.('aria-current','page');else b.removeAttribute?.('aria-current')});
  $('#top-label').textContent=dateFull(day());
  if(!materialsReadyForRender())return;
  $('#app').innerHTML=(room?renderRoom():view==='today'?renderToday():view==='plan'?renderPlan():view==='progress'?renderProgress():view==='words'?((window.WordNotebook?.render()||'')+knownWordsPanel()):renderLibrary())+renderQuestionWindow();
  updateTimerDisplay();
  window.StudyMarks?.onRender();
  window.WordNotebook?.onRender();
  if(!restoreLearningFocus(focusBefore)&&pageChanged){const title=$('#app').querySelector?.('h1,h2,h3');if(title?.focus){title.setAttribute('tabindex','-1');title.focus({preventScroll:true})}}
  renderedViewKey=viewKey;
}
function studyMaterialLabel(s){
  const d=day();
  if(s.id==='warmup')return '';
  if(s.id==='vocabulary')return `${cardsForDay().length}个词`;
  if(s.id==='listening')return listeningIds().map(id=>lessonBank[id]?.title).filter(Boolean).join(' / ')||resource(d.listening?.paper)?.label||'';
  if(s.kind==='reading')return lessonBank[s.lessonId]?.title||resource(d.reading?.paper)?.label||'';
  if(s.id==='reading')return resource(d.reading?.paper)?.label||'';
  if(s.id==='writing')return (d.writing?.ids||[]).map(id=>(content.writing[id]||content.translation[id])?.title).filter(Boolean).join(' / ');
  if(s.id==='mock-writing'||s.id==='mock-translation')return resource(d.writing?.paper)?.label||'';
  return '';
}
function renderToday(){
  const d=day(),ss=steps(d),facts=[`${ss.length}个环节`];
  if(d.mode!=='exam'){if(cardsForDay().length)facts.push(`${cardsForDay().length}个词`);if(d.reading?.questionCount)facts.push(`${d.reading.questionCount}道阅读题`)}
  return `${chooser()}<section class="hero"><div class="today-heading"><p class="today-day">第${d.day}天</p><h1>${d.mode==='exam'?'六级考试':'今日学习'}</h1><p class="today-facts">${facts.map(x=>`<span>${esc(x)}</span>`).join('')}</p><div class="hero-actions"><button class="primary-button" data-action="start">开始学习 <span aria-hidden="true">↗</span></button>${done(d)?'<span class="status-chip">已完成</span>':''}</div></div><div class="quote-sheet"><p class="sheet-label">今天想对你说</p><blockquote>${esc(d.interestSnippet?.english||'One small step at a time.')}</blockquote><p>${esc(d.interestSnippet?.chinese||'一步一步来。')}</p></div></section><div class="section-heading"><h2>今天的学习</h2><span>${ss.length}个环节</span></div><div class="agenda">${ss.map((s,i)=>`<div class="agenda-row"><span class="agenda-number">${String(i+1).padStart(2,'0')}</span><h3>${s.label}</h3><p>${esc(studyMaterialLabel(s))}</p><div class="agenda-action"><span class="task-time">${s.minutes}分钟</span><button class="agenda-link" data-action="start-step" data-step="${i}">开始<span aria-hidden="true"> ↗</span></button></div></div>`).join('')}</div>`
}
function renderPlan(){
  const groups=[];for(let i=0;i<days.length;i+=7)groups.push(days.slice(i,i+7));
  return `<h1 class="view-title">全部计划</h1><div class="view-toolbar"><button class="small-button" data-action="goto-first">第一天</button></div>${groups.map((g,i)=>`<section><div class="week-head"><h2>第${i+1}周</h2><span>${pretty(g[0].date)}—${pretty(g.at(-1).date)}</span></div><div class="calendar">${g.map(d=>`<button class="day-cell ${selected===d.date?'current':''} ${done(d)?'completed':''} ${isFullMock(d)?'mock':''}" data-action="choose-day" data-date="${d.date}"><span class="date">${d.date.slice(5).replace('-','/')}</span><span class="weekday">周${d.weekday}</span><p>${esc(d.title)}</p><span class="cell-meta">${done(d)?'✓ 已完成 · ':''}${d.mode==='exam'?'六级笔试':`约${d.sessionMinutes}分钟`}</span></button>`).join('')}</div></section>`).join('')}`
}
function renderProgress(){
  const entries=days.filter(d=>saved.records[d.date]);const n=entries.filter(done).length;
  const minutes=entries.reduce((a,d)=>a+(+saved.records[d.date].minutes||0),0);
  const liked=entries.filter(d=>saved.records[d.date].difficulty==='轻松').length;
  return `<h1 class="view-title">学习记录</h1><div class="summary-row"><div><strong>${n}</strong><span>完成的学习日</span></div><div><strong>${minutes}</strong><span>已记录的实际分钟</span></div><div><strong>${liked}</strong><span>感觉轻松的学习日</span></div></div><div class="view-toolbar"><button class="primary-button" data-action="record">记录所选日期</button><button class="secondary-button" data-action="export">导出学习记录</button><button class="secondary-button" data-action="import">合并导入记录</button></div>${renderReviewQueue()}${renderPracticeResults()}${renderExerciseReview()}${entries.length?`<table class="record-table"><thead><tr><th>日期</th><th>状态</th><th>感受</th><th class="hide-small">实际分钟</th><th>收获与卡点</th><th></th></tr></thead><tbody>${entries.map(d=>{const r=saved.records[d.date];return `<tr><td>${pretty(d.date)}</td><td>${esc(r.status)}</td><td>${esc(r.difficulty||'未填写')}</td><td class="hide-small">${esc(r.minutes||'—')}</td><td class="note">${esc(r.note||'还没有记收获')}</td><td><button class="text-button" data-action="choose-day" data-date="${d.date}">回到当天</button></td></tr>`}).join('')}</tbody></table>`:'<div class="empty-note">暂无学习记录</div>'}`
}
function renderExerciseReview(){const words=Object.values(saved.exerciseWords);if(!words.length)return '';return `<section class="review-shelf"><h2>随题词库</h2><div class="exercise-words">${words.map(w=>`<div class="exercise-word"><b>${esc(w.word)}</b>${panel('review-'+w.word,'回想后看中文',`<p>${esc(w.meaning)}</p><p class="word-example-small">${esc(w.example||'')}</p>`)}<p class="text-note">来自 ${esc(w.lessonId||'练习')}</p></div>`).join('')}</div></section>`;}
function renderLibrary(){return `<h1 class="view-title">资料书架</h1><div class="library-list">${resources.map(r=>`<div class="library-row"><span class="resource-id">${r.id}</span><div class="resource-label"><h3>${esc(r.label)}</h3><p>${esc(r.provider)}${r.audioSeconds?` · ${fmt(r.audioSeconds)}`:''}</p></div><div class="resource-actions"><button class="small-button" data-action="pdf" data-id="${r.id}" data-kind="questionPdf">试卷</button><button class="small-button" data-action="pdf" data-id="${r.id}" data-kind="answerPdf">答案</button>${r.audioUrl||r.audioHosted?`<button class="small-button" data-action="audio" data-id="${r.id}">播放原音</button>`:''}${r.transcriptPdf?`<button class="small-button" data-action="pdf" data-id="${r.id}" data-kind="transcriptPdf">原文</button>`:''}<a class="small-button" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">来源</a></div></div>`).join('')}</div><p class="text-note"><a href="pronunciation-credits.html" target="_blank" rel="noopener">单词发音录音来源与署名</a></p>`}
function cardsForDay(){const d=day();let cards=[];
  if(content.dailyVocabulary?.[d.date])return content.dailyVocabulary[d.date].cards.filter(c=>!isKnownWord(c.word)).map((c,i)=>({...c,group:'daily-'+d.date,index:i+1}));
  for(const g of d.vocabGroups||[]){const group=content.vocabulary[g]?.cards||[];let indices=d.vocabIndices?.length?d.vocabIndices:Array.from({length:group.length},(_,i)=>i+1);cards.push(...indices.filter(n=>group[n-1]).map(n=>({...group[n-1],group:g,index:n})));}
  if(!cards.length){for(const g of d.reviewGroups||[]){cards.push(...(content.vocabulary[g]?.cards||[]).filter(c=>saved.hardWords[c.word]).map(c=>({...c,group:g})));}}
  if(!cards.length){for(const g of d.reviewGroups||[]){cards.push(...(content.vocabulary[g]?.cards||[]).slice(0,5).map(c=>({...c,group:g})));}}
  return cards.slice(0,20).filter(c=>!isKnownWord(c.word));
}
function isKnownWord(word){const entry=saved.knownWords[String(word).trim().toLowerCase()];return !!entry&&entry.hidden!==false;}
function knownWordsPanel(){const entries=Object.values(saved.knownWords).filter(entry=>entry&&entry.hidden!==false);return panel('known-words','已会的词（'+entries.length+'）',entries.length?entries.map(entry=>`<div class="known-word-row"><b>${esc(entry.word)}</b><button class="small-button" data-action="restore-known-word" data-word="${esc(entry.word)}">恢复学习</button></div>`).join(''):'<p>还没有标记已会的词。</p>');}
function wordBatchLabel(cards,card){const batch=cards.filter(c=>c.lessonId===card.lessonId),index=batch.indexOf(card)+1,label=({listening:'听力词',matching:'长篇匹配词',careful:'仔细阅读词',cloze:'选词填空词'})[card.batchType];return label?`${label} · ${index}/${batch.length}`:'';}
function renderRoom(){const d=day(),ss=steps(d);stepIndex=Math.min(stepIndex,ss.length-1);const s=ss[stepIndex];
  return `<section class="room ${s.id==='listening'&&practiceMode==='exercise'&&(!isFullMock(d)||mockReview)?'room-listening-exercise':''}"><div class="room-top"><h1 class="room-title">${pretty(d.date)}</h1><div class="room-meta"><span>${isFullMock(d)?(d.mode==='mockPractice'?'完整演练':'模考'):''}</span><button class="text-button" data-action="exit-room">返回</button></div></div><div class="step-nav">${s.id==='listening'&&practiceMode==='exercise'&&(!isFullMock(d)||mockReview)?'<button class="step-pill listening-compact-return" data-action="exit-room">返回</button>':''}${ss.map((x,i)=>`<button class="step-pill ${i===stepIndex?'active':''}" data-action="step" data-step="${i}">${x.label}</button>`).join('')}</div><div class="room-stage"><div class="stage-heading"><h2>${s.label}</h2></div>${stageContent(s)}</div><div class="room-bottom"><div class="timer-box"><span class="timer-display" id="timer-display">${fmt(timerLeft||s.minutes*60)}</span><button class="small-button" data-action="timer" id="timer-button">${timerRunning?'暂停计时':'开始计时'}</button><button class="text-button" data-action="timer-reset">重置</button></div><div class="actions"><button class="secondary-button" data-action="prev-step" ${stepIndex===0?'disabled':''}>上一环节</button>${stepIndex<ss.length-1?'<button class="primary-button" data-action="next-step">下一环节</button>':'<button class="primary-button" data-action="save-record">保存今天的记录</button>'}</div></div></section>`
}
function stageContent(s){const d=day();
  if(s.id==='warmup')return `${window.StudyMarks?.controls()||''}<div class="warmup-english">${esc(d.interestSnippet?.english)}</div><p class="warmup-cn">${esc(d.interestSnippet?.chinese)}</p><button class="small-button" data-action="speak-snippet">听这句话的发音</button>${isFullMock(d)?'<div class="coach-line">按考试顺序独立限时完成，再统一订正。</div>'+paperLinks(d.writing?.paper||d.listening?.paper,false):''}`;
  if(s.id==='vocabulary'){const cards=cardsForDay();if(!cards.length)return '<div class="empty-note">今天的词卡都已标记为学会，可在生词本恢复学习。</div>';wordIndex=Math.min(wordIndex,cards.length-1);const c=cards[wordIndex];return `${window.StudyMarks?.controls()||''}<div class="word-board"><p class="word-index">${wordIndex+1} / ${cards.length}${c.batchType?` · ${esc(wordBatchLabel(cards,c))}`:''}</p><h3 class="word-en">${esc(c.word)}</h3><p class="word-cn">${showMeaning?esc((c.pos||'')+' '+c.meaning):''}</p>${c.sourceLabel?`<p class="text-note word-source">${esc(c.sourceLabel)}</p>`:''}${c.example?`${c.exampleKind?`<p class="text-note word-example-label">${c.exampleKind==='source'?'原文例句':'学习例句'}</p>`:''}<p class="word-example">${esc(c.example)}</p>`:''}${c.exampleZh?panel(day().date+'-vocab-'+c.group+'-'+c.word+'-example-zh','显示例句中文',`<p>${esc(c.exampleZh)}</p>`,'translation-panel word-example-translation'):''}${showMeaning?`<p>${esc(c.phrase)}</p>`:''}${renderPronunciationExample(c.word,day().date+'-word-recording-'+c.word)}<div class="word-actions"><div class="word-primary-actions"><button class="primary-button" data-action="meaning">${showMeaning?'遮住中文':'看看意思'}</button><button class="small-button" data-action="speak-word" >${window.EnglishPronunciation?.label?.(c.word,c.pos)||(window.EnglishPronunciation?.entry(c.word,c.pos)?'听真人发音':'查找真人发音')}</button><button class="text-button" data-action="hard-word" aria-pressed="${!!saved.hardWords[c.word]}">${saved.hardWords[c.word]?'已标为需复习':'标为需复习'}</button></div><button class="small-button" data-action="known-word">已会，以后跳过</button><div class="word-navigation"><button class="small-button" data-action="prev-word" ${wordIndex===0?'disabled':''}>上一条</button><button class="small-button" data-action="next-word" ${wordIndex===cards.length-1?'disabled':''}>下一条</button></div></div></div>`}
  if(s.id==='listening'||s.id==='reading')return renderPractice(s.id);
  if(s.kind==='reading')return renderPractice('reading',s.lessonId);
  if(s.id==='writing')return renderWriting();
  if(s.id==='mock-writing'||s.id==='mock-translation')return renderMockWriting(s);
  if(s.id==='collect')return '<div class="coach-line">先收答题卡1，再进入阅读。听力已结束，不回放、不补改听力答案。</div><p>现在切换到答题卡2，核对阅读和翻译的对应区域。</p>';
  if(s.id==='reflection')return (isFullMock()?'<div class="lesson-links"><button class="primary-button" data-action="mock-review">进入模考订正</button></div>':'')+reflectionForm();
  if(s.id==='exam')return `<div class="coach-line">考试时间：2026年12月12日15:00—17:25。入场、证件、文具和听力设备以准考证和学校通知为准。</div><p>上午熟悉原音5—10分钟，回看自己的错题和写译检查表。午餐和出发按既定安排，考场按监考指令完成。</p><a href="https://www.neea.edu.cn/html1/report/2609/1-1.htm" target="_blank" rel="noopener">查看官方考试安排</a>`;
  return '';
}
function paperLinks(ids,answers=true){return String(ids||'').split('/').map(id=>{const r=resource(id);if(!r)return '';return `<div class="lesson-links"><b>${id} ${esc(r.label)}</b><button class="small-button" data-action="pdf" data-id="${id}" data-kind="questionPdf">打开试卷</button>${answers?`<button class="small-button" data-action="pdf" data-id="${id}" data-kind="answerPdf">练完看答案</button>${r.transcriptPdf?`<button class="small-button" data-action="pdf" data-id="${id}" data-kind="transcriptPdf">查看原文/文字稿</button>`:''}`:''}<a class="text-button" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">材料来源</a></div>`}).join('')}
function panel(key,label,body,cls='translation-panel',defaultOpen=false){
  const isOpen=Object.hasOwn(openPanels,key)?openPanels[key]:defaultOpen;
  return `<details class="${cls}" data-panel="${esc(key)}" ${isOpen?'open':''}><summary>${esc(label)}</summary><div class="panel-body">${body}</div></details>`;
}
function listeningIds(d=day()){
  const t=d.listening;if(!t)return [];
  if(Array.isArray(t.lessonIds))return [...new Set(t.lessonIds)];
  const ranges=[...String(t.questions||'').matchAll(/Q?\s*(\d+)\s*[–—-]\s*(\d+)/g)].map(m=>[+m[1],+m[2]]);
  const parts=[['C1',1,4],['C2',5,8],['P1',9,11],['P2',12,15],['L1',16,18],['L2',19,21],['L3',22,25]];
  return String(t.paper).split('/').flatMap(p=>parts.filter(x=>!ranges.length||ranges.some(([a,b])=>x[1]<=b&&x[2]>=a)).map(x=>p+'-'+x[0]));
}
function inlineFor(kind,id){const ids=kind==='listening'?listeningIds():(day().reading?.items||[]).map(x=>x.lessonId);return lessonBank[id||activeLesson]||lessonBank[ids[0]]||null;}
function listeningTeaching(q,lesson){
  if(lesson.kind!=='listening')return '';
  const t=q.teaching;if(!t)return '<p>'+esc(q.explanation||'请对照本段原音与完整原文核对。')+'</p>'+checkingClues(q);
  const base=day().date+'-'+lesson.id+'-'+q.number;
  return `<section class="listening-teaching"><p><b>听前关注：</b>${esc(t.focus)}</p><h4>原文证据</h4>${t.evidence.map((e,i)=>`<div class="evidence-card"><p class="passage-text">${esc(e.text)}</p>${panel(base+'-evidence-'+i,'显示证据句中文',`<p>${esc(e.zh)}</p>`)}<a class="text-button" href="#transcript-${esc(lesson.id)}-${e.paragraph}" data-action="evidence-source" data-id="${esc(lesson.id)}" data-paragraph="${e.paragraph}">在完整原文中定位</a></div>`).join('')}${t.audio?`<button class="small-button evidence-play" data-action="evidence-audio" data-id="${esc(lesson.id)}" data-start="${t.audio.start}" data-end="${t.audio.end}">回听本题依据 · ${fmt(t.audio.start)}–${fmt(t.audio.end)}</button>`:''}<h4>原文怎样变成答案</h4><p>${esc(t.mapping)}</p><p>${esc(t.reason)}</p><h4>其他选项为什么不选</h4><div class="distractor-list">${Object.entries(t.distractors).map(([letter,reason])=>`<p><b>${esc(letter)}.</b> ${esc(reason)}</p>`).join('')}</div><p class="listening-drill"><b>再练一次：</b>${esc(t.tip)}</p></section>`;
}
function checkingClues(q){
  return q.checkingClues?.length?'<div class="source-checking-clues"><h4>辅助定位句</h4>'+q.checkingClues.map(text=>'<p class="passage-text">'+esc(text)+'</p>').join('')+'<p class="text-note">请结合完整上下文核对题干与选项。</p></div>':'';
}
function questionBlock(q,lesson,exam=false){
  const key=day().date+'-'+lesson.id+'-'+q.number,choice=saved.answers[key];
  const questionTime=clipBank[lesson.id]?.questionTimes?.[q.number];
  const options=q.options||{};
  let rendered=Object.entries(options).map(([letter,text])=>`<button class="option ${choice===letter?'selected':''}" data-action="option" data-key="${esc(key)}" data-letter="${esc(letter)}" aria-pressed="${choice===letter}"><strong>${esc(letter)}</strong><span>${esc(text)}</span></button>`).join('');
  if(lesson.readingType==='matching')rendered=`<div class="letter-options">${(lesson.paragraphs||[]).map((x,i)=>x.label||String.fromCharCode(65+i)).map(letter=>`<button class="letter-option ${choice===letter?'selected':''}" data-action="option" data-key="${esc(key)}" data-letter="${esc(letter)}" aria-pressed="${choice===letter}">${esc(letter)}</button>`).join('')}</div>`;
  if(lesson.readingType==='cloze')rendered='';
  const zh=`${q.promptZh?`<p>${esc(q.promptZh)}</p>`:''}${Object.entries(q.optionsZh||{}).map(([l,t])=>`<p><b>${esc(l)}.</b> ${esc(t)}</p>`).join('')}`;
  const result=saved.lessonResults[day().date+'-'+lesson.id];
  const answer=`<b>参考答案：${esc(q.answer)}</b>${lesson.kind==='listening'?listeningTeaching(q,lesson):`<p>${esc(q.explanation||'请回到原文，圈出与答案一致的依据。')}</p>${checkingClues(q)}`}${q.answerNote?`<p class="text-note">${esc(q.answerNote)}</p>`:''}`;
  const cloze=lesson.readingType==='cloze';
  return `<article class="question-block ${cloze?'cloze-explanation':''}" id="${cloze?'explanation':'question'}-${esc(lesson.id)}-${q.number}"><div class="question-head"><h3>第${q.number}${cloze?'空':'题'}</h3>${lesson.kind==='reading'&&!cloze?`<button class="small-button pin-question" data-action="pin-question" data-id="${esc(lesson.id)}" data-number="${q.number}" aria-label="固定第${q.number}题">固定题目</button>`:''}${!exam&&questionTime!==undefined?`<button class="small-button" data-action="question-audio" data-id="${esc(lesson.id)}" data-time="${+questionTime}">听本题问题</button>`:''}</div>${!cloze&&(!exam||lesson.kind!=='listening')?`<p class="question-prompt">${esc(q.prompt)}</p>`:''}${rendered}${!exam?panel(key+'-zh','显示题目与选项中文',zh||'<p>请参照文段和词库的中文。</p>'):''}${!exam?panel(key+'-answer','核对本题答案与依据',answer,'answer-panel',true):''}${!exam?questionReflection(q,lesson):''}${result&&!exam?`<p class="result-line">${choice===q.answer?'✓ 本题答对':choice?'本题需订正':'本题未作答'}</p>`:''}</article>`;
}
function renderQuestionWindow(){
  const lesson=pinnedQuestion&&lessonBank[pinnedQuestion.lessonId];
  const valid=room&&pinnedQuestion?.date===selected&&activeLesson===lesson?.id&&lesson?.kind==='reading'&&steps()[stepIndex]?.kind==='reading';
  if(!valid){pinnedQuestion=null;document.body.classList.toggle('has-question-window',false);return '';}
  const q=lesson.questions.find(q=>q.number===pinnedQuestion.number);
  if(!q){pinnedQuestion=null;document.body.classList.toggle('has-question-window',false);return '';}
  document.body.classList.toggle('has-question-window',true);
  const key=selected+'-'+lesson.id+'-'+q.number,choice=saved.answers[key];
  const index=lesson.questions.indexOf(q);
  const options=lesson.readingType==='matching'?(lesson.paragraphs||[]).map((p,i)=>[p.label||String.fromCharCode(65+i),'']):Object.entries(q.options||{});
  return `<aside class="question-window ${questionWindowCollapsed?'is-collapsed':''}" aria-label="固定题目窗口"><header class="question-window-header"><h2>第${q.number}题</h2><div><button class="text-button" data-action="question-window-collapse" aria-expanded="${!questionWindowCollapsed}" aria-controls="question-window-content">${questionWindowCollapsed?'展开':'收起'}</button><button class="text-button" data-action="question-window-close" aria-label="关闭固定题目窗口">关闭</button></div></header><div id="question-window-content" ${questionWindowCollapsed?'hidden':''}><article class="question-block" id="pinned-${esc(lesson.id)}-${q.number}"><p class="question-prompt">${esc(q.prompt)}</p><div class="${lesson.readingType==='matching'?'letter-options':'pinned-options'}">${options.map(([letter,text])=>`<button class="${text?'option':'letter-option'} ${choice===letter?'selected':''}" data-action="option" data-key="${esc(key)}" data-letter="${esc(letter)}" aria-pressed="${choice===letter}"><strong>${esc(letter)}</strong>${text?`<span>${esc(text)}</span>`:''}</button>`).join('')}</div></article><footer class="question-window-footer"><button class="small-button" data-action="pinned-prev" ${index===0?'disabled':''} aria-label="固定上一题">上一题</button><button class="small-button" data-action="pinned-source">看原文</button><button class="small-button" data-action="pinned-next" ${index===lesson.questions.length-1?'disabled':''} aria-label="固定下一题">下一题</button></footer></div></aside>`;
}
function vocabularySummary(lesson){const words=lesson.vocabulary||[];if(!words.length)return '';
  return panel(day().date+'-'+lesson.id+'-words','本篇词汇',`<div class="exercise-words">${words.map((w,i)=>`<div class="exercise-word"><b>${esc(w.word)}</b>${panel(lesson.id+'-word-'+i,'看中文与原句',`<p>${esc(w.meaning||w.zh||'释义待校对')}</p><p class="word-example-small">${esc(w.example||'')}</p>`)}<button class="small-button" data-action="exercise-word" data-id="${esc(lesson.id)}" data-index="${i}">${saved.exerciseWords[w.word]?'已加入复习':'加入复习'}</button></div>`).join('')}</div>`,'vocabulary-summary');
}
function inlineClozeSelect(q,lesson){
  const key=day().date+'-'+lesson.id+'-'+q.number,choice=saved.answers[key]||'';
  return `<span class="inline-cloze-slot ${choice?'is-filled':''}" data-blank-number="${q.number}" id="question-${esc(lesson.id)}-${q.number}"><span class="cloze-blank-number" aria-hidden="true">${q.number}</span><select data-answer-key="${esc(key)}" data-lesson-id="${esc(lesson.id)}" aria-label="第${q.number}空答案"><option value="">—</option>${(lesson.wordBank||[]).map(w=>`<option value="${esc(w.letter)}" data-word="${esc(w.word)}" ${choice===w.letter?'selected':''}>${esc(w.letter)}. ${esc(w.word)}</option>`).join('')}</select></span>`;
}
function clozePassageText(text,lesson){
  return String(text||'').split(/(__\d+__)/).map(part=>{
    const match=/^__(\d+)__$/.exec(part),q=match&&lesson.questions.find(q=>q.number===+match[1]);
    return q?inlineClozeSelect(q,lesson):esc(part);
  }).join('');
}
function sourceErrata(lesson){return (lesson.sourceErrata||[]).map(e=>`<p class="text-note source-erratum">原题勘误：${esc(typeof e==='string'?e:e.note)}${e.url?` <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.label||'核对来源')}</a>`:''}</p>`).join('')}
function passageBlock(lesson,exam=false){
  const cloze=lesson.readingType==='cloze';
  return `${!exam?sourceErrata(lesson):''}<div class="reading-passage ${cloze?'cloze-passage':''}">${lesson.wordBank?.length?(window.ClozeSupport?.renderBank(lesson,{date:day().date})||''):''}${(lesson.paragraphs||[]).map((p,i)=>{if(typeof p==='string')p={text:p};const paragraphQuestions=cloze?[...String(p.text).matchAll(/__(\d+)__/g)].map(m=>lesson.questions.find(q=>q.number===+m[1])).filter(Boolean):[];return `<article class="passage-paragraph">${p.label?`<b class="paragraph-letter">${esc(p.label)}</b>`:''}<p class="passage-text">${cloze?clozePassageText(p.text,lesson):esc(p.text)}</p>${!exam?panel(lesson.id+'-para-'+i,'显示本段中文',`<p>${esc(p.zh||'本段译文正在校对，请先参照英文与原卷。')}</p>`):''}${!exam&&cloze?`<div class="cloze-paragraph-explanations">${paragraphQuestions.map(q=>questionBlock(q,lesson,false)).join('')}</div>`:''}</article>`}).join('')}</div>`;
}
function lessonHasAnswers(lesson){return lesson.questions.some(q=>!!saved.answers[day().date+'-'+lesson.id+'-'+q.number]);}
function resetLessonAnswers(id){
  const lesson=lessonBank[id];if(!lesson)return false;
  const prefix=day().date+'-'+id+'-';
  const previous=lesson.questions.map(q=>prefix+q.number).filter(key=>Object.hasOwn(saved.answers,key)).map(key=>[key,saved.answers[key]]);
  if(!previous.length)return false;
  previous.forEach(([key])=>delete saved.answers[key]);
  if(!persist()){previous.forEach(([key,value])=>saved.answers[key]=value);return false;}
  lesson.questions.forEach(q=>openPanels[prefix+q.number+'-answer']=false);
  practiceMode='exercise';render();
  const heading=$('#app').querySelector?.('.lesson-heading h3');
  if(heading?.focus){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
  return true;
}
function lessonProgressText(lesson){
  const answered=lesson.questions.filter(q=>saved.answers[day().date+'-'+lesson.id+'-'+q.number]).length;
  return `${lesson.resourceId} · 第${lesson.questionRange||lesson.questions[0].number+'–'+lesson.questions.at(-1).number}题 · 已作答${answered}/${lesson.questions.length}`;
}
function transcriptBlock(lesson){return panel(day().date+'-'+lesson.id+'-transcript','听完后：展开本段原文',`${lesson.source?.verificationUrl?`<p class="text-note"><a href="${esc(lesson.source.verificationUrl)}" target="_blank" rel="noopener">原文来源</a></p>`:''}<div class="bilingual-transcript">${(lesson.transcriptParagraphs||[]).map((p,i)=>`<article class="passage-paragraph transcript-evidence" id="transcript-${esc(lesson.id)}-${i}"><p class="passage-text">${p.speaker?`<b>${esc(p.speaker)}：</b>`:''}${esc(p.text)}</p>${panel(lesson.id+'-script-'+i,'显示本段中文',`<p>${esc(p.zh||'本段译文正在校对，请先参照英文与原卷。')}</p>`)}${p.uncertainty?`<p class="text-note">${esc(p.uncertainty)}</p>`:''}</article>`).join('')}</div>`,'transcript-panel',true);}
// Listening notes have their own namespace; answers, writing drafts and transcript text stay independent.
function listeningScratchKey(lessonId,date=day().date){return date+'-'+lessonId;}
function validListeningScratchKey(key){
  const match=/^(\d{4}-\d{2}-\d{2})-(.{1,100})$/.exec(key),d=match&&days.find(d=>d.date===match[1]);
  return !!d?.listening&&(listeningIds(d).includes(match[2])||lessonBank[match[2]]?.kind==='listening'||match[2]==='paper-'+d.listening.paper);
}
function normalizeListeningDraft(value){
  if(typeof value==='string')return {text:value,updatedAt:'',alternatives:[]};
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.text!=='string')return null;
  const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():'';
  const alternatives=[];
  for(const item of Array.isArray(value.alternatives)?value.alternatives:[]){
    if(!item||typeof item.text!=='string'||!item.text||item.text===value.text)continue;
    const existing=alternatives.find(row=>row.text===item.text),updatedAt=stamp(item.updatedAt);
    if(existing){if(updatedAt>existing.updatedAt)existing.updatedAt=updatedAt;}else alternatives.push({text:item.text,updatedAt});
  }
  return {text:value.text,updatedAt:stamp(value.updatedAt),alternatives};
}
function mergeListeningDraft(current,incoming){
  const a=normalizeListeningDraft(current),b=normalizeListeningDraft(incoming);
  if(!b)return a;if(!a)return b;
  // An empty or older import must not erase notes. Different nonempty texts remain accessible as versions.
  const primary=!b.text&&a.text?a:!a.text&&b.text?b:b.updatedAt>a.updatedAt?b:a;
  return normalizeListeningDraft({...primary,alternatives:[a,b,...a.alternatives,...b.alternatives]});
}
function listeningScratchStatus(key){
  const entry=normalizeListeningDraft(saved.listeningDrafts[key]);
  return pendingListeningDrafts.has(key)?'尚未保存到浏览器，文字仍保留在当前页面。请重试或导出学习记录。':entry?'已保存在此浏览器':'随输入自动保存在此浏览器';
}
function updateListeningScratchStatus(){
  document.querySelectorAll('[data-listening-scratch-status]').forEach(node=>{
    const key=node.dataset.listeningScratchStatus,message=listeningScratchStatus(key);if(node.textContent!==message)node.textContent=message;node.dataset.state=pendingListeningDrafts.has(key)?'error':'saved';
  });
  document.querySelectorAll('[data-action="listening-scratch-retry"]').forEach(node=>node.hidden=!pendingListeningDrafts.has(node.dataset.key));
}
function renderListeningScratch(lessonId){
  const key=listeningScratchKey(lessonId),entry=normalizeListeningDraft(saved.listeningDrafts[key]),panelKey='listening-scratch-'+key;
  const text=entry?.text||'',alternatives=entry?.alternatives||[],failed=pendingListeningDrafts.has(key);
  return `<details class="listening-scratch" data-panel="${esc(panelKey)}" ${openPanels[panelKey]===false?'':'open'}><summary>听力草稿本 <span>随听随记</span></summary><div class="listening-scratch-body"><label for="listening-scratch-input">关键词、数字或听到的句子</label><textarea id="listening-scratch-input" data-listening-scratch-key="${esc(key)}" rows="7" spellcheck="false" autocomplete="off" placeholder="边听边记，不必写成完整句子。草稿不会作为答案提交。">${esc(text)}</textarea><p class="listening-scratch-status" role="status" aria-live="polite" data-listening-scratch-status="${esc(key)}" data-state="${failed?'error':'saved'}">${esc(listeningScratchStatus(key))}</p><div class="listening-scratch-actions"><button class="small-button" data-action="listening-scratch-retry" data-key="${esc(key)}" ${failed?'':'hidden'}>重试保存</button><button class="text-button" data-action="export">导出学习记录</button></div>${alternatives.length?`<details class="listening-scratch-versions"><summary>其他保留版本（${alternatives.length}）</summary>${alternatives.map((item,index)=>`<article><p>${esc(item.updatedAt?'记录时间 '+item.updatedAt:'导入时保留的草稿')}</p><textarea readonly rows="4" aria-label="其他草稿版本 ${index+1}">${esc(item.text)}</textarea><button class="small-button" data-action="listening-scratch-use-version" data-key="${esc(key)}" data-index="${index}">使用这个版本</button></article>`).join('')}</details>`:''}<p class="listening-scratch-scope">${esc(pretty(day().date))} · ${esc(lessonId)} · 与其他日期和听力段分开保存</p></div></details>`;
}
function writeListeningScratch(key,text){
  if(!validListeningScratchKey(key)||typeof text!=='string')return false;
  const previous=normalizeListeningDraft(saved.listeningDrafts[key]);
  saved.listeningDrafts[key]={text,updatedAt:new Date().toISOString(),alternatives:previous?.alternatives||[]};
  pendingListeningDrafts.add(key);
  const stored=persist();if(!stored)updateListeningScratchStatus();return stored;
}
function useListeningScratchVersion(key,index){
  if(!validListeningScratchKey(key))return false;
  const entry=normalizeListeningDraft(saved.listeningDrafts[key]),version=entry?.alternatives[index];if(!version)return false;
  saved.listeningDrafts[key]=normalizeListeningDraft({text:version.text,updatedAt:new Date().toISOString(),alternatives:[entry,...entry.alternatives]});
  pendingListeningDrafts.add(key);const stored=persist();render();$('#listening-scratch-input')?.focus({preventScroll:true});return stored;
}
window.addEventListener?.('beforeunload',event=>{if(pendingListeningDrafts.size){event.preventDefault();event.returnValue='';}});

function renderPractice(kind,id){
  const task=day()[kind];if(!task)return '';
  const exam=isFullMock()&&!mockReview;
  if(exam)return `<div class="exam-ribbon">模考</div>${kind==='listening'?`<button class="primary-button" data-action="audio" data-id="${esc(task.paper)}">播放完整听力原音</button>`:''}${paperLinks(task.paper,false)}${kind==='listening'?renderListeningScratch('paper-'+task.paper):''}`;
  const studying=practiceMode==='study';
  const modeControl=`<div class="practice-mode-bar"><div><b>${studying?'学习模式':'做题模式'}</b></div>${window.StudyMarks?.controls()||''}<button class="small-button" data-action="practice-mode" aria-label="${studying?'切换到做题模式':'切换到学习模式'}">${studying?'切换到做题模式':'切换到学习模式'}</button></div>`;
  const ids=kind==='listening'?listeningIds():(id?[id]:(task.items||[]).map(x=>x.lessonId));
  if(!ids.includes(activeLesson))activeLesson=ids[0];if(id)activeLesson=id;
  const lesson=lessonBank[activeLesson];
  const navigation=ids.length>1?`<div class="lesson-switcher">${ids.map(lid=>`<button class="small-button ${activeLesson===lid?'active':''}" data-action="lesson" data-id="${esc(lid)}">${esc(lessonBank[lid]?.title||lid)}</button>`).join('')}</div>`:'';
  if(!lesson)return modeControl+navigation+`<div class="content-notice"><b>本篇页面练习正在整理</b><p>${esc(activeLesson)} 暂未接入页面，请使用下方同套原卷完成当天指定题号。</p></div>`+paperLinks(task.paper,studying)+(kind==='listening'?renderListeningScratch(activeLesson||'paper-'+task.paper):'');
  const item=task.items?.find(x=>x.lessonId===lesson.id),result=saved.lessonResults[day().date+'-'+lesson.id];
  const clip=clipBank[lesson.id];
  return modeControl+navigation+`<div class="lesson-heading"><div><span class="phase-tag">${(item?.knownReview??task.knownReview)?'熟题回练':'首次练习'}</span><h3>${esc(lesson.title)}</h3><p role='status' aria-live='polite' data-lesson-progress="${esc(lesson.id)}">${esc(lessonProgressText(lesson))}</p></div>${kind==='listening'&&clip?`<div class="clip-actions"><button class="primary-button" data-action="clip-audio" data-id="${esc(lesson.id)}">播放本段原音</button><button class="small-button" data-action="clip-restart" data-id="${esc(lesson.id)}">从头再听</button>${clip?`<a class="text-button" href="${esc(clip.file)}" download="${esc(lesson.id)}.mp3">下载本段音频</a>`:''}</div>`:''}</div>${kind==='listening'&&!clip?`<div class="content-notice">本段独立音频正在整理，可以使用同套完整录音。<button class="small-button" data-action="audio" data-id="${esc(lesson.resourceId)}">播放完整原音</button></div>`:''}${kind==='listening'?'<div class="listening-workspace"><div class="listening-question-area">':''}${kind==='reading'?passageBlock(lesson,!studying):''}${lesson.readingType==='cloze'?'':`<div class="all-questions">${lesson.questions.map(q=>questionBlock(q,lesson,!studying)).join('')}</div>`}<div class="check-lesson"><button class="primary-button" data-action="check-lesson" data-id="${esc(lesson.id)}">${studying?'核对整篇并记录结果':'完成作答，进入讲解'}</button><button class="secondary-button lesson-reset" data-action="reset-lesson-answers" data-id="${esc(lesson.id)}" ${lessonHasAnswers(lesson)?'':'disabled'}>重置选项</button>${result&&studying?`<span>最近提交${result.correct}/${result.total}题答对${result.complete?' · 已完成':' · 尚有未作答题'}</span>`:''}</div>${studying&&kind==='listening'?transcriptBlock(lesson):''}${studying?renderMethodGuide(lesson)+vocabularySummary(lesson):''}${kind==='listening'?'</div>'+renderListeningScratch(lesson.id)+'</div>':''}<p class="text-note">${studying&&lesson.learningTranslation?.note?esc(lesson.learningTranslation.note):''}${lesson.source?.url?` · <a href="${esc(lesson.source.url)}" target="_blank" rel="noopener">原始来源</a>`:''}</p>`;
}
function markdown(md){return String(md||'').split(/\n\n/).map(p=>`<p>${esc(p).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/`([^`]+)`/g,'$1').replace(/\n/g,'<br>')}</p>`).join('')}
function renderMockWriting(s){
  const d=day(),writing=s.id==='mock-writing';
  const itemId=(d.writing.ids||[]).find(id=>id.startsWith(writing?'W':'T'));
  const item=(writing?content.writing:content.translation)[itemId];
  return `<div class="coach-line">${writing?'作文30分钟。先审题、列提纲，再完整作答。':'翻译30分钟。完整译出信息点，再核对主干。'}</div>${item?`<p class="${writing?'writing-prompt':'translation-prompt'}">${esc(item.prompt)}</p>${mockReview&&item.promptZh?panel(item.id+'-prompt-zh','显示题目中文',`<p>${esc(item.promptZh)}</p>`):''}`:''}${paperLinks(d.writing.paper,mockReview)}<textarea class="draft-input" data-draft-key="${s.id}" placeholder="也可以使用纸笔答题。这里输入的文字会保存到当前浏览器。">${esc(saved.drafts[d.date+'-'+s.id]||'')}</textarea>${mockReview&&item?`<button class="small-button" data-action="reference">${showReference?'收起参考':'查看参考与检查点'}</button>${showReference?`<div class="answer-box reference-content">${markdown(item.referenceMarkdown)}</div>`:''}`:'<p class="text-note">独立模考中不展开答案。题号和答题卡区域按原卷填写。</p>'}`;
}
function renderWriting(){const w=day().writing;if(!w)return '';if(w.paper)return paperLinks(w.paper,!isFullMock())+`<textarea class="draft-input" data-draft-key="paper-writing" placeholder="输入英文作文或译文">${esc(saved.drafts[day().date+'-paper-writing']||'')}</textarea>`;
  const ids=w.ids||[];if(!ids.length)return '<div class="empty-note">今天先修改自己的旧稿，把句子主语、谓语和漏译信息核对一遍。</div>';
  writingIndex=Math.min(writingIndex,ids.length-1);const id=ids[writingIndex],item=id.startsWith('W')?content.writing[id]:content.translation[id];if(!item)return `<p>${esc(w.task)}</p>`;
  const draft=saved.drafts[day().date+'-'+id]||'';
  return `${window.StudyMarks?.controls()||''}<div class="question-tabs">${ids.map((x,i)=>`<button class="question-tab ${i===writingIndex?'active':''}" data-action="writing-tab" data-index="${i}">${x} ${esc((content.writing[x]||content.translation[x])?.title||'')}</button>`).join('')}</div><p class="${id.startsWith('W')?'writing-prompt':'translation-prompt'}">${esc(item.prompt)}</p>${item.promptZh?panel(id+'-prompt-zh','显示题目中文',`<p>${esc(item.promptZh)}</p>`):''}<textarea class="draft-input" data-draft-key="${id}" id="writing-draft" placeholder="输入英文作文或译文">${esc(draft)}</textarea><div class="lesson-links"><span id="word-count" class="text-note">${id.startsWith('W')?`当前约${draft.trim()?draft.trim().split(/\s+/).length:0}个英文词`:''}</span><button class="small-button" data-action="reference">${showReference?'收起参考':'写完再看参考与检查点'}</button></div>${showReference?`<div class="answer-box reference-content">${markdown(item.referenceMarkdown)}</div>`:''}`;
}
function reflectionForm(){const r=saved.records[day().date]||{};difficulty=r.difficulty||difficulty;return `<div class="reflection"><label>今天的感受</label><div class="difficulty-options">${['轻松','正好','有点累'].map(x=>`<button class="difficulty ${difficulty===x?'active':''}" data-action="difficulty" data-value="${x}">${x}</button>`).join('')}</div><label for="reflection-note">收获与卡点</label><textarea id="reflection-note" placeholder="今天的收获或笔记">${esc(saved.notes[day().date]??r.note??'')}</textarea><div class="inline-fields"><div><label for="actual-minutes">实际学习分钟（可留空）</label><input id="actual-minutes" type="number" min="0" max="600" value="${esc(r.minutes??'')}" placeholder="例如45"></div><div><label for="lesson-status">今天完成情况</label><select id="lesson-status"><option ${r.status==='完成'?'selected':''}>完成</option><option ${r.status==='部分完成'?'selected':''}>部分完成</option><option ${r.status==='调整或休息'?'selected':''}>调整或休息</option></select></div></div></div>`}
function setDay(value){if(!days.some(d=>d.date===value))return;stopWordPronunciation();audio.pause();$('#audio-dock').hidden=true;selected=value;room=false;view='today';resetRoomState();render();window.StudyLoader?.warmDay(selected);window.scrollTo(0,0)}
function resetRoomState(){practiceMode='exercise';activeLesson=null;mockReview=false;stepIndex=0;wordIndex=0;qIndex=0;paraIndex=0;showMeaning=false;revealAnswer=false;revealPrompt=false;writingIndex=0;showReference=false;timerRunning=false;timerEnd=null;timerLeft=steps()[0].minutes*60}
function goStep(n){stopWordPronunciation();practiceMode='exercise';activeLesson=null;stepIndex=Math.max(0,Math.min(n,steps().length-1));wordIndex=0;showMeaning=false;qIndex=0;paraIndex=0;revealAnswer=false;revealPrompt=false;writingIndex=0;showReference=false;timerRunning=false;timerEnd=null;timerLeft=steps()[stepIndex].minutes*60;audio.pause();$('#audio-dock').hidden=true;render();window.scrollTo(0,0)}
function fmt(secs){secs=Math.max(0,Math.round(+secs||0));return `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`}
function updateTimerDisplay(){const display=$('#timer-display');if(display)display.textContent=fmt(timerLeft);const btn=$('#timer-button');if(btn)btn.textContent=timerRunning?'暂停计时':'开始计时'}
setInterval(()=>{if(timerRunning){timerLeft=Math.max(0,Math.ceil((timerEnd-Date.now())/1000));if(!timerLeft){timerRunning=false;toast('这一环节的建议时间到了，可以按实际状态继续或进入下一环节。')}updateTimerDisplay()}},500);
function renderPronunciationExample(word,id){
  const r=window.EnglishPronunciation?.entry(word);if(r?.recordingScope!=='example'||!r.exampleText)return '';
  const key=String(word).trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ').toLowerCase();
  return panel(id,'真人录音原句',`<p class="word-example-small">${esc(r.exampleText)}</p>${r.exampleZh?panel(id+'-zh','显示录音原句中文',`<p>${esc(r.exampleZh)}</p>`,'translation-panel'):''}`,'pronunciation-context').replace('<details ',`<details data-pronunciation-word="${esc(key)}" `);
}
function showPronunciationExample(word){const key=String(word).trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ').toLowerCase();document.querySelectorAll('[data-pronunciation-word]').forEach(node=>{if(node.dataset.pronunciationWord===key){node.open=true;if(node.dataset.panel)openPanels[node.dataset.panel]=true}})}
function stopWordPronunciation(){window.EnglishPronunciation?.stop();window.speechSynthesis?.cancel()}
function speak(text,allowSynthesis=false,pos=""){if(window.EnglishPronunciation?.play(text,pos)){showPronunciationExample(text);return;}window.EnglishPronunciation?.stop();window.speechSynthesis?.cancel();if(!allowSynthesis){if(window.EnglishPronunciation?.playLookup){toast('正在查找真人录音…');window.EnglishPronunciation.playLookup(text,pos).then(result=>{if(result?.error)toast(result.error);else if(result?.record)showPronunciationExample(text)})}else toast('这个词尚未补齐真人录音。');return}if(!('speechSynthesis' in window)){toast('当前浏览器没有发音功能，可以跟读真题原音。');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=.9;const voices=speechSynthesis.getVoices();const v=voices.find(v=>/Google US English|Microsoft.*(Aria|Jenny|Sonia|Libby).*Online/i.test(v.name))||voices.find(v=>/^en-US/.test(v.lang))||voices.find(v=>/^en/.test(v.lang));if(v)u.voice=v;speechSynthesis.speak(u)}
function openClip(id,at=0){pointA=pointB=null;loopOn=false;$('#loop-button').textContent='循环关';const c=clipBank[id],l=lessonBank[id];if(!c){toast('本段音频未找到，请使用同套完整录音。');return}if(audioId!==id){audio.pause();audio.src=c.file;audioId=id;pointA=pointB=null;loopOn=false;audio.playbackRate=1;$('#audio-speed').value='1';$('#loop-button').textContent='循环关';audio.load()}const play=()=>{audio.currentTime=Math.max(0,Math.min(at,(audio.duration||Infinity)-.1));audio.play().catch(()=>toast('请点击播放器中的播放按钮。'))};if(audio.readyState>=1)play();else audio.addEventListener('loadedmetadata',play,{once:true});$('#audio-title').textContent=`${id} · ${l?.title||'分段原音'}`;$('#audio-status').textContent='本段全部题目 · '+fmt(c.duration);$('#ab-label').textContent='';$('#audio-dock').hidden=false;}
function openEvidenceClip(id,start,end){
  const clip=clipBank[id];if(!clip||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>clip.duration){toast('本题回听区间暂不可用，请播放本段原音。');return}
  openClip(id,start);pointA=start;pointB=end;loopOn=true;
  $('#loop-button').textContent='循环开';$('#ab-label').textContent=`本题依据 A ${fmt(start)} → B ${fmt(end)} · 自动循环`;
  $('#audio-status').textContent='回听原文依据 · 可调速、暂停或关闭循环';
}
function openAudio(id){const r=resource(id);if(!r){toast('请先选择一套听力材料。');return}const offline=location.protocol==='file:';const src=offline?r.audioOffline:(r.audioHosted||r.audioUrl);if(!src){toast('这份官方样题用于阅读和写译；听力请打开J系列材料。');return}if(audioId!==id){audio.pause();audio.src=src;audioId=id;pointA=pointB=null;loopOn=false;audio.playbackRate=1;$('#audio-speed').value='1';$('#loop-button').textContent='循环关';$('#ab-label').textContent='';audio.load()}$('#audio-title').textContent=`${id} · ${r.label}`;$('#audio-status').textContent=offline?'离线原音':r.audioHosted?'已配原音':'来源网站原音';$('#audio-dock').hidden=false;}
audio.addEventListener('timeupdate',()=>{if(loopOn&&pointA!==null&&pointB!==null&&audio.currentTime>=pointB)audio.currentTime=pointA});
audio.addEventListener('error',()=>{$('#audio-status').textContent='音频暂时无法加载';toast('原音暂时无法加载。可打开资料来源页，或使用离线版的本地录音。')});
$('#audio-speed').addEventListener('change',e=>audio.playbackRate=+e.target.value);
function dialog(body){$('#dialog-body').innerHTML=body;$('#dialog').showModal()}
function openPdf(id,kind){const r=resource(id);const src=r?.[kind];if(!src){toast('这套资料没有此文件，请查看材料来源。');return}dialog(`<h2 class="dialog-title">${id} · ${kind==='questionPdf'?'试卷':kind==='answerPdf'?'参考答案':'原文与文字稿'}</h2><p>${esc(r.label)}</p><a href="${esc(src)}" target="_blank" rel="noopener">另开页面 / 下载PDF</a><iframe class="pdf-frame" title="${id} PDF" src="${esc(src)}"></iframe>`)}
function saveRecord(){const note=$('#reflection-note')?.value??saved.notes[day().date]??saved.records[day().date]?.note??'';let m=$('#actual-minutes')?.value??saved.records[day().date]?.minutes??null;m=m===''?null:Math.min(600,Math.max(0,+m||0));const status=$('#lesson-status')?.value||'完成';saved.records[day().date]={status,difficulty,note,minutes:m,updatedAt:new Date().toISOString(),mode:day().mode};saved.notes[day().date]=note;persist();if($('#dialog').open)$('#dialog').close();toast('今天的学习记录已保存。');render()}
function checkLesson(id){
  const lesson=lessonBank[id];if(!lesson)return;
  const key=day().date+'-'+id;
  const complete=lesson.questions.every(q=>saved.answers[key+'-'+q.number]);
  if(!complete){toast('先完成全部题目，再核对整篇并记录结果。');return}
  const previous=saved.lessonResults[key];
  const past=Object.entries(saved.lessonResults).filter(([k,r])=>k!==key&&k.endsWith('-'+id)&&r.complete);
  const knownReview=!!previous?.complete||past.length>0;
  const snapshot={correct:lesson.questions.filter(q=>saved.answers[key+'-'+q.number]===q.answer).length,total:lesson.questions.length,complete:true,knownReview,updatedAt:new Date().toISOString(),answers:Object.fromEntries(lesson.questions.map(q=>[q.number,saved.answers[key+'-'+q.number]]))};
  const attempts=previous?.attempts?.length?[...previous.attempts]:previous?.complete?[{...previous,attempts:undefined,firstAttempt:undefined}]:[];
  attempts.push(snapshot);
  saved.lessonResults[key]={...snapshot,firstAttempt:previous?.firstAttempt||attempts[0],attempts};
  lesson.questions.filter(q=>!q.sourceConflict&&snapshot.answers[q.number]!==q.answer).forEach(q=>queueQuestion(id,q.number));
  lesson.questions.forEach(q=>openPanels[key+'-'+q.number+'-answer']=true);
  openPanels[key+'-words']=true;practiceMode='study';persist();render();toast('已保存本次结果');
}
function renderPracticeResults(){
  const entries=Object.entries(saved.lessonResults).filter(([,r])=>r?.complete);
  if(!entries.length)return '';
  return `<section class="practice-results"><h2>练习结果</h2>${entries.sort(([a],[b])=>a.localeCompare(b)).map(([key,r])=>{const first=r.firstAttempt||r;const id=key.slice(11);return `<div class="practice-result-row"><div><b>${esc(lessonBank[id]?.title||id)}</b><br><small>${esc(key.slice(0,10))} · ${esc(id)}</small></div><div>首次提交 ${first.correct}/${first.total} · ${first.knownReview?'熟题回练':'首做'}<br><small>最近提交 ${r.correct}/${r.total} · 共${r.attempts?.length||1}次</small></div></div>`}).join('')}</section>`;
}
function exportRecords(){const payload={app:'zimeng-cet6-study-room',version:2,planVersion:DATA.curriculum.meta.version,exportedAt:new Date().toISOString(),...saved};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='梓萌英语学习记录-'+today+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('已导出学习记录')}
function mergeLearningRecords(x){
  if(x?.app!=='zimeng-cet6-study-room'||!x.records||typeof x.records!=='object'||Array.isArray(x.records))throw Error('不是本网页的学习记录');
  for(const [key,value] of Object.entries(cleanMap(x.listeningDrafts))){if(!validListeningScratchKey(key)||!normalizeListeningDraft(value))continue;const merged=mergeListeningDraft(saved.listeningDrafts[key],value);if(JSON.stringify(merged)!==JSON.stringify(saved.listeningDrafts[key])){saved.listeningDrafts[key]=merged;pendingListeningDrafts.add(key);}}
  const skippedDates=new Set();
  for(const [date,r] of Object.entries(cleanMap(x.records))){
    if(!days.some(d=>d.date===date)||!r||typeof r!=='object'||Array.isArray(r))continue;
    if(saved.records[date]&&String(saved.records[date].updatedAt||'')>String(r.updatedAt||'')){skippedDates.add(date);continue}
    saved.records[date]={status:['完成','部分完成','调整或休息'].includes(r.status)?r.status:'部分完成',difficulty:['轻松','正好','有点累'].includes(r.difficulty)?r.difficulty:'正好',note:String(r.note||'').slice(0,10000),minutes:r.minutes===null?null:Math.min(600,Math.max(0,+r.minutes||0)),mode:String(r.mode||''),updatedAt:String(r.updatedAt||'')};saved.notes[date]=saved.records[date].note;
  }
  for(const [date,note] of Object.entries(cleanMap(x.notes)))if(days.some(d=>d.date===date)&&!skippedDates.has(date)&&typeof note==='string')saved.notes[date]=note.slice(0,10000);
  for(const field of ['answers','drafts','hardWords','knownWords','exerciseWords','lessonResults','reviewQueue','personalWords','highlights'])for(const [k,v] of Object.entries(cleanMap(x[field]))){
    if(k.length>=300)continue;
    if(field==='answers'){if(typeof v==='string'&&/^[A-O]$/.test(v))saved[field][k]=v;continue}
    if(field==='drafts'){if(typeof v==='string')saved[field][k]=v.slice(0,50000);continue}
    if(field==='hardWords'){if(typeof v==='boolean')saved[field][k]=v;continue}
    if(!v||typeof v!=='object'||Array.isArray(v))continue;
    if(field==='knownWords'){
      const word=String(v.word||k).trim().toLowerCase();
      if(!/^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,9}$/.test(word)||word.length>160||typeof v.hidden!=='boolean')continue;
      if(String(saved.knownWords[word]?.updatedAt||'')>String(v.updatedAt||''))continue;
      saved.knownWords[word]={word,hidden:v.hidden,date:String(v.date||'').slice(0,10),updatedAt:String(v.updatedAt||'').slice(0,40)};continue;
    }
    if(field==='highlights'){
      if(!/^hl-[a-zA-Z0-9-]{1,100}$/.test(k)||!days.some(d=>d.date===v.date)||typeof v.scope!=='string'||v.scope.length>160||typeof v.key!=='string'||v.key.length>500||!v.key.startsWith(v.date+'|'+v.scope+'|')||!Number.isInteger(v.start)||!Number.isInteger(v.end)||v.start<0||v.end<=v.start||v.end>50000||typeof v.text!=='string'||v.text.length>4000||v.text.length!==v.end-v.start)continue;
      if(saved.highlights[k]&&String(saved.highlights[k].updatedAt||'')>String(v.updatedAt||''))continue;
      saved.highlights[k]={id:k,date:v.date,scope:v.scope,key:v.key,start:v.start,end:v.end,text:v.text,createdAt:String(v.createdAt||'').slice(0,40),updatedAt:String(v.updatedAt||'').slice(0,40)};continue;
    }
    if(field==='personalWords'){
      if(typeof v.word!=='string'||typeof v.meaning!=='string'||!v.meaning.trim()||!/^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,3}$/.test(v.word)||v.word.length>70)continue;
      const key=v.word.toLowerCase();if(saved.personalWords[key]&&String(saved.personalWords[key].updatedAt||'')>String(v.updatedAt||''))continue;
      saved.personalWords[key]={word:key,meaning:v.meaning.slice(0,1800),phonetic:String(v.phonetic||'').slice(0,100),source:String(v.source||'导入记录').slice(0,100),lemma:String(v.lemma||'').slice(0,70),example:String(v.example||'').slice(0,6000),exampleZh:String(v.exampleZh||'').slice(0,6000),exampleSource:String(v.exampleSource||'').slice(0,100),lessonId:String(v.lessonId||'').slice(0,100),createdAt:String(v.createdAt||'').slice(0,40),updatedAt:String(v.updatedAt||'').slice(0,40),reviewed:!!v.reviewed,contexts:(Array.isArray(v.contexts)?v.contexts:[]).filter(c=>c&&typeof c.example==='string').slice(0,20).map(c=>({example:c.example.slice(0,6000),exampleZh:String(c.exampleZh||'').slice(0,6000),exampleSource:String(c.exampleSource||'').slice(0,100),lessonId:String(c.lessonId||'').slice(0,100),date:String(c.date||'').slice(0,10)}))};continue;
    }
    if(field==='exerciseWords'){if(typeof v.word==='string'&&typeof v.meaning==='string')saved[field][k]={word:v.word.slice(0,200),meaning:v.meaning.slice(0,1000),example:String(v.example||'').slice(0,2000),lessonId:String(v.lessonId||'').slice(0,100),date:String(v.date||'').slice(0,10)};continue}
    if(field==='reviewQueue'){if(typeof v.lessonId==='string'&&lessonBank[v.lessonId]?.questions?.some(q=>q.number===v.number)&&days.some(d=>d.date===v.date)&&/^\d{4}-\d{2}-\d{2}$/.test(v.due)&&Number.isInteger(v.stage)&&v.stage>=0&&v.stage<=3)saved[field][k]={lessonId:v.lessonId,number:v.number,date:v.date,due:v.due,stage:v.stage,mastered:v.mastered===true};continue}
    const valid=r=>r&&typeof r==='object'&&Number.isInteger(r.total)&&r.total>0&&r.total<=30&&Number.isInteger(r.correct)&&r.correct>=0&&r.correct<=r.total;
    if(!valid(v))continue;
    if(saved[field][k]&&String(saved[field][k].updatedAt||'')>String(v.updatedAt||''))continue;
    const safe=r=>({correct:r.correct,total:r.total,complete:r.complete===true,knownReview:r.knownReview===true,updatedAt:String(r.updatedAt||'').slice(0,40),answers:cleanMap(r.answers)});
    saved[field][k]={...safe(v),firstAttempt:safe(valid(v.firstAttempt)?v.firstAttempt:v),attempts:(Array.isArray(v.attempts)?v.attempts.filter(valid).slice(0,500):[v]).map(safe)};
  }
}
$('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10e6)throw Error('文件过大');mergeLearningRecords(JSON.parse(await file.text()));const stored=persist();view='progress';room=false;audio.pause();$('#audio-dock').hidden=true;render();toast(stored?'学习记录已合并，较新的日记录与练习结果已保留。':'记录已合并到当前页面，但浏览器未能保存，请立即导出备份。')}catch(err){toast('无法导入：'+err.message)}e.target.value=''});
document.addEventListener('toggle',e=>{if(e.target.dataset?.panel)openPanels[e.target.dataset.panel]=e.target.open},true);
document.addEventListener('change',e=>{if(e.target.dataset.answerKey){saved.answers[e.target.dataset.answerKey]=e.target.value;persist();const slot=e.target.closest('.inline-cloze-slot');if(slot)slot.classList.toggle('is-filled',!!e.target.value);const lesson=lessonBank[e.target.dataset.lessonId];if(lesson){const status=document.querySelector('[data-lesson-progress="'+lesson.id+'"]');if(status)status.textContent=lessonProgressText(lesson);const reset=document.querySelector('[data-action="reset-lesson-answers"][data-id="'+lesson.id+'"]');if(reset)reset.disabled=!lessonHasAnswers(lesson)}}});
document.addEventListener('input',e=>{if(e.target.dataset.listeningScratchKey){writeListeningScratch(e.target.dataset.listeningScratchKey,e.target.value);return}if(e.target.id==='reflection-note'){saved.notes[day().date]=e.target.value;persist()}if(e.target.dataset.draftKey){saved.drafts[day().date+'-'+e.target.dataset.draftKey]=e.target.value;persist();const c=$('#word-count');if(c)c.textContent=`当前约${e.target.value.trim()?e.target.value.trim().split(/\s+/).length:0}个英文词`}});
document.addEventListener('change',e=>{if(e.target.id==='date-select')setDay(e.target.value)});
document.addEventListener('click',e=>{const btn=e.target.closest('[data-action],[data-view]');if(!btn)return;const a=btn.dataset.action;if(btn.dataset.view||['home','start','start-step','exit-room','next-word','prev-word','known-word','lesson'].includes(a))stopWordPronunciation();if(btn.dataset.view){view=btn.dataset.view;room=false;timerRunning=false;audio.pause();$('#audio-dock').hidden=true;render();window.scrollTo(0,0);return}if(btn.tagName==='A'&&btn.getAttribute('href')==='#')e.preventDefault();
  if(a==='material-retry'){materialWaitKey='';materialLoadError='';render();return}
  else if(a==='material-return'){room=false;view='today';render();return}
  else if(a==='listening-scratch-retry'){persist();updateListeningScratchStatus();return}
  else if(a==='listening-scratch-use-version'){useListeningScratchVersion(btn.dataset.key,+btn.dataset.index);return}
  else if(a==='home'){room=false;view='today';timerRunning=false;audio.pause();$('#audio-dock').hidden=true;render();window.scrollTo(0,0)}
  else if(a==='choose-day')setDay(btn.dataset.date);
  else if(a==='goto-first')setDay(days[0].date);
  else if(a==='prev-day'||a==='next-day'){const i=days.findIndex(d=>d.date===selected);const d=days[i+(a==='prev-day'?-1:1)];if(d)setDay(d.date)}
  else if(a==='start'||a==='start-step'){room=true;resetRoomState();if(a==='start-step')stepIndex=+btn.dataset.step;timerLeft=steps()[stepIndex].minutes*60;render();window.scrollTo(0,0)}
  else if(a==='exit-room'){room=false;timerRunning=false;audio.pause();$('#audio-dock').hidden=true;render()}
  else if(a==='step')goStep(+btn.dataset.step);
  else if(a==='next-step')goStep(stepIndex+1);
  else if(a==='prev-step')goStep(stepIndex-1);
  else if(a==='meaning'){showMeaning=!showMeaning;render()}
  else if(a==='next-word'){wordIndex++;showMeaning=false;render()}
  else if(a==='prev-word'){wordIndex--;showMeaning=false;render()}
  else if(a==='speak-word'){const card=cardsForDay()[wordIndex];speak(card?.word||'',false,card?.pos||'')}
  else if(a==='speak-snippet')speak(day().interestSnippet?.english||'',true);
  else if(a==='hard-word'){const c=cardsForDay()[wordIndex];saved.hardWords[c.word]=!saved.hardWords[c.word];persist();render()}
  else if(a==='known-word'){const c=cardsForDay()[wordIndex];if(c){const word=c.word.toLowerCase(),previous=saved.knownWords[word];saved.knownWords[word]={word,hidden:true,date:selected,updatedAt:new Date().toISOString()};if(!persist()){if(previous)saved.knownWords[word]=previous;else delete saved.knownWords[word];return}showMeaning=false;wordIndex=Math.min(wordIndex,Math.max(0,cardsForDay().length-1));render();toast('以后词卡会跳过这个词，可在生词本恢复。')}}
  else if(a==='restore-known-word'){const word=btn.dataset.word,previous=saved.knownWords[word];if(previous){saved.knownWords[word]={...previous,hidden:false,updatedAt:new Date().toISOString()};if(!persist()){saved.knownWords[word]=previous;return}render();toast('已恢复到每日词卡。')}}
  else if(a==='question'){qIndex=+btn.dataset.index;revealAnswer=false;revealPrompt=false;render()}
  else if(a==='pin-question'){pinnedQuestion={date:selected,lessonId:btn.dataset.id,number:+btn.dataset.number};questionWindowCollapsed=false;render();$('#question-window-content')?.closest('aside')?.querySelector('button')?.focus({preventScroll:true})}
  else if(a==='question-window-close'){const previous=pinnedQuestion;pinnedQuestion=null;render();if(previous)document.querySelector(`[data-action="pin-question"][data-id="${previous.lessonId}"][data-number="${previous.number}"]`)?.focus({preventScroll:true})}
  else if(a==='question-window-collapse'){questionWindowCollapsed=!questionWindowCollapsed;render();document.querySelector('[data-action="question-window-collapse"]')?.focus({preventScroll:true})}
  else if(a==='pinned-prev'||a==='pinned-next'){const lesson=lessonBank[pinnedQuestion?.lessonId];if(lesson){const index=lesson.questions.findIndex(q=>q.number===pinnedQuestion.number),q=lesson.questions[index+(a==='pinned-prev'?-1:1)];if(q){pinnedQuestion.number=q.number;render();document.querySelector(`[data-action="${a}"]`)?.focus({preventScroll:true})}}}
  else if(a==='pinned-source'){$('.reading-passage')?.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})}
  else if(a==='option'){if(!Object.hasOwn(saved.answers,btn.dataset.key))saved.answers[btn.dataset.key]=btn.dataset.letter;else saved.answers[btn.dataset.key]=btn.dataset.letter;persist();render()}
  else if(a==='reset-lesson-answers'){btn.disabled=true;btn.setAttribute?.('aria-busy','true');if(!resetLessonAnswers(btn.dataset.id)){btn.disabled=false;btn.removeAttribute?.('aria-busy');btn.dataset.state='error';btn.textContent='重试重置'}}
  else if(a==='answer'){revealAnswer=!revealAnswer;render()}
  else if(a==='prompt'){revealPrompt=true;render()}
  else if(a==='prev-para'){paraIndex--;render()}
  else if(a==='next-para'){paraIndex++;render()}
  else if(a==='lesson'){practiceMode='exercise';activeLesson=btn.dataset.id;audio.pause();$('#audio-dock').hidden=true;render()}
  else if(a==='practice-mode'){practiceMode=practiceMode==='exercise'?'study':'exercise';render()}
  else if(a==='check-lesson')checkLesson(btn.dataset.id);
  else if(a==='exercise-word'){const w=lessonBank[btn.dataset.id]?.vocabulary?.[+btn.dataset.index];if(w){if(saved.exerciseWords[w.word])delete saved.exerciseWords[w.word];else saved.exerciseWords[w.word]={word:w.word,meaning:w.meaning||w.zh,example:w.example,lessonId:btn.dataset.id,date:day().date};persist();render()}}
  else if(a==='clip-audio'||a==='clip-restart'){openClip(btn.dataset.id,0)}
  else if(a==='question-audio'){openClip(btn.dataset.id,+btn.dataset.time)}
  else if(a==='evidence-audio'){openEvidenceClip(btn.dataset.id,+btn.dataset.start,+btn.dataset.end)}
  else if(a==='evidence-source'){e.preventDefault();const target=$('#transcript-'+btn.dataset.id+'-'+btn.dataset.paragraph);if(target){const details=target.closest('details');if(details){details.open=true;openPanels[details.dataset.panel]=true}const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});target.classList.add('evidence-highlight');setTimeout(()=>target.classList.remove('evidence-highlight'),3500)}}
  else if(a==='mock-review'){practiceMode='study';mockReview=true;activeLesson=null;stepIndex=steps().findIndex(s=>s.id==='listening');render();window.scrollTo(0,0)}
  else if(a==='audio')openAudio(btn.dataset.id);
  else if(a==='audio-hide'){$('#audio-dock').hidden=true;audio.pause()}
  else if(a==='rewind')audio.currentTime=Math.max(0,audio.currentTime-5);
  else if(a==='repeat')audio.currentTime=Math.max(0,audio.currentTime-20);
  else if(a==='set-a'){pointA=audio.currentTime;$('#ab-label').textContent=`A点 ${fmt(pointA)}，接着设B点。`}
  else if(a==='set-b'){pointB=audio.currentTime;if(pointA===null||pointB<=pointA){pointB=null;toast('B点需要在A点之后。')}else $('#ab-label').textContent=`循环区间 ${fmt(pointA)}—${fmt(pointB)}`}
  else if(a==='loop'){if(pointA===null||pointB===null){toast('先设A点和后面的B点。');return}loopOn=!loopOn;$('#loop-button').textContent=loopOn?'循环开':'循环关';if(loopOn)audio.currentTime=pointA}
  else if(a==='pdf')openPdf(btn.dataset.id,btn.dataset.kind);
  else if(a==='transcript'){const lesson=inlineFor('listening');if(lesson)dialog(`<h2 class="dialog-title">${esc(lesson.title)} · 复盘原文</h2><p class="text-note">${esc(lesson.transcriptNote)}</p><div class="transcript">${lesson.transcriptParagraphs.map(x=>`<p><b>${x.speaker}：</b>${esc(x.text)}</p>${x.uncertainty?`<p class="text-note">${esc(x.uncertainty)}</p>`:''}`).join('')}</div>`)}
  else if(a==='writing-tab'){writingIndex=+btn.dataset.index;showReference=false;render()}
  else if(a==='reference'){showReference=!showReference;render()}
  else if(a==='difficulty'){difficulty=btn.dataset.value;document.querySelectorAll('.difficulty').forEach(b=>b.classList.toggle('active',b.dataset.value===difficulty))}
  else if(a==='record'){dialog(`<h2 class="dialog-title">${pretty(day().date)}的学习记录</h2>${reflectionForm()}<div class="lesson-links"><button class="primary-button" data-action="save-record">保存记录</button></div>`)}
  else if(a==='save-record')saveRecord();
  else if(a==='export')exportRecords();
  else if(a==='import')$('#import-file').click();
  else if(a==='timer'){if(timerRunning){timerLeft=Math.max(0,Math.ceil((timerEnd-Date.now())/1000));timerRunning=false}else{if(!timerLeft)timerLeft=steps()[stepIndex].minutes*60;timerEnd=Date.now()+timerLeft*1000;timerRunning=true}updateTimerDisplay()}
  else if(a==='timer-reset'){timerRunning=false;timerEnd=null;timerLeft=steps()[stepIndex].minutes*60;updateTimerDisplay()}
  else if(a==='close-dialog')$('#dialog').close();
});
document.addEventListener('keydown',e=>{if(e.target.closest('.question-window')){if(e.key==='Escape'){e.preventDefault();document.querySelector('[data-action="question-window-close"]')?.click()}return}if(e.defaultPrevented||e.shiftKey||e.target.matches('input,textarea,select,[contenteditable="true"]')||$('#dialog').open||e.target.closest('#word-lookup,#mark-tools-popover'))return;if(room&&e.key==='ArrowRight'){e.preventDefault();if(stepIndex<steps().length-1)goStep(stepIndex+1)}if(room&&e.key==='ArrowLeft'){e.preventDefault();if(stepIndex>0)goStep(stepIndex-1)}});
resetRoomState();render();
window.StudyLoader?.warmDay(selected);
setTimeout(()=>window.StudyLoader?.warmDictionary(),15000);
