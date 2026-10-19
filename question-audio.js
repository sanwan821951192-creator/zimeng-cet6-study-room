'use strict';
// Plays ranges of the supplied recording without making or downloading new audio.
window.ListeningClipPlayer={create(audio,{onEnd=()=>{},onError=()=>{}}={}){
  let generation=0,bounds=null,pending=null,timer=null,disposed=false,finishing=false,completed=false,released=false;
  const stopTimer=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
  function detach(){if(pending){audio.removeEventListener('loadedmetadata',pending);pending=null;}}
  function clearRange(){bounds=null;completed=false;released=true;stopTimer();}
  function cancel(){generation++;detach();clearRange();audio.pause();}
  function finish(){
    if(!bounds||finishing||completed)return;
    finishing=true;completed=true;stopTimer();audio.pause();
    if(audio.currentTime!==bounds.end)audio.currentTime=bounds.end;
    const range={...bounds};finishing=false;onEnd(range);
  }
  function check(){
    if(!bounds||disposed)return;
    if(audio.currentTime>=bounds.end-.015){finish();return;}
    schedule();
  }
  function schedule(){
    stopTimer();if(!bounds||audio.paused||audio.ended||disposed)return;
    const remaining=(bounds.end-audio.currentTime)/Math.max(.1,audio.playbackRate||1)*1000;
    timer=setTimeout(check,Math.max(15,Math.min(200,remaining)));
  }
  function clampSeek(){
    if(!bounds||finishing)return;
    if(audio.currentTime<bounds.start){audio.currentTime=bounds.start;return;}
    if(audio.currentTime>=bounds.end){finish();return;}
    schedule();
  }
  function resume(){
    completed=false;
    if(bounds&&(audio.currentTime<bounds.start||audio.currentTime>=bounds.end-.015))audio.currentTime=bounds.start;
    schedule();
  }
  function mediaError(){
    const wasPending=!!pending;generation++;detach();clearRange();
    if(wasPending)onError();
  }
  const events={timeupdate:check,seeking:clampSeek,seeked:schedule,playing:schedule,play:resume,pause:stopTimer,waiting:stopTimer,ratechange:schedule,ended:()=>{stopTimer();if(bounds)finish();},error:mediaError};
  for(const [name,handler] of Object.entries(events))audio.addEventListener(name,handler);
  function play({src,start=0,end=null}){
    if(disposed||!src||!Number.isFinite(start)||start<0||(end!==null&&(!Number.isFinite(end)||end<=start)))return false;
    cancel();released=false;const token=generation;
    if(audio.getAttribute('src')!==src||audio.error){audio.src=src;audio.load();}
    const begin=()=>{
      if(token!==generation||disposed)return;
      detach();
      const duration=Number.isFinite(audio.duration)&&audio.duration>0?audio.duration:Infinity;
      const endAt=end===null?null:Math.min(end,duration);
      if(start>=duration||(endAt!==null&&start>=endAt)){onError();return;}
      bounds=endAt===null||released?null:{start,end:endAt};
      audio.currentTime=start;
      try{
        const promise=audio.play();
        if(promise&&typeof promise.catch==='function')promise.catch(()=>{if(token===generation&&!disposed){stopTimer();onError();}});
      }catch(error){if(token===generation&&!disposed)onError(error);}
      schedule();
    };
    if(audio.readyState>=1)begin();
    else{pending=begin;audio.addEventListener('loadedmetadata',begin,{once:true});}
    return true;
  }
  return {play,cancel,clearRange,range:()=>bounds?{...bounds}:null,dispose(){cancel();disposed=true;for(const [name,handler] of Object.entries(events))audio.removeEventListener(name,handler);}};
}};
