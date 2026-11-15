/* =============================================================================
   kb-sync.js · 跨设备同步（GitHub 账号 + 私有 Gist）
   —— 只在浏览器跑：登录一次（粘贴 GitHub 令牌），数据存进你账号下一个私有 Gist
   —— 三站共用同一个令牌与 Gist（同域 localStorage 共享），各站数据分文件存放
   —— 同步范围：做题记录 / 错题本 / 收藏（主题、目录展开、阅读进度属于设备偏好，不同步）
   ============================================================================= */
(function(){
  var S = document.currentScript || (function(){
    var ss=document.getElementsByTagName('script');
    for(var i=ss.length-1;i>=0;i--) if(/sync\.js/.test(ss[i].src)) return ss[i];
    return null;
  })();
  var SITE = (S && S.getAttribute('data-site')) || 'gs';
  var SITE_NAME = {'gs':'高数','xd':'线代','c':'C 语言'}[SITE] || SITE;
  /* 每站同步哪些 key：前缀式 + 精确名单 */
  var CONF = {
    gs: { keys:['gs_wrong','gs-kb-favs'], prefix:'gs_', skip:['gs_dark'] },
    xd: { keys:['xd_wrong','xd-kb-favs'], prefix:'xd_', skip:['xd_dark'] },
    c : { keys:['ex-th-wrong','c-kb-favs'], prefix:'c_',  skip:['c_dark','ex-th-last'] }
  }[SITE] || { keys:[], prefix:SITE+'_', skip:[] };

  var TK='kb-sync-token', GK='kb-sync-gist', UK='kb-sync-user';
  var MK='kb-sync-meta-'+SITE, SK='kb-sync-snap-'+SITE;
  var API='https://api.github.com';

  var st = { token:'', gist:'', user:'', busy:false, dirty:false, lastSync:0, applying:false };

  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
  function jget(k,d){ try{ var s=ls(k); return s?JSON.parse(s):d; }catch(e){ return d; } }

  /* ---------- 同步键集合 ---------- */
  function syncKeys(){
    var out={}, i;
    for(i=0;i<CONF.keys.length;i++) out[CONF.keys[i]]=1;
    try{
      for(i=0;i<localStorage.length;i++){
        var k=localStorage.key(i);
        if(k && k.indexOf(CONF.prefix)===0 && k.indexOf('kb-sync-')!==0
           && CONF.skip.indexOf(k)<0) out[k]=1;
      }
    }catch(e){}
    return Object.keys(out);
  }

  /* ---------- 状态提示 ---------- */
  var btn, dot, lab, modal, msgEl, userEl, tokEl, timeEl;
  function setState(){
    if(!btn) return;
    var on = !!st.token && !!st.user;
    btn.title = on ? ('已登录 '+st.user+' · 点击管理同步') : '跨设备同步（登录 GitHub）';
    if(dot) dot.className = 'kb-dot' + (st.busy?' busy':(on?' on':''));
    if(lab) lab.textContent = on ? '已同步' : '同步';
    if(userEl) userEl.textContent = on ? ('@'+st.user) : '未登录';
    if(timeEl) timeEl.textContent = st.lastSync ? ('上次同步：'+new Date(st.lastSync).toLocaleString()) : '尚未同步';
  }
  function toast(t){
    var el=document.getElementById('kb-sync-toast');
    if(!el){ el=document.createElement('div'); el.id='kb-sync-toast'; document.body.appendChild(el); }
    el.textContent=t; el.classList.add('on');
    clearTimeout(toast._t); toast._t=setTimeout(function(){ el.classList.remove('on'); },2200);
  }
  function showMsg(t,err){
    if(!msgEl) return;
    msgEl.textContent=t||''; msgEl.className='kb-msg'+(err?' err':'');
  }

  /* ---------- GitHub API ---------- */
  function api(path, opt){
    opt = opt || {};
    opt.headers = Object.assign({
      'Authorization':'token '+st.token,
      'Accept':'application/vnd.github+json'
    }, opt.headers||{});
    return fetch(API+path, opt).then(function(r){
      if(r.status===401) throw new Error('令牌无效或已过期，请重新登录');
      if(r.status===403) throw new Error('GitHub 接口频率超限，请稍后再试');
      if(!r.ok) throw new Error('GitHub 接口错误 '+r.status);
      return r.headers.get('content-type') && r.headers.get('content-type').indexOf('json')>=0 ? r.json() : r.text();
    });
  }

  /* ---------- 找 / 建 Gist ---------- */
  function ensureGist(){
    var saved=ls(GK);
    if(saved) return Promise.resolve(saved);
    var desc='kb-sync-store · 知识库账号同步（自动生成，请勿删除）';
    return api('/gists?per_page=100').then(function(list){
      var hit=(list||[]).filter(function(g){ return g.description && g.description.indexOf('kb-sync-store')===0; })[0];
      if(hit){ lsSet(GK,hit.id); return hit.id; }
      var body={ description:desc, public:false, files:{} };
      body.files[SITE+'.json']={ content: JSON.stringify({site:SITE,updatedAt:0,keys:{}} ,null,1) };
      return api('/gists',{ method:'POST', body:JSON.stringify(body) }).then(function(g){
        lsSet(GK,g.id); return g.id;
      });
    });
  }

  /* ---------- 拉取：远端较新的键写入本地 ---------- */
  function pull(silent){
    if(!st.token || st.busy) return Promise.resolve(false);
    st.busy=true; setState();
    return ensureGist().then(function(gid){
      st.gist=gid;
      return api('/gists/'+gid);
    }).then(function(g){
      var f=g.files && g.files[SITE+'.json'];
      if(!f || !f.content) return false;
      var remote=null;
      try{ remote=JSON.parse(f.content); }catch(e){ return false; }
      var meta=jget(MK,{}), snap=jget(SK,{}), changed=[];
      st.applying=true;
      Object.keys(remote.keys||{}).forEach(function(k){
        var r=remote.keys[k];
        if(!r || r.v==null) return;
        if((r.t||0) > (meta[k]||0)){
          if(ls(k)!==r.v){
            /* 覆盖前先留本地备份（键名 kb-sync-bak-<原键>），可用控制台恢复 */
            var old=ls(k);
            if(old!=null && ls('kb-sync-bak-'+k)==null) lsSet('kb-sync-bak-'+k, old);
            lsSet(k,r.v); changed.push(k);
          }
          meta[k]=r.t||0; snap[k]=r.v;
        }
      });
      st.applying=false;
      lsSet(MK,JSON.stringify(meta)); lsSet(SK,JSON.stringify(snap));
      st.lastSync=Date.now(); setState();
      if(changed.length){
        if(document.visibilityState==='hidden'){ location.reload(); return true; }
        var tEl=(function(){
          var el=document.getElementById('kb-sync-toast');
          if(!el){ el=document.createElement('div'); el.id='kb-sync-toast'; document.body.appendChild(el); }
          return el;
        })();
        tEl.textContent='云端有更新（'+changed.length+' 项），点此刷新页面';
        tEl.classList.add('on','click'); 
        tEl.onclick=function(){ location.reload(); };
        clearTimeout(pull._tt); pull._tt=setTimeout(function(){ tEl.classList.remove('on','click'); },8000);
        if(btn) btn.classList.add('kb-hasnew');
      }
      return changed.length>0;
    }).catch(function(e){
      showMsg(e.message,true);
      if(/401|令牌/.test(e.message)){ lsDel(TK); st.token=''; st.user=''; }
      return false;
    }).then(function(r){ st.busy=false; setState(); return r; });
  }

  /* ---------- 推送：本地改动（对比上次同步快照）写回 Gist ---------- */
  function push(){
    if(!st.token || st.busy) return Promise.resolve(false);
    var keys=syncKeys(), snap=jget(SK,{}), meta=jget(MK,{}), now=Date.now(), payload={}, dirty=false;
    keys.forEach(function(k){
      var v=ls(k); if(v==null) return;
      var t=meta[k]||0;
      if(v!==snap[k]){ t=now; dirty=true; }
      payload[k]={ v:v, t:t };
    });
    if(!dirty){ st.dirty=false; return Promise.resolve(false); }
    st.busy=true; setState();
    return ensureGist().then(function(gid){
      st.gist=gid;
      var body={ files:{} };
      body.files[SITE+'.json']={ content: JSON.stringify({ site:SITE, updatedAt:now, keys:payload },null,1) };
      return api('/gists/'+gid,{ method:'PATCH', body:JSON.stringify(body) });
    }).then(function(){
      Object.keys(payload).forEach(function(k){ meta[k]=payload[k].t; snap[k]=payload[k].v; });
      lsSet(MK,JSON.stringify(meta)); lsSet(SK,JSON.stringify(snap));
      st.dirty=false; st.lastSync=Date.now(); setState();
      return true;
    }).catch(function(e){
      showMsg(e.message,true);
      if(/401|令牌/.test(e.message)){ lsDel(TK); st.token=''; st.user=''; }
      return false;
    }).then(function(r){ st.busy=false; setState(); return r; });
  }
  function schedulePush(){
    if(!st.token || st.applying) return;
    st.dirty=true;
    clearTimeout(schedulePush._t);
    schedulePush._t=setTimeout(function(){ push(); }, 1500);
  }

  /* ---------- 登录 ---------- */
  function login(tok){
    tok=(tok||'').trim();
    if(!tok) return showMsg('请粘贴 GitHub 令牌',true);
    st.token=tok; showMsg('正在验证令牌…');
    return api('/user').then(function(u){
      st.user=u.login; lsSet(TK,tok); lsSet(UK,u.login);
      return ensureGist();
    }).then(function(){
      showMsg('登录成功，正在拉取云端数据…');
      return pull();
    }).then(function(){
      showMsg(st.gist?('已连接 Gist '+st.gist):'登录成功');
      setTimeout(function(){ closeModal(); }, 700);
      toast('同步已开启');
      /* 登录后把本地已有数据先推一次，避免云端为空看不到本地记录 */
      return push();
    }).catch(function(e){
      showMsg(e.message,true);
      st.token=''; st.user=''; lsDel(TK);
      setState();
    });
  }
  function logout(){
    lsDel(TK); lsDel(GK); lsDel(UK); lsDel(MK); lsDel(SK);
    st.token=''; st.user=''; st.gist=''; st.lastSync=0; st.dirty=false;
    setState(); showMsg('已退出登录（本地数据保留，云端不移除）');
  }

  /* ---------- UI ---------- */
  function openModal(){
    if(modal){ modal.classList.add('on'); }
    var mk=document.getElementById('kb-sync-mask'); if(mk) mk.classList.add('on');
    setState(); showMsg('');
  }
  function closeModal(){
    if(modal) modal.classList.remove('on');
    var mk=document.getElementById('kb-sync-mask'); if(mk) mk.classList.remove('on');
    if(btn) btn.classList.remove('kb-hasnew');
  }

  function buildUI(){
    var tools=document.querySelector('header .tools') || document.querySelector('.tools');
    if(!tools) return;
    var style=document.createElement('style');
    style.textContent=
      '.kb-sync{position:relative}\n'+
      '.kb-sync .tb{gap:6px}\n'+
      '.kb-dot{width:6px;height:6px;border-radius:50%;background:var(--ink3,var(--fg-3,#aeaeb2));display:inline-block;flex:none}\n'+
      '.kb-dot.on{background:#34c759}\n'+
      '.kb-dot.busy{background:#ff9f0a;animation:kbp 1s infinite}\n'+
      '@keyframes kbp{50%{opacity:.35}}\n'+
      '#kb-sync-btn.kb-hasnew .kb-dot{background:#ff9f0a}\n'+
      '#kb-sync-mask{position:fixed;inset:0;background:rgba(0,0,0,.34);z-index:120;display:none}\n'+
      '#kb-sync-mask.on{display:block}\n'+
      '#kb-sync-card{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:420px;max-width:92vw;\n'+
      '  background:var(--panel-solid,var(--panel,#fff));color:var(--hi,var(--ink,#1c1c1e));border-radius:16px;z-index:121;\n'+
      '  box-shadow:0 24px 70px rgba(0,0,0,.28);padding:20px 20px 16px;display:none;\n'+
      '  font:13px/1.6 "PingFang SC","Microsoft YaHei",-apple-system,sans-serif}\n'+
      '#kb-sync-card.on{display:block}\n'+
      '#kb-sync-card h3{margin:0 0 4px;font-size:15px}\n'+
      '.kb-sub{font-size:11.5px;color:var(--ink2,var(--fg-2,#6e6e73));margin-bottom:12px}\n'+
      '.kb-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;color:var(--ink2,var(--fg-2,#6e6e73))}\n'+
      '.kb-row b{color:var(--hi,var(--ink,#1c1c1e))}\n'+
      '#kb-sync-tok{width:100%;box-sizing:border-box;border:1px solid var(--line2,var(--line-2,#dddde2));border-radius:10px;\n'+
      '  padding:9px 11px;font:12px/1.5 ui-monospace,Consolas,monospace;background:var(--panel2,var(--panel-2,#f6f6f8));color:inherit;margin-bottom:8px}\n'+
      '.kb-btns{display:flex;gap:8px;margin:10px 0 4px}\n'+
      '.kb-btn{flex:1;border:1px solid var(--line2,var(--line-2,#dddde2));border-radius:10px;background:var(--panel2,var(--panel-2,#f6f6f8));\n'+
      '  padding:9px 0;font:600 12.5px inherit;font-family:inherit;cursor:pointer;color:var(--hi,var(--ink,#1c1c1e))}\n'+
      '.kb-btn:hover{border-color:var(--acc,var(--ac,#3478f6));color:var(--acc,var(--ac,#3478f6))}\n'+
      '.kb-btn.pri{background:var(--acc,var(--ac,#3478f6));border-color:var(--acc,var(--ac,#3478f6));color:#fff}\n'+
      '.kb-btn.pri:hover{opacity:.9;color:#fff}\n'+
      '.kb-msg{font-size:11.5px;color:var(--ink2,var(--fg-2,#6e6e73));min-height:18px;margin-top:6px;word-break:break-word}\n'+
      '.kb-msg.err{color:#eb4d3d}\n'+
      '.kb-tip{font-size:11px;color:var(--ink3,var(--fg-3,#aeaeb2));border-top:1px dashed var(--line,#e8e8ec);\n'+
      '  padding-top:9px;margin-top:8px;line-height:1.65}\n'+
      '.kb-tip a{color:var(--acc,var(--ac,#3478f6))}\n'+
      '#kb-sync-toast{position:fixed;left:50%;bottom:30px;transform:translate(-50%,12px);background:rgba(28,28,30,.94);\n'+
      '  color:#fff;font-size:12.5px;padding:9px 18px;border-radius:999px;opacity:0;pointer-events:none;transition:.22s;z-index:130}\n'+
      '#kb-sync-toast.on{opacity:1;transform:translate(-50%,0)}\n'+
      '#kb-sync-toast.click{pointer-events:auto;cursor:pointer;background:var(--acc,var(--ac,#3478f6))}\n'+
      '.kb-guide{margin-top:10px;border-top:1px dashed var(--line,#e8e8ec);padding-top:9px}\n'+
      '.kb-guide summary{cursor:pointer;font-size:11.5px;color:var(--acc,var(--ac,#3478f6));list-style:none;outline:none;user-select:none}\n'+
      '.kb-guide summary::-webkit-details-marker{display:none}\n'+
      '.kb-guide summary:before{content:"\\25B8";display:inline-block;margin-right:4px;transition:transform .15s}\n'+
      '.kb-guide[open] summary:before{transform:rotate(90deg)}\n'+
      '.kb-guide ol{margin:8px 0 6px;padding-left:19px;font-size:11.5px;color:var(--ink2,var(--fg-2,#6e6e73));line-height:1.85}\n'+
      '.kb-guide li{margin-bottom:3px}\n'+
      '.kb-guide code{font:11px ui-monospace,Consolas,monospace;background:var(--panel2,var(--panel-2,#f6f6f8));padding:1px 4px;border-radius:4px}\n'+
      '.kb-guide p{font-size:11px;color:var(--ink3,var(--fg-3,#aeaeb2));margin:6px 0 0;line-height:1.65}\n'+
      '.kb-guide a{color:var(--acc,var(--ac,#3478f6))}\n';
    document.head.appendChild(style);

    var wrap=document.createElement('div');
    wrap.className='kb-sync';
    wrap.innerHTML='<button class="tb" id="kb-sync-btn" type="button" title="跨设备同步">'
      +'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      +'<path d="M7 18.5a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.2 9.6 3.8 3.8 0 0 1 17 17.1"/><path d="M12 12v7m0 0l-2.6-2.6M12 19l2.6-2.6"/></svg>'
      +'<span id="kb-sync-t">同步</span><i class="kb-dot" id="kb-sync-dot"></i></button>';
    var seg=tools.querySelector('.seg');
    if(seg && seg.parentNode===tools) tools.insertBefore(wrap,seg); else tools.appendChild(wrap);

    var m=document.createElement('div');
    m.id='kb-sync-mask';
    var card=document.createElement('div');
    card.id='kb-sync-card';
    card.innerHTML=
      '<h3>跨设备同步</h3>'
      +'<div class="kb-sub">用 GitHub 账号登录，错题本与收藏存进你名下的私有 Gist；三个站点共用同一个登录。</div>'
      +'<div class="kb-row">账号：<b id="kb-sync-user">未登录</b><span style="flex:1"></span><span id="kb-sync-time">尚未同步</span></div>'
      +'<input id="kb-sync-tok" type="password" placeholder="粘贴 GitHub 令牌（ghp_… 或 github_pat_…）" autocomplete="off" spellcheck="false">'
      +'<div class="kb-btns">'
      +'<button class="kb-btn pri" id="kb-sync-login" type="button">保存并登录</button>'
      +'<button class="kb-btn" id="kb-sync-now" type="button">立即同步</button>'
      +'<button class="kb-btn" id="kb-sync-out" type="button">退出登录</button>'
      +'</div>'
      +'<div class="kb-msg" id="kb-sync-msg"></div>'
      +'<details class="kb-guide" id="kb-sync-guide"><summary>第一次用？3 步拿到令牌（约 40 秒）</summary>'
      +'<ol>'
      +'<li>点 <a href="https://github.com/settings/tokens/new?scopes=gist&description=kb-sync" target="_blank" rel="noopener">创建令牌</a>'
      +'（会帮你自动勾好 <code>gist</code>；没登录 GitHub 就先登录或注册）</li>'
      +'<li>拉到页面最下面点绿色 <b>Generate token</b>，复制 <code>ghp_…</code> 开头那一串</li>'
      +'<li>回到这里粘贴，点 <b>保存并登录</b>；看到绿点就是同步已开启</li>'
      +'</ol>'
      +'<p>每个账号各建自己的令牌，互不影响。令牌只存这台设备的浏览器，数据写进你账号下的私有 Gist；换设备粘贴同一个令牌即可恢复。'
      +'想用细粒度令牌：Account permissions → Gists → Read and write。</p>'
      +'</details>'
      +'<div class="kb-tip">把页面链接后加 <code>?sync=1</code> 发给别人，打开就直达这个登录面板并展开引导。</div>';
    document.body.appendChild(m);
    document.body.appendChild(card);

    btn=document.getElementById('kb-sync-btn');
    dot=document.getElementById('kb-sync-dot');
    lab=document.getElementById('kb-sync-t');
    modal=card; msgEl=document.getElementById('kb-sync-msg');
    userEl=document.getElementById('kb-sync-user'); timeEl=document.getElementById('kb-sync-time');
    tokEl=document.getElementById('kb-sync-tok');

    btn.addEventListener('click',function(e){
      e.stopPropagation(); openModal();
    });
    m.addEventListener('click',closeModal);
    document.getElementById('kb-sync-login').addEventListener('click',function(){ login(tokEl.value); });
    document.getElementById('kb-sync-now').addEventListener('click',function(){ push().then(function(){ pull(); toast('已同步'); }); });
    document.getElementById('kb-sync-out').addEventListener('click',logout);
    tokEl.addEventListener('keydown',function(e){ if(e.key==='Enter') login(tokEl.value); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeModal(); });
    m.classList.remove('on');
  }

  /* ---------- 变更挂钩：监听 localStorage 写入 ---------- */
  function hookWrites(){
    var orig = localStorage.setItem.bind(localStorage);
    try{
      localStorage.setItem = function(k,v){
        orig(k,v);
        if(st.applying || CONF.skip.indexOf(k)>=0) return;
        if(CONF.keys.indexOf(k)>=0 || (k && k.indexOf(CONF.prefix)===0 && k.indexOf('kb-sync-')!==0)) schedulePush();
      };
    }catch(e){}
  }

  /* ---------- 启动 ---------- */
  function boot(){
    buildUI();
    hookWrites();
    st.token = ls(TK) || '';
    st.user = ls(UK) || '';
    setState();
    var gd=document.getElementById('kb-sync-guide');
    if(gd && !st.token) gd.open=true;
    if(/[?&]sync=1(&|$)/.test(location.search)) setTimeout(openModal, 300);
    if(st.token){
      setState();
      pull(true);
      setInterval(function(){ pull(true); }, 60000);
      document.addEventListener('visibilitychange',function(){
        if(document.visibilityState==='visible') pull(true);
      });
      window.addEventListener('focus',function(){ pull(true); });
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

  window.KBSync = { pull:pull, push:push, logout:logout, state:st };
})();
