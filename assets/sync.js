/* =============================================================================
   sync.js · 跨设备同步（Supabase 账号 + 数据库）
   —— 邮箱 + 密码注册/登录，数据存 Supabase 表 public.user_progress
   —— 三站共用同一个账号（同域 localStorage 共享），各站数据按 key 前缀区分
   —— 同步范围：做题记录 / 错题本 / 收藏 / 试卷记录 / 头像昵称 / 字号
   —— 安全：publishable key 是公开的，真正的隔离靠表上的 Row Level Security
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
    gs: { keys:['gs_wrong','gs-kb-favs','kb-prof','kb-zoom'], prefix:'gs_', skip:['gs_dark'] },
    xd: { keys:['xd_wrong','xd-kb-favs','kb-prof'], prefix:'xd_', skip:['xd_dark'] },
    c : { keys:['ex-th-wrong','c-kb-favs','kb-prof'], prefix:'c_',  skip:['c_dark','ex-th-last'] }
  }[SITE] || { keys:[], prefix:SITE+'_', skip:[] };

  /* ---------- Supabase 配置 ----------
     publishable key 放在前端是正常做法（它只代表"这个项目"，不代表某个用户）；
     数据能不能被读到，由数据库表上的 RLS 策略决定。 */
  var SB_URL = 'https://vgdtbnypvamsgpwmmnye.supabase.co';
  var SB_KEY = 'sb_publishable_Y448FC-dVLIHajn8iIfWlw_XuazubUI';
  var TB     = 'user_progress';

  var SES='kb-sb-session';
  var MK='kb-sync-meta-'+SITE, SK='kb-sync-snap-'+SITE;

  var st = { token:'', refresh:'', exp:0, uid:'', user:'', busy:false, dirty:false,
             lastSync:0, applying:false, recovery:false };

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
        if(k && k.indexOf(CONF.prefix)===0 && k.indexOf('kb-sync-')!==0 && k.indexOf('kb-sb-')!==0
           && CONF.skip.indexOf(k)<0) out[k]=1;
      }
    }catch(e){}
    return Object.keys(out);
  }

  /* ---------- 状态提示 ---------- */
  var btn, dot, lab, modal, msgEl, userEl, timeEl, outEl, mailEl, pwdEl, loginEl, signupEl, forgetEl;
  function setState(){
    if(!btn) return;
    var on = !!st.user && !!st.token;
    btn.title = on ? ('已登录 '+st.user+' · 点击管理同步') : '跨设备同步（登录账号）';
    if(dot) dot.className = 'kb-dot' + (st.busy?' busy':(on?' on':''));
    if(lab) lab.textContent = on ? '已同步' : '同步';
    if(userEl) userEl.textContent = on ? st.user : '未登录';
    if(timeEl) timeEl.textContent = st.lastSync ? ('上次同步：'+new Date(st.lastSync).toLocaleString()) : '尚未同步';
    /* 第三颗按钮随登录状态换身份：已登录=退出登录，未登录=关闭面板 */
    if(outEl){
      outEl.textContent = on ? '退出登录' : '关闭';
      outEl.title = on ? '清除这台设备的登录状态（云端数据保留）' : '关闭这个面板';
    }
    if(loginEl) loginEl.textContent = st.recovery ? '保存新密码' : (on ? '切换账号登录' : '登录');
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

  /* ---------- HTTP：Auth + PostgREST ---------- */
  function errMsg(status, d){
    var code = (d && (d.error_code || d.error)) || '';
    var raw  = (d && (d.msg || d.message || d.error_description)) || '';
    if(code==='invalid_credentials' || /invalid login credentials/i.test(raw)) return '邮箱或密码不正确';
    if(code==='email_not_confirmed' || /email not confirmed/i.test(raw)) return '邮箱还没确认：去收件箱点确认链接，或在后台关掉「Confirm email」';
    if(code==='user_already_exists' || /already registered/i.test(raw)) return '这个邮箱已经注册过了，直接点「登录」';
    if(code==='weak_password' || /password should be at least/i.test(raw)) return '密码太短，至少 6 位';
    if(code==='over_email_send_rate_limit' || status===429) return '操作太频繁，等几分钟再试（免费版邮箱发送有配额）';
    if(code==='42501' || /permission denied for table/i.test(raw)) return '数据库没给登录用户授权：把建表脚本最后那句 GRANT 再跑一遍';
    if(code==='PGRST301' || /JWT expired/i.test(raw)) return '登录已过期，请重新登录';
    if(status===401) return '登录已过期，请重新登录';
    if(status===403) return '没有权限（检查数据表的 RLS 策略是否建好）';
    if(status===409 || code==='42P10' || /no unique or exclusion constraint/i.test(raw)) return '数据表缺少唯一约束 (user_id, key)：按说明重建表或补一条唯一索引';
    if(status===404 || code==='42P01' || /does not exist/i.test(raw)) return '数据表还不存在：先在 Supabase 建 user_progress 表';
    return raw || ('请求失败（'+status+'）');
  }
  function req(path, opt){
    opt = opt || {};
    var h = {'apikey':SB_KEY, 'Content-Type':'application/json'};
    if(opt.headers) for(var k in opt.headers) h[k]=opt.headers[k];
    if(opt.auth!==false) h['Authorization'] = 'Bearer ' + (opt.token || st.token || SB_KEY);
    return fetch(SB_URL+path, { method:opt.method||'GET', headers:h, body:opt.body }).then(function(r){
      return r.text().then(function(t){
        var d=null; try{ d = t? JSON.parse(t) : null; }catch(e){ d=t; }
        if(!r.ok){ var e=new Error(errMsg(r.status,d)); e.status=r.status; throw e; }
        return d;
      });
    });
  }

  /* ---------- 会话 ---------- */
  function loadSes(){
    try{ var s=JSON.parse(ls(SES)||'null'); if(!s||!s.a||!s.r) return null; return s; }catch(e){ return null; }
  }
  function saveSes(){
    lsSet(SES, JSON.stringify({a:st.token,r:st.refresh,e:st.exp,u:st.user,id:st.uid}));
  }
  function applySes(d){
    st.token = d.access_token;
    if(d.refresh_token) st.refresh = d.refresh_token;
    st.exp = Date.now() + ((+d.expires_in||3600) * 1000);
    if(d.user){ st.uid = d.user.id || st.uid; st.user = d.user.email || st.user; }
    saveSes(); setState();
  }
  function clearSes(){
    lsDel(SES);
    st.token=''; st.refresh=''; st.exp=0; st.uid=''; st.user='';
    setState();
  }
  /* 令牌 1 小时过期：快到期就先刷新（refresh_token 会轮换，必须存新的） */
  function ready(){
    if(!st.refresh) return Promise.reject(new Error('请先登录'));
    if(Date.now() < st.exp - 90000) return Promise.resolve();
    return req('/auth/v1/token?grant_type=refresh_token', {
      method:'POST', auth:false, body:JSON.stringify({refresh_token:st.refresh})
    }).then(applySes).catch(function(){
      clearSes(); throw new Error('登录已过期，请重新登录');
    });
  }

  /* ---------- 拉取：远端较新的行写入本地 ---------- */
  function pull(silent){
    if(!st.token || st.busy) return Promise.resolve(false);
    st.busy=true; setState();
    return ready().then(function(){
      return req('/rest/v1/'+TB+'?select=key,value,ts&limit=2000');
    }).then(function(rows){
      var meta=jget(MK,{}), snap=jget(SK,{}), changed=[];
      st.applying=true;
      (rows||[]).forEach(function(r){
        var k=r.key; if(!k) return;
        var rt=+r.ts||0, v=r.value;
        if(v==null) return;
        if(rt > (meta[k]||0)){
          if(ls(k)!==v){
            /* 覆盖前先留本地备份（键名 kb-sync-bak-<原键>），可用控制台恢复 */
            var old=ls(k);
            if(old!=null && ls('kb-sync-bak-'+k)==null) lsSet('kb-sync-bak-'+k, old);
            lsSet(k,v); changed.push(k);
          }
          meta[k]=rt; snap[k]=v;
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
      if(/登录已过期/.test(e.message)) clearSes();
      return false;
    }).then(function(r){ st.busy=false; setState(); return r; });
  }

  /* ---------- 推送：本地改动（对比上次同步快照）写回数据库 ---------- */
  function push(){
    if(!st.token || st.busy) return Promise.resolve(false);
    var snap=jget(SK,{}), now=Date.now(), rows=[], upd={};
    syncKeys().forEach(function(k){
      var v=ls(k); if(v==null) return;
      if(v===snap[k]) return;                    /* 只有真的变了才上传 */
      rows.push({ user_id:st.uid, key:k, value:v, ts:now });
      upd[k]={ t:now, v:v };
    });
    if(!rows.length){ st.dirty=false; return Promise.resolve(false); }
    st.busy=true; setState();
    return ready().then(function(){
      return req('/rest/v1/'+TB+'?on_conflict=user_id,key', {
        method:'POST',
        headers:{ 'Prefer':'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows)
      });
    }).then(function(){
      var meta=jget(MK,{}), snap2=jget(SK,{});
      Object.keys(upd).forEach(function(k){ meta[k]=upd[k].t; snap2[k]=upd[k].v; });
      lsSet(MK,JSON.stringify(meta)); lsSet(SK,JSON.stringify(snap2));
      st.dirty=false; st.lastSync=Date.now(); setState();
      return true;
    }).catch(function(e){
      showMsg(e.message,true);
      if(/登录已过期/.test(e.message)) clearSes();
      return false;
    }).then(function(r){ st.busy=false; setState(); return r; });
  }
  function schedulePush(){
    if(!st.token || st.applying) return;
    st.dirty=true;
    clearTimeout(schedulePush._t);
    schedulePush._t=setTimeout(function(){ push(); }, 1500);
  }

  /* ---------- 登录 / 注册 ----------
     o = { email, password, mode:'in'|'up' }
     cb 可选：{ msg(t,err), done(user), fail(msg) }
     传 cb 时不自动关闭弹窗（供首次引导等外部界面内嵌使用） */
  function login(o, cb){
    o = o || {};
    function notify(kind, a, b){
      if(!cb) return;
      var f = (typeof cb==='function') ? (kind==='msg'?cb:null) : cb[kind];
      if(typeof f==='function') f(a,b);
    }
    function say(t,err){ showMsg(t,err); notify('msg', t, !!err); }

    /* 恢复密码模式：这颗按钮变成"保存新密码" */
    if(st.recovery) return changePassword(o.password, cb);

    var email=(o.email||'').trim().toLowerCase(), pwd=o.password||'', up=(o.mode==='up');
    if(!email) return say('请填写邮箱',true);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say('邮箱格式不对',true);
    if(!pwd) return say('请填写密码',true);
    if(pwd.length<6) return say('密码至少 6 位',true);

    say(up ? '正在创建账号…' : '正在登录…');
    st.busy=true; setState();

    var p = up
      ? req('/auth/v1/signup', { method:'POST', auth:false, body:JSON.stringify({email:email,password:pwd}) })
      : req('/auth/v1/token?grant_type=password', { method:'POST', auth:false, body:JSON.stringify({email:email,password:pwd}) });

    return p.then(function(d){
      if(!d || !d.access_token){
        /* 项目开了「Confirm email」：注册后要先点邮件里的链接 */
        var m='注册成功，但还要确认邮箱：去收件箱点确认链接即可自动登录（没收到看垃圾箱）';
        say(m,false); notify('fail', m); return;
      }
      applySes(d);
      st.busy = false;                 /* pull/push 自己会置忙，这里先放行 */
      say('登录成功，正在同步数据…');
      return pull().then(function(){ return push(); }).then(function(){
        say('已登录 '+(st.user||'')+'，数据已同步', false);
        setState(); notify('done', st.user);
        if(!cb) setTimeout(closeModal, 700);
        toast('已开启跨设备同步');
      });
    }).catch(function(e){
      say(e.message||'登录失败',true);
      clearSes(); notify('fail', e.message||'登录失败');
    }).then(function(){ st.busy=false; setState(); });
  }

  /* 重置密码邮件的回跳地址：对齐 Supabase 里登记的站点根（如 https://xxx.github.io/GS_learn，不带末尾斜杠） */
  function siteBase(){
    var seg=(location.pathname||'/').split('/').filter(Boolean);
    return seg.length ? (location.origin + '/' + seg[0]) : (location.origin + '/');
  }

  /* 忘记密码：发一封重置邮件，点链接回到本站设新密码 */
  function recover(email){
    email=(email||'').trim().toLowerCase();
    if(!email){ showMsg('先在上面填好邮箱，再点「忘记密码」',true); return Promise.resolve(); }
    showMsg('正在发送重置邮件…');
    return req('/auth/v1/recover', {
      method:'POST', auth:false,
      body:JSON.stringify({ email:email, redirect_to: siteBase() })
    }).then(function(){
      showMsg('重置邮件已发送：到邮箱点链接，回到本站设置新密码（没收到看垃圾箱）');
    }).catch(function(e){ showMsg(e.message,true); });
  }
  function changePassword(pwd, cb){
    function notify(kind,a){ if(cb && typeof cb[kind]==='function') cb[kind](a); }
    if(!pwd || pwd.length<6){ showMsg('密码至少 6 位',true); notify('fail','密码至少 6 位'); return; }
    showMsg('正在保存新密码…');
    return req('/auth/v1/user', { method:'PUT', body:JSON.stringify({password:pwd}) })
      .then(function(){
        st.recovery=false; setRecoveryUI(false); saveSes();
        showMsg('密码已更新，正在同步数据…');
        return pull().then(function(){ return push(); }).then(function(){
          showMsg('密码已更新，已登录 '+(st.user||''), false);
          notify('done', st.user);
          if(!cb) setTimeout(closeModal, 800);
        });
      }).catch(function(e){
        showMsg(e.message||'保存失败',true); notify('fail', e.message);
      });
  }

  function logout(){
    /* 未登录时这颗按钮的语义是「关闭这个界面」 */
    if(!st.token && !st.user){ showMsg(''); closeModal(); return; }
    var hadTok = st.token;
    clearSes();
    lsDel(MK); lsDel(SK);
    st.lastSync=0; st.dirty=false; st.recovery=false;
    setRecoveryUI(false);
    setState(); showMsg('已退出登录（本地数据保留，云端数据还在）');
    toast('已退出登录');
    setTimeout(closeModal, 700);
    if(hadTok){
      req('/auth/v1/logout', { method:'POST', token:hadTok }).catch(function(){});
    }
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
  function setRecoveryUI(on){
    st.recovery = !!on;
    if(mailEl){
      mailEl.style.display = on ? 'none' : '';
      mailEl.value = on ? '' : mailEl.value;
    }
    if(pwdEl) pwdEl.placeholder = on ? '输入新密码（至少 6 位）' : '密码（至少 6 位）';
    if(signupEl) signupEl.style.display = on ? 'none' : '';
    if(forgetEl) forgetEl.style.display = on ? 'none' : '';
    setState();
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
      '.kb-row b{color:var(--hi,var(--ink,#1c1c1e));max-width:62%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n'+
      '.kb-in{width:100%;box-sizing:border-box;border:1px solid var(--line2,var(--line-2,#dddde2));border-radius:10px;\n'+
      '  padding:9px 11px;font:12px/1.5 inherit;background:var(--panel2,var(--panel-2,#f6f6f8));color:inherit;margin-bottom:8px}\n'+
      '.kb-in:focus{outline:none;border-color:var(--acc,var(--ac,#3478f6));background:var(--panel-solid,var(--panel,#fff))}\n'+
      '#kb-sync-mail{font:12px/1.5 ui-monospace,Consolas,monospace}\n'+
      '.kb-btns{display:flex;gap:8px;margin:10px 0 4px}\n'+
      '.kb-btn{flex:1;border:1px solid var(--line2,var(--line-2,#dddde2));border-radius:10px;background:var(--panel2,var(--panel-2,#f6f6f8));\n'+
      '  padding:9px 0;font:600 12.5px inherit;font-family:inherit;cursor:pointer;color:var(--hi,var(--ink,#1c1c1e))}\n'+
      '.kb-btn:hover{border-color:var(--acc,var(--ac,#3478f6));color:var(--acc,var(--ac,#3478f6))}\n'+
      '.kb-btn.pri{background:var(--acc,var(--ac,#3478f6));border-color:var(--acc,var(--ac,#3478f6));color:#fff}\n'+
      '.kb-btn.pri:hover{opacity:.9;color:#fff}\n'+
      '.kb-msg{font-size:11.5px;color:var(--ink2,var(--fg-2,#6e6e73));min-height:18px;margin-top:6px;word-break:break-word}\n'+
      '.kb-msg.err{color:#eb4d3d}\n'+
      '.kb-tokhint{font-size:10.5px;color:var(--ink3,var(--fg-3,#aeaeb2));line-height:1.6;margin:-3px 0 2px}\n'+
      '.kb-tokhint b{color:var(--warn,#d98324)}\n'+
      '.kb-forget{font-size:11px;color:var(--acc,var(--ac,#3478f6));cursor:pointer;text-decoration:none;user-select:none}\n'+
      '.kb-forget:hover{text-decoration:underline}\n'+
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
      '.kb-guide .kb-h{margin:10px 0 3px;font-size:11.5px;font-weight:600;color:var(--hi,var(--ink,#1c1c1e));line-height:1.5}\n'+
      '.kb-guide .kb-note{font-size:10.5px;color:var(--ink3,var(--fg-3,#aeaeb2));margin:5px 0 0;line-height:1.7}\n'+
      '.kb-guide ul{margin:4px 0 2px;padding-left:16px;font-size:11.5px;color:var(--ink2,var(--fg-2,#6e6e73));line-height:1.75}\n'+
      '.kb-guide ul ul{margin:3px 0 4px;padding-left:15px;font-size:11px;color:var(--ink3,var(--fg-3,#8e8e93));line-height:1.7}\n'+
      '.kb-guide li{margin-bottom:3px}\n'+
      '#kb-sync-card{max-height:86vh;overflow-y:auto}\n'+
      '#kb-sync-card{width:452px}\n'+
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
      +'<div class="kb-sub">用邮箱注册一个账号，做题记录、错题本、收藏、试卷记录、头像昵称都存进你自己的账号里；三个站点共用同一个账号，换设备只要登录一次，不用再管令牌。</div>'
      +'<div class="kb-row">账号：<b id="kb-sync-user">未登录</b><span style="flex:1"></span><span id="kb-sync-time">尚未同步</span></div>'
      +'<input class="kb-in" id="kb-sync-mail" type="email" placeholder="邮箱" autocomplete="username" spellcheck="false">'
      +'<input class="kb-in" id="kb-sync-pwd" type="password" placeholder="密码（至少 6 位）" autocomplete="current-password">'
      +'<div class="kb-btns">'
      +'<button class="kb-btn pri" id="kb-sync-login" type="button">登录</button>'
      +'<button class="kb-btn" id="kb-sync-signup" type="button">注册新账号</button>'
      +'</div>'
      +'<div class="kb-btns" style="margin-top:2px">'
      +'<button class="kb-btn" id="kb-sync-now" type="button">立即同步</button>'
      +'<button class="kb-btn" id="kb-sync-out" type="button">退出登录</button>'
      +'</div>'
      +'<div style="text-align:right"><a class="kb-forget" id="kb-sync-forget">忘记密码？</a></div>'
      +'<div class="kb-msg" id="kb-sync-msg"></div>'
      +'<details class="kb-guide" id="kb-sync-guide">'
      +'<summary>第一次用？怎么注册 · 换设备 · 数据存在哪</summary>'
      +'<p class="kb-h">第 1 步 · 注册（约 20 秒）</p>'
      +'<ul>'
      +'<li>上面填一个常用邮箱 + 自己想的密码（<b>至少 6 位</b>），点 <b>「注册新账号」</b>。</li>'
      +'<li>如果弹出"要确认邮箱"，去收件箱点那封确认链接，回到本站就自动登录了（没收到先看垃圾箱）。</li>'
      +'<li>已经有账号了：填同样的邮箱密码，点 <b>「登录」</b> 就行。</li>'
      +'</ul>'
      +'<p class="kb-h">第 2 步 · 换设备 / 第二台设备</p>'
      +'<ul>'
      +'<li>在新设备打开本站 → 右上角「同步」→ 填<b>同一个邮箱和密码</b> → 登录。</li>'
      +'<li>错题本、收藏、试卷记录、头像昵称会自动拉下来；<b>三个站点共用这一个账号</b>，各站分别登录一次即可（同一浏览器只要一次）。</li>'
      +'<li>不需要记住令牌、不需要复制粘贴任何密钥 —— 这就是换掉 GitHub 令牌的原因。</li>'
      +'</ul>'
      +'<p class="kb-h">忘记密码怎么办</p>'
      +'<ul>'
      +'<li>填好邮箱 → 点下面的 <b>「忘记密码？」</b> → 去邮箱点链接 → 回到本站直接输新密码。</li>'
      +'<li>邮件用的是免费的默认发信服务，<b>1 小时最多几封</b>；点太多次会被限流，等几分钟再试。</li>'
      +'</ul>'
      +'<p class="kb-h">数据到底存在哪</p>'
      +'<ul>'
      +'<li>存在 Supabase 的 <code>public.user_progress</code> 表，每行是 <code>user_id + key + value + ts</code>。</li>'
      +'<li>表上开了 <b>RLS（行级安全）</b>：数据库层面强制"只能读写 user_id = 自己"的行，别人即使拿到链接也看不到你的记录。</li>'
      +'<li>本站前端只带 publishable key，它只能证明"来自哪个项目"，不能绕过 RLS 读别人的数据。</li>'
      +'</ul>'
      +'<p class="kb-h">多设备冲突 · 退出登录</p>'
      +'<ul>'
      +'<li>多台设备可同时登录，各自改动都会上传；同一条记录冲突时以<b>最后修改的</b>为准（按时间戳 ts 判定），不会互相清空。</li>'
      +'<li>「退出登录」只清这台设备的登录状态，云端数据保留，下次登录还在。</li>'
      +'<li>要彻底删除：到 Supabase 控制台把那张表里自己的行删掉，或在 Authentication → Users 删掉该用户（连带删除）。</li>'
      +'</ul>'
      +'<p class="kb-note">邮箱只用来登录，本站不会给你发任何推广邮件；密码经 Supabase Auth 加密存储，本站拿不到明文。</p>'
      +'</details>'
      +'<div class="kb-tip">把页面链接后加 <code>?sync=1</code> 发给别人，打开就直达这个登录面板。</div>';
    document.body.appendChild(m);
    document.body.appendChild(card);

    btn=document.getElementById('kb-sync-btn');
    dot=document.getElementById('kb-sync-dot');
    lab=document.getElementById('kb-sync-t');
    modal=card; msgEl=document.getElementById('kb-sync-msg');
    userEl=document.getElementById('kb-sync-user'); timeEl=document.getElementById('kb-sync-time');
    mailEl=document.getElementById('kb-sync-mail'); pwdEl=document.getElementById('kb-sync-pwd');
    loginEl=document.getElementById('kb-sync-login'); signupEl=document.getElementById('kb-sync-signup');
    forgetEl=document.getElementById('kb-sync-forget');
    outEl=document.getElementById('kb-sync-out');

    function cred(mode){ return { email:mailEl.value, password:pwdEl.value, mode:mode }; }

    btn.addEventListener('click',function(e){
      e.stopPropagation(); openModal();
    });
    m.addEventListener('click',closeModal);
    loginEl.addEventListener('click',function(){ login(cred('in')); });
    signupEl.addEventListener('click',function(){ login(cred('up')); });
    document.getElementById('kb-sync-now').addEventListener('click',function(){
      push().then(function(){ return pull(); }).then(function(){ toast(st.user?'已同步':'未登录'); });
    });
    outEl.addEventListener('click',logout);
    forgetEl.addEventListener('click',function(){ recover(mailEl.value); });
    mailEl.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); pwdEl.focus(); } });
    pwdEl.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); login(cred('in')); } });
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
        if(CONF.keys.indexOf(k)>=0 || (k && k.indexOf(CONF.prefix)===0 && k.indexOf('kb-sync-')!==0 && k.indexOf('kb-sb-')!==0)) schedulePush();
      };
    }catch(e){}
  }

  /* ---------- 邮件链接回跳：确认邮箱 / 重置密码 ---------- */
  function hashParams(){
    var h=(location.hash||'').replace(/^#/,''); if(!h) return null;
    var o={}, ps=h.split('&');
    for(var i=0;i<ps.length;i++){
      var j=ps[i].indexOf('=');
      if(j>0) o[decodeURIComponent(ps[i].slice(0,j))]=decodeURIComponent(ps[i].slice(j+1));
    }
    return o;
  }
  function handleHash(){
    var p=hashParams();
    if(!p || !p.access_token) return Promise.resolve(false);
    var t=p.type||'';
    if(t!=='recovery' && t!=='signup' && t!=='magiclink' && t!=='email_change') return Promise.resolve(false);
    st.token=p.access_token;
    st.refresh=p.refresh_token||'';
    st.exp=Date.now()+((+p.expires_in||3600)*1000);
    try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){}
    return req('/auth/v1/user').then(function(u){
      st.uid=(u&&u.id)||''; st.user=(u&&u.email)||'';
      if(t==='recovery'){
        st.recovery=true;
        openModal(); setRecoveryUI(true);
        showMsg('设置一个新密码，保存后即登录', false);
        if(pwdEl) pwdEl.focus();
        return true;
      }
      saveSes(); setState();
      toast('邮箱已确认，已登录');
      return pull().then(function(){ return push(); }).then(function(){ return true; });
    }).catch(function(){ return false; });
  }

  /* ---------- 启动 ---------- */
  function boot(){
    buildUI();
    hookWrites();
    var s=loadSes();
    if(s){ st.token=s.a; st.refresh=s.r; st.exp=s.e||0; st.user=s.u||''; st.uid=s.id||''; }
    setState();
    if(/[?&]sync=1(&|$)/.test(location.search)) setTimeout(openModal, 300);
    handleHash().then(function(){
      if(st.token && st.user && !st.recovery){
        pull(true);
        setInterval(function(){ pull(true); }, 60000);
        document.addEventListener('visibilitychange',function(){
          if(document.visibilityState==='visible') pull(true);
        });
        window.addEventListener('focus',function(){ pull(true); });
      }
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();

  window.KBSync = { pull:pull, push:push, logout:logout, login:login, recover:recover,
    changePassword:changePassword, state:st, close:closeModal,
    logged:function(){ return !!st.token && !!st.user; } };
})();
