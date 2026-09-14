window.ASEAN_API=(()=>{
'use strict';
let _csrf='';
const ME_URL='/admin-api/owner/me';

async function _refreshCsrf(){
  const r=await fetch(ME_URL,{credentials:'same-origin'});
  if(!r.ok){
    // session truly gone — redirect to login
    if(r.status===401){location.href='index.html';return '';}
    throw new Error('Session refresh failed: '+r.status);
  }
  const p=await r.json().catch(()=>({}));
  _csrf=p?.data?.csrfToken||_csrf;
  return _csrf;
}

async function request(url,options={}){
  const headers={'content-type':'application/json',...(options.headers||{})};
  // always use the current csrf
  if(_csrf) headers['x-csrf-token']=_csrf;
  let r=await fetch(url,{credentials:'same-origin',...options,headers});
  let p=await r.json().catch(()=>({}));

  // 401 AUTH_REQUIRED — session expired, send to login
  if(r.status===401){
    location.href='index.html';
    throw new Error(p?.error?.message||p?.error||'Sesi tidak tersedia.');
  }

  // 403 CSRF_INVALID — refresh token then retry once
  if(r.status===403&&(p?.error?.code==='CSRF_INVALID'||p?.error==='Token keamanan tidak valid.')){
    const fresh=await _refreshCsrf();
    if(!fresh){throw new Error('Tidak dapat memperbarui token keamanan. Silakan login ulang.');}
    const headers2={'content-type':'application/json',...(options.headers||{}),'x-csrf-token':fresh};
    r=await fetch(url,{credentials:'same-origin',...options,headers:headers2});
    p=await r.json().catch(()=>({}));
    if(r.status===401){location.href='index.html';throw new Error('Sesi tidak tersedia.');}
  }

  if(!r.ok) throw new Error(p?.error?.message||p?.error||'Permintaan gagal.');
  return p.data;
}

return{
  get csrf(){return _csrf;},
  set csrf(v){_csrf=v;},
  refreshCsrf:_refreshCsrf,
  request,
  money(v){return 'IDR '+Number(v||0).toLocaleString('id-ID');}
};
})();

