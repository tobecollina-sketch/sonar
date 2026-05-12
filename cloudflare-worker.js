addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request));
});

var VAPID_PUBLIC = 'BAM2-G9NerrFBVMFBzBAvdOWySZle-C60yzWwZsNMYz5WVpTJhdOYHx8yB7gZgc4MP7cRc7EGEBIaM-8FnKknmk';
var VAPID_PRIVATE = 'URgsKZolEqubD73KkDV67OXbNQuVGC9LUoUgFb7aX0Y';
var VAPID_SUB = 'mailto:tobia@trieste.it';
var FB_URL = 'https://sonar-trieste-default-rtdb.europe-west1.firebasedatabase.app';

function b64uDecode(s) {
  s = s.replace(/-/g,'+').replace(/_/g,'/');
  while(s.length%4) s+='=';
  var bin = atob(s);
  var arr = new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return arr;
}

function b64uEncode(buf) {
  var arr = new Uint8Array(buf);
  var str = '';
  for(var i=0;i<arr.length;i++) str+=String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function makeAuth(endpoint) {
  var origin = new URL(endpoint).origin;
  var exp = Math.floor(Date.now()/1000)+43200;
  var h = b64uEncode(new TextEncoder().encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  var p = b64uEncode(new TextEncoder().encode(JSON.stringify({aud:origin,exp:exp,sub:VAPID_SUB})));
  var key = await crypto.subtle.importKey('raw',b64uDecode(VAPID_PRIVATE),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  var sig = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(h+'.'+p));
  return 'vapid t='+h+'.'+p+'.'+b64uEncode(sig)+',k='+VAPID_PUBLIC;
}

async function handleRequest(req) {
  var cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'};
  if(req.method==='OPTIONS') return new Response(null,{headers:cors});
  if(req.method!=='POST') return new Response('error',{status:405,headers:cors});
  var body;
  try { body=await req.json(); } catch(e) { return new Response('bad json',{status:400,headers:cors}); }
  if(!body.title) return new Response('no title',{status:400,headers:cors});
  var fbRes = await fetch(FB_URL+'/sonar/ts_push_subs.json');
  var subs = await fbRes.json();
  if(!subs||typeof subs!=='object') return new Response('{"sent":0}',{headers:Object.assign({'Content-Type':'application/json'},cors)});
  var payload = {title:body.title,body:body.message||'',tag:body.tag||'sonar',url:'/'};
  var sent = 0;
  var vals = Object.values(subs);
  for(var i=0;i<vals.length;i++) {
    var sub = vals[i];
    if(!sub||!sub.endpoint) continue;
    try {
      var auth = await makeAuth(sub.endpoint);
      var r = await fetch(sub.endpoint,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json',TTL:'86400'},body:JSON.stringify(payload)});
      if(r.status<300) sent++;
    } catch(e2) {}
  }
  return new Response('{"sent":'+sent+'}',{headers:Object.assign({'Content-Type':'application/json'},cors)});
}
