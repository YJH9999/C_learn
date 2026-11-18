/* =============================================================================
   kb-profile.js · 右上角个人信息面板
   —— 头像 / 昵称 / 使用时长 / 做题数 / 错题数 / 正确率
   —— 全部数据存 localStorage：未登录也在统计，登录同步后自动进账号（Supabase）
   —— 依赖：sync.js（若存在则共用同一套同步机制）
   ============================================================================= */
(function(){
  var S = document.currentScript || (function(){
    var ss=document.getElementsByTagName('script');
    for(var i=ss.length-1;i>=0;i--) if(/profile\.js/.test(ss[i].src)) return ss[i];
    return null;
  })();
  var SITE = (S && S.getAttribute('data-site')) || 'gs';
  var SITE_NAME = {'gs':'高数','xd':'线代','c':'C 语言'}[SITE] || SITE;
  var STAT_KEY = SITE + '_stat';          // gs_stat / xd_stat / c_stat（同步会自动带上）
  var PROF_KEY = 'kb-prof';               // 三站共用：头像/昵称
  var WRONG_KEY = {'gs':'gs_wrong','xd':'xd_wrong','c':'ex-th-wrong'}[SITE];
  var ALL_WRONG = {'gs':'gs_wrong','xd':'xd_wrong','c':'ex-th-wrong'};
  var ZOOM_KEY = 'kb-zoom';               // 全站字号缩放（三站共用）
  var FLUSH = 60000;                      // 每 60s 落盘一次，避免频繁触发同步

  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function jget(k,d){ try{ var s=ls(k); return s?JSON.parse(s):d; }catch(e){ return d; } }

  var prof = jget(PROF_KEY, {name:'', av:'', color:'#3b82f6', emoji:'🐳'});
  var stat = jget(STAT_KEY, {t:0,n:0,ok:0,d:{}});
  if(!stat.d) stat.d = {};
  var dirty = false, btn=null, panel=null, tick=null;

  function today(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function dget(){ var k=today(); if(!stat.d[k]) stat.d[k]={t:0,n:0,ok:0}; return stat.d[k]; }
  function pruneDays(){
    var ks=Object.keys(stat.d).sort();
    while(ks.length>120){ delete stat.d[ks.shift()]; }
  }
  function flush(){
    if(!dirty) return;
    pruneDays();
    stat.upd = Date.now();
    lsSet(STAT_KEY, JSON.stringify(stat));
    dirty=false;
  }

  /* ---------- 计时：只算可见时间 ---------- */
  function startTimer(){
    if(tick) clearInterval(tick);
    tick = setInterval(function(){
      if(document.visibilityState!=='visible') return;
      stat.t += 10; dget().t += 10; dirty = true;
    }, 10000);
    setInterval(flush, FLUSH);
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState==='hidden') flush();
    });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  /* ---------- 对外接口：做题计数 ---------- */
  window.KBStats = {
    answer: function(ok){
      stat.n += 1; dget().n += 1;
      if(ok){ stat.ok += 1; dget().ok += 1; }
      dirty = true;
      if(btn) renderStats();
    },
    batch: function(answered, ok){
      stat.n += answered||0; dget().n += answered||0;
      stat.ok += ok||0; dget().ok += ok||0;
      dirty = true;
      if(btn) renderStats();
    },
    /* 离线做题折算的时长：一次性加进「本站使用时长」并立刻落盘（好让同步带走） */
    addTime: function(sec){
      sec = Math.round(sec||0);
      if(sec<=0) return;
      stat.t += sec; dget().t += sec;
      dirty = true;
      flush();
      if(btn) renderStats();
    },
    refresh: function(){ if(btn) renderStats(); },
    flush: flush
  };

  /* ---------- 格式化 ---------- */
  function fmtTime(sec){
    if(sec<60) return '不到 1 分钟';
    var m = Math.round(sec/60);
    if(m<60) return m+' 分钟';
    var h = Math.floor(m/60), mm = m%60;
    return mm? h+' 小时 '+mm+' 分' : h+' 小时';
  }
  function pct(ok,n){ return n? Math.round(ok/n*100)+'%' : '—'; }
  function wrongCount(site){
    var a = jget(ALL_WRONG[site], []);
    return Array.isArray(a) ? a.length : 0;
  }

  /* ---------- UI ---------- */
  function avatarHTML(size){
    var s = size+'px';
    if(prof.av) return '<img src="'+prof.av+'" alt="" style="width:'+s+';height:'+s+';border-radius:50%;object-fit:cover;display:block">';
    return '<span style="width:'+s+';height:'+s+';border-radius:50%;background:'+(prof.color||'#3b82f6')+
      ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:'+Math.round(size*0.5)+
      'px;line-height:1">'+(prof.emoji||((prof.name||'?').slice(0,1))) +'</span>';
  }

  function buildStyle(){
    var st=document.createElement('style');
    st.textContent =
      '.kbp{position:relative;display:flex;align-items:center}\n'+
      '#kbp-btn{width:28px;height:28px;border-radius:50%;border:1px solid var(--line,var(--line2,#e2e2e6));\n'+
      '  background:var(--panel2,var(--panel-2,#f2f2f7));cursor:pointer;padding:0;overflow:hidden;flex:none;\n'+
      '  display:flex;align-items:center;justify-content:center}\n'+
      '#kbp-btn:hover{border-color:var(--acc,var(--ac,#3b82f6))}\n'+
      '#kbp-panel{position:absolute;right:0;top:calc(100% + 8px);width:308px;z-index:118;\n'+
      '  background:var(--panel-solid,var(--panel,#fff));color:var(--hi,var(--ink,#1c1c1e));\n'+
      '  border:1px solid var(--line,var(--line-2,#e8e8ec));border-radius:14px;\n'+
      '  box-shadow:0 18px 50px rgba(0,0,0,.18);padding:14px;display:none;\n'+
      '  font:12.5px/1.6 "PingFang SC","Microsoft YaHei",-apple-system,sans-serif}\n'+
      '#kbp-panel.on{display:block}\n'+
      '.kbp-head{display:flex;gap:11px;align-items:center}\n'+
      '.kbp-avwrap{position:relative;cursor:pointer;flex:none}\n'+
      '.kbp-avwrap:hover:after{content:"换头像";position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,.45);\n'+
      '  color:#fff;font-size:9.5px;display:flex;align-items:center;justify-content:center}\n'+
      '.kbp-name{flex:1;min-width:0}\n'+
      '.kbp-nick{width:100%;box-sizing:border-box;background:transparent;border:1px solid transparent;border-radius:7px;\n'+
      '  padding:2px 5px;margin-left:-5px;font:600 14px inherit;color:inherit}\n'+
      '.kbp-nick:hover{border-color:var(--line,var(--line-2,#e6e6ea))}\n'+
      '.kbp-nick:focus{outline:none;border-color:var(--acc,var(--ac,#3b82f6));background:var(--panel2,var(--panel-2,#f6f6f8))}\n'+
      '.kbp-sub{font-size:11px;color:var(--ink2,var(--fg-2,#8e8e93));margin-top:1px}\n'+
      '.kbp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 4px}\n'+
      '.kbp-cell{background:var(--panel2,var(--panel-2,#f6f6f8));border-radius:10px;padding:8px 10px}\n'+
      '.kbp-k{font-size:10.5px;color:var(--ink2,var(--fg-2,#8e8e93))}\n'+
      '.kbp-v{font:600 16px/1.3 inherit;letter-spacing:-.2px}\n'+
      '.kbp-v small{font:500 10.5px inherit;color:var(--ink3,var(--fg-3,#98989f));margin-left:3px;letter-spacing:0}\n'+
      '.kbp-today{font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f));margin:6px 0 10px;line-height:1.7}\n'+
      '.kbp-foot{display:flex;gap:7px;border-top:1px dashed var(--line,var(--line-2,#e8e8ec));padding-top:10px}\n'+
      '.kbp-btn2{flex:1;border:1px solid var(--line,var(--line-2,#e2e2e6));border-radius:9px;background:var(--panel2,var(--panel-2,#f6f6f8));\n'+
      '  padding:7px 0;font:600 11.5px inherit;cursor:pointer;color:inherit}\n'+
      '.kbp-btn2:hover{border-color:var(--acc,var(--ac,#3b82f6));color:var(--acc,var(--ac,#3b82f6))}\n'+
      '.kbp-swatches{display:flex;gap:6px;margin:9px 0 0}\n'+
      '.kbp-sw{width:18px;height:18px;border-radius:50%;border:2px solid transparent;cursor:pointer}\n'+
      '.kbp-sw.on{border-color:var(--hi,var(--ink,#1c1c1e))}\n'+
      '.kbp-emojis{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}\n'+
      '.kbp-em{width:24px;height:24px;border-radius:7px;border:1px solid transparent;background:transparent;\n'+
      '  cursor:pointer;font-size:14px;line-height:1;padding:0}\n'+
      '.kbp-em:hover{border-color:var(--line,var(--line-2,#e2e2e6))}\n'+
      '.kbp-em.on{border-color:var(--acc,var(--ac,#3b82f6));background:var(--panel2,var(--panel-2,#f6f6f8))}\n'+
      '.kbp-hide{display:none}\n'+
      /* ---- 字号调节 ---- */
      '.kbp-z{display:flex;align-items:center;gap:1px;background:var(--panel2,var(--panel-2,#f2f2f7));border-radius:10px;padding:2px;flex:none}\n'+
      '.kbp-z button{border:0;background:transparent;color:var(--ink2,var(--fg-2,#6e6e73));cursor:pointer;\n'+
      '  font:600 11px/1 inherit;padding:5px 6px;border-radius:8px;font-family:inherit;transition:.15s}\n'+
      '.kbp-z button:hover{color:var(--acc,var(--ac,#3478f6));background:var(--panel-solid,var(--panel,#fff))}\n'+
      '.kbp-z button:disabled{opacity:.35;cursor:default}\n'+
      '.kbp-z span{font:600 10.5px/1 inherit;color:var(--ink3,var(--fg-3,#8e8e93));min-width:29px;text-align:center}\n'+
      /* ---- 首次引导 ---- */
      '#kbp-ob{position:fixed;inset:0;background:rgba(0,0,0,.42);z-index:150;display:flex;align-items:center;\n'+
      '  justify-content:center;padding:20px;backdrop-filter:blur(2px)}\n'+
      '#kbp-ob-card{width:414px;max-width:94vw;max-height:92vh;overflow-y:auto;background:var(--panel-solid,var(--panel,#fff));\n'+
      '  color:var(--hi,var(--ink,#1c1c1e));border-radius:18px;padding:22px 22px 18px;\n'+
      '  box-shadow:0 26px 80px rgba(0,0,0,.34);font:13px/1.6 "PingFang SC","Microsoft YaHei",-apple-system,sans-serif}\n'+
      '#kbp-ob-card h3{margin:0 0 5px;font:700 17px/1.35 inherit}\n'+
      '#kbp-ob-card .ob-sub{font-size:11.5px;color:var(--ink2,var(--fg-2,#8e8e93));margin:0 0 15px;line-height:1.65}\n'+
      '.ob-row{display:flex;align-items:center;gap:13px;margin-bottom:14px}\n'+
      '.ob-av{width:56px;height:56px;flex:none;border-radius:50%;overflow:hidden;cursor:pointer;\n'+
      '  box-shadow:0 4px 14px rgba(0,0,0,.14)}\n'+
      '.ob-field{flex:1;min-width:0}\n'+
      '.ob-field label{display:block;font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f));margin-bottom:3px}\n'+
      '.ob-field input{width:100%;box-sizing:border-box;border:1px solid var(--line,var(--line-2,#e2e2e6));border-radius:9px;\n'+
      '  background:var(--panel2,var(--panel-2,#f6f6f8));color:inherit;font:600 14px inherit;padding:7px 10px}\n'+
      '.ob-field input:focus{outline:none;border-color:var(--acc,var(--ac,#3b82f6));background:var(--panel-solid,var(--panel,#fff))}\n'+
      '.ob-lab{font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f));margin:0 0 6px}\n'+
      '.ob-go{width:100%;border:0;border-radius:11px;background:var(--acc,var(--ac,#3b82f6));color:#fff;\n'+
      '  padding:11px 0;font:600 13.5px inherit;cursor:pointer;margin-top:6px}\n'+
      '.ob-go:hover{filter:brightness(1.06)}\n'+
      '.ob-note{font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f));margin:9px 0 0;line-height:1.65}\n'+
      /* ---- 首次引导：登录卡 ---- */
      '.ob-state{font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f));min-height:15px;margin:8px 0 0;line-height:1.6;word-break:break-word}\n'+
      '.ob-state.ok{color:#1a9e4b}\n'+
      '.ob-state.err{color:#eb4d3d}\n'+
      '.ob-tok{width:100%;box-sizing:border-box;border:1px solid var(--line,var(--line-2,#e2e2e6));border-radius:9px;\n'+
      '  background:var(--panel2,var(--panel-2,#f6f6f8));color:inherit;font:12px/1.6 inherit;padding:9px 10px;margin-bottom:7px}\n'+
      '.ob-tok.ob-mail{font:11.5px/1.6 ui-monospace,Consolas,monospace}\n'+
      '.ob-tok:focus{outline:none;border-color:var(--acc,var(--ac,#3b82f6));background:var(--panel-solid,var(--panel,#fff))}\n'+
      '.ob-tok:disabled{opacity:.62}\n'+
      '.ob-syncrow{display:flex;align-items:center;gap:9px;margin-top:9px}\n'+
      '.ob-login{flex:1;border:1px solid var(--acc,var(--ac,#3b82f6));border-radius:9px;background:transparent;\n'+
      '  color:var(--acc,var(--ac,#3b82f6));padding:9px 0;font:600 12.5px inherit;cursor:pointer}\n'+
      '.ob-login:hover{background:var(--acc-soft,rgba(59,130,246,.1))}\n'+
      '.ob-login.pri{background:var(--acc,var(--ac,#3b82f6));color:#fff}\n'+
      '.ob-login.pri:hover{filter:brightness(1.06);color:#fff}\n'+
      '.ob-login:disabled{opacity:.55;cursor:default}\n'+
      '.ob-link{font-size:10.5px;color:var(--acc,var(--ac,#3b82f6));text-decoration:none;white-space:nowrap}\n'+
      '.ob-link:hover{text-decoration:underline}\n'+
      '.ob-tip{font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f));line-height:1.65;margin:7px 0 0}\n'+
      '.ob-tokhint{font-size:10px;color:var(--ink3,var(--fg-3,#98989f));line-height:1.6;margin:6px 0 0}\n'+
      '.ob-tokhint b{color:var(--warn,#d98324)}\n'+
      '.ob-skip{width:100%;border:0;background:transparent;color:var(--ink2,var(--fg-2,#6e6e73));\n'+
      '  font:600 12px inherit;padding:10px 0 2px;cursor:pointer}\n'+
      '.ob-skip:hover{color:var(--acc,var(--ac,#3b82f6))}\n'+
      /* ---- 首次引导：折叠说明 ---- */
      '.ob-guide{margin-top:12px;border-top:1px dashed var(--line,var(--line-2,#e8e8ec));padding-top:10px;\n'+
      '  font-size:11px;color:var(--ink2,var(--fg-2,#6e6e73));line-height:1.7}\n'+
      '.ob-guide summary{cursor:pointer;font:600 11.5px inherit;color:var(--ink2,var(--fg-2,#6e6e73));list-style:none;outline:none;\n'+
      '  display:flex;align-items:center;gap:4px}\n'+
      '.ob-guide summary::-webkit-details-marker{display:none}\n'+
      '.ob-guide summary:before{content:"\\25B8";display:inline-block;transition:transform .15s;color:var(--ink3,var(--fg-3,#98989f))}\n'+
      '.ob-guide[open] summary:before{transform:rotate(90deg)}\n'+
      '.ob-guide .ob-g-h{font:600 11px inherit;color:var(--hi,var(--ink,#1c1c1e));margin:10px 0 2px}\n'+
      '.ob-guide ul{margin:2px 0 2px;padding-left:16px}\n'+
      '.ob-guide li{margin-bottom:2px}\n'+
      '.ob-guide code{font:10.5px ui-monospace,Consolas,monospace;background:var(--panel2,var(--panel-2,#f6f6f8));\n'+
      '  padding:1px 3px;border-radius:4px}\n'+
      '.ob-guide a{color:var(--acc,var(--ac,#3b82f6));text-decoration:none}\n'+
      '.ob-guide a:hover{text-decoration:underline}\n'+
      '@media print{body{zoom:1!important}}\n';
    document.head.appendChild(st);
  }

  function renderStats(){
    if(!panel) return;
    var el = panel.querySelector('#kbp-stats');
    if(!el) return;
    var td = stat.d[today()] || {t:0,n:0,ok:0};
    el.innerHTML =
      '<div class="kbp-grid">'+
        '<div class="kbp-cell"><div class="kbp-k">使用时长</div><div class="kbp-v">'+fmtTime(stat.t)+'</div></div>'+
        '<div class="kbp-cell"><div class="kbp-k">做题</div><div class="kbp-v">'+stat.n+'<small>题</small></div></div>'+
        '<div class="kbp-cell"><div class="kbp-k">错题</div><div class="kbp-v">'+wrongCount(SITE)+'<small>道</small></div></div>'+
        '<div class="kbp-cell"><div class="kbp-k">正确率</div><div class="kbp-v">'+pct(stat.ok,stat.n)+'</div></div>'+
      '</div>'+
      '<div class="kbp-today">今日：'+fmtTime(td.t)+' · '+(td.n||0)+' 题 · '+pct(td.ok||0,td.n||0)+'</div>';
  }

  function renderHead(){
    if(!panel) return;
    var u = (window.KBSync && KBSync.state && KBSync.state.user) || '';
    panel.querySelector('#kbp-avwrap').innerHTML = avatarHTML(46);
    var nick = panel.querySelector('#kbp-nick');
    if(nick && document.activeElement!==nick && nick.value !== (prof.name||'')) nick.value = prof.name||'';
    nick && (nick.placeholder = '点这里改昵称');
    var sub = panel.querySelector('#kbp-sub');
    if(sub) sub.textContent = u ? (u + ' · 已登录同步') : '未登录 · 数据只在这台设备';
    if(btn) btn.innerHTML = avatarHTML(26).replace('width:26px;height:26px','width:26px;height:26px');
  }

  function buildUI(){
    buildStyle();
    var tools = document.querySelector('header .tools') || document.querySelector('.tools');
    if(!tools) return;

    // 字号调节（放在主题切换之后、头像之前）
    var seg = tools.querySelector('.seg');
    var zbox = document.createElement('div');
    zbox.className = 'kbp-z'; zbox.id = 'kbp-zoom';
    zbox.innerHTML = '<button type="button" id="kbp-z-" title="缩小字号">A−</button>'+
      '<span id="kbp-zv">100%</span>'+
      '<button type="button" id="kbp-z+" title="放大字号">A+</button>';
    if(seg && seg.parentNode===tools && seg.nextSibling) tools.insertBefore(zbox, seg.nextSibling);
    else tools.appendChild(zbox);
    bindZoom();

    var wrap=document.createElement('div');
    wrap.className='kbp';
    wrap.innerHTML='<button id="kbp-btn" type="button" title="个人中心"></button>';
    tools.appendChild(wrap);
    btn = wrap.querySelector('#kbp-btn');

    panel=document.createElement('div');
    panel.id='kbp-panel';
    panel.innerHTML =
      '<div class="kbp-head">'+
        '<div class="kbp-avwrap" id="kbp-avwrap" title="点击上传头像"></div>'+
        '<div class="kbp-name">'+
          '<input class="kbp-nick" id="kbp-nick" maxlength="16" spellcheck="false">'+
          '<div class="kbp-sub" id="kbp-sub"></div>'+
        '</div>'+
      '</div>'+
      '<div id="kbp-stats"></div>'+
      '<div class="kbp-foot">'+
        '<button class="kbp-btn2" id="kbp-sync" type="button">同步设置</button>'+
        '<button class="kbp-btn2" id="kbp-reset" type="button">重置统计</button>'+
      '</div>'+
      '<input type="file" id="kbp-file" accept="image/*" class="kbp-hide">';
    wrap.appendChild(panel);

    // 上传头像
    var file=panel.querySelector('#kbp-file');
    panel.querySelector('#kbp-avwrap').addEventListener('click', function(){ file.click(); });
    file.addEventListener('change', function(){
      var f=file.files && file.files[0]; if(!f) return;
      readAvatar(f, function(url){ prof.av = url; saveProf(); renderHead(); });
      file.value='';
    });

    // 昵称
    var nick=panel.querySelector('#kbp-nick');
    nick.addEventListener('change', function(){ prof.name=nick.value.trim().slice(0,16); saveProf(); renderHead(); });
    nick.addEventListener('keydown', function(e){ if(e.key==='Enter'){ nick.blur(); } });

    // 同步设置 / 重置
    panel.querySelector('#kbp-sync').addEventListener('click', function(){
      if(window.KBSync){ closePanel(); var b=document.getElementById('kb-sync-btn'); b && b.click(); }
      else alert('同步模块未加载（sync.js 不存在或加载失败）');
    });
    panel.querySelector('#kbp-reset').addEventListener('click', function(){
      if(!confirm('重置本机的使用时长与做题统计？（云端数据会在下次同步时被覆盖）')) return;
      stat={t:0,n:0,ok:0,d:{},upd:Date.now()};
      dirty=true; flush(); renderStats();
    });

    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var on=panel.classList.toggle('on');
      if(on){ renderHead(); renderStats(); }
    });
    document.addEventListener('click', function(e){
      if(!panel.classList.contains('on')) return;
      if(wrap.contains(e.target)) return;
      closePanel();
    });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') closePanel(); });

    renderHead(); renderStats();
  }

  function closePanel(){ panel && panel.classList.remove('on'); }

  /* ---------- 字号调节（全站统一缩放，三站共用 kb-zoom） ---------- */
  var zoom = parseFloat(ls(ZOOM_KEY) || '') || 1;
  function applyZoom(){
    zoom = Math.min(1.3, Math.max(0.85, Math.round(zoom * 20) / 20));
    try{ document.body.style.zoom = zoom; }catch(e){}
    lsSet(ZOOM_KEY, String(zoom));
    var v = document.getElementById('kbp-zv');
    if(v) v.textContent = Math.round(zoom*100)+'%';
    var dn = document.getElementById('kbp-z-'), up = document.getElementById('kbp-z+');
    if(dn) dn.disabled = zoom <= 0.85;
    if(up) up.disabled = zoom >= 1.3;
  }
  function bindZoom(){
    var dn = document.getElementById('kbp-z-'), up = document.getElementById('kbp-z+');
    if(dn) dn.onclick = function(){ zoom -= 0.05; applyZoom(); };
    if(up) up.onclick = function(){ zoom += 0.05; applyZoom(); };
  }

  /* ---------- 登录状态 / 同步提醒 ---------- */
  function logged(){
    return !!(window.KBSync && KBSync.state && KBSync.state.user);
  }
  function askSync(delay){
    if(logged()) return;
    var b = document.getElementById('kb-sync-btn');
    if(!b) return;
    setTimeout(function(){ b.click(); }, delay||280);
  }

  /* ---------- 头像图片压缩（160px 居中裁剪 JPEG） ---------- */
  function readAvatar(file, cb){
    var fr = new FileReader();
    fr.onload = function(){
      var img = new Image();
      img.onload = function(){
        var S2 = 160, cv = document.createElement('canvas');
        cv.width = S2; cv.height = S2;
        var ctx = cv.getContext('2d');
        var side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width-side)/2, (img.height-side)/2, side, side, 0, 0, S2, S2);
        try{ cb(cv.toDataURL('image/jpeg', 0.82)); }catch(e){}
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* ---------- 首次进入：① 登录（可跳过）→ ② 头像昵称 ---------- */
  var EMOJIS = ['🐳','📘','🧮','🔭','🌱','⚡️','🎯','🧠','🌙'];
  var COLORS = ['#3b82f6','#6366f1','#8b5cf6','#ec4899','#ef4444','#f59e0b','#10b981','#14b8a6','#64748b'];

  function guideHTML(){
    return '<details class="ob-guide"><summary>第一次用？怎么注册 · 换设备 · 数据存在哪</summary>'
      +'<p class="ob-g-h">第 1 步 · 注册一个账号（约 20 秒）</p>'
      +'<ul>'
      +'<li>上面填一个常用邮箱 + 自己想的密码（<b>至少 6 位</b>），点 <b>「注册」</b>。</li>'
      +'<li>如果提示要确认邮箱，去收件箱点那封链接，回到本站就自动登录了（没收到先看垃圾箱）。</li>'
      +'<li>已经有账号：填同样的邮箱密码，点 <b>「登录」</b>。</li>'
      +'</ul>'
      +'<p class="ob-g-h">第 2 步 · 换设备 / 第二台设备</p>'
      +'<ul>'
      +'<li>在新设备打开本站 → 右上角「同步」→ 填<b>同一个邮箱和密码</b> → 登录，记录自动拉下来。</li>'
      +'<li><b>不用令牌、不用 Regenerate、不用复制任何密钥</b> —— 这就是从 GitHub 令牌换过来的原因。</li>'
      +'<li>三个站点共用同一个账号，每站第一次打开时各登录一次即可。</li>'
      +'</ul>'
      +'<p class="ob-g-h">忘记密码</p>'
      +'<ul>'
      +'<li>在「同步」面板里填好邮箱 → 点 <b>「忘记密码？」</b> → 邮箱里点链接 → 回到本站直接输新密码。</li>'
      +'<li>免费发信服务有配额（大约每小时几封），点太多次会被限流，等几分钟再试。</li>'
      +'</ul>'
      +'<p class="ob-g-h">数据存在哪 · 别人能看到吗</p>'
      +'<ul>'
      +'<li>存在 Supabase 数据库的 <code>public.user_progress</code> 表：一行是 <code>user_id + key + value + ts</code>。</li>'
      +'<li>表上开了 <b>RLS（行级安全）</b>：数据库层面强制只能读写 <code>user_id = 自己</code> 的行。别人拿到项目地址和公开 key 也读不到你的记录。</li>'
      +'<li>密码由 Supabase Auth 加密存储，本站拿不到明文；邮箱只用来登录，不会收到任何推广邮件。</li>'
      +'</ul>'
      +'<p class="ob-g-h">多设备 · 换账号 · 退出登录</p>'
      +'<ul>'
      +'<li>多台设备可同时登录，各自改动都会上传；同一条记录冲突时以最后修改的为准，不会互相清空。</li>'
      +'<li>换账号：先「退出登录」，再用另一个邮箱登录；两个账号的数据互不相通。</li>'
      +'<li>退出登录只清这台设备的登录状态，云端数据保留，下次登录还在。</li>'
      +'<li>要彻底删除：Supabase 控制台里删掉该用户（连带删除其数据）。</li>'
      +'</ul>'
      +'</details>';
  }

  function obRoot(inner){
    var ob = document.createElement('div');
    ob.id = 'kbp-ob';
    ob.innerHTML = '<div id="kbp-ob-card">' + inner + '</div>';
    document.body.appendChild(ob);
    return ob;
  }

  function showOnboard(){
    if (document.getElementById('kbp-ob')) return;
    if (prof.onboarded) return;          // 云端资料已拉下来就不打扰
    if (logged()){ showProfileCard(); return; }   // 已经登录过、只是还没设资料
    showLoginGate();
  }

  /* ① 登录卡：只有注册/登录这一步，不登录就跳过 */
  function showLoginGate(){
    if (document.getElementById('kbp-ob')) return;
    var ob = obRoot(
      '<h3>注册 / 登录，跨设备同步</h3>'
      +'<p class="ob-sub">做题记录、错题本、收藏、试卷记录、头像昵称都跟着账号走，手机 / 平板 / 电脑共用一次登录。'
      +'<b>换设备只要同一个邮箱密码，不用再管令牌。</b>不登录也能正常用，数据只留在这台设备。</p>'
      +'<input class="ob-tok ob-mail" id="ob-mail" type="email" autocomplete="username" spellcheck="false" placeholder="邮箱">'
      +'<input class="ob-tok" id="ob-pwd" type="password" autocomplete="current-password" placeholder="密码（至少 6 位）">'
      +'<div class="ob-syncrow">'
      +'<button class="ob-login pri" id="ob-login" type="button">登录</button>'
      +'<button class="ob-login" id="ob-signup" type="button">注册</button>'
      +'</div>'
      +'<p class="ob-state" id="ob-state">未登录</p>'
      +guideHTML()
      +'<button class="ob-skip" id="ob-skip" type="button">暂不登录，先自己用 →</button>'
      +'<p class="ob-note">之后随时可以点右上角「同步」登录；已经登录过的话，资料会直接带过来。</p>'
    );

    var mailEl = ob.querySelector('#ob-mail');
    var pwdEl  = ob.querySelector('#ob-pwd');
    var lgBtn  = ob.querySelector('#ob-login');
    var upBtn  = ob.querySelector('#ob-signup');
    var stEl   = ob.querySelector('#ob-state');
    function state(cls, txt){ stEl.className = 'ob-state' + (cls ? ' ' + cls : ''); stEl.textContent = txt; }

    function next(){
      ob.remove();
      var p = jget(PROF_KEY, null);
      if (p && p.onboarded){                 // 云端已有头像昵称：直接用，不再问
        prof = Object.assign(prof, p);
        renderHead(); renderStats();
        return;
      }
      showProfileCard();
    }

    function go(mode){
      if (!window.KBSync){ state('err', '同步模块未加载'); return; }
      var email = mailEl.value.trim(), pwd = pwdEl.value;
      if (!email){ state('err', '请填邮箱'); mailEl.focus(); return; }
      if (!pwd){ state('err', '请填密码'); pwdEl.focus(); return; }
      if (pwd.length < 6){ state('err', '密码至少 6 位'); pwdEl.focus(); return; }
      lgBtn.disabled = upBtn.disabled = true;
      (mode === 'up' ? upBtn : lgBtn).textContent = '请稍候…';
      state('', mode === 'up' ? '正在创建账号…' : '正在登录…');
      KBSync.login({ email: email, password: pwd, mode: mode }, {
        msg: function(t, isErr){ state(isErr ? 'err' : '', t); },
        done: function(u){ state('ok', '已登录 ' + u + '，正在同步资料…'); setTimeout(next, 400); },
        fail: function(m){
          lgBtn.disabled = upBtn.disabled = false;
          lgBtn.textContent = '登录'; upBtn.textContent = '注册';
          state('err', m || '登录失败，请检查邮箱和密码');
        }
      });
    }
    lgBtn.onclick = function(){ go('in'); };
    upBtn.onclick = function(){ go('up'); };
    mailEl.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); pwdEl.focus(); } });
    pwdEl.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); go('in'); } });
    ob.querySelector('#ob-skip').onclick = next;
    setTimeout(function(){ try{ mailEl.focus(); }catch(e){} }, 80);
  }

  /* ② 头像昵称卡（登录或跳过后才出现） */
  function showProfileCard(){
    if (document.getElementById('kbp-ob')) return;
    var tmp = {name: prof.name || 'Student', av: prof.av || '', color: prof.color || '#3b82f6', emoji: prof.emoji || '🐳'};
    var ob = obRoot(
      '<h3>设置头像和昵称</h3>'
      +'<p class="ob-sub">'+(logged()
        ? '这些会跟着账号同步到其他设备，下次换设备登录自动带过来。'
        : '这些先存在这台设备；以后登录时会一起同步到账号里。')+'</p>'
      +'<div class="ob-row">'
      +  '<div class="ob-av" id="ob-av" title="点击上传自己的图片"></div>'
      +  '<div class="ob-field"><label>昵称</label><input id="ob-name" maxlength="16" spellcheck="false"></div>'
      +'</div>'
      +'<p class="ob-lab">选一个头像，或点左侧圆圈上传图片</p>'
      +'<div class="kbp-emojis" id="ob-emojis"></div>'
      +'<div class="kbp-swatches" id="ob-colors"></div>'
      +'<button class="ob-go" id="ob-go" type="button">保存并继续</button>'
      +'<p class="ob-note">昵称留空将使用默认的 Student；头像、昵称之后可以点右上角头像随时改。</p>'
      +'<input type="file" id="ob-file" accept="image/*" class="kbp-hide">'
    );

    var avEl = ob.querySelector('#ob-av');
    var nameEl = ob.querySelector('#ob-name');
    nameEl.value = tmp.name;
    nameEl.select();

    function paintAv(){
      if (tmp.av){
        avEl.innerHTML = '<img src="'+tmp.av+'" alt="" style="width:56px;height:56px;object-fit:cover;display:block">';
      } else {
        avEl.innerHTML = '<span style="width:56px;height:56px;border-radius:50%;background:'+tmp.color+
          ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;line-height:1">'+
          (tmp.emoji || '?')+'</span>';
      }
    }
    paintAv();

    var em = ob.querySelector('#ob-emojis');
    em.innerHTML = EMOJIS.map(function(c){
      return '<button class="kbp-em'+(tmp.emoji===c&&!tmp.av?' on':'')+'" data-e="'+c+'" type="button">'+c+'</button>';
    }).join('');
    em.addEventListener('click', function(e){
      var t = e.target.closest('.kbp-em'); if(!t) return;
      tmp.emoji = t.dataset.e; tmp.av = '';
      em.querySelectorAll('.kbp-em').forEach(function(x){ x.classList.toggle('on', x===t); });
      paintAv();
    });

    var cs = ob.querySelector('#ob-colors');
    cs.innerHTML = COLORS.map(function(c){
      return '<span class="kbp-sw'+(tmp.color===c?' on':'')+'" data-c="'+c+'" style="background:'+c+'"></span>';
    }).join('');
    cs.addEventListener('click', function(e){
      var t = e.target.closest('.kbp-sw'); if(!t) return;
      tmp.color = t.dataset.c; tmp.av = '';
      cs.querySelectorAll('.kbp-sw').forEach(function(x){ x.classList.toggle('on', x===t); });
      paintAv();
    });

    var file = ob.querySelector('#ob-file');
    avEl.addEventListener('click', function(){ file.click(); });
    file.addEventListener('change', function(){
      var f = file.files && file.files[0]; if(!f) return;
      readAvatar(f, function(url){ tmp.av = url; paintAv(); });
      file.value = '';
    });

    ob.querySelector('#ob-go').onclick = function(){
      prof.name = (nameEl.value || '').trim().slice(0,16) || 'Student';
      prof.av = tmp.av; prof.color = tmp.color; prof.emoji = tmp.emoji;
      prof.onboarded = 1;
      saveProf();
      ob.remove();
      renderHead(); renderStats();
    };
  }

  function saveProf(){
    lsSet(PROF_KEY, JSON.stringify(prof));
    // 主动触发一次同步（sync.js 的 hook 已监听 localStorage.setItem）
  }

  /* ---------- 进入备考中心后：未登录时提示同步（4s 内不重复） ---------- */
  function hookExamCenter(){
    if(!/\/exam\.html?$/i.test(location.pathname)) return;
    if(!prof.onboarded) return;                  // 首次引导里已经包含登录
    if(logged()) return;
    setTimeout(function(){
      if(logged()) return;
      var c = document.getElementById('kb-sync-card');
      if(c && c.classList.contains('on')) return; // 已经打开就别叠
      var now = Date.now(), last = 0;
      try{ last = +(sessionStorage.getItem('kb-sync-ask') || 0); }catch(e){}
      if(now - last < 4000) return;
      try{ sessionStorage.setItem('kb-sync-ask', String(now)); }catch(e){}
      askSync(0);
    }, 900);
  }

  function boot(){
    buildUI();
    applyZoom();
    startTimer();
    hookExamCenter();
    if(/[?&]me=1(&|$)/.test(location.search) && btn) setTimeout(function(){ btn.click(); }, 300);
    // 首次进入：先登录（可跳过），再设头像昵称
    if(!prof.onboarded) setTimeout(showOnboard, 420);
    // 同步面板登录状态变化时刷新副标题
    setInterval(function(){ if(panel && panel.classList.contains('on')) renderHead(); }, 3000);
    // 登录后 / 换设备时云端资料会写进 localStorage，这里把它同步到界面（别打断正在输入的昵称）
    setInterval(function(){
      var p = jget(PROF_KEY, null);
      if(!p || !p.onboarded) return;
      if(JSON.stringify(p) === JSON.stringify(prof)) return;
      var nick = panel && panel.querySelector('#kbp-nick');
      if(nick && document.activeElement === nick) return;
      prof = Object.assign(prof, p);
      renderHead(); renderStats();
    }, 4000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
