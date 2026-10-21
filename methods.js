'use strict';
// Original practice prompts; source review scope is maintenance metadata, not learner copy.
const methodSources=[
  {title:'李旭：六级听力提分技巧',url:'https://news.koolearn.com/20170617/1126403.html',note:'参考逐句听抄、发音、连读与重音训练；把每道题的证据句作为短练习。本站逐题分析自行编写。'},
  {title:'刘晓燕相关语法学习方向（新东方备考文章推荐，非本人讲义）',url:'https://cet4-6.xdf.cn/202603/15121891.html',note:'据公开推荐，加入真题句子成分训练；本站拆解与练习为自行编写。'},
  {title:'王江涛：英语听力，到底应该怎么学？',url:'https://yingyu.xdf.cn/202001/11017499.html',note:'借鉴听写、研究真题和复盘的方向，按当前基础缩为20—40秒练习。'},
  {title:'新东方：六级听力的预判、定位与精听',url:'https://cet4-6.xdf.cn/202606/15231709.html',note:'借鉴选项预览与听后定位，结合本站独立音频和A/B循环。'},
  {title:'刘晓艳六级急救班：赠送简单句上下两讲',url:'https://www.ixuecheng.cn/detail?id=1824985823741640704&type=1',note:'2026-10-21对已上线简单句上下两讲的板书重点抽样核对；无字幕/讲义，未完整听录音；听力、阅读、写译专项直播尚未开课。借鉴主语、完整谓语、补足与修饰成分的识别方向，用本站原题独立编写拆解；不复制课程例句、截图或待纠错句。'}
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
  'J02-R2':{text:'The study concludes that without radical action the level of prosperity that millions of people in the developed world count on will be impossible to maintain or extend to poorer countries.',main:'The study concludes that the level…will be impossible to maintain or extend：研究认为，这种繁荣水平将难以维持或扩展。',parts:['第一个that引出研究结论。','第二个that修饰the level of prosperity；count on表示依靠。','without radical action是结论的条件，不能删去后说“一定无法改善”。'],check:'找出结论的条件，并说明为什么它对排除绝对化选项很重要。'},
  'J04-R-match':{
    text:'The low productivity of African farmers is reflected in national economic statistics— despite absorbing so much labour, farming generates just 15% of GDP.',
    prompt:'破折号前后各找一组主语和完整谓语。再看吸收了很多劳动力的是谁。',
    subject:'前半句：The low productivity of African farmers（非洲农民的低生产率）；后半句：farming（农业）。',
    predicate:'前半句：is reflected（得到体现），is与reflected共同构成被动谓语；后半句：generates（创造）。',
    remaining:'of African farmers修饰productivity；in national economic statistics说明体现在哪里，要与is reflected一起理解。后半句的宾语是just 15% of GDP（仅15%的国内生产总值）。',
    meaning:'非洲农民的低生产率体现在国家经济统计数据中：农业尽管吸收了如此多的劳动力，却只创造了15%的国内生产总值。',
    parts:['despite absorbing so much labour表示“尽管吸收了如此多的劳动力”；absorbing在介词despite后，不是另一个独立谓语，动作主体是farming。','先保留每个分句的主干，再把地点、范围和让步信息放回去，才能看清“劳动力多、产出占比低”的对比。'],
    check:'回到第36题：这句说明低生产率；E段哪一句还补充了“一个世纪”这条时间信息？'
  },
  'R2023-12-3-R2':{
    text:'Conservation efforts, often led by determined individuals, have helped some species to recover by reintroducing them to new areas.',
    prompt:'先找主语和完整谓语，再区分led、to recover和reintroducing各在补充什么。',
    subject:'Conservation efforts（保护行动）。',
    predicate:'have helped（已经帮助），have表示现在完成时，不能把它从谓语里漏掉。',
    remaining:'some species是helped的宾语，to recover补充说明这些物种恢复；by reintroducing them to new areas说明帮助它们恢复的方式，them指some species。',
    meaning:'这些保护行动往往由意志坚定的人士牵头，通过将某些物种重新引入新的区域，已经帮助这些物种恢复。',
    parts:['often led by determined individuals插在主语之后，补充说明保护行动由谁牵头；这里的led是过去分词，不能与主句的have helped并列当作两个谓语。','to recover是不定式；reintroducing在介词by之后。这两处都不是新的分句谓语，但仍承载“恢复”和“怎样帮助”的重要信息。'],
    check:'本句说部分物种在保护下恢复。回到第54题和第四段：保护者最担忧的威胁是什么？不能把“部分已恢复”扩大成“所有蜘蛛都安全了”。'
  },
  'J04-R-cloze':{
    text:'Plenty of water, spare tires, and a full tank of gas are needed to explore this unit of the national park system, which is the third largest in the country.',
    prompt:'并列主语有哪些？找出主句的完整被动谓语，再单独找which从句的主语和谓语。',
    subject:'主句：Plenty of water, spare tires, and a full tank of gas（充足的水、备用轮胎和满满一箱汽油）；关系从句：which，指这个国家公园系统管理单元。',
    predicate:'主句：are needed（被需要／需要准备），are与needed共同构成被动谓语；which从句：is（是）。',
    remaining:'to explore…说明准备这些物资的目的；of the national park system说明unit属于哪个系统。关系从句中的the third largest是表语，in the country限定比较范围。',
    meaning:'要探索国家公园系统中的这个管理单元，需要准备充足的水、备用轮胎和满满一箱汽油；这个管理单元的面积在全国排名第三。',
    parts:['water、tires和a full tank of gas由and连接，共同作主语；are不能只与最后一个单数名词tank对应。','needed虽然以-ed结尾，这里却与are组成谓语；to explore才是不定式。不能只看词尾判断一个词是不是谓语。'],
    check:'这些物资和上一句的鞋都属于出发前的准备。回看第34空：哪个词能恰当地修饰shoes，符合在未铺面的道路上行走的需要？'
  }
};
function methodDraft(lesson,suffix){return day().date+'-method-'+lesson.id+'-'+suffix}
function renderMethodGuide(lesson){
  const dictation=lesson.kind==='listening'?`<label class="method-label" for="method-dictation">短段听写</label><textarea id="method-dictation" class="method-input" data-draft-key="method-${esc(lesson.id)}-dictation" placeholder="听到的英文">${esc(saved.drafts[methodDraft(lesson,'dictation')]||'')}</textarea>`:'';
  const grammar=sentenceWork[lesson.id];
  const structured=!!grammar?.subject;
  const reference=grammar?(structured?`<p><b>主语：</b>${esc(grammar.subject)}</p><p><b>完整谓语：</b>${esc(grammar.predicate)}</p><p><b>其余成分：</b>${esc(grammar.remaining)}</p><p><b>整句意思：</b>${esc(grammar.meaning)}</p>`:`<p><b>主干：</b>${esc(grammar.main)}</p>`)+`<ul>${grammar.parts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>${structured?'<b>回到题目：</b>':''}${esc(grammar.check)}</p>`:'';
  const grammarHtml=grammar?panel('method-sentence-'+lesson.id,structured?'原句拆解':'长难句',`<p class="passage-text">${esc(grammar.text)}</p>${grammar.prompt?`<p>${esc(grammar.prompt)}</p>`:''}<label class="method-label">${structured?'主语、完整谓语与修饰':'主干与修饰'}</label><textarea class="method-input" aria-label="${structured?'本篇原句主干笔记':'本篇长难句主干笔记'}" data-draft-key="method-${esc(lesson.id)}-sentence" placeholder="${structured?'先写各分句的主语和完整谓语，再说其余成分':'主语、谓语和修饰关系'}">${esc(saved.drafts[methodDraft(lesson,'sentence')]||'')}</textarea>${panel('method-sentence-reference-'+lesson.id,'句子拆解',reference)}`):'';
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
