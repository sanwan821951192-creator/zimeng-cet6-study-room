'use strict';
/* Cache only immutable public assets; learner records remain in the existing store. */
if('serviceWorker' in navigator&&['https:','http:'].includes(location.protocol)){
  setTimeout(()=>navigator.serviceWorker.register('site-cache.js',{updateViaCache:'none'}).catch(()=>{}),1500);
}
