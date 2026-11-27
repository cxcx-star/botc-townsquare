/* 官方魔典 → 城镇广场 的状态桥
   官方魔典是个前端 Vue 应用，状态全在 Vuex 里。这里读它的 store，
   把「座位 / 名字 / 角色 / 生死 / 鬼票」整份快照推给本地服务，
   平板端的城镇广场就能跟着变。 */
(function () {
  'use strict';

  var q = new URLSearchParams(location.search);
  var code = String(q.get('room') || '').toUpperCase();
  var hasRoom = /^[A-Z0-9]{4}$/.test(code);

  var store = null;
  var last = '';
  var inflight = false;
  var retryAt = 0;

  function getStore() {
    var app = document.getElementById('app');
    if (!app || !app.__vue__ || !app.__vue__.$store) return null;
    return app.__vue__.$store;
  }

  function snapshot() {
    var s = (store && store.state && store.state.players) || {};
    var arr = Array.isArray(s.players) ? s.players : [];
    return arr.map(function (p, i) {
      p = p || {};
      return {
        seat: i + 1,
        name: String(p.name || '').trim() || ('座位' + (i + 1)),
        character: p.role && p.role.id ? String(p.role.id) : null,
        status: p.isDead ? (p.isVoteless ? 'deadNone' : 'deadVote') : 'alive'
      };
    });
  }

  var applying = false;

  function push(force) {
    if (applying) return;
    if (!store) {
      store = getStore();
      if (!store) return;
    }
    if (inflight || Date.now() < retryAt) return;
    var snap;
    try {
      snap = snapshot();
    } catch (err) {
      return;
    }
    var sig = JSON.stringify(snap);
    if (!force && sig === last) return;
    last = sig;
    inflight = true;
    fetch('/api/room/' + code + '/phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players: snap, scriptName: scriptName() })
    }).then(function (res) {
      inflight = false;
      if (!res.ok) throw new Error('HTTP ' + res.status);
    }).catch(function () {
      inflight = false;
      last = '';
      retryAt = Date.now() + 2500;
    });
  }

  function start() {
    store = getStore();
    if (!store) {
      setTimeout(start, 300);
      return;
    }
    try {
      store.subscribe(function () { push(false); });
    } catch (err) {
      /* 没有 subscribe 就靠轮询 */
    }
    push(true);
    setInterval(function () { push(false); }, 900);
  }

  /* 官方网页版加座位只有键盘 [A]，手机上没有键盘。
     触屏设备补一个小按钮，点它等价于按一下 A。 */
  function addSeatButton() {
    if (document.getElementById('gs-add-seat')) return;
    var b = document.createElement('button');
    b.id = 'gs-add-seat';
    b.type = 'button';
    b.textContent = '＋ 座位';
    b.setAttribute('aria-label', '添加座位');
    b.style.cssText = [
      'position:fixed',
      'right:14px',
      'bottom:calc(16px + env(safe-area-inset-bottom))',
      'z-index:2147483000',
      'padding:10px 15px',
      'border-radius:99px',
      'border:1px solid rgba(226,200,150,.5)',
      'background:rgba(22,17,12,.84)',
      'color:#f0e2c4',
      'font:600 13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
      'letter-spacing:.08em',
      'box-shadow:0 10px 26px -10px #000',
      '-webkit-backdrop-filter:blur(6px)',
      'backdrop-filter:blur(6px)',
      '-webkit-tap-highlight-color:transparent'
    ].join(';');
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var app = document.getElementById('app');
      if (app) app.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
    });
    document.body.appendChild(b);
  }

  /* 信息提示：说书人常用的一句话提示工具，点开就是大字号，直接递给玩家看 */
  function hintButton() {
    if (document.getElementById('gs-hint')) return;
    var b = document.createElement('button');
    b.id = 'gs-hint';
    b.type = 'button';
    b.textContent = '提示';
    b.setAttribute('aria-label', '打开信息提示');
    b.style.cssText = [
      'position:fixed',
      'right:14px',
      'bottom:calc(64px + env(safe-area-inset-bottom))',
      'z-index:2147483000',
      'padding:10px 15px',
      'border-radius:99px',
      'border:1px solid rgba(204,4,255,.45)',
      'background:rgba(28,16,34,.86)',
      'color:#e9d5ff',
      'font:600 13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
      'letter-spacing:.08em',
      'box-shadow:0 10px 26px -10px #000',
      '-webkit-backdrop-filter:blur(6px)',
      'backdrop-filter:blur(6px)',
      '-webkit-tap-highlight-color:transparent'
    ].join(';');
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openHint();
    });
    document.body.appendChild(b);
  }

  /* 下发身份：传递手机领牌 */
  function dealButton() {
    if (document.getElementById('gs-deal')) return;
    var b = document.createElement('button');
    b.id = 'gs-deal';
    b.type = 'button';
    b.textContent = '下发';
    b.setAttribute('aria-label', '下发身份');
    b.style.cssText = [
      'position:fixed',
      'right:14px',
      'bottom:calc(160px + env(safe-area-inset-bottom))',
      'z-index:2147483000',
      'padding:10px 15px',
      'border-radius:99px',
      'border:1px solid rgba(127,201,138,.45)',
      'background:rgba(16,28,20,.86)',
      'color:#cdebd2',
      'font:600 13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
      'letter-spacing:.08em',
      'box-shadow:0 10px 26px -10px #000',
      '-webkit-backdrop-filter:blur(6px)',
      'backdrop-filter:blur(6px)',
      '-webkit-tap-highlight-color:transparent'
    ].join(';');
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var q = [];
      if (hasRoom) q.push('room=' + encodeURIComponent(code));
      var sq = scriptQuery().replace(/^\?/, '');
      if (sq) q.push(sq);
      openOverlay('/deal' + (q.length ? '?' + q.join('&') : ''));
    });
    document.body.appendChild(b);
  }

  function scriptName() {
    try {
      var st = (store || getStore());
      var ed = st && st.state && st.state.edition;
      return (ed && ed.name) || '';
    } catch (e) {
      return '';
    }
  }

  /* 当前剧本：内置剧本用 edition，自定义/缝合剧本用角色 id 列表 */
  function scriptQuery() {
    try {
      var st = (store || getStore());
      if (!st || !st.state) return '';
      var ed = st.state.edition || {};
      var custom = [];
      try {
        custom = (st.state.customRoles || []).map(function (r) { return r && r.id; }).filter(Boolean);
      } catch (e) {
        custom = [];
      }
      /* 以魔典当前的角色池为准（内置剧本、自制剧本都适用） */
      var ids = [];
      try {
        var pool = st.state.roles;
        if (pool && typeof pool.forEach === 'function') {
          pool.forEach(function (r, k) { ids.push(r && r.id ? r.id : k); });
        }
      } catch (e) {
        ids = [];
      }
      if (!ids.length && custom.length) ids = custom;

      var q = [];
      if (ids.length) q.push('roles=' + encodeURIComponent(ids.join(',')));
      else if (ed.id && ed.id !== 'custom') q.push('edition=' + encodeURIComponent(ed.id));
      if (ed.name) q.push('name=' + encodeURIComponent(ed.name));
      return q.length ? ('?' + q.join('&')) : '';
    } catch (e) {
      return '';
    }
  }

  /* 工具页用页内浮层打开，关掉就回到魔典原状（不会离开这一页） */
  var hintLayer = null;
  function openOverlay(target) {
    if (!hintLayer) {
      hintLayer = document.createElement('div');
      hintLayer.id = 'gs-hint-layer';
      hintLayer.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483600',
        'background:#08070b', 'display:none',
        '-webkit-tap-highlight-color:transparent'
      ].join(';');

      var frame = document.createElement('iframe');
      frame.id = 'gs-hint-frame';
      frame.setAttribute('title', '工具');
      frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#08070b';
      frame.src = target || '/xrh';

      hintLayer.appendChild(frame);
      document.body.appendChild(hintLayer);

      /* 工具里按 Esc 或自己退出时也能关掉浮层 */
      window.addEventListener('message', function (ev) {
        if (ev && ev.data === 'deal-applied') { overlayOpen = false; pullRoles(); }
        if (ev && (ev.data === 'xrh-close' || ev.data === 'deal-close')) {
          hintLayer.style.display = 'none';
          overlayOpen = false;
          pullRoles();
        }
      });
    }
    var fr = document.getElementById('gs-hint-frame');
    if (fr && target) fr.src = target;
    hintLayer.style.display = 'block';
    overlayOpen = true;          // 浮层里在操作（比如下发），暂停回写避免魔典反复重绘
    if (hasRoom) push(true);
  }

  function openHint() {
    openOverlay('/xrh' + scriptQuery());
  }

  if (hasRoom) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupButtons);
  else setupButtons();

  function homeButton() {
    if (document.getElementById('gs-home')) return;
    var b = document.createElement('button');
    b.id = 'gs-home';
    b.type = 'button';
    b.textContent = '首页';
    b.setAttribute('aria-label', '回首页');
    b.style.cssText = [
      'position:fixed',
      'right:14px',
      'bottom:calc(112px + env(safe-area-inset-bottom))',
      'z-index:2147483000',
      'padding:10px 15px',
      'border-radius:99px',
      'border:1px solid rgba(226,200,150,.35)',
      'background:rgba(18,14,10,.8)',
      'color:#cfc0a4',
      'font:600 13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif',
      'letter-spacing:.08em',
      'box-shadow:0 10px 26px -10px #000',
      '-webkit-backdrop-filter:blur(6px)',
      'backdrop-filter:blur(6px)',
      '-webkit-tap-highlight-color:transparent'
    ].join(';');
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      location.href = '/';
    });
    document.body.appendChild(b);
  }

  /* 触屏设备：补上有用的浮层按钮（与有没有房间码无关） */
  function setupButtons() {
    if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return;
    addSeatButton();
    hintButton();
    homeButton();
    dealButton();
  }

  /* 反向同步：房间里的「座位 → 角色」如果和魔典不一致（比如刚用下发系统抽过），
     就把房间的角色写回魔典的 store，魔典界面当场刷新。 */
  var pullInflight = false;
  var overlayOpen = false;

  function pullRoles() {
    if (!hasRoom || pullInflight || overlayOpen) return;
    var st = getStore();
    if (!st) return;
    pullInflight = true;
    fetch('/api/room/' + code, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        pullInflight = false;
        var list = (d && d.doc && d.doc.players) || [];
        if (!list.length) return;
        var state = st.state;
        var ps = (state.players && state.players.players) || [];
        var rolesMap = state.roles;
        if (!rolesMap || typeof rolesMap.get !== 'function') return;

        /* 房间里比魔典多出来的座位，先补上（这样下发完不用手动加座位） */
        list.forEach(function (rp, i) {
          if (ps[i]) return;
          st.commit('players/add', rp.name || ('玩家' + rp.seat));
          ps = st.state.players.players;
        });

        /* 先把所有要改的座位算出来，再一次性提交。
           否则每提交一个都会触发一次 push，把没改完的旧角色写回房间。 */
        var changes = [];
        list.forEach(function (rp) {
          if (!rp.character) return;                 // 房间里没角色就不动魔典
          var sp = ps[rp.seat - 1];
          if (!sp) return;
          var have = sp.role && sp.role.id ? sp.role.id : null;
          if (have === rp.character) return;
          var role = rolesMap.get(rp.character);
          if (!role) return;
          changes.push({ player: sp, role: role });
        });
        if (!changes.length) return;

        applying = true;
        try {
          changes.forEach(function (c) {
            st.commit('players/update', { player: c.player, property: 'role', value: c.role });
          });
        } finally {
          /* 等这一轮 UI 更新完再放开，并强制推送一次，让房间和魔典完全一致 */
          setTimeout(function () {
            applying = false;
            last = '';
            push(true);
          }, 120);
        }
      })
      .catch(function () { pullInflight = false; });
  }

  if (hasRoom) setInterval(pullRoles, 2500);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && hasRoom) { push(true); pullRoles(); }
  });
})();
