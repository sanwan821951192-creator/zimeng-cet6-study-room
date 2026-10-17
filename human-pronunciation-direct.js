/* Optional static-host fallback. Local bundled recordings remain the first choice. */
'use strict';
window.CET_HUMAN_PRONUNCIATION_LOOKUP=(()=>{
  const cache=new Map(),pending=new Map();
  const homographs=new Set(['advocate','increase','object','record','present','permit','project','conduct','produce','refuse','desert','contrast','content','extract','contract','export','import','subject','suspect','contest','conflict','address','progress']);
  const normalize=value=>String(value||'').trim().replace(/[’‘]/g,"'").replace(/\s+/g,' ').toLowerCase();
  const posName=value=>({n:'noun',v:'verb',adj:'adjective',adv:'adverb'}[value]||value);
  const plain=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim();
  function templates(text){
    const stack=[],out=[];
    for(const m of text.matchAll(/\{\{|\}\}/g)){
      if(m[0]==='{{')stack.push(m.index);
      else if(stack.length){const from=stack.pop();out.push({from,body:text.slice(from+2,m.index)});}
    }
    return out.sort((a,b)=>a.from-b.from);
  }
  function candidates(text,word,pos=''){
    const start=text.match(/^==\s*English\s*==\s*$/m);if(!start)return [];
    let section=text.slice(start.index+start[0].length);
    const next=section.search(/^==[^=\n].*?[^=\n]==\s*$/m);if(next>=0)section=section.slice(0,next);
    const result=[];
    for(const t of templates(section)){
      const parts=t.body.split('|').map(x=>x.trim());
      if(parts[0].toLowerCase()!=='audio'||parts[1]!=='en')continue;
      const file=parts[2]?.replace(/^File:/i,'');
      if(!file||/[{}<>\\/]/.test(file)||! /\.(ogg|oga|wav|mp3|flac|webm)$/i.test(file))continue;
      const named=Object.fromEntries(parts.slice(3).filter(x=>x.includes('=')).map(x=>{const at=x.indexOf('=');return[x.slice(0,at),x.slice(at+1)];}));
      const labelsIn=value=>[...value.toLowerCase().matchAll(/(?:^|[^a-z])(noun|verb|adjective|adverb|adj)(?=$|[^a-z])/g)].map(m=>posName(m[1]));
      // Explicit file/template POS wins: adjacent Noun/Verb sections cannot relabel it.
      const explicit=labelsIn((named.pos||'')+' '+file);
      const preceding=section.slice(Math.max(0,t.from-400),t.from).split('\n').slice(-8).filter(line=>/^\*?\s*(Noun|Verb|Adjective|Adverb)\b/i.test(line)).slice(-1).join(' ');
      const labels=explicit.length?explicit:labelsIn(preceding);
      if(pos&&labels.length&&!labels.includes(pos))continue;
      if(pos&&homographs.has(word)&&!labels.includes(pos))continue;
      const dialect=/\bUS\b|en-us|American|California/i.test(file+' '+(named.a||''))?'US':/\bUK\b|en-uk|en-gb|British|\bRP\b/i.test(file+' '+(named.a||''))?'UK':'English';
      result.push({title:'File:'+file,word,pos:labels.join(', '),dialect,score:(dialect==='US'?10:dialect==='UK'?8:1)+(pos&&labels.includes(pos)?20:0)});
    }
    return result.sort((a,b)=>b.score-a.score).filter((x,i,a)=>a.findIndex(y=>y.title===x.title)===i).slice(0,8);
  }
  async function api(host,params){
    // Anonymous MediaWiki CORS. No credentials, JSONP, tokens, or proxy required.
    const query=new URLSearchParams({action:'query',format:'json',formatversion:'2',origin:'*',maxlag:'5',...params});
    const response=await fetch('https://'+host+'/w/api.php?'+query,{mode:'cors',credentials:'omit',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('在线真人录音暂时无法连接，请稍后重试。');
    let data;
    try{data=await response.json();}catch{throw Error('在线真人录音来源暂忙，请稍后重试。');}
    if(data.error)throw Error('在线真人录音来源暂忙，请稍后重试。');
    return data;
  }
  async function lookup(word,pos){
    const pages=await api('en.wiktionary.org',{titles:word,redirects:'1',prop:'revisions',rvprop:'content',rvslots:'main'});
    const text=pages.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content||'';
    const found=candidates(text,word,pos);if(!found.length)return null;
    const info=await api('commons.wikimedia.org',{titles:found.map(x=>x.title).join('|'),redirects:'1',prop:'imageinfo',iiprop:'url|extmetadata|mime|size'});
    // Follow Commons file redirects without losing the candidate's POS evidence.
    const redirects=new Map((info.query?.redirects||[]).map(x=>[x.from.toLowerCase(),x.to.toLowerCase()]));
    for(const candidate of found){
      let title=candidate.title.toLowerCase();
      for(let n=0;n<8&&redirects.has(title);n++)title=redirects.get(title);
      const page=info.query?.pages?.find(p=>p.title.toLowerCase()===title),i=page?.imageinfo?.[0],m=i?.extmetadata||{},v=k=>m[k]?.value||'';
      if(!i||!Number.isFinite(i.size)||i.size<=0||i.size>2000000||!(/^audio\//.test(i.mime||'')||/^application\/ogg$/.test(i.mime||'')))continue;
      if(!/^https:\/\/upload\.wikimedia\.org\//.test(i.url||'')||!/^https:\/\/commons\.wikimedia\.org\/wiki\//.test(i.descriptionurl||''))continue;
      if(!/^(?:cc-by(?:-sa)?-[\d.]+|cc0|pd)(?:$|-)/i.test(v('License')))continue;
      if(/text.to.speech|speech synthes|\btts\b|espeak|synthe[st]i[sz]ed/i.test(plain(v('ImageDescription')+' '+v('Artist'))))continue;
      const record={word,file:i.url,sourceAudioUrl:i.url,sourceUrl:i.descriptionurl,license:plain(v('LicenseShortName')),licenseUrl:plain(v('LicenseUrl'))||i.descriptionurl+'#Licensing',author:plain(v('Artist')),dialect:candidate.dialect,partOfSpeech:candidate.pos,recordingType:'human',recordingScope:'word',provider:'Wiktionary / Wikimedia Commons',mime:i.mime};
      if(record.author&&record.license)return record;
    }
    return null;
  }
  async function resolve(value,partOfSpeech=''){
    const word=normalize(value),pos=posName(normalize(partOfSpeech).replace(/\.$/,''));
    if(word.length>70||!/^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,3}$/.test(word)||!['','noun','verb','adjective','adverb'].includes(pos))return null;
    const key=word+'|'+pos,old=cache.get(key);
    if(old&&Date.now()-old.at<86400000)return old.record;
    if(pending.has(key))return pending.get(key);
    const request=lookup(word,pos).then(record=>{if(cache.size>=500)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),record});return record;}).finally(()=>pending.delete(key));
    pending.set(key,request);return request;
  }
  return{resolve,candidates};
})();
