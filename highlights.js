'use strict';
/* Learner-owned text annotations. Translation requires an explicit action. */
window.StudyMarks=(()=>{
  const kinds=[['passage','.passage-text'],['prompt','.question-prompt'],['option','.option span'],['word','.word-en'],['example','.word-example'],['example-small','.word-example-small'],['warmup','.warmup-english'],['writing','.writing-prompt'],['bank','.word-bank span'],['panel','.panel-body p']];
  const selector=kinds.map(([,css])=>css).join(',');
  let mode='highlight',lastScope=null,pending=null,pointerType='mouse',selectionTimer=null;
  const popup=document.createElement('section');popup.id='mark-tools-popover';popup.hidden=true;popup.setAttribute('role','toolbar');popup.setAttribute('aria-label','文字标记操作');document.body.append(popup);
  const canLookup=text=>/^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,3}$/i.test(String(text).trim().replace(/[’‘]/g,"'"))&&text.length<=70;
  function scope(){
    if(!room||isFullMock()&&!mockReview)return null;
    const step=steps()[stepIndex];if(!step)return null;
    if(step.id==='vocabulary'){const card=cardsForDay()[wordIndex];return card?'vocab-'+card.group+'-'+card.word:null;}
    if(step.id==='listening'||step.id==='reading'||step.kind==='reading')return activeLesson;
    if(step.id==='writing')return 'writing-'+(day().writing?.ids?.[writingIndex]||'draft');
    return step.id==='warmup'?'warmup':null;
  }
  function hash(text){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(36);}
  function textNodes(node){const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode()){const t=walker.currentNode;if(!t.parentElement.closest('.inline-cloze-slot,select,option,input,textarea,script,style'))nodes.push(t);}return nodes;}
  function metadata(node){
    const currentScope=scope();if(!currentScope)return null;
    const kind=kinds.find(([,css])=>node.matches(css));if(!kind)return null;
    const root=node.closest('details[data-panel],.question-block,.transcript-evidence,.reading-passage,.word-board')||$('#app');
    const rootId=root.dataset.panel||root.id||(root.matches('.reading-passage')?'reading':root.matches('.word-board')?'word-card':'stage');
    const peers=[...root.querySelectorAll(kind[1])],index=peers.indexOf(node),text=textNodes(node).map(t=>t.textContent).join('');
    const prefix=day().date+'|'+currentScope+'|'+kind[0]+'|',suffix='|'+hash(text),legacyKey=prefix+rootId+'|'+index+suffix;
    let key=legacyKey,aliases=[legacyKey];
    // The fixed window is another view of the same question, not a new annotation target.
    const question=/^(?:question|pinned)-(.+)-(\d+)$/.exec(rootId);
    if(['prompt','option'].includes(kind[0])&&question&&question[1]===currentScope){
      const questionId='question-'+question[1]+'-'+question[2],letter=node.closest('.option')?.dataset.letter;
      const identity=kind[0]==='option'&&/^[A-O]$/.test(letter||'')?'letter-'+letter:String(index);
      key=prefix+questionId+'|'+identity+suffix;
      aliases=[...new Set([key,prefix+questionId+'|'+index+suffix,prefix+'pinned-'+question[1]+'-'+question[2]+'|'+index+suffix])];
    }
    node.dataset.annotationKey=key;
    return {node,key,aliases,text,date:day().date,scope:currentScope};
  }
  function recordsFor(data){
    return Object.entries(saved.highlights).filter(([,m])=>m&&(data.aliases||[data.key]).includes(m.key)&&m.date===data.date&&m.scope===data.scope&&Number.isInteger(m.start)&&Number.isInteger(m.end)&&m.start>=0&&m.end>m.start&&m.end<=data.text.length&&m.text===data.text.slice(m.start,m.end)).sort((a,b)=>a[1].start-b[1].start);
  }
  function container(node){const element=node?.nodeType===1?node:node?.parentElement;return element?.closest(selector);}
  function selectionData(){
    const selection=window.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return null;
    const range=selection.getRangeAt(0),node=container(range.startContainer);if(!node||!node.closest('#app')||node!==container(range.endContainer))return null;
    const data=metadata(node);if(!data)return null;
    let offset=0,start=null,end=null;
    for(const t of textNodes(node)){
      if(t===range.startContainer)start=offset+range.startOffset;
      if(t===range.endContainer)end=offset+range.endOffset;
      offset+=t.textContent.length;
    }
    if(start===null||end===null||end<=start||end-start>4000)return null;
    while(start<end&&/\s/.test(data.text[start]))start++;
    while(end>start&&/\s/.test(data.text[end-1]))end--;
    if(start===end)return null;
    return {...data,start,end,selectedText:data.text.slice(start,end),rect:range.getBoundingClientRect(),ids:[]};
  }
  function hide(restore=false){
    const previous=pending;popup.hidden=true;pending=null;
    if(restore&&previous){const node=[...document.querySelectorAll('#app [data-annotation-key]')].find(n=>n.dataset.annotationKey===previous.key);if(node){node.setAttribute('tabindex','-1');node.focus({preventScroll:true});}}
  }
  function position(rect){
    const vp=window.visualViewport,left=vp?.offsetLeft||0,top=vp?.offsetTop||0,w=vp?.width||innerWidth,h=vp?.height||innerHeight,width=Math.min(264,w-24);
    popup.style.width=width+'px';popup.style.left=Math.max(left+12,Math.min(rect.left,left+w-width-12))+'px';
    popup.style.top=Math.max(top+12,Math.min(rect.bottom+8,top+h-popup.offsetHeight-12))+'px';popup.style.maxHeight=Math.max(100,h-24)+'px';
  }
  function show(data,focus=false,error=false){
    pending=data;popup.hidden=false;
    popup.innerHTML='<div class="mark-popover-heading"><b>文字标记</b><button class="text-button" data-mark-action="close" aria-label="关闭标记操作">×</button></div><p class="mark-preview">'+esc(data.selectedText.slice(0,100))+'</p><div class="mark-popover-actions"><button class="small-button" data-mark-action="'+(data.ids.length?'remove':'apply')+'" '+(error?'data-state="error"':'')+'>'+(error?'重试保存':data.ids.length?'取消高亮':'高亮标记')+'</button><button class="small-button" data-mark-action="translate" '+(canLookup(data.selectedText)?'':'disabled')+'>查词翻译</button></div>';
    position(data.rect);if(focus)popup.querySelector('[data-mark-action="'+(data.ids.length?'remove':'apply')+'"]').focus({preventScroll:true});
  }
  function clearSelection(){window.getSelection()?.removeAllRanges();}
  function add(data){
    let start=data.start,end=data.end;const previous={...saved.highlights},records=recordsFor(data),merged=new Set();
    // Include every connected old/new range, even when an earlier alias is reached through another range.
    let changed=true;while(changed){changed=false;for(const [id,m] of records){if(!merged.has(id)&&m.start<=end&&m.end>=start){start=Math.min(start,m.start);end=Math.max(end,m.end);merged.add(id);changed=true;}}}
    for(const id of merged)delete saved.highlights[id];
    const id='hl-'+(window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));const now=new Date().toISOString();
    saved.highlights[id]={id,key:data.key,date:data.date,scope:data.scope,start,end,text:data.text.slice(start,end),createdAt:now,updatedAt:now};
    if(!persist()){saved.highlights=previous;show(data,false,true);return false;}
    clearSelection();hide();render();return true;
  }
  function remove(data){
    const previous={...saved.highlights};for(const id of data.ids)delete saved.highlights[id];
    if(!persist()){saved.highlights=previous;show(data,false,true);return false;}
    const key=data.key;clearSelection();hide();render();const node=[...document.querySelectorAll('#app [data-annotation-key]')].find(n=>n.dataset.annotationKey===key);if(node){node.setAttribute('tabindex','-1');node.focus({preventScroll:true});}return true;
  }
  function paint(node,data){
    const records=recordsFor(data);
    const ranges=[];for(const [id,m] of records){const last=ranges.at(-1);if(last&&m.start<=last.end){last.end=Math.max(last.end,m.end);last.ids.push(id);}else ranges.push({start:m.start,end:m.end,ids:[id]});}
    if(!ranges.length)return;
    let offset=0;for(const t of textNodes(node)){
      const text=t.textContent,from=offset,to=offset+text.length;offset=to;
      const intersections=ranges.filter(r=>r.start<to&&r.end>from);if(!intersections.length)continue;
      const frag=document.createDocumentFragment();let cursor=0;
      for(const r of intersections){const a=Math.max(0,r.start-from),b=Math.min(text.length,r.end-from);frag.append(text.slice(cursor,a));const mark=document.createElement('mark');mark.className='study-highlight';mark.dataset.highlightIds=r.ids.join(',');mark.tabIndex=0;mark.setAttribute('role','button');mark.setAttribute('aria-label','高亮标记：'+data.text.slice(r.start,r.end));mark.title='高亮标记';mark.textContent=text.slice(a,b);frag.append(mark);cursor=b;}
      frag.append(text.slice(cursor));t.replaceWith(frag);
    }
  }
  function controls(){return room&&(!isFullMock()||mockReview)?'<div class="annotation-mode" role="group" aria-label="文字标记方式"><button class="small-button" data-mark-action="mode" data-mark-mode="highlight" aria-pressed="'+(mode==='highlight')+'">高亮标记</button><button class="small-button" data-mark-action="mode" data-mark-mode="lookup" aria-pressed="'+(mode==='lookup')+'">查词翻译</button></div>':'';}
  function onRender(){
    hide();const currentScope=scope(),page=day().date+'|'+currentScope;
    if(page!==lastScope)mode='highlight';lastScope=page;
    document.body.classList.toggle('text-lookup-mode',mode==='lookup');
    document.querySelectorAll('[data-mark-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.markMode===mode)));
    if(!currentScope)return;
    for(const node of document.querySelectorAll('#app '+selector.split(',').join(',#app '))){const data=metadata(node);if(data)paint(node,data);}
  }
  function activateMark(mark){
    const node=container(mark),data=node&&metadata(node);if(!data)return;
    const ids=mark.dataset.highlightIds.split(',').filter(id=>saved.highlights[id]);if(!ids.length)return;
    const records=ids.map(id=>saved.highlights[id]),start=Math.min(...records.map(m=>m.start)),end=Math.max(...records.map(m=>m.end));
    show({...data,start,end,selectedText:data.text.slice(start,end),rect:mark.getBoundingClientRect(),ids},true);
  }
  document.addEventListener('pointerdown',e=>{pointerType=e.pointerType||'mouse';if(!popup.hidden&&!e.target.closest('#mark-tools-popover'))hide();});
  document.addEventListener('pointerup',e=>{
    if(mode!=='highlight'||e.target.closest('#mark-tools-popover,#word-lookup,input,textarea,select,option'))return;
    setTimeout(()=>{const data=selectionData();if(!data)return;if(pointerType==='touch')show(data);else add(data);},0);
  });
  document.addEventListener('selectionchange',()=>{if(pointerType!=='touch'||mode!=='highlight')return;clearTimeout(selectionTimer);selectionTimer=setTimeout(()=>{const data=selectionData();if(data)show(data);},120);});
  document.addEventListener('click',e=>{
    if(e.target.closest('.option')&&window.getSelection()?.toString().trim()){e.preventDefault();e.stopImmediatePropagation();return;}
    const mark=e.target.closest('mark.study-highlight');if(mark){if(window.getSelection()?.toString().trim())return;e.preventDefault();e.stopImmediatePropagation();activateMark(mark);}
  },true);
  document.addEventListener('keydown',e=>{
    if(!popup.hidden&&e.key==='Escape'){e.preventDefault();hide(true);return;}
    const mark=e.target.closest('mark.study-highlight');if(mark&&['Enter',' '].includes(e.key)){e.preventDefault();activateMark(mark);}
  },true);
  document.addEventListener('keyup',e=>{if(mode==='highlight'&&e.key==='Shift'){const data=selectionData();if(data)add(data);}});
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-mark-action]');if(!button)return;const action=button.dataset.markAction;
    if(action==='mode'){mode=button.dataset.markMode;clearSelection();hide();render();return;}
    if(action==='close'){hide(true);return;}if(!pending)return;
    const data=pending;
    if(action==='apply'||action==='remove'){button.disabled=true;button.setAttribute('aria-busy','true');if(action==='apply')add(data);else remove(data);}
    if(action==='translate'&&canLookup(data.selectedText)){clearSelection();hide();window.WordNotebook?.open(data.selectedText,data.text,data.rect,lessonBank[data.scope]?data.scope:null,data.node);}
  });
  const reposition=()=>{if(!popup.hidden&&pending)position(pending.rect);};window.visualViewport?.addEventListener('resize',reposition);window.visualViewport?.addEventListener('scroll',reposition);
  onRender();return {controls,onRender,isLookupMode:()=>mode==='lookup'};
})();
