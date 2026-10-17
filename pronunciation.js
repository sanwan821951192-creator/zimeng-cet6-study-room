'use strict';
window.EnglishPronunciation=(()=>{
  const normalize=text=>String(text||'').trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ').toLowerCase();
  let player=null,serial=0;
  const loads=new Map(),online=new Map();
  const posName=p=>/^n\.?$|^noun$|名词/i.test(p)?'noun':/^v\.?$|^verb$|动词/i.test(p)?'verb':/^adj\.?$|^adjective$/i.test(p)?'adjective':/^adv\.?$|^adverb$/i.test(p)?'adverb':'';
  function entry(text,pos=''){
    const key=normalize(text),data=window.STUDY_DATA?.pronunciations,r=online.get(key+'|'+posName(pos))||data?.words?.[key]||data?.archivedWords?.[key]||window.CET_PRONUNCIATION_SHARDS?.[key[0]]?.[key]||null;
    const noun=/^(?:n\.|noun|名词)(?:$|[\s/])/i.test(String(pos).trim());
    if(noun&&['advocate','increase'].includes(key)){
      const variant=data?.variants?.[key]?.noun;
      if(variant)return variant;
      if(r?.recordingScope!=='example'&&r?.partOfSpeech==='verb')return null;
    }
    if(posName(pos)&&['object','record','present','permit','project','conduct','produce','refuse','desert','contrast','content','extract','contract','export','import','subject','suspect','contest','conflict','address','progress','increase','advocate'].includes(key)&&(!r?.partOfSpeech||!r.partOfSpeech.includes(posName(pos)))&&r?.recordingScope!=='example')return null;
    return r;
  }
  function label(text,pos=''){const r=entry(text,pos);return r?(r.recordingScope==='example'?'听真人例句':'听真人发音'):'查找真人发音';}
  function stop(){serial++;if(player){player.pause();player=null;}}
  function play(text,pos=''){
    const record=entry(text,pos);if(!record?.file)return false;
    stop();window.speechSynthesis?.cancel();
    const currentPlayer=new Audio(record.file);player=currentPlayer;currentPlayer.preload='auto';
    currentPlayer.play().catch(error=>{if(player!==currentPlayer||error?.name==='AbortError')return;if(typeof toast==='function')toast('录音暂未播放，请再点一次。')});
    return true;
  }
  function shard(letter){
    if(window.CET_PRONUNCIATION_SHARDS?.[letter])return Promise.resolve();
    if(loads.has(letter))return loads.get(letter);
    const request=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='pronunciation-lookup/'+letter+'.js';s.onload=resolve;s.onerror=()=>{loads.delete(letter);s.remove();reject(Error('本地录音词库未能加载'))};document.head.append(s)});loads.set(letter,request);return request;
  }
  async function ensure(text,pos='',lemma=''){
    const word=normalize(text);if(!/^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,3}$/.test(word)||word.length>70)return null;
    if(entry(word,pos))return entry(word,pos);
    try{await shard(word[0])}catch{}if(entry(word,pos))return entry(word,pos);
    // Inflected forms keep their own button. A lemma recording is explicitly named.
    const base=normalize(lemma);
    if(base&&base!==word){try{await shard(base[0])}catch{}const r=entry(base,pos);if(r)return{...r,requestedWord:word,spokenLemma:base}}
    if(typeof fetch!=='function')return null;
    let r=null;
    if(location.protocol!=='file:'){
      try{
        const response=await fetch('api/human-pronunciation?'+new URLSearchParams({word,pos:posName(pos)}),{signal:AbortSignal.timeout(25000)});
        if(response.ok&&response.headers.get('content-type')?.includes('application/json'))r=(await response.json()).record;
        else if(response.status===404&&response.headers.get('content-type')?.includes('application/json'))return null;
      }catch{}
    }
    if(!r)r=await window.CET_HUMAN_PRONUNCIATION_LOOKUP?.resolve(word,posName(pos));
    if(r?.recordingType!=='human'||!r.file||!r.sourceUrl||!r.license)return null;
    online.set(word+'|'+posName(pos),r);return r;
  }
  async function playLookup(text,pos='',lemma=''){
    stop();const request=serial;
    try{
      const r=await ensure(text,pos,lemma);if(request!==serial)return null;
      if(!r)return{error:'免费词库暂未收录这条完整真人录音，可打开词典核对。'};
      window.speechSynthesis?.cancel();const audio=new Audio(r.file);player=audio;audio.preload='auto';await audio.play();
      if(request!==serial)return null;
      return{record:r};
    }catch(e){if(request!==serial||e?.name==='AbortError')return null;return{error:e?.name==='NotAllowedError'?'录音已找到，请再点一次播放。':e.message||'录音暂未播放，请重试。'}}
  }
  return {entry,label,play,playLookup,ensure,stop};
})();
