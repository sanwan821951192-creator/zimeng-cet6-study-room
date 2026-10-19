'use strict';
/* Local definitions and learner notebook. Online audio requests send only the word after a click. */
window.WordNotebook=(()=>{
  const normalize=w=>String(w||'').trim().replace(/[’‘]/g,"'").toLowerCase();
  const valid=w=>/^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,3}$/.test(w)&&w.length<=70;
  const local=new Map(),loads=new Map(),pairs=[],pairKeys=new Set(),tokenPairs=new Map(),formPairs=new Map(),studyPairs=new Map(),matchCache=new Map(),dictionaryCache=new Map(),indexedLessons=new Set();
  const lessonOrder=new Map(Object.keys(lessonBank).map((id,index)=>[id,index]));
  let nextPairOrder=null,current=null,ticket=0,filter='',returnFocus=null,returnSnapshot=null,lastRect=null;
  const textKey=t=>String(t||'').replace(/\s+/g,' ').trim();
  function indexPair(index,key,pair){if(!index.has(key))index.set(key,new Set());index.get(key).add(pair);}
  function addPair(example,exampleZh,lessonId='',exampleSource='原文例句',forms=[],date='',rank=0){
    if(!example||!exampleZh||example.length>6000||exampleZh.length>6000)return;
    const normalizedText=textKey(example),key=JSON.stringify([lessonId,normalizedText,exampleZh,date]);if(pairKeys.has(key))return;pairKeys.add(key);
    const pair={example,exampleZh,lessonId,exampleSource,forms:forms.map(normalize).filter(Boolean),date,rank,normalizedText,order:nextPairOrder===null?pairs.length:nextPairOrder++};pairs.push(pair);
    for(const token of new Set(example.toLowerCase().match(/[a-z]+/g)||[]))indexPair(tokenPairs,token,pair);
    for(const form of pair.forms){indexPair(formPairs,form,pair);if(rank)indexPair(studyPairs,form,pair);}
  }
  function addCard(c,lessonId='',date=''){
    const forms=[c.word,c.sourceWord].filter(Boolean),meaning=c.meaning||c.zh;
    for(const form of forms)if(meaning&&!local.has(normalize(form)))local.set(normalize(form),{meaning,source:'学习词卡',phonetic:c.phonetic||''});
    addPair(c.example,c.exampleZh,c.lessonId||lessonId,c.exampleSource||(c.exampleKind==='source'?'原文例句':'学习例句'),forms,date,date?2:1);
  }
  for(const [date,g] of Object.entries(content.dailyVocabulary||{}))for(const c of g.cards||[])addCard(c,c.lessonId,date);
  for(const [id,g] of Object.entries(content.vocabulary||{}))for(const c of g.cards||[])addCard(c,id);
  function indexLesson(id,l){
    if(indexedLessons.has(id)||window.StudyLoader&&!window.StudyLoader.isLessonReady(id))return;
    indexedLessons.add(id);const previousOrder=nextPairOrder;nextPairOrder=1000000+(lessonOrder.get(id)||0)*10000;
    for(const w of l.vocabulary||[]){if(w.meaning||w.zh){if(!local.has(normalize(w.word)))local.set(normalize(w.word),{meaning:w.meaning||w.zh,source:'课文词汇'});addCard(w,id)}}
    for(const p of l.paragraphs||l.transcriptParagraphs||[])addPair(p.text,p.zh,id,'原文语境');
    for(const q of l.questions||[]){
      addPair(q.prompt,q.promptZh,id,'题目原句');
      for(const [letter,text] of Object.entries(q.options||{}))addPair(text,q.optionsZh?.[letter],id,'选项原句');
      for(const e of q.teaching?.evidence||[])addPair(e.text,e.zh,id,'原文例句');
    }
    nextPairOrder=previousOrder;matchCache.clear();
  }
  for(const [id,l] of Object.entries(lessonBank))indexLesson(id,l);
  window.StudyLoader?.onLessons(additions=>{for(const [id,lesson] of Object.entries(additions))indexLesson(id,lesson);});
  nextPairOrder=1000000+lessonOrder.size*10000;
  if(typeof days!=='undefined')for(const d of days)addPair(d.interestSnippet?.english,d.interestSnippet?.chinese,'今天的开场','双语开场',[],d.date);
  nextPairOrder=null;
  function matchingPairs(word){
    if(matchCache.has(word))return matchCache.get(word);
    const token=word.match(/^[a-z]+/)?.[0],candidates=new Set([...(tokenPairs.get(token)||[]),...(formPairs.get(word)||[])]);
    const pattern=new RegExp("(^|[^A-Za-z])"+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+')+"(?=$|[^A-Za-z])",'i');
    const result=[...candidates].filter(p=>p.forms.includes(word)||pattern.test(p.example));
    if(matchCache.size>=512)matchCache.delete(matchCache.keys().next().value);matchCache.set(word,result);return result;
  }
  function findPair(word,lessonId='',example='',lemma=''){
    const forms=[normalize(word),normalize(lemma)].filter(Boolean),exact=textKey(example);
    let best=null,bestScore=-1;
    for(const p of new Set(forms.flatMap(matchingPairs))){const score=(exact&&p.normalizedText===exact?10000:0)+(lessonId&&p.lessonId===lessonId?500:0)+(p.date===day().date?100:0)+(exact&&p.normalizedText.includes(exact)?80:0)+(p.forms.some(w=>forms.includes(w))?50:0)+(p.exampleSource!=='原文语境'?10:0);if(score>bestScore||score===bestScore&&p.order<best.order){best=p;bestScore=score;}}
    return best;
  }
  function exactPair(word,lessonId,example,lemma=''){if(!textKey(example))return null;const p=findPair(word,lessonId,example,lemma);return p&&p.normalizedText===textKey(example)?p:null;}
  function findStudyPair(word,lessonId='',lemma=''){
    const forms=[normalize(word),normalize(lemma)].filter(Boolean);
    let best=null,bestScore=-1;
    for(const p of new Set(forms.flatMap(w=>[...(studyPairs.get(w)||[])]))){const score=p.rank*2000+(p.lessonId===lessonId?500:0)+(p.date===day().date?100:0)+(p.exampleSource==='学习例句'?50:0);if(score>bestScore||score===bestScore&&p.order<best.order){best=p;bestScore=score;}}
    return best||findPair(word,lessonId,'',lemma);
  }
  function sameContext(a,b){return textKey(a.example)===textKey(b.example)&&(a.lessonId||'')===(b.lessonId||'');}
  function resolveEntry(entry,word=entry?.word,lemma=''){
    const result={...entry,contexts:(entry?.contexts||[]).map(c=>({...c}))};
    function fill(c){const row={...c,exampleZh:String(c.exampleZh||'')},p=row.example&&!row.exampleZh?exactPair(word,row.lessonId,row.example,lemma):null;return p?{...row,exampleZh:p.exampleZh,exampleSource:row.exampleSource||p.exampleSource}:row;}
    Object.assign(result,fill(result));result.contexts=result.contexts.map(fill);
    const p=findStudyPair(word,result.lessonId,lemma);
    if(p){
      if(p.rank&&!result.example&&!result.exampleZh)Object.assign(result,{example:p.example,exampleZh:p.exampleZh,exampleSource:p.exampleSource,lessonId:result.lessonId||p.lessonId});
      if(result.contexts.length<20&&!result.contexts.some(c=>sameContext(c,p)))result.contexts.push({example:p.example,exampleZh:p.exampleZh,exampleSource:p.exampleSource,lessonId:p.lessonId,date:day().date});
    }
    return result;
  }
  function upgradeSaved(word,lemma=''){
    const previous=saved.personalWords[word];if(!previous)return null;
    const next=resolveEntry(previous,word,lemma);if(JSON.stringify(next)===JSON.stringify(previous))return previous;
    saved.personalWords[word]=next;if(!persist()){saved.personalWords[word]=previous;return previous}return next;
  }
  const box=document.createElement('section');box.id='word-lookup';box.hidden=true;box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','查词与加入生词本');box.innerHTML='<div class="lookup-top"><b>选词查询</b><button type="button" data-word-action="close" aria-label="关闭查词">×</button></div><div id="lookup-body" aria-live="polite"></div>';document.body.append(box);
  function bucket(word){let h=2166136261;for(let i=0;i<word.length;i++)h=Math.imul(h^word.charCodeAt(i),16777619);return (h&127).toString(16).padStart(2,'0');}
  function dictionaryEntry(word){
    const course=window.CET_COURSE_DICTIONARY;if(course&&Object.hasOwn(course,word)){const r=course[word];return{meaning:r[0],phonetic:r[1]||'',tag:r[2]||'',...(r[3]?{lemma:r[3]}:{})};}
    const old=window.CET_DICTIONARY_SHARDS?.[word[0]];if(old&&Object.hasOwn(old,word))return old[word];
    const data=window.CET_DICTIONARY_FAST?.[bucket(word)];if(!data||!Object.hasOwn(data,word))return null;
    const r=data[word];return{meaning:r[0],phonetic:r[1],tag:r[2],...(r[3]?{lemma:r[3]}:{})};
  }
  function shard(word){
    const key=bucket(word);if(window.CET_DICTIONARY_FAST?.[key]||window.CET_DICTIONARY_SHARDS?.[word[0]])return Promise.resolve();
    if(loads.has(key))return loads.get(key);
    const request=new Promise((resolve,reject)=>{const s=document.createElement('script');let done=false;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);s.onload=s.onerror=null;if(error){s.remove();loads.delete(key);reject(error)}else resolve()};
      const timer=setTimeout(()=>finish(Error('词义加载超时，请点重试。')),12000);
      s.src='dictionary-fast-v1-'+key+'.js';s.onload=()=>finish(window.CET_DICTIONARY_FAST?.[key]?null:Error('词库未加载完整，请点重试。'));s.onerror=()=>finish(Error('词典未加载，请检查网络后重试。'));document.head.append(s);
    });loads.set(key,request);return request;
  }
  function immediateDefinition(w){if(local.has(w))return{...local.get(w),word:w};if(dictionaryCache.has(w))return dictionaryCache.get(w);const r=dictionaryEntry(w);return r?{...r,word:w,source:'ECDICT本地词典'}:null;}
  window.StudyLoader?.onDictionary(()=>{
    if(!current?.loading)return;const ready=immediateDefinition(current.word);
    if(!ready&&!window.CET_COURSE_MISSING?.has(current.word))return;
    rememberDrafts();ticket++;current.result=ready;current.loading=false;current.error='';
    draw();
  });
  async function lookup(word){
    const w=normalize(word);if(!valid(w))return null;
    let r=immediateDefinition(w);if(!r){if(window.CET_COURSE_MISSING?.has(w)||w.includes(' '))return null;await shard(w);const row=dictionaryEntry(w);if(!row)return null;r={...row,word:w,source:'ECDICT本地词典'};dictionaryCache.set(w,r);}
    // A second network request for the lemma must never hold up the selected word.
    if(r.lemma&&r.lemma!==w){const base=dictionaryEntry(r.lemma);if(base&&!r.meaning.includes('\n\n原形 '))r={...r,meaning:r.meaning+'\n\n原形 '+r.lemma+'：\n'+base.meaning};}
    const p=findStudyPair(w,current?.lessonId||'',r.lemma);return{...r,...(p?{example:p.example,exampleZh:p.exampleZh,exampleSource:p.exampleSource}:{})};
  }
  function sentence(text,word){text=String(text||'').replace(/\s+/g,' ').trim();const at=text.toLowerCase().indexOf(word.toLowerCase());if(at<0)return text;const before=text.slice(0,at),from=Math.max(before.lastIndexOf('. '),before.lastIndexOf('? '),before.lastIndexOf('! '));const tail=text.slice(at+word.length),end=tail.search(/[.!?](?:\s|$)/);return text.slice(from<0?0:from+2,end<0?text.length:at+word.length+end+1);}
  function contextText(node){
    if(!node)return '';
    function read(n){
      if(n.nodeType===3)return n.textContent;
      if(n.nodeType!==1)return '';
      if(n.matches('.inline-cloze-slot')){
        const select=n.querySelector('select'),word=select?.selectedOptions?.[0]?.dataset.word;
        return ' '+(word||'__'+n.dataset.blankNumber+'__')+' ';
      }
      if(n.matches('select,option,textarea,script,style'))return '';
      return Array.from(n.childNodes,read).join('');
    }
    return read(node).replace(/\s+([,.;:!?])/g,'$1');
  }
  function hide(restore=true){
    box.hidden=true;ticket++;current=null;window.EnglishPronunciation?.stop();
    window.getSelection()?.removeAllRanges();
    if(restore){
      if(returnFocus?.isConnected){if(!returnFocus.matches('button,a[href],input,textarea,select,summary,[tabindex]'))returnFocus.setAttribute('tabindex','-1');returnFocus.focus({preventScroll:true})}
      else restoreLearningFocus(returnSnapshot);
    }
    returnFocus=null;returnSnapshot=null;lastRect=null;
  }
  function position(rect){
    const vp=window.visualViewport,left=vp?.offsetLeft||0,topEdge=vp?.offsetTop||0,w=vp?.width||innerWidth,h=vp?.height||innerHeight,width=Math.min(410,w-24);
    box.style.width=width+'px';box.style.left=Math.max(left+12,Math.min(rect?.left??left+w-width-24,left+w-width-12))+'px';
    const top=Math.max(topEdge+12,Math.min((rect?.bottom??topEdge+60)+10,topEdge+h-340));box.style.top=top+'px';box.style.maxHeight=Math.max(80,topEdge+h-top-12)+'px';
  }
  function rememberDrafts(){
    if(!current)return;
    for(const [key,id] of [['meaning','lookup-meaning-edit'],['example','lookup-example-edit'],['exampleZh','lookup-example-zh-edit']]){
      const node=$('#'+id);if(current.rendered?.[key]!==undefined&&node&&node.value!==current.rendered[key])current.drafts[key]=node.value;
    }
  }
  function pronunciationPos(word,lessonId=''){
    for(const group of Object.values(content.dailyVocabulary||{})){
      const card=(group.cards||[]).find(c=>normalize(c.word)===normalize(word)&&c.lessonId===lessonId);
      if(card?.pos)return card.pos;
    }
    return '';
  }
  function pronunciationLabel(word,pos=''){return window.EnglishPronunciation?.label?.(word,pos)||(window.EnglishPronunciation?.entry(word)?'听真人发音':'查找真人发音');}
  function pronunciationExampleMarkup(word,id){const r=window.EnglishPronunciation?.entry(word);if(r?.recordingScope!=='example'||!r.exampleText)return '';return panel(id,'真人录音原句',`<p class="word-example-small">${esc(r.exampleText)}</p>${r.exampleZh?panel(id+'-zh','显示录音原句中文',`<p>${esc(r.exampleZh)}</p>`,'translation-panel'):''}`,'pronunciation-context').replace('<details ',`<details data-pronunciation-word="${esc(normalize(word))}" `);}
  function bilingualMarkup(pair,id,translationClass='notebook-example-translation'){
    return `<p class="text-note">${esc(pair.exampleSource||'双语例句')}</p><p class="word-example-small">${esc(pair.example)}</p>${panel(id,'显示'+(pair.exampleSource==='原文语境'?'语境':'例句')+'中文',`<p>${esc(pair.exampleZh)}</p>`,'translation-panel '+translationClass)}`;
  }
  function draw(){
    if(!current)return;rememberDrafts();const c=current,entry=saved.personalWords[c.word],r=c.result,focusBefore=captureLearningFocus(document.activeElement,box);
    const suggestion=findStudyPair(c.word,c.lessonId,r?.lemma);c.suggestion=suggestion;
    // Use a verified English/Chinese pair together; a paragraph translation must never label only one extracted sentence.
    if(!entry&&c.editContextIndex===undefined&&!Object.hasOwn(c.drafts,'example')&&!Object.hasOwn(c.drafts,'exampleZh')&&(!c.example||!c.exampleZh)&&suggestion){c.example=suggestion.example;c.exampleZh=suggestion.exampleZh;c.exampleSource=suggestion.exampleSource;c.exampleLessonId=suggestion.lessonId||c.lessonId;}
    const values={meaning:c.drafts.meaning??entry?.meaning??r?.meaning??'',example:c.drafts.example??c.example??'',exampleZh:c.drafts.exampleZh??c.exampleZh??''};c.rendered=values;
    $('#lookup-body').innerHTML=`<h3>${esc(c.word)}</h3>${c.loading?'<p role="status">正在查中文释义…</p>':r?`<p class="lookup-phonetic">${esc(r.phonetic||'')}${r.lemma?` · 原形 ${esc(r.lemma)}`:''}</p><p class="lookup-meaning">${esc(r.meaning)}</p><p class="text-note">${esc(r.source)}${r.tag?.includes('cet6')?' · 六级词汇':''}</p>`:`<p class="lookup-message">${esc(c.error||'词典暂未收录这个词或表达，可以填写中文释义后保存。')}</p>${c.error?'<button class="small-button" data-word-action="retry">重试查询</button>':''}`}<label for="lookup-meaning-edit">${r?'本句里的意思（可修改）':'中文释义'}</label><textarea id="lookup-meaning-edit" rows="2" maxlength="1800" placeholder="填写适合这句话的中文意思">${esc(values.meaning)}</textarea><label for="lookup-example-edit">${c.editContextIndex!==undefined?'收藏原句（可修改）':'英文例句（可修改）'}</label><textarea id="lookup-example-edit" rows="3" maxlength="6000" placeholder="填写完整英文例句">${esc(values.example)}</textarea><label for="lookup-example-zh-edit">例句中文译文（可修改）</label><textarea id="lookup-example-zh-edit" class="lookup-example-translation" rows="3" maxlength="6000" placeholder="填写与上面英文完整对应的中文译文">${esc(values.exampleZh)}</textarea>${!values.example||!values.exampleZh?'<p class="lookup-message">例句或译文暂缺也可先加入生词本，之后再补充。</p>':`<p class="text-note">${esc(c.exampleSource||'个人填写')}</p>`}${suggestion&&(textKey(suggestion.example)!==textKey(values.example)||!values.exampleZh)?`<details ${suggestion.rank?'open':''}><summary>${suggestion.rank?'课程学习例句':'原文语境'}</summary>${bilingualMarkup(suggestion,'lookup-suggestion-'+c.word,'lookup-example-translation')}<button class="small-button" data-word-action="use-example">使用这组双语例句</button></details>`:''}${c.captured?.example&&textKey(c.captured.example)!==textKey(values.example)?`<details><summary>保留的选词原句</summary><p class="word-example-small">${esc(c.captured.example)}</p>${c.captured.exampleZh?`<p class="word-context-translation">${esc(c.captured.exampleZh)}</p>`:'<p class="text-note">这条原句的逐句译文待补充；不会用整段中文代替。</p>'}</details>`:''}${pronunciationExampleMarkup(c.word,'lookup-recording-'+c.word)}<div class="lookup-pronunciation-status" role="status"></div><div class="lookup-actions"><button class="primary-button" data-word-action="save" ${c.loading?'disabled':''}>${entry?'保存修改':'加入生词本'}</button><button class="small-button" data-word-action="speak" >${pronunciationLabel(c.word,pronunciationPos(c.word,c.lessonId))}</button></div><button class="text-button" data-word-action="notebook">打开生词本${Object.keys(saved.personalWords).length?'（'+Object.keys(saved.personalWords).length+'）':''}</button>`;
    restoreLearningFocus(focusBefore,box);
  }
  async function open(word,example='',rect=null,lessonId=null,origin=null,options={}){
    const w=normalize(word);if(!valid(w))return;
    if(room&&isFullMock()&&!mockReview){toast('模考期间先独立作答，完成后再查词。');return}
    const stage=room?steps()[stepIndex]:null,card=stage?.id==='vocabulary'?cardsForDay()[wordIndex]:null;
    if(card&&normalize(example)===w)example=card.example||example;
    const locationId=card?.lessonId||(stage?.id==='vocabulary'?'词卡 '+(day().vocabGroups||[]).join('/'):stage?.id==='warmup'?'今天的开场':stage?.id==='writing'?'写译练习 '+(day().writing?.ids?.[writingIndex]||''):stage&&(stage.kind==='reading'||['listening','reading'].includes(stage.id))?activeLesson:'');
    const known=immediateDefinition(w),entry=upgradeSaved(w,saved.personalWords[w]?.lemma||known?.lemma||''),context=options.contextIndex!==undefined?entry?.contexts?.[options.contextIndex]:null,where=lessonId||context?.lessonId||entry?.lessonId||(example?locationId:''),raw=context?.example||sentence(example,w),exact=exactPair(w,where,raw),pair=findStudyPair(w,where);
    const initial=context||entry||(pair?.rank?pair:exact)||{},initialExample=initial.example||raw,initialZh=initial.exampleZh||exactPair(w,where,initialExample)?.exampleZh||'';
    if(box.hidden){returnFocus=origin||document.activeElement;returnSnapshot=captureLearningFocus(returnFocus)}
    const ready=entry?.meaning?{...known,...entry,source:entry.source||known?.source||'生词本'}:known;
    lastRect=rect;current={word:w,example:initialExample,exampleZh:initialZh,exampleSource:initial.exampleSource||exact?.exampleSource||'',exampleLessonId:initial.lessonId||where||pair?.lessonId||'',lessonId:where||pair?.lessonId||'',captured:raw?{example:raw,exampleZh:exact?.exampleZh||'',exampleSource:exact?.exampleSource||'收藏原句',lessonId:where,date:day().date}:null,date:day().date,result:ready,loading:!ready&&!window.CET_COURSE_MISSING?.has(w)&&!w.includes(' '),drafts:{},editContextIndex:options.contextIndex};const opened=current,id=++ticket;box.hidden=false;position(rect);draw();box.querySelector('[data-word-action="close"]').focus({preventScroll:true});
    if(!ready)await completeLookup(w,id);
    if(current!==opened)return;
    const contextLessons=[...new Set([where,...(entry?.contexts||[]).map(c=>c.lessonId)].filter(lid=>lessonBank[lid]&&window.StudyLoader&&!window.StudyLoader.isLessonReady(lid)))];
    if(contextLessons.length)window.StudyLoader.ensureLessons(contextLessons).then(()=>{
      if(current!==opened)return;rememberDrafts();const updated=upgradeSaved(w,current.result?.lemma);
      if(!Object.hasOwn(current.drafts,'exampleZh')&&updated?.exampleZh&&textKey(updated.example)===textKey(current.example))current.exampleZh=updated.exampleZh;draw();
    }).catch(()=>{});
    if(!where&&!findStudyPair(w,'',current.result?.lemma)?.rank&&window.StudyLoader){
      window.StudyLoader.warmDictionary().then(()=>{
        if(current!==opened)return;const source=window.StudyLoader.lessonForWord(w,current.result?.lemma);
        return source?window.StudyLoader.ensureLessons([source]).then(()=>{if(current!==opened)return;rememberDrafts();upgradeSaved(w,current.result?.lemma);draw();}):null;
      }).catch(()=>{});
    }
  }
  async function completeLookup(word,id){
    try{const r=await lookup(word);if(id!==ticket)return;rememberDrafts();current.result=r;current.loading=false;current.error='';upgradeSaved(word,r?.lemma);draw()}catch(e){if(id!==ticket)return;current.loading=false;current.error=e.message;draw()}
  }
  async function retryLookup(){
    if(!current||current.loading)return;rememberDrafts();current.loading=true;current.error='';draw();await completeLookup(current.word,++ticket);
  }
  function onRender(){
    if(room&&isFullMock()&&!mockReview)return;
    const words=Object.keys(saved.personalWords).filter(w=>/^[a-z][a-z'-]*$/.test(w));if(!words.length)return;
    const set=new Set(words);for(const node of document.querySelectorAll('#app .passage-text,#app .question-prompt,#app .option span,#app .word-example,#app .word-example-small,#app .warmup-english,#app .writing-prompt')){
      const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);const texts=[];while(walker.nextNode())if(!walker.currentNode.parentElement.closest('mark,textarea,script,select,option'))texts.push(walker.currentNode);
      for(const t of texts){const matches=[...t.textContent.matchAll(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g)].filter(m=>set.has(normalize(m[0])));if(!matches.length)continue;const frag=document.createDocumentFragment();let last=0;for(const m of matches){frag.append(t.textContent.slice(last,m.index));const mark=document.createElement('mark');mark.className='personal-word';mark.dataset.word=normalize(m[0]);mark.textContent=m[0];mark.title='已加入生词本';mark.tabIndex=0;frag.append(mark);last=m.index+m[0].length}frag.append(t.textContent.slice(last));t.replaceWith(frag)}
    }
  }
  function save(){
    if(!current||current.loading)return;rememberDrafts();const c=current,meaning=$('#lookup-meaning-edit').value.trim(),example=$('#lookup-example-edit').value.trim(),exampleZh=$('#lookup-example-zh-edit').value.trim();
    if(!meaning){toast('请填写中文释义。');return}if(example.length>6000||exampleZh.length>6000){toast('例句或译文过长，请使用不超过6000字的完整句段。');return}
    const previous=saved.personalWords[c.word],contexts=(previous?.contexts||[]).map(x=>({...x})),now=new Date().toISOString();
    function add(row,replace=false){if(!row?.example)return;const value={...row,exampleZh:String(row.exampleZh||'')},at=contexts.findIndex(x=>sameContext(x,value));if(at<0)contexts.unshift(value);else if(replace)contexts[at]={...contexts[at],...value};else if(!contexts[at].exampleZh&&value.exampleZh)contexts[at]={...contexts[at],exampleZh:value.exampleZh,exampleSource:contexts[at].exampleSource||value.exampleSource};}
    if(previous?.example)add({example:previous.example,exampleZh:previous.exampleZh||'',exampleSource:previous.exampleSource||'收藏原句',lessonId:previous.lessonId||'',date:previous.createdAt?.slice(0,10)||c.date});
    add(c.captured);
    const unchangedExample=textKey(example)===textKey(c.example)&&textKey(exampleZh)===textKey(c.exampleZh),exampleLessonId=unchangedExample?c.exampleLessonId||c.lessonId:c.lessonId;
    const pair={example,exampleZh,exampleSource:unchangedExample?c.exampleSource||'个人填写':'个人填写',lessonId:exampleLessonId,date:c.date};add(pair,true);
    let main={example,exampleZh,exampleSource:pair.exampleSource,lessonId:exampleLessonId||previous?.lessonId||''};
    if(c.editContextIndex!==undefined&&previous){main={example:previous.example||'',exampleZh:previous.exampleZh||'',exampleSource:previous.exampleSource||'',lessonId:previous.lessonId||''};if(textKey(previous.example)===textKey(example))main={...main,exampleZh,exampleSource:pair.exampleSource};}
    saved.personalWords[c.word]={...previous,word:c.word,meaning,phonetic:previous?.phonetic||c.result?.phonetic||'',source:previous?.source||c.result?.source||'个人填写',lemma:previous?.lemma||c.result?.lemma||'',...main,contexts:contexts.slice(0,20),createdAt:previous?.createdAt||now,updatedAt:now,reviewed:previous?.reviewed||false};
    // Enrich checked contexts without changing the main fields the learner just submitted (including explicit blanks).
    const enriched=resolveEntry(saved.personalWords[c.word],c.word,saved.personalWords[c.word].lemma);saved.personalWords[c.word].contexts=enriched.contexts;
    if(!persist()){if(previous)saved.personalWords[c.word]=previous;else delete saved.personalWords[c.word];return}render();draw();toast(previous?'已保存修改。':'已加入生词本。');
  }
  async function playHumanLookup(button){
    const word=button.dataset.word||current?.word||'',entry=saved.personalWords[word],pos=button.dataset.pos||pronunciationPos(word,current?.lessonId||entry?.lessonId||''),token=current;
    const status=button.closest('#word-lookup')?.querySelector('.lookup-pronunciation-status')||button.closest('.notebook-word')?.querySelector('.lookup-pronunciation-status');
    button.disabled=true;button.setAttribute('aria-busy','true');const old=button.textContent;button.textContent='正在找真人录音…';
    if(status)status.textContent='';
    const api=window.EnglishPronunciation;
    const result=api?.playLookup?await api.playLookup(word,pos,current?.word===word?current.result?.lemma:entry?.lemma):null;
    if(!api?.playLookup)speak(word,false,pos);
    if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.textContent=api?.label?.(word,pos)||old;}
    if(!result)return;
    if(result.error){if(status){status.textContent=result.error+' ';const link=document.createElement('a');link.textContent='打开词典查发音';link.href='https://dictionary.cambridge.org/dictionary/english/'+encodeURIComponent(word.replace(/ /g,'-'));link.target='_blank';link.rel='noopener';status.append(link);if(/[ -]/.test(word)){status.append(' · 分词听：');for(const part of word.split(/[ -]+/)){const b=document.createElement('button');b.className='text-button';b.dataset.wordAction='speak';b.dataset.word=part;b.textContent=part;status.append(b)}}}else toast(result.error);return;}
    const r=result.record;if(status){status.textContent=(r.spokenLemma?'原形 '+r.spokenLemma+' · ':'')+(r.dialect||'英语')+' · '+(r.recordingScope==='example'?'含目标词的真人例句':'真人录音')+' ';const link=document.createElement('a');link.textContent='录音来源';link.href=r.sourceUrl;link.target='_blank';link.rel='noopener';status.append(link);}
    if(typeof showPronunciationExample==='function')showPronunciationExample(word);
  }
  function renderNotebook(){
    window.StudyLoader?.warmDictionary();
    const entries=Object.values(saved.personalWords).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))),shown=entries.filter(w=>(w.word+' '+w.meaning).toLowerCase().includes(filter.toLowerCase()));
    function article(original){
      const w=resolveEntry(original,original.word,original.lemma),study=findStudyPair(w.word,w.lessonId,w.lemma),primary=study?.rank?study:w.example&&w.exampleZh?w:w.contexts.find(c=>c.example&&c.exampleZh),other=w.contexts.map((c,index)=>({...c,index})).filter(c=>c.example&&(!primary||textKey(c.example)!==textKey(primary.example)||c.exampleZh!==primary.exampleZh));
      if(w.example&&(!primary||textKey(w.example)!==textKey(primary.example))&&!other.some(c=>textKey(c.example)===textKey(w.example)))other.unshift({example:w.example,exampleZh:w.exampleZh||'',exampleSource:w.exampleSource||'收藏原句',lessonId:w.lessonId,date:w.createdAt?.slice(0,10)||'',index:-1});
      return `<article class="notebook-word ${w.reviewed?'reviewed':''}"><div class="lookup-pronunciation-status" role="status"></div><div class="notebook-heading"><h2>${esc(w.word)}</h2><span>${esc(w.phonetic)}</span><button class="small-button" data-word-action="speak" data-word="${esc(w.word)}" data-pos="${esc(pronunciationPos(w.word,w.lessonId))}" >${pronunciationLabel(w.word,pronunciationPos(w.word,w.lessonId))}</button><button class="text-button" data-word-action="open" data-word="${esc(w.word)}">查看/修改</button><button class="small-button" data-word-action="review" data-word="${esc(w.word)}">${w.reviewed?'已复习':'标记已复习'}</button><button class="text-button" data-word-action="remove" data-word="${esc(w.word)}">移出</button></div>${panel('personal-'+w.word,'中文释义',`<p>${esc(w.meaning)}</p>`)}${primary?(['原文语境','原文例句','题目原句','选项原句'].includes(primary.exampleSource)?panel('personal-context-'+w.word,'原文语境',bilingualMarkup(primary,'personal-example-'+w.word)):bilingualMarkup(primary,'personal-example-'+w.word)):'<p class="lookup-message">暂无已核对的双语例句，请点“查看/修改”补充英文例句和中文译文。</p>'}${pronunciationExampleMarkup(w.word,'notebook-recording-'+w.word)}${other.length?panel('contexts-'+w.word,'其他原句（'+other.length+'）',other.map(c=>`<div class="word-notebook-context"><p class="text-note">${esc(c.exampleSource||'收藏原句')}</p><p class="word-example-small">${esc(c.example)}</p>${c.exampleZh?panel('context-'+w.word+'-'+c.index,'显示原句中文',`<p>${esc(c.exampleZh)}</p>`,'translation-panel word-context-translation'):'<p class="text-note">这条原句的译文待补充。</p>'}<p class="text-note">${esc(c.lessonId)} · ${esc(c.date)}</p><button class="text-button" data-word-action="edit-context" data-word="${esc(w.word)}" data-context-index="${c.index}">${c.exampleZh?'修改这条原句与译文':'补充这条原句的译文'}</button></div>`).join('')):''}<p class="text-note">${esc(w.lessonId||'手动查词')} · ${esc(w.source)} · ${esc(String(w.createdAt||'').slice(0,10))}</p></article>`;
    }
    return `<h1 class="view-title">我的生词本</h1>${window.NotebookRecovery?.renderTools()||''}<div class="word-notebook-tools"><label>查词或表达<input id="notebook-lookup" type="text" maxlength="70" placeholder="英文单词或短语" autocomplete="off"></label><button class="primary-button" data-word-action="lookup-input">查词</button><button class="secondary-button" data-action="export">导出学习记录</button><button class="secondary-button" data-action="import">导入学习记录</button></div><label class="notebook-search">搜索已收藏的词<input id="notebook-filter" type="search" placeholder="英文或中文" value="${esc(filter)}"></label><p class="text-note">已收藏${entries.length}个 · 显示${shown.length}个</p><div class="notebook-list">${shown.length?shown.map(article).join(''):'<div class="empty-note">暂无符合条件的生词</div>'}</div><p class="text-note">词典：<a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noopener">ECDICT</a></p>`;
  }
  document.addEventListener('pointerdown',e=>{if(!box.hidden&&!e.target.closest('#word-lookup'))hide(false)});
  document.addEventListener('pointerup',e=>{if(!window.StudyMarks?.isLookupMode())return;if(e.target.closest('#word-lookup,input,textarea,select,option,.notebook-list'))return;setTimeout(()=>{const selection=window.getSelection(),word=normalize(selection?.toString());if(!word||!valid(word)||!selection.rangeCount)return;const anchor=selection.anchorNode?.parentElement;if(!anchor?.closest('#app'))return;const container=anchor.closest('.passage-text,.question-prompt,.option,.word-example,.warmup-english,.writing-prompt,.word-bank')||anchor;open(word,contextText(container),selection.getRangeAt(0).getBoundingClientRect(),null,container)},0)});
  document.addEventListener('click',e=>{const mark=e.target.closest('mark.personal-word');if(mark&&window.StudyMarks?.isLookupMode()){e.preventDefault();e.stopImmediatePropagation();open(mark.dataset.word,contextText(mark.closest('p,.option')),mark.getBoundingClientRect(),null,mark);return}if(e.target.closest('.option')&&valid(normalize(window.getSelection()?.toString()))){e.preventDefault();e.stopImmediatePropagation()}},true);
  document.addEventListener('keydown',e=>{
    if(!box.hidden){
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();hide();return}
      if(e.key==='Tab'){
        const items=Array.from(box.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')).filter(el=>el.getClientRects().length),first=items[0],last=items.at(-1);
        if(first&&(!box.contains(document.activeElement)||(e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last))){e.preventDefault();(e.shiftKey?last:first).focus()}
        e.stopPropagation();return;
      }
      if(e.target.closest('#word-lookup'))return;
    }
    const mark=e.target.closest('mark.personal-word');if(mark&&window.StudyMarks?.isLookupMode()&&['Enter',' '].includes(e.key)){e.preventDefault();open(mark.dataset.word,contextText(mark.closest('p,.option')),mark.getBoundingClientRect(),null,mark)}
    if(e.target.id==='notebook-lookup'&&e.key==='Enter'){e.preventDefault();open(e.target.value,'',null,null,e.target)}if(e.target.id==='notebook-filter'&&e.key==='Enter'){filter=e.target.value;render()}
  },true);
  document.addEventListener('click',e=>{const b=e.target.closest('[data-word-action]');if(!b)return;const a=b.dataset.wordAction;if(a==='close')hide();else if(a==='retry')retryLookup();else if(a==='save')save();else if(a==='use-example'){rememberDrafts();const p=current?.suggestion;if(p){current.drafts.example=p.example;current.drafts.exampleZh=p.exampleZh;current.example=p.example;current.exampleZh=p.exampleZh;current.exampleSource=p.exampleSource;current.lessonId=p.lessonId||current.lessonId;current.exampleLessonId=current.lessonId;draw()}}else if(a==='speak')playHumanLookup(b);else if(a==='notebook'){hide(false);room=false;view='words';audio.pause();$('#audio-dock').hidden=true;render();window.scrollTo(0,0)}else if(a==='lookup-input'){const w=$('#notebook-lookup').value;if(!valid(normalize(w)))toast('请输入英文单词或短语。');else open(w,'',null,null,b)}else if(a==='open')open(b.dataset.word,saved.personalWords[b.dataset.word]?.example,null,saved.personalWords[b.dataset.word]?.lessonId,b);else if(a==='edit-context'){const index=+b.dataset.contextIndex,entry=saved.personalWords[b.dataset.word],c=index<0?entry:resolveEntry(entry,entry.word,entry.lemma).contexts[index];open(b.dataset.word,c?.example||'',null,c?.lessonId||'',b,index<0?{}:{contextIndex:index})}else if(a==='review'){const w=saved.personalWords[b.dataset.word];w.reviewed=!w.reviewed;w.updatedAt=new Date().toISOString();persist();render()}else if(a==='remove'){delete saved.personalWords[b.dataset.word];persist();render();toast('已移出。')}});
  document.addEventListener('input',e=>{if(!current)return;const fields={'lookup-meaning-edit':'meaning','lookup-example-edit':'example','lookup-example-zh-edit':'exampleZh'};if(Object.hasOwn(fields,e.target.id))current.drafts[fields[e.target.id]]=e.target.value;});
  document.addEventListener('change',e=>{if(e.target.id==='notebook-filter'){filter=e.target.value;render()}});
  document.addEventListener('click',e=>{if(e.target.closest('[data-view],[data-action="step"],[data-action="next-step"],[data-action="exit-room"]'))hide(false)});
  const reposition=()=>{if(!box.hidden)position(lastRect)};window.addEventListener('resize',reposition);window.visualViewport?.addEventListener('resize',reposition);window.visualViewport?.addEventListener('scroll',reposition);
  onRender();return {render:renderNotebook,onRender,lookup,normalize,open,resolveEntry,exampleFor:findStudyPair};
})();
