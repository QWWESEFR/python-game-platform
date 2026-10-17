/* app.js — 主页面逻辑（index.html）
 * 功能：发布流程（Pyodide 验证）、修改与管理、搜索与可见设置、
 *       个人中心取名、朋友系统、游玩（沙箱运行 + 实时人数）
 */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var U = window.Utils;
  var DB = window.DB;
  var PyRunner = window.PyRunner;

  var state = {
    currentUser: DB.getCurrentUser(),
    editingGameId: null,
    playGameId: null,
    playSessionId: null,
    selectedPendingId: null,
    activeTab: 'published'
  };

  /* ============ 通用 UI ============ */
  function toast(msg, type) {
    var wrap = $('#toastWrap');
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast-' + type : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  var confirmOkAction = null;
  var confirmCancelAction = null;

  function askConfirm(title, text, onOk, okLabel, onCancel, cancelLabel) {
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmOk').textContent = okLabel || '确定';
    $('#confirmCancel').textContent = cancelLabel || '取消';
    confirmOkAction = onOk || null;
    confirmCancelAction = onCancel || null;
    openModal('#confirmModal');
  }

  /* ============ 用户 / 取名 ============ */
  function refreshUser() {
    state.currentUser = DB.getCurrentUser();
    $('#btnProfile').textContent = state.currentUser
      ? ('个人中心 · ' + state.currentUser.name)
      : '个人中心';
    if (state.currentUser) $('#myNameInput').value = state.currentUser.name;
  }

  function requireUser() {
    if (!state.currentUser || !state.currentUser.name) {
      openProfile('name');
      return null;
    }
    return state.currentUser;
  }

  function saveName() {
    var n = $('#myNameInput').value.trim();
    if (!n) { toast('请输入名字', 'error'); return; }
    var cur = state.currentUser;
    // 已取名用户：支持修改自己的名字（游戏作者名、好友引用同步更新）
    if (cur && cur.id) {
      if (cur.name === n) { toast('名字没有变化'); return; }
      var other = DB.findUserByName(n);
      if (other && other.id !== cur.id) { toast('该名字已被其他用户使用', 'error'); return; }
      var updated = DB.renameUser(cur.id, n);
      if (!updated) { toast('改名失败，请重试', 'error'); return; }
      DB.setCurrentUser(updated);
      state.currentUser = updated;
      refreshUser();
      renderAll();
      toast('名字已更新为「' + updated.name + '」，游戏中作者名已同步', 'success');
      return;
    }
    // 首次取名
    var u = DB.getOrCreateUser(n);
    DB.setCurrentUser(u);
    state.currentUser = u;
    refreshUser();
    renderAll();
    toast('名字已保存：' + u.name, 'success');
  }

  /* ============ 实用的工具（官方下载专区，仅浏览下载） ============ */
  function renderTools() {
    var tools = DB.getTools();
    var grid = $('#toolsGrid');
    $('#toolsEmpty').hidden = tools.length > 0;
    if (!tools.length) {
      grid.innerHTML = '';
      return;
    }
    grid.innerHTML = tools.map(function (t) {
      var url = U.getToolDownloadUrl(t);
      var sizeText = t.size || (t.pkgSize ? U.formatSize(t.pkgSize) : '');
      return '<div class="tool-card">' +
        '<div class="tool-head">' +
        '<span class="tool-icon">' + U.esc(t.icon || '🔧') + '</span>' +
        '<div class="tool-meta">' +
        '<div class="tool-name">' + U.esc(t.name) + '</div>' +
        '<div class="tool-sub">' + U.esc(t.version || '') +
        (sizeText ? ' · ' + U.esc(sizeText) : '') + ' · Windows 电脑版</div>' +
        '</div>' +
        '</div>' +
        '<p class="tool-desc">' + U.esc(t.desc || '') + '</p>' +
        '<p class="tool-note">安装说明：' + U.esc(t.installNote || '下载后双击安装包，按向导完成安装。') + '</p>' +
        '<div class="tool-actions">' +
        '<a class="btn btn-small btn-primary tool-download" href="' + U.esc(url) + '" download="' + U.esc(t.pkgName || '') + '"' +
        (url === '#' ? ' onclick="return false;"' : '') + '>下载安装包</a>' +
        '<span class="tool-file">' + U.esc(t.pkgName || '') + '</span>' +
        '</div></div>';
    }).join('');
  }

  function openTools() {
    renderTools();
    openModal('#toolsModal');
  }

  /* ============ 可见性过滤 ============ */
  function canSeeGame(game, viewer) {
    if (!game) return false;
    if (game.status === 'draft' || game.status === 'removed') return false;
    switch (game.visibility) {
      case 'public':
        return true;
      case 'private':
        return !!(viewer && game.authorId === viewer.id);
      case 'friends':
      case 'friends_and_self': {
        if (viewer && game.authorId === viewer.id) return true;
        if (!viewer) return false;
        var author = DB.findUserById(game.authorId);
        if (!author) return false;
        return author.friends.some(function (f) {
          return (f.id && f.id === viewer.id) || (!f.id && f.name === viewer.name);
        });
      }
      default:
        return true;
    }
  }

  /* ============ 游戏列表 ============ */
  function renderGames() {
    var user = state.currentUser;
    var kw = ($('#searchInput').value || '').trim().toLowerCase();
    var games = DB.getGames().filter(function (g) { return canSeeGame(g, user); });
    var filtered = games.filter(function (g) {
      if (!kw) return true;
      var author = DB.findUserById(g.authorId);
      var authorName = author ? author.name : (g.authorName || '');
      return g.title.toLowerCase().indexOf(kw) >= 0 ||
        authorName.toLowerCase().indexOf(kw) >= 0;
    });
    filtered.sort(function (a, b) {
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });

    var grid = $('#gameGrid');
    if (!filtered.length) {
      grid.innerHTML = '';
      $('#emptyTip').hidden = false;
      return;
    }
    $('#emptyTip').hidden = true;
    grid.innerHTML = filtered.map(function (g) {
      var author = DB.findUserById(g.authorId);
      var authorName = author ? author.name : (g.authorName || '未知作者');
      var online = DB.countPlayers(g.id);
      var editing = g.status === 'editing';
      var mine = !!(user && g.authorId === user.id);
      return '<div class="game-card' + (editing ? ' card-editing' : '') + '">' +
        '<div class="game-card-head"><h3>' + U.esc(g.title) + '</h3>' +
        '<span class="vis-badge vis-' + g.visibility + '">' + U.esc(U.VIS_LABEL[g.visibility] || g.visibility) + '</span></div>' +
        '<p class="game-author">作者：' + U.esc(authorName) + '</p>' +
        '<p class="game-online">在线游玩：' + online + ' 人</p>' +
        (editing ? '<p class="editing-tip">正在修改中，暂不可游玩</p>' : '') +
        '<div class="game-actions">' +
        (mine ? '<button type="button" class="btn btn-small btn-outline" data-act="edit" data-id="' + g.id + '">修改</button>' : '') +
        (mine ? '<button type="button" class="btn btn-small btn-danger-ghost" data-act="delete" data-id="' + g.id + '">删除</button>' : '') +
        '<button type="button" class="btn btn-small btn-primary" data-act="play" data-id="' + g.id + '"' + (editing ? ' disabled' : '') + '>游玩</button>' +
        '</div></div>';
    }).join('');
  }

  /* ============ 个人中心 ============ */
  function openProfile(highlight) {
    refreshUser();
    renderPublished();
    renderFriends();
    $('#profileModal').hidden = false;
    if (highlight === 'name') {
      var tip = $('#nameTip');
      tip.hidden = false;
      tip.className = 'status-box info';
      tip.textContent = '请先取名字，取名后才能创作和发布。';
    } else {
      $('#nameTip').hidden = true;
    }
  }

  function renderPublished() {
    var user = state.currentUser;
    var box = $('#tabPublished');
    if (!user) { box.innerHTML = '<div class="empty-tip">请先保存名字</div>'; return; }
    var mine = DB.getGames().filter(function (g) { return g.authorId === user.id; })
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    if (!mine.length) { box.innerHTML = '<div class="empty-tip">还没有发布过小游戏</div>'; return; }
    box.innerHTML = mine.map(function (g) {
      var editing = g.status === 'editing';
      return '<div class="pub-item">' +
        '<div class="pub-info">' +
        '<div class="pub-title">' + U.esc(g.title) +
        (editing ? ' <span class="status-tag status-editing">修改中</span>' : '') + '</div>' +
        '<div class="pub-meta">可见范围：' + U.esc(U.VIS_LABEL[g.visibility] || g.visibility) +
        ' · 在线 ' + DB.countPlayers(g.id) + ' 人</div>' +
        '</div>' +
        '<div class="pub-actions">' +
        '<button type="button" class="btn btn-small btn-outline" data-act="edit" data-id="' + g.id + '">修改小游戏</button>' +
        '<button type="button" class="btn btn-small btn-danger-ghost" data-act="delete" data-id="' + g.id + '">删除小游戏</button>' +
        '</div></div>';
    }).join('');
  }

  /* ============ 朋友系统 ============ */
  function renderFriends() {
    var user = state.currentUser;
    if (!user) return;
    var cur = DB.findUserById(user.id) || user;

    var pend = DB.getPendingFriends(cur.id);
    var pendBox = $('#pendingFriends');
    if (!pend.length) {
      pendBox.innerHTML = '<div class="empty-tip" style="padding:8px 0;">暂无待确认的朋友</div>';
    } else {
      pendBox.innerHTML = pend.map(function (p) {
        var key = p.id ? ('id:' + p.id) : ('name:' + p.name);
        var sel = state.selectedPendingId === key;
        return '<div class="friend-item' + (sel ? ' selected' : '') + '" data-pkey="' + key + '">' +
          '<span class="friend-name">' + U.esc(p.name) + '</span>' +
          (sel ? '<span class="status-tag status-ok">已选择</span>' : '') +
          '</div>';
      }).join('');
    }

    var fBox = $('#friendList');
    if (!cur.friends.length) {
      fBox.innerHTML = '<div class="empty-tip" style="padding:8px 0;">还没有好友，添加朋友后即可建立好友关系</div>';
    } else {
      fBox.innerHTML = cur.friends.map(function (f) {
        return '<div class="friend-item"><span class="friend-name">' + U.esc(f.name) + '</span>' +
          '<span class="status-tag status-ok">好友</span></div>';
      }).join('');
    }
  }

  function addFriend() {
    var user = requireUser();
    if (!user) return;
    var n = $('#friendNameInput').value.trim();
    if (!n) { toast('请输入朋友的名字', 'error'); return; }
    var cur = DB.findUserById(user.id) || user;
    if (n === cur.name) { toast('不能添加自己为朋友', 'error'); return; }
    if (cur.friends.some(function (f) { return f.name === n; })) {
      toast('「' + n + '」已经是你的好友', 'error'); return;
    }
    var pend = DB.getPendingFriends(cur.id);
    if (pend.some(function (p) { return p.name === n; })) {
      toast('「' + n + '」已在待确认列表', 'error'); return;
    }
    var target = DB.findUserByName(n);
    pend.push({ id: target ? target.id : null, name: n, addedAt: Date.now() });
    DB.savePendingFriends(cur.id, pend);
    $('#friendNameInput').value = '';
    renderFriends();
    toast('已添加「' + n + '」，请点击该朋友后再点「确定」建立好友关系', 'success');
  }

  function confirmFriend() {
    var user = requireUser();
    if (!user) return;
    if (!state.selectedPendingId) { toast('请先点击选择一位朋友', 'error'); return; }
    var cur = DB.findUserById(user.id) || user;
    var pend = DB.getPendingFriends(cur.id);
    var p = null;
    if (state.selectedPendingId.indexOf('id:') === 0) {
      p = pend.filter(function (x) { return x.id && ('id:' + x.id) === state.selectedPendingId; })[0] || null;
    } else {
      p = pend.filter(function (x) { return !x.id && ('name:' + x.name) === state.selectedPendingId; })[0] || null;
    }
    if (!p) { toast('待确认列表中找不到该朋友', 'error'); return; }
    if (!cur.friends.some(function (f) { return f.name === p.name; })) {
      cur.friends.push({ id: p.id, name: p.name });
      DB.saveUsers(DB.getUsers().map(function (u) { return u.id === cur.id ? cur : u; }));
      DB.setCurrentUser(cur);
      state.currentUser = cur;
      refreshUser();
    }
    DB.savePendingFriends(cur.id, pend.filter(function (x) { return x !== p; }));
    state.selectedPendingId = null;
    renderFriends();
    toast('已与「' + p.name + '」成为好友', 'success');
  }

  /* ============ 编辑器（发布 / 修改） ============ */
  function setEditorStatus(msg, type) {
    var box = $('#editorStatus');
    if (!msg) {
      box.hidden = true;
      box.className = 'status-box';
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.className = 'status-box ' + (type || 'info');
    box.textContent = msg;
  }

  function openEditor(gameId) {
    if (gameId) {
      var g = DB.getGameById(gameId);
      if (!g) { toast('游戏不存在', 'error'); return; }
      g.backup = { title: g.title, code: g.code, visibility: g.visibility };
      g.status = 'editing';
      g.updatedAt = Date.now();
      DB.saveGames(DB.getGames().map(function (x) { return x.id === g.id ? g : x; }));
      state.editingGameId = g.id;
      $('#editorTitle').textContent = '修改小游戏';
      $('#btnVerifyPublish').hidden = true;
      $('#btnSaveEdit').hidden = false;
      $('#gameTitleInput').value = g.title;
      $('#codeInput').value = g.code;
      $('#gameVisibility').value = g.visibility;
      renderGames();
      renderPublished();
      toast('进入修改状态，该游戏已标记为「禁止游玩」', 'info');
    } else {
      state.editingGameId = null;
      $('#editorTitle').textContent = '发布新游戏';
      $('#btnVerifyPublish').hidden = false;
      $('#btnSaveEdit').hidden = true;
      $('#gameTitleInput').value = '';
      $('#codeInput').value = '';
      $('#gameVisibility').value = 'public';
    }
    setEditorStatus(null, null);
    openModal('#editorModal');
  }

  async function handlePublish() {
    var user = requireUser();
    if (!user) return;
    var title = $('#gameTitleInput').value.trim();
    var code = $('#codeInput').value;
    var visibility = $('#gameVisibility').value;
    if (!title) { setEditorStatus('请填写游戏名称', 'error'); return; }
    if (!code.trim()) { setEditorStatus('请粘贴或输入 Python 代码', 'error'); return; }
    setEditorStatus('正在用 Pyodide 真实运行验证，请稍候...', 'info');
    var result = await PyRunner.verify(code);
    if (!result.ok) {
      setEditorStatus('验证未通过（' + (result.stage || '运行') + '）：' + result.error, 'error');
      return;
    }
    var games = DB.getGames();
    games.push({
      id: DB.uid('g'),
      title: title,
      code: code,
      visibility: visibility,
      authorId: user.id,
      authorName: user.name,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    DB.saveGames(games);
    setEditorStatus('验证通过，发布成功！' + (result.note ? '（' + result.note + '）' : ''), 'success');
    renderGames();
    renderPublished();
    setTimeout(function () {
      closeModal('#editorModal');
      toast('发布成功', 'success');
    }, 700);
  }

  async function handleSaveEdit() {
    var gameId = state.editingGameId;
    if (!gameId) return;
    var title = $('#gameTitleInput').value.trim();
    var code = $('#codeInput').value;
    var visibility = $('#gameVisibility').value;
    if (!title) { setEditorStatus('请填写游戏名称', 'error'); return; }
    if (!code.trim()) { setEditorStatus('请粘贴或输入 Python 代码', 'error'); return; }
    setEditorStatus('正在验证修改后的代码...', 'info');
    var result = await PyRunner.verify(code);
    if (!result.ok) {
      setEditorStatus('验证未通过（' + (result.stage || '运行') + '）：' + result.error, 'error');
      return;
    }
    var games = DB.getGames();
    var g = games.filter(function (x) { return x.id === gameId; })[0];
    if (g) {
      g.title = title;
      g.code = code;
      g.visibility = visibility;
      g.status = 'active';
      g.backup = null;
      g.updatedAt = Date.now();
      DB.saveGames(games);
    }
    state.editingGameId = null;
    setEditorStatus('修改已保存并生效，游戏恢复可游玩。', 'success');
    renderGames();
    renderPublished();
    setTimeout(function () {
      closeModal('#editorModal');
      toast('修改已保存', 'success');
    }, 700);
  }

  function abandonEdit() {
    var gameId = state.editingGameId;
    if (gameId) {
      var games = DB.getGames();
      var g = games.filter(function (x) { return x.id === gameId; })[0];
      if (g && g.backup) {
        g.title = g.backup.title;
        g.code = g.backup.code;
        g.visibility = g.backup.visibility;
        g.backup = null;
        g.status = 'active';
        g.updatedAt = Date.now();
        DB.saveGames(games);
      }
    }
    state.editingGameId = null;
    renderGames();
    renderPublished();
  }

  /* 关闭编辑器：修改中先询问是否保存 */
  function handleCloseEditor() {
    if (state.editingGameId) {
      askConfirm(
        '是否保存修改？',
        '该游戏正在修改中（当前已标记为禁止游玩）。点击「保存修改」将验证并保存代码、恢复可游玩；点击「放弃修改」将恢复修改前内容。',
        function () { handleSaveEdit(); },
        '保存修改',
        function () {
          abandonEdit();
          closeModal('#editorModal');
          toast('已放弃修改，恢复原内容');
        },
        '放弃修改'
      );
      return;
    }
    closeModal('#editorModal');
  }

  /* ============ 删除游戏 ============ */
  function handleDeleteGame(gameId) {
    var g = DB.getGameById(gameId);
    if (!g) return;
    askConfirm(
      '删除小游戏',
      '确定要删除《' + g.title + '》吗？删除后不可恢复。',
      function () {
        DB.saveGames(DB.getGames().filter(function (x) { return x.id !== gameId; }));
        DB.savePlaySessions(DB.getPlaySessions().filter(function (s) { return s.gameId !== gameId; }));
        if (state.editingGameId === gameId) {
          state.editingGameId = null;
          closeModal('#editorModal');
        }
        renderGames();
        renderPublished();
        toast('已删除《' + g.title + '》', 'success');
      }
    );
  }

  /* ============ 游玩 ============ */
  function addPlaySession(gameId, user) {
    var sessions = DB.getPlaySessions();
    var existing = sessions.filter(function (s) { return s.gameId === gameId && s.userId === user.id; })[0];
    if (existing) return existing;
    var s = { id: DB.uid('ps'), gameId: gameId, userId: user.id, playerName: user.name, startTime: Date.now() };
    sessions.push(s);
    DB.savePlaySessions(sessions);
    return s;
  }

  function removePlaySession(sessionId) {
    DB.savePlaySessions(DB.getPlaySessions().filter(function (s) { return s.id !== sessionId; }));
  }

  function updatePlayCount() {
    if (state.playGameId) {
      $('#playCount').textContent = DB.countPlayers(state.playGameId);
    }
  }

  async function handlePlay(gameId) {
    var user = requireUser();
    if (!user) return;
    var g = DB.getGameById(gameId);
    if (!g) { toast('游戏不存在', 'error'); return; }
    if (g.status === 'editing') { toast('该游戏正在修改中，暂无法游玩', 'error'); return; }
    if (DB.isKicked(user.id)) { toast('您已被管理员踢出，暂时无法游玩', 'error'); return; }

    state.playGameId = gameId;
    $('#playTitle').textContent = g.title;
    $('#sandboxOutput').textContent = '';
    if (PyRunner.hasBlocker(g.code)) {
      $('#sandboxOutput').textContent = '[提示] 检测到代码包含 input()/无限循环/图形库调用，沙箱以非交互方式运行，可能立即结束或无响应。\n';
    }
    openModal('#playModal');

    var session = addPlaySession(gameId, user);
    state.playSessionId = session.id;
    updatePlayCount();
    renderGames();

    var result = await PyRunner.play(g.code, function (line) {
      var out = $('#sandboxOutput');
      var box = out.parentElement;
      out.textContent += line;
      if (box) box.scrollTop = box.scrollHeight;
    });
    if (!result.ok) {
      $('#sandboxOutput').textContent += '\n[运行错误] ' + result.error + '\n';
    }
  }

  function stopPlay() {
    if (state.playSessionId) {
      removePlaySession(state.playSessionId);
      state.playSessionId = null;
    }
    state.playGameId = null;
    closeModal('#playModal');
    renderGames();
  }

  /* ============ 事件绑定 ============ */
  function bindEvents() {
    $('#btnCreate').addEventListener('click', function () {
      if (!requireUser()) return;
      openEditor(null);
    });

    $('#btnProfile').addEventListener('click', function () { openProfile(null); });

    $('#btnTools').addEventListener('click', function () { openTools(); });

    $('#btnSaveName').addEventListener('click', saveName);
    $('#myNameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveName(); });

    $('#searchInput').addEventListener('input', function () { renderGames(); });

    $('#btnUpload').addEventListener('click', function () { $('#fileUpload').click(); });
    $('#fileUpload').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { $('#codeInput').value = String(reader.result || ''); };
      reader.onerror = function () { toast('读取文件失败', 'error'); };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#btnVerifyPublish').addEventListener('click', handlePublish);
    $('#btnSaveEdit').addEventListener('click', handleSaveEdit);

    $('#btnAddFriend').addEventListener('click', addFriend);
    $('#btnConfirmFriend').addEventListener('click', confirmFriend);
    $('#friendNameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') addFriend(); });

    $('#pendingFriends').addEventListener('click', function (e) {
      var item = e.target.closest('.friend-item');
      if (!item) return;
      state.selectedPendingId = item.getAttribute('data-pkey');
      renderFriends();
    });

    $('#btnStopPlay').addEventListener('click', stopPlay);

    $('#confirmOk').addEventListener('click', function () {
      var fn = confirmOkAction;
      confirmOkAction = null;
      confirmCancelAction = null;
      closeModal('#confirmModal');
      if (fn) fn();
    });
    $('#confirmCancel').addEventListener('click', function () {
      var fn = confirmCancelAction;
      confirmOkAction = null;
      confirmCancelAction = null;
      closeModal('#confirmModal');
      if (fn) fn();
    });

    // 页签切换
    $$('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        $$('.tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
        state.activeTab = tab.getAttribute('data-tab');
        $('#tabPublished').hidden = (state.activeTab !== 'published');
        $('#tabFriends').hidden = (state.activeTab !== 'friends');
        if (state.activeTab === 'published') renderPublished();
        if (state.activeTab === 'friends') renderFriends();
      });
    });

    // 关闭按钮
    $$('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var target = btn.getAttribute('data-close');
        if (target === 'editorModal') { handleCloseEditor(); return; }
        if (target === 'playModal') { stopPlay(); return; }
        closeModal('#' + target);
      });
    });

    // 遮罩点击关闭
    $$('.modal-overlay').forEach(function (ov) {
      ov.addEventListener('click', function (e) {
        if (e.target !== ov) return;
        if (ov.id === 'editorModal') { handleCloseEditor(); return; }
        if (ov.id === 'playModal') { stopPlay(); return; }
        ov.hidden = true;
      });
    });

    // 游戏列表操作（事件委托）
    $('#gameGrid').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-id');
      if (act === 'play') handlePlay(id);
      if (act === 'edit') openEditor(id);
      if (act === 'delete') handleDeleteGame(id);
    });

    // 个人中心已发布列表操作
    $('#tabPublished').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-id');
      if (act === 'edit') { closeModal('#profileModal'); openEditor(id); }
      if (act === 'delete') handleDeleteGame(id);
    });

    // 跨页同步（admin 页面 / iframe 修改数据后实时刷新）
    window.addEventListener('storage', function (e) {
      if (e.key && e.key.indexOf(DB.PREFIX) === 0) {
        renderGames();
        if (!$('#profileModal').hidden) { renderPublished(); renderFriends(); }
        if (state.playGameId) updatePlayCount();
      }
    });

    // 离开页面时清理游玩会话
    window.addEventListener('beforeunload', function () {
      if (state.playSessionId) removePlaySession(state.playSessionId);
    });

    // 实时人数轮询
    setInterval(function () {
      if (state.playGameId) updatePlayCount();
    }, 2000);
  }

  /* ============ 初始化 ============ */
  function renderAll() {
    renderGames();
    renderPublished();
    renderFriends();
  }

  function init() {
    var sel = $('#gameVisibility');
    sel.innerHTML = U.VIS_OPTIONS.map(function (o) {
      return '<option value="' + o.value + '">' + o.label + '</option>';
    }).join('');
    refreshUser();
    renderGames();
    bindEvents();
  }

  init();
})();
