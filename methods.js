'use strict';
// Original practice prompts adapted from the linked public teaching resources.
const methodSources=[
  {title:'李旭：六级听力提分技巧',url:'https://news.koolearn.com/20170617/1126403.html',note:'参考逐句听抄、发音、连读与重音训练；把每道题的证据句作为短练习。本站逐题分析自行编写。'},
  {title:'刘晓燕相关语法学习方向（新东方备考文章推荐，非本人讲义）',url:'https://cet4-6.xdf.cn/202603/15121891.html',note:'据公开推荐，加入真题句子成分训练；本站拆解与练习为自行编写。'},
  {title:'王江涛：英语听力，到底应该怎么学？',url:'https://yingyu.xdf.cn/202001/11017499.html',note:'借鉴听写、研究真题和复盘的方向，按当前基础缩为20—40秒练习。'},
  {title:'新东方：六级听力的预判、定位与精听',url:'https://cet4-6.xdf.cn/202606/15231709.html',note:'借鉴选项预览与听后定位，结合本站独立音频和A/B循环。'}
];
const methodSteps={
  listening:[['先听再核对','做题时只看选项，先判断人物、动作或态度。原速完整听一遍，选出答案。'],['精听一小段','核对后点“回听本题依据”，自动循环证据句。先听写最卡住的一句，听不出的地方留空。'],['对照并跟读','对照英文证据、中文和选项改写，分清人物、否定、因果与时间。跟读两遍，再关稿回听。']],
  cloze:[['先确定词性','看空前空后，判断需要名词、动词、形容词还是副词，再从词库筛选。'],['再核对搭配与句意','回到完整句子，检查主谓一致、固定搭配、代词指向及上下文关系。'],['整篇回读','检查词库是否重复使用；不会的空先保留，最后用全文意思交叉核对。']],
  matching:[['圈独特线索','先看题目陈述，圈人名、数字、地点和核心动作，再找相关段落。'],['核对整条信息','段落中出现同一个词只是线索，继续确认主体、动作和因果是否一致。'],['总结替换表达','把题目与原文中意思相同、措辞不同的表达记在本题依据里；同一段可以重复选。']],
  careful:[['题目指向哪里','区分问细节、原因、态度还是主旨。定位相关段落，细节题再看前后句。'],['先说主干','找主语和谓语，再处理从句与修饰；特别检查否定、转折、比较和指代。'],['比较每个选项','用原文证据排除主体偷换、范围扩大、因果颠倒和无依据推断，再记录同义替换。']]
};
const sentenceWork={
  'O01-R1':{text:"But science is exactly what we need more of when it comes to GM foods, which is why I was happy to see Nature devote a special series of articles to the GM food controversy.",main:'science is what we need more of：科学研究正是我们更需要的。',parts:['when it comes to GM foods：说明讨论范围是转基因食品。','which is why…：连接前面的判断与作者高兴的原因。','see Nature devote…：see + 宾语 + 动词原形；Nature是杂志名。'],check:'作者认为需要更多科学研究，这与第47题的research如何对应？'},
  'O01-R2':{text:'Some experts worry that Yellen will be inclined to chase unemployment to the neglect of inflation.',main:'Some experts worry：一些专家担心。',parts:['that…是worry后面的宾语从句，说明担心的内容。','be inclined to：倾向于；chase unemployment在此语境指致力于降低失业率。','to the neglect of inflation：代价是忽视通货膨胀。'],check:'区分“部分专家的担心”和下一段提到的“更多公众的担心”。'},
  'J01-R1':{text:'Ironically, the new tax on endowments drains financial aid funds from the very schools most able to offer opportunity to those who have earned a spot but cannot otherwise afford this education.',main:'the new tax drains financial aid funds from schools：新税削减学校的助学资金。',parts:['on endowments修饰tax，说明对捐赠基金征税。','most able to offer opportunity修饰schools。','who…修饰those，指已获录取、却无法自行承担费用的学生；but连接这两个信息。'],check:'税收、资助和学生机会的关系是什么？不要把“所有人被录取”当作结论。'},
  'J01-R2':{text:'When new ideas are in accord with what we already believe, they are more readily accepted.',main:'they are more readily accepted：新观念更容易被接受。',parts:['When…引出条件或情境。','what we already believe：我们已经相信的东西。','they指new ideas；in accord with表示与……一致。'],check:'作者是在赞同这种判断方式，还是分析它可能带来的偏差？继续看后文。'},
  'J02-R1':{text:"Their desire to avoid feeling inferior ends up making them feel inferior when it comes to their diminished capacity for friendship and leisure.",main:'Their desire ends up making them feel inferior：这种愿望最终反而让他们感到自卑。',parts:['to avoid feeling inferior修饰desire：想避免自卑。','make + 宾语 + 动词原形：making them feel…','when it comes to…说明具体方面是友谊与休闲能力下降。'],check:'为什么“想避免自卑”会产生相反结果？回到前后句解释。'},
  'J02-R2':{text:'The study concludes that without radical action the level of prosperity that millions of people in the developed world count on will be impossible to maintain or extend to poorer countries.',main:'The study concludes that the level…will be impossible to maintain or extend：研究认为，这种繁荣水平将难以维持或扩展。',parts:['第一个that引出研究结论。','第二个that修饰the level of prosperity；count on表示依靠。','without radical action是结论的条件，不能删去后说“一定无法改善”。'],check:'找出结论的条件，并说明为什么它对排除绝对化选项很重要。'}
};
function methodDraft(lesson,suffix){return day().date+'-method-'+lesson.id+'-'+suffix}
function renderMethodGuide(lesson){
  const dictation=lesson.kind==='listening'?`<label class="method-label" for="method-dictation">短段听写</label><textarea id="method-dictation" class="method-input" data-draft-key="method-${esc(lesson.id)}-dictation" placeholder="听到的英文">${esc(saved.drafts[methodDraft(lesson,'dictation')]||'')}</textarea>`:'';
  const grammar=sentenceWork[lesson.id];
  const grammarHtml=grammar?panel('method-sentence-'+lesson.id,'长难句',`<p class="passage-text">${esc(grammar.text)}</p><label class="method-label">主干与修饰</label><textarea class="method-input" aria-label="本篇长难句主干笔记" data-draft-key="method-${esc(lesson.id)}-sentence" placeholder="主语、谓语和修饰关系">${esc(saved.drafts[methodDraft(lesson,'sentence')]||'')}</textarea>${panel('method-sentence-reference-'+lesson.id,'句子拆解',`<p><b>主干：</b>${esc(grammar.main)}</p><ul>${grammar.parts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>${esc(grammar.check)}</p>`)}`):'';
  return dictation||grammarHtml?`<section class="method-guide">${dictation}${grammarHtml}</section>`:'';
}
const errorKinds=['词义不熟','语音没辨出','主干或从句没读懂','定位不准','同义替换没识别','否定或逻辑看反','选项范围或主体偷换','时间不足／漏题'];
function questionReflection(q,lesson){
  const suffix=q.number+'-evidence',errorSuffix=q.number+'-error';
  const queued=saved.reviewQueue?.[lesson.id+'-'+q.number];
  return panel(methodDraft(lesson,q.number+'-notes'),'本题笔记',`<label class="method-label">依据句 / 对应表达</label><textarea class="method-input" aria-label="第${q.number}题依据笔记" data-draft-key="method-${esc(lesson.id)}-${suffix}" placeholder="原文依据、同义表达、词性或搭配">${esc(saved.drafts[methodDraft(lesson,suffix)]||'')}</textarea><label class="method-label" for="error-${esc(lesson.id)}-${q.number}">错因</label><select id="error-${esc(lesson.id)}-${q.number}" data-method-key="${esc(methodDraft(lesson,errorSuffix))}"><option value="">选择错因</option>${errorKinds.map(x=>`<option ${saved.drafts[methodDraft(lesson,errorSuffix)]===x?'selected':''}>${esc(x)}</option>`).join('')}</select><p><button class="small-button" data-action="queue-question" data-id="${esc(lesson.id)}" data-number="${q.number}">${queued&&!queued.mastered?'已加入错题复习':'加入错题复习'}</button></p>`);
}
function plusDays(dateValue,n){const d=new Date(dateValue+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function queueQuestion(id,number){
  if(!lessonBank[id]?.questions.some(q=>q.number===number))return;
  const key=id+'-'+number;const current=saved.reviewQueue[key];
  if(current&&!current.mastered)return;
  saved.reviewQueue[key]={lessonId:id,number,date:day().date,due:plusDays(today,1),stage:0,mastered:false};
}
function renderReviewQueue(){
  const rows=Object.values(saved.reviewQueue||{}).filter(r=>r&&!r.mastered&&lessonBank[r.lessonId]);
  if(!rows.length)return '';
  rows.sort((a,b)=>a.due.localeCompare(b.due));
  return `<section class="review-shelf"><h2>错题复习</h2><p class="text-note">${rows.length}题待复习</p>${rows.map(r=>`<div class="practice-result-row"><div><b>${esc(lessonBank[r.lessonId].title)} · 第${r.number}题</b><br><small>${r.due<=today?'今日复习':'待复习'}</small></div><div><button class="small-button" data-action="review-question" data-key="${esc(r.lessonId+'-'+r.number)}">重做</button> <button class="small-button" data-action="review-understood" data-key="${esc(r.lessonId+'-'+r.number)}">已能解释依据</button></div></div>`).join('')}</section>`;
}
document.addEventListener('change',e=>{if(e.target.dataset.methodKey){saved.drafts[e.target.dataset.methodKey]=e.target.value;persist()}});
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-action]');if(!button)return;
  if(button.dataset.action==='queue-question'){queueQuestion(button.dataset.id,+button.dataset.number);persist();render();toast('已加入错题复习。')}
  if(button.dataset.action==='review-understood'){
    const r=saved.reviewQueue[button.dataset.key];if(!r)return;
    r.stage++;r.mastered=r.stage>=3;r.due=plusDays(today,[1,3,7][r.stage]||7);persist();render();toast(r.mastered?'复习已完成。':'已记录。');
  }
  if(button.dataset.action==='review-question'){
    const r=saved.reviewQueue[button.dataset.key],l=lessonBank[r?.lessonId];if(!l)return;
    setDay(r.date);room=true;resetRoomState();
    const index=steps().findIndex(s=>l.kind==='listening'?s.id==='listening':s.lessonId===l.id||s.id==='reading');
    if(index<0){toast('请在这套原卷中复习第'+r.number+'题。');room=false;render();return}
    goStep(index);activeLesson=l.id;practiceMode='exercise';render();$('#question-'+l.id+'-'+r.number)?.scrollIntoView?.({block:'start'});
  }
});
