'use strict';
/* Recovery is local to this site and always requires an explicit selection. */
window.NotebookRecovery=(()=>{
  const BACKUP_KEY='zimeng-notebook-backup-v1',MAX_CHARS=500000,MAX_WORDS=2000,MAX_IMPORT_BYTES=10*1024*1024;
  const normalize=w=>String(w||'').trim().replace(/[’‘]/g,"'").toLowerCase();
  const valid=w=>/^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,3}$/.test(w)&&w.length<=70;
  const text=(v,n=6000)=>String(v||'').slice(0,n);
  const labels={backup:'本机词条备份',import:'旧记录生词',exercise:'随题词库',highlight:'单词高亮候选'};
  let opened=false,busy=false,rows=[],chosen=new Set(),message='',backupReadable=true,backupLimited=false,importedWords={},memoryBackup=null,backupVolatile=false;
  function cleanEntry(value,key){
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    const word=normalize(value.word||key);if(!valid(word))return null;
    return {word,meaning:typeof value.meaning==='string'?text(value.meaning,1800):'',phonetic:text(value.phonetic,100),source:text(value.source,100),lemma:text(value.lemma,70),example:text(value.example),exampleZh:text(value.exampleZh),exampleSource:text(value.exampleSource,100),lessonId:text(value.lessonId,100),createdAt:text(value.createdAt,40),updatedAt:text(value.updatedAt,40),reviewed:!!value.reviewed,contexts:(Array.isArray(value.contexts)?value.contexts:[]).filter(c=>c&&typeof c.example==='string').slice(0,20).map(c=>({example:text(c.example),exampleZh:text(c.exampleZh),exampleSource:text(c.exampleSource,100),lessonId:text(c.lessonId,100),date:text(c.date,10)}))};
  }
  function readBackup(){
    try{
      const raw=memoryBackup||localStorage.getItem(BACKUP_KEY);if(!raw){backupReadable=true;return {version:1,words:{}};}
      if(raw.length>MAX_CHARS*2)throw Error('oversized backup');
      const data=JSON.parse(raw);if(data?.version!==1||!data.words||Array.isArray(data.words)||typeof data.words!=='object')throw Error('invalid backup');
      backupReadable=true;return {...data,serialized:raw};
    }catch{backupReadable=false;return {version:1,words:{}};}
  }
  function remember(personalWords){
    try{
      const previous=readBackup();if(!backupReadable)return false;
      const entries=new Map();
      for(const [key,value] of Object.entries(previous.words)){const row=cleanEntry(value,key);if(row)entries.set(row.word,row);}
      for(const [key,value] of Object.entries(personalWords||{})){const row=cleanEntry(value,key);if(row)entries.set(row.word,row);}
      if(!entries.size&&!previous.serialized)return true;
      const ordered=[...entries.values()].sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt))||a.word.localeCompare(b.word));
      const words=Object.create(null);let size=JSON.stringify({version:1,limited:false,words:{}}).length;
      for(const row of ordered){if(Object.keys(words).length>=MAX_WORDS)break;const cost=JSON.stringify(row.word).length+JSON.stringify(row).length+2;if(size+cost>MAX_CHARS)continue;words[row.word]=row;size+=cost;}
      const limited=!!previous.limited||Object.keys(words).length<ordered.length,value=JSON.stringify({version:1,limited,words});if(value.length>MAX_CHARS)return false;
      if(value===previous.serialized&&!backupVolatile)return true;
      try{localStorage.setItem(BACKUP_KEY,value);memoryBackup=null;backupVolatile=false;return true;}
      catch{memoryBackup=value;backupVolatile=true;return false;}
    }catch{return false;}
  }
  function retryPrimarySave(write){
    if(typeof write!=='function')return false;
    let disk;try{disk=localStorage.getItem(BACKUP_KEY);}catch{return false;}
    if(!disk)return false;
    const priorMemory=memoryBackup,priorVolatile=backupVolatile;
    memoryBackup=memoryBackup||disk;backupVolatile=true;
    try{localStorage.removeItem(BACKUP_KEY);}catch{return false;}
    try{write();return true;}
    catch{
      try{localStorage.setItem(BACKUP_KEY,disk);memoryBackup=priorMemory;backupVolatile=priorVolatile;}
      catch{/* Keep this site's backup in memory when the browser cannot restore it. */}
      return false;
    }
  }
  function existingWords(){return new Set(Object.entries(saved.personalWords||{}).map(([key,row])=>normalize(row?.word||key)));}
  function hash(value){let result=2166136261;for(let index=0;index<value.length;index++)result=Math.imul(result^value.charCodeAt(index),16777619);return (result>>>0).toString(36);}
  function markContext(mark){
    const lesson=lessonBank[mark.scope],key=String(mark.key||'').split('|'),kind=key[2],root=key[3]||'',index=Number(key[4]);
    let candidate=null;
    if(lesson){
      if(kind==='passage'&&!/^(?:question|pinned)-/.test(root)&&Number.isInteger(index)&&index>=0)candidate=(lesson.paragraphs||lesson.transcriptParagraphs||[])[index];
      else if(kind==='prompt'||kind==='option'){
        const number=Number(root.match(/-(\d+)$/)?.[1]),question=(lesson.questions||[]).find(q=>q.number===number);
        if(question){
          if(kind==='prompt')candidate={text:question.prompt,zh:question.promptZh};
          else{const letter=/^letter-([A-O])$/.exec(key[4]||'')?.[1]||Object.keys(question.options||{})[index];candidate={text:question.options?.[letter],zh:question.optionsZh?.[letter]};}
        }
      }
    }
    const display=typeof candidate?.text==='string'?[candidate.text,candidate.text.replace(/__\d+__/g,'')].find(value=>hash(value)===key[5]&&value.slice(mark.start,mark.end)===mark.text):null;
    const exact=display!==null&&display!==undefined?candidate:null;
    return {example:exact?.text||mark.text,exampleZh:exact?.zh||'',exampleSource:exact?'原文语境':'高亮选词',lessonId:mark.scope||'',date:mark.date||''};
  }
  function scan(preserve=false){
    const previous=chosen,existing=existingWords(),found=new Map(),backup=readBackup();backupLimited=!!backup.limited;
    const timestamp=entry=>{for(const value of [entry?.updatedAt,entry?.createdAt]){if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value||''))continue;const date=Date.parse(value);if(Number.isFinite(date))return date;}return 0;};
    const priority=(source,entry)=>source==='import'&&entry.meaning.trim()?5:source==='backup'?4:source==='exercise'?3:source==='import'?2:1;
    function add(word,source,entry,origin){
      word=normalize(word);if(!valid(word)||existing.has(word))return;
      const candidate=cleanEntry({...entry,word},word);if(!candidate)return;
      let row=found.get(word);if(!row){row={word,source,entry:candidate,origins:[],pending:''};found.set(word,row);}
      else if(timestamp(candidate)>timestamp(row.entry)||timestamp(candidate)===timestamp(row.entry)&&priority(source,candidate)>priority(row.source,row.entry)){row.entry=candidate;row.source=source;}
      row.origins.push({source,...origin});
    }
    for(const [key,row] of Object.entries(backup.words))if(row&&typeof row==='object')add(row.word||key,'backup',row,{date:String(row.createdAt||'').slice(0,10),scope:row.lessonId||''});
    for(const [key,row] of Object.entries(importedWords))add(row.word||key,'import',row,{date:String(row.createdAt||'').slice(0,10),scope:row.lessonId||''});
    for(const [key,row] of Object.entries(saved.exerciseWords||{}))if(row&&typeof row==='object')add(row.word||key,'exercise',row,{date:row.date||'',scope:row.lessonId||''});
    for(const mark of Object.values(saved.highlights||{}))if(mark&&typeof mark.text==='string')add(mark.text,'highlight',{...markContext(mark),word:mark.text,meaning:'',source:'从高亮选择恢复'},{date:mark.date||'',scope:mark.scope||'',mark:{text:mark.text,scope:mark.scope,key:mark.key,start:mark.start,end:mark.end,date:mark.date}});
    rows=[...found.values()];chosen=new Set(rows.filter(row=>preserve?previous.has(row.word):row.source!=='highlight').map(row=>row.word));
  }
  function renderTools(){
    const button=`<button class="secondary-button" data-notebook-recovery="toggle" aria-expanded="${opened}" ${busy?'disabled':''}>${opened?'收起找回生词':'找回生词'}</button>`;
    if(!opened)return `<section id="notebook-recovery-tools">${button}</section>`;
    const groups=Object.entries(labels).map(([kind,label])=>{
      const group=rows.filter(row=>row.source===kind);if(!group.length)return '';
      const note=kind==='highlight'?'<p class="text-note">这些词仅代表曾经高亮，不代表以前加入过生词本。请自行勾选需要的词。</p>':'';
      return `<section><h3>${label}（${group.length}）</h3>${note}${group.map(row=>`<label class="recovery-candidate"><input type="checkbox" data-notebook-recovery="select" data-recovery-word="${esc(row.word)}" ${chosen.has(row.word)?'checked':''} ${busy?'disabled':''}> <b>${esc(row.word)}</b> ${esc(row.entry?.meaning||'待查释义')}<small class="text-note"> ${esc([...new Set(row.origins.map(o=>labels[o.source]))].join('、'))} · ${esc([...new Set(row.origins.map(o=>[o.date,o.scope].filter(Boolean).join(' ')))].filter(Boolean).join('；'))}</small>${row.pending?`<p class="lookup-message">${esc(row.pending)}</p>`:''}</label>`).join('')}</section>`;
    }).join('');
    return `<section id="notebook-recovery-tools" aria-label="找回生词">${button}<p class="text-note">只检查当前网站在这台电脑保存的记录。原有生词不会被覆盖；移出过的词只有在此勾选后才会恢复。另一台电脑的记录请先从那里导出，再在下方选择“从旧记录找回生词”。这里只恢复缺失生词，不导入答案或其他学习记录。</p>${backupVolatile?'<p class="lookup-message">浏览器存储空间不足，词条备份目前仅保留在本次打开的页面内。请先勾选恢复需要的词，再导出学习记录，完成后再关闭页面。</p>':''}${backupLimited?'<p class="text-note">本机词条备份容量有限，已优先保留较新的完整词条。请定期导出完整学习记录。</p>':''}${!backupReadable?'<p class="lookup-message">本机词条备份暂时无法读取，其他来源仍可检查。请先导出学习记录保留现状。</p>':''}${message?`<p role="status">${esc(message)}</p>`:''}${groups||'<p class="text-note">当前没有找到缺失词条。可从旧电脑或旧网址导出的学习记录中找回生词。</p>'}<div class="lookup-actions"><button class="primary-button" data-notebook-recovery="restore" ${busy||!chosen.size?'disabled':''}>${busy?'正在查词并恢复…':'恢复所选（'+chosen.size+'）'}</button><button class="small-button" data-notebook-recovery="refresh" ${busy?'disabled':''}>重新检查</button><button class="small-button" data-notebook-recovery="import" ${busy?'disabled':''}>从旧记录找回生词</button><input id="notebook-recovery-file" type="file" accept=".json,application/json" hidden><button class="small-button" data-action="export">导出当前记录</button></div></section>`;
  }
  function paint(){const node=document.querySelector('#notebook-recovery-tools');if(node)node.outerHTML=renderTools();}
  function refreshNotebook(){
    if(typeof view!=='undefined'&&view!=='words')return;
    const focused=document.activeElement;
    if(focused?.matches?.('input,textarea')&&!focused.closest?.('#notebook-recovery-tools')){paint();return;}
    render();
  }
  async function prepare(row){
    let entry={...row.entry,contexts:(row.entry?.contexts||[]).map(c=>({...c}))};
    const ids=[...new Set([entry.lessonId,...row.origins.map(o=>o.scope)].filter(id=>lessonBank[id]))];
    if(window.StudyLoader?.ensureLessons&&ids.length)try{await window.StudyLoader.ensureLessons(ids);}catch{}
    for(const origin of row.origins)if(origin.source==='highlight'){
      const context=markContext(origin.mark);if(context.example&&!entry.contexts.some(c=>c.example===context.example&&c.lessonId===context.lessonId))entry.contexts.push(context);
      if(!entry.example||entry.example===origin.mark.text)Object.assign(entry,{...context,lessonId:entry.lessonId||context.lessonId});
    }
    if(!entry.meaning.trim()){
      let result;try{result=await window.WordNotebook?.lookup(row.word);}catch{}
      if(!result?.meaning?.trim())return {row,pending:'待查：暂未找到释义，尚未加入生词本；可重试或通过查词手动填写。'};
      entry={...entry,meaning:result.meaning,phonetic:entry.phonetic||result.phonetic||'',lemma:entry.lemma||result.lemma||'',source:entry.source||result.source||labels[row.source]};
    }
    if(window.WordNotebook?.resolveEntry)entry=window.WordNotebook.resolveEntry(entry,row.word,entry.lemma||'');
    const now=new Date().toISOString();
    return {row,entry:{...entry,word:row.word,source:entry.source||labels[row.source],createdAt:entry.createdAt||now,updatedAt:now,contexts:(entry.contexts||[]).slice(0,20)}};
  }
  async function restoreSelected(){
    if(busy)return;const selectedRows=rows.filter(row=>chosen.has(row.word));if(!selectedRows.length)return;
    busy=true;message='正在检查所选词条，未保存前不会改变生词本。';paint();
    try{
      const results=[];
      for(let offset=0;offset<selectedRows.length;offset+=4)results.push(...await Promise.all(selectedRows.slice(offset,offset+4).map(async row=>{try{return await prepare(row);}catch{return {row,pending:'待查：本次未能完成检查，词条尚未加入，可重试。'};}})));
      const additions=results.filter(result=>result.entry&&!existingWords().has(result.row.word));
      const inserted=[];saved.personalWords=saved.personalWords||{};
      for(const {row,entry} of additions){if(existingWords().has(row.word))continue;saved.personalWords[row.word]=entry;inserted.push({word:row.word,entry});}
      if(inserted.length){
        let ok=false;try{ok=persist();}catch{}
        if(!ok){for(const item of inserted)if(saved.personalWords[item.word]===item.entry)delete saved.personalWords[item.word];message='本次恢复未保存成功，已撤回新增词条；所选词仍保留，可重试或先导出学习记录。';return;}
      }
      for(const result of results)if(result.pending)result.row.pending=result.pending;
      const existing=existingWords();rows=rows.filter(row=>!existing.has(row.word));chosen=new Set([...chosen].filter(word=>!existing.has(word)));
      const pending=results.filter(result=>result.pending).length;
      message=`已恢复 ${inserted.length} 个生词${pending?'；'+pending+' 个待查，仍保留在下面供重试或手动补充':''}。`;toast(message);
    }finally{busy=false;paint();refreshNotebook();}
  }
  async function importFile(file){
    if(busy||!file)return;busy=true;message='正在读取旧记录中的生词，只预览，不改动当前记录。';paint();
    try{
      if(!Number.isFinite(file.size)||file.size>MAX_IMPORT_BYTES)throw Error('请选择不超过 10 MB 的学习记录 JSON 文件。');
      const raw=await file.text();if(raw.length>MAX_IMPORT_BYTES)throw Error('学习记录文件过大，请选择不超过 10 MB 的 JSON 文件。');
      let payload;try{payload=JSON.parse(raw);}catch{throw Error('文件不是有效的 JSON 学习记录，当前记录未改动。');}
      if(!payload||typeof payload!=='object'||Array.isArray(payload)||(Object.hasOwn(payload,'app')&&payload.app!=='zimeng-cet6-study-room'))throw Error('这不是本网站的学习记录，当前记录未改动。');
      if(!payload.personalWords||typeof payload.personalWords!=='object'||Array.isArray(payload.personalWords))throw Error('文件中没有可读取的生词本 personalWords，当前记录未改动。');
      const previous=new Set(Object.keys(importedWords)),next=Object.create(null);let invalid=0;
      for(const [key,value] of Object.entries(payload.personalWords)){const entry=cleanEntry(value,key);if(entry)next[entry.word]=entry;else invalid++;}
      importedWords={...importedWords,...next};scan(true);
      for(const row of rows)if(row.origins.some(origin=>origin.source==='import')&&!previous.has(row.word))chosen.add(row.word);
      const count=rows.filter(row=>row.origins.some(origin=>origin.source==='import')).length;
      message=`旧记录中找到 ${count} 个当前生词本缺失的词${invalid?'，跳过 '+invalid+' 条无效词条':''}。请核对后点击“恢复所选”；答案等其他记录不会导入。`;
    }catch(error){message=error.message||'旧记录读取失败，当前记录未改动。';}
    finally{busy=false;paint();}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-notebook-recovery]');if(!button)return;
    const action=button.dataset.notebookRecovery;
    if(action==='toggle'&&!busy){opened=!opened;if(opened){scan();message='';}paint();}
    else if(action==='refresh'&&!busy){scan(true);message='已重新检查当前电脑的记录。';paint();}
    else if(action==='restore')restoreSelected();
    else if(action==='import'&&!busy)document.querySelector('#notebook-recovery-file')?.click();
  });
  document.addEventListener('change',event=>{
    if(event.target.id==='notebook-recovery-file'){const file=event.target.files?.[0];event.target.value='';importFile(file);return;}
    const input=event.target.closest('[data-notebook-recovery="select"]');if(!input||busy)return;
    const word=input.dataset.recoveryWord;if(input.checked)chosen.add(word);else chosen.delete(word);paint();
  });
  return {renderTools,remember,retryPrimarySave};
})();
