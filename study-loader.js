'use strict';
/* Complete lesson records and their word meanings arrive together, before practice. */
window.StudyLoader=(()=>{
  const data=window.STUDY_DATA,meta=data?._lazyLessons;
  const loaded=new Set(meta?[]:Object.keys(data?.lessons||{})),loads=new Map(),listeners=new Set(),dictionaryListeners=new Set();
  const dictionary=window.CET_COURSE_DICTIONARY=Object.create(null),wordLessons=Object.create(null);
  const missing=window.CET_COURSE_MISSING=new Set();
  let bank=null,dictionaryReady=!meta;
  function register(payload){
    const additions={};
    for(const [id,lesson] of Object.entries(payload.lessons||{})){
      if(!meta?.files?.[id]||!lesson||!Array.isArray(lesson.questions))continue;
      data.lessons[id]=lesson;if(bank)bank[id]=lesson;loaded.add(id);additions[id]=lesson;
    }
    for(const [word,record] of Object.entries(payload.dictionary||{})){
      if(!Array.isArray(record)||typeof record[0]!=='string')continue;
      dictionary[word]=record;missing.delete(word);
    }
    for(const word of payload.missingWords||[])if(!Object.hasOwn(dictionary,word))missing.add(word);
    for(const [word,id] of Object.entries(payload.wordLessons||{}))if(meta?.files?.[id])wordLessons[word]=id;
    if(!payload.lessons)dictionaryReady=true;
    if(Object.keys(additions).length)for(const listener of listeners)listener(additions);
    for(const listener of dictionaryListeners)listener();
  }
  function bind(value){bank=value;for(const id of loaded)if(data.lessons[id])bank[id]=data.lessons[id];}
  function isLessonReady(id){return !meta||loaded.has(id);}
  function loadFile(filename,priority='auto'){
    if(loads.has(filename))return loads.get(filename);
    const request=new Promise((resolve,reject)=>{
      const script=document.createElement('script');let finished=false;
      const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);script.onload=script.onerror=null;
        if(error){script.remove();loads.delete(filename);reject(error)}else resolve();};
      const timer=setTimeout(()=>finish(Error('学习材料加载超时，请点击重试。')),12000);
      script.src=filename;script.fetchPriority=priority;
      script.onload=()=>{
        const ready=filename===meta.dictionaryFile?dictionaryReady:Object.entries(meta.files).filter(([,file])=>file===filename).every(([id])=>loaded.has(id));
        finish(ready?null:Error('学习材料未加载完整，请点击重试。'));
      };
      script.onerror=()=>finish(Error('学习材料未能下载，请检查网络后重试。'));
      document.head.append(script);
    });loads.set(filename,request);return request;
  }
  function lessonsForDay(date){return meta?.dayLessons?.[date]||[];}
  function ensureLessons(ids){
    if(!meta)return Promise.resolve();
    const required=[...new Set(ids)].filter(id=>!loaded.has(id));
    if(required.some(id=>!meta.files[id]))return Promise.reject(Error('没有找到这份学习材料，请刷新后重试。'));
    return Promise.all([...new Set(required.map(id=>meta.files[id]))].map(file=>loadFile(file)));
  }
  const ensureDay=date=>ensureLessons(lessonsForDay(date));
  const warmDay=date=>ensureDay(date).catch(()=>{});
  function warmDictionary(){return !meta||dictionaryReady?Promise.resolve():loadFile(meta.dictionaryFile,'low').catch(()=>{});}
  function onLessons(listener){listeners.add(listener);return()=>listeners.delete(listener);}
  function onDictionary(listener){dictionaryListeners.add(listener);return()=>dictionaryListeners.delete(listener);}
  const lessonForWord=(word,lemma='')=>wordLessons[word]||wordLessons[lemma]||null;
  return{register,bind,onLessons,onDictionary,lessonForWord,isLessonReady,isReady:ids=>ids.every(isLessonReady),lessonsForDay,ensureLessons,ensureDay,warmDay,warmDictionary};
})();
