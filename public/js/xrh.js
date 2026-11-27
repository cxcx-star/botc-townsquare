/* 信息提示
   用法：点提示卡 / 点「角色」从列表里挑角色，按下的顺序被记录下来；
   最后按底部「显示」，把记录下来的内容按顺序铺满屏幕。
   角色在展示页只显示 token 图标，不显示名字。 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  var PHRASES = [
    { id: 'you-are', label: '你是' },
    { id: 'this-is', label: '这名玩家是' },
    { id: 'affect', label: '该角色的技能作用于你' },
    { id: 'absent', label: '这些角色不在场' },
    { id: 'nominate', label: '你昨天提名了吗' },
    { id: 'vote', label: '你昨天投票了吗' },
    { id: 'choose', label: '做出你的选择' },
    { id: 'ability', label: '你要使用你的能力吗' },
    { id: 'demon', label: '他是恶魔' },
    { id: 'minions', label: '他们是你的爪牙' }
  ];

  var TEAM_ORDER = { townsfolk: 0, outsider: 1, minion: 2, demon: 3, traveler: 4, fabled: 5 };
  var TEAM_NAME = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔', traveler: '旅行者' };

  var roles = [];
  var pool = [];
  var queue = [];              // { type:'phrase', label } | { type:'role', role }

  var query = new URLSearchParams(location.search);
  var onlyEdition = (query.get('edition') || '').toLowerCase();
  var onlyRoles = (query.get('roles') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  var scriptName = query.get('name') || '';
  var embedded = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  /* ---------- 数据 ---------- */
  function loadRoles() {
    return fetch('/ct-role-data.json', { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var list = (d && d.data && d.data.role) || [];
        roles = list
          .filter(function (r) { return r && r.name && r.team !== 'fabled'; })
          .map(function (r) {
            return {
              id: r.id,
              name: r.name,
              team: r.team || '',
              edition: r.edition || '',
              image: String(r.image || '').replace(/^\/oss\//, '/gs/oss/')
            };
          })
          .sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
        buildPool();
      })
      .catch(function () { roles = []; pool = []; });
  }

  function buildPool() {
    if (onlyRoles.length) {
      var byId = {};
      roles.forEach(function (r) { byId[r.id] = r; });
      pool = onlyRoles.map(function (id) { return byId[id]; }).filter(Boolean);
      if (!pool.length) pool = roles.slice();
      return;
    }
    if (onlyEdition && onlyEdition !== 'custom') {
      var subset = roles.filter(function (r) { return (r.edition || '') === onlyEdition; });
      pool = subset.length ? subset : roles.slice();
      return;
    }
    pool = roles.slice();
  }

  /* ---------- 记录区 ---------- */
  function addItem(item) {
    queue.push(item);
    renderAll();
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* noop */ } }
  }

  function removeAt(i) {
    queue.splice(i, 1);
    renderAll();
  }

  function clearQueue() {
    queue = [];
    renderAll();
  }

  function renderAll() {
    renderGrid();
    renderQueue();
    var empty = queue.length === 0;
    $('#btnShow').disabled = empty;
    $('#btnShow').textContent = empty ? '显示' : ('显示（' + queue.length + ' 项）');
    $('#btnClearTop').classList.toggle('on', !empty);
    updateSheetFoot();
  }

  /* ---------- 提示卡 ---------- */
  function renderGrid() {
    var box = $('#grid');
    box.innerHTML = '';
    PHRASES.forEach(function (p) {
      var used = queue.some(function (q) { return q.type === 'phrase' && q.label === p.label; });
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'x-card' + (used ? ' on' : '');
      b.textContent = p.label;
      b.addEventListener('click', function () {
        if (used) {
          var i = -1;
          queue.forEach(function (q, k) { if (q.type === 'phrase' && q.label === p.label) i = k; });
          if (i >= 0) removeAt(i);
          return;
        }
        addItem({ type: 'phrase', label: p.label });
      });
      box.appendChild(b);
    });
  }

  /* ---------- 已记录 ---------- */
  function renderQueue() {
    var box = $('#queue');
    box.innerHTML = '';
    if (!queue.length) {
      box.innerHTML = '<p class="x-queue-empty">点上面的提示卡，或点「角色」挑角色，会按顺序记在这里</p>';
      return;
    }
    queue.forEach(function (item, i) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'x-chip' + (item.type === 'role' ? ' token' : '');
      chip.dataset.i = i;
      if (item.type === 'role') {
        chip.innerHTML = '<img src="' + (item.role.image || '') + '" alt="">';
        chip.title = item.role.name;
      } else {
        chip.textContent = item.label;
      }
      chip.addEventListener('click', function () { removeAt(i); });
      box.appendChild(chip);
    });
  }

  /* ---------- 角色列表 ---------- */
  function updateSheetFoot() {
    var btn = $('#pickDone');
    if (btn) btn.textContent = queue.length ? ('返回（已记录 ' + queue.length + ' 项）') : '返回';
  }

  function openSheet() {
    $('#search').value = '';
    renderRoles('');
    updateSheetFoot();
    $('#sheet').hidden = false;
    $('#back').hidden = false;
    setClose(false);
  }

  function closeSheet() {
    $('#sheet').hidden = true;
    if ($('#show').hidden) { $('#back').hidden = true; setClose(true); }
  }

  function renderRoles(kw) {
    var box = $('#roles');
    kw = String(kw || '').trim();
    box.innerHTML = '';
    pool.slice().sort(function (a, b) {
      var da = TEAM_ORDER[a.team] == null ? 9 : TEAM_ORDER[a.team];
      var db = TEAM_ORDER[b.team] == null ? 9 : TEAM_ORDER[b.team];
      if (da !== db) return da - db;
      return a.name.localeCompare(b.name, 'zh');
    }).forEach(function (r) {
      if (kw && r.name.indexOf(kw) < 0 && r.id.indexOf(kw) < 0) return;
      var b = document.createElement('button');
      b.type = 'button';
      var used = queue.some(function (q) { return q.type === 'role' && q.role.id === r.id; });
      b.className = 'x-role team-' + r.team + (used ? ' used' : '');
      b.innerHTML = (r.image ? '<img src="' + r.image + '" alt="" loading="lazy">' : '') +
        '<span>' + r.name + '</span><em>' + (TEAM_NAME[r.team] || '') + '</em>';
      b.addEventListener('click', function () {
        addItem({ type: 'role', role: r });
        renderRoles($('#search').value);      // 不关闭，重新标记已选
      });
      box.appendChild(b);
    });
    if (!box.children.length) {
      box.innerHTML = '<p style="grid-column:1/-1;color:#7d7264;font-size:13px;padding:12px 4px">没有匹配的角色</p>';
    }
  }

  /* ---------- 展示 ---------- */
  function textClass(t) {
    var n = String(t || '').length;
    if (n <= 2) return 'len-s';
    if (n <= 4) return 'len-m';
    return 'len-l';
  }

  function showDisplay() {
    if (!queue.length) return;
    var box = $('#showList');
    box.innerHTML = '';

    queue.forEach(function (item) {
      if (item.type === 'phrase') {
        var line = document.createElement('div');
        line.className = 'x-line text';
        line.textContent = item.label;
        box.appendChild(line);
        return;
      }
      // 角色：token 图标 + 名字写在里面
      var t = document.createElement('div');
      t.className = 'x-token with-text ' + textClass(item.role.name);
      t.innerHTML = (item.role.image ? '<img src="' + item.role.image + '" alt="">' : '<div class="x-token-blank"></div>') +
        '<span class="x-token-text">' + item.role.name + '</span>';
      box.appendChild(t);
    });

    box.className = 'x-showlist n' + Math.min(queue.length, 6) + ' standalone';
    $('#show').hidden = false;
    $('#back').hidden = false;
    setClose(false);
    fitShow();
  }

  /* 内容放不下就整体等比缩小（以中心为基准），保证第一行和底部按钮都在屏幕内 */
  function fitShow() {
    var box = $('#showList');
    var host = $('#show');
    box.style.transform = 'translate(-50%, -50%)';
    requestAnimationFrame(function () {
      var availH = host.clientHeight - 130;    // 留出底部按钮
      var availW = host.clientWidth - 32;
      var h = box.offsetHeight;
      var w = box.offsetWidth;
      if (!h || !w) return;
      var s = Math.min(1, availH / h, availW / w);
      s = Math.max(0.32, s);
      box.style.transform = 'translate(-50%, -50%) scale(' + s.toFixed(3) + ')';
    });
  }

  function closeDisplay() {
    $('#show').hidden = true;
    if ($('#sheet').hidden) { $('#back').hidden = true; setClose(true); }
  }

  /* ---------- 内嵌关闭 ---------- */
  function setClose(visible) {
    var b = document.getElementById('x-close');
    if (b) b.style.display = visible ? '' : 'none';
  }

  function addEmbeddedClose() {
    if (!embedded || document.getElementById('x-close')) return;
    var b = document.createElement('button');
    b.id = 'x-close';
    b.type = 'button';
    b.className = 'x-close';
    b.textContent = '关闭';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { window.parent.postMessage('xrh-close', '*'); } catch (err) { /* noop */ }
    });
    document.body.appendChild(b);
  }

  /* ---------- 事件 ---------- */
  $('#roleBtn').addEventListener('click', openSheet);
  $('#search').addEventListener('input', function (e) { renderRoles(e.target.value); });
  $('#pickDone').addEventListener('click', closeSheet);
  $('#btnShow').addEventListener('click', showDisplay);
  $('#btnClearTop').addEventListener('click', function () { if (queue.length) clearQueue(); });
  $('#btnShowBack').addEventListener('click', function (e) { e.stopPropagation(); closeDisplay(); });
  $('#btnShowClear').addEventListener('click', function (e) {
    e.stopPropagation();
    clearQueue();
    closeDisplay();
  });
  $('#show').addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.x-show-btn')) return;
    closeDisplay();
  });
  $('#back').addEventListener('click', function () {
    if (!$('#show').hidden) { closeDisplay(); return; }
    closeSheet();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('#show').hidden) { closeDisplay(); return; }
    if (!$('#sheet').hidden) { closeSheet(); return; }
    try { if (embedded) window.parent.postMessage('xrh-close', '*'); } catch (err) { /* noop */ }
  });

  /* ---------- 启动 ---------- */
  renderAll();
  addEmbeddedClose();
  loadRoles().then(function () {
    var sub = document.querySelector('.x-sub');
    if (!sub) return;
    var label = scriptName;
    if (!label && onlyEdition) {
      var map = { tb: '暗流涌动', bmr: '黯月初升', snv: '梦殒春宵', hdcs: '华灯初上', exp: '实验性角色', syyl: '山雨欲来', ngj: '无上愉悦', luf: '窃窃私语' };
      label = map[onlyEdition] || '';
    }
    sub.textContent = label ? ('当前剧本：' + label) : '点提示卡和角色，最后按「显示」';
  });
})();
