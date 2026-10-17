/* storage.js — 数据层统一封装
 * 键名统一带版本前缀 pgp_v1_，index.html 与 admin.html 共享同一数据模型：
 * games / users（含 friends）/ playSessions / kickedPlayers / adminConfig / currentUser / tools
 */
window.Utils = {
  esc: function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  VIS_LABEL: {
    public: '所有人可见',
    private: '仅自己可见',
    friends: '仅朋友可见',
    friends_and_self: '仅朋友和自己可见'
  },
  VIS_OPTIONS: [
    { value: 'public', label: '所有人可见' },
    { value: 'private', label: '仅自己可见' },
    { value: 'friends', label: '仅朋友可见' },
    { value: 'friends_and_self', label: '仅朋友和自己可见' }
  ],
  /* 解析官方工具下载地址：优先使用配置的真实 URL；未配置时指向项目内 downloads/ 目录下同名安装包 */
  getToolDownloadUrl: function (t) {
    if (!t) return '#';
    if (t.downloadUrl && String(t.downloadUrl).trim()) return String(t.downloadUrl).trim();
    if (t.pkgName && String(t.pkgName).trim()) return 'downloads/' + String(t.pkgName).trim();
    return '#';
  },
  /* 格式化字节数为可读大小 */
  formatSize: function (bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
  }
};

window.DB = (function () {
  'use strict';

  var PREFIX = 'pgp_v1_';
  var KEYS = {
    users: PREFIX + 'users',
    games: PREFIX + 'games',
    playSessions: PREFIX + 'playSessions',
    kickedPlayers: PREFIX + 'kickedPlayers',
    adminConfig: PREFIX + 'adminConfig',
    currentUser: PREFIX + 'currentUser',
    tools: PREFIX + 'tools'
  };

  function pendingKey(userId) {
    return PREFIX + 'pendingFriends_' + userId;
  }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function now() {
    return Date.now();
  }

  /* ===== users ===== */
  function getUsers() { return read(KEYS.users, []); }
  function saveUsers(list) { write(KEYS.users, list); }
  function findUserById(id) {
    return getUsers().filter(function (u) { return u.id === id; })[0] || null;
  }
  function findUserByName(name) {
    var n = String(name || '').trim();
    return getUsers().filter(function (u) { return u.name === n; })[0] || null;
  }
  function getOrCreateUser(name) {
    var n = String(name || '').trim();
    if (!n) return null;
    var u = findUserByName(n);
    if (!u) {
      u = { id: uid('u'), name: n, friends: [], createdAt: now() };
      var list = getUsers();
      list.push(u);
      saveUsers(list);
    }
    return u;
  }

  /* ===== games ===== */
  function getGames() { return read(KEYS.games, []); }
  function saveGames(list) { write(KEYS.games, list); }
  function getGameById(id) {
    return getGames().filter(function (g) { return g.id === id; })[0] || null;
  }

  /* ===== playSessions ===== */
  function getPlaySessions() { return read(KEYS.playSessions, []); }
  function savePlaySessions(list) { write(KEYS.playSessions, list); }
  function countPlayers(gameId) {
    return getPlaySessions().filter(function (s) { return s.gameId === gameId; }).length;
  }

  /* ===== kickedPlayers ===== */
  function getKickedPlayers() { return read(KEYS.kickedPlayers, []); }
  function saveKickedPlayers(list) { write(KEYS.kickedPlayers, list); }
  function isKicked(userId) {
    return getKickedPlayers().some(function (k) { return k.userId === userId; });
  }

  /* ===== adminConfig ===== */
  function getAdminConfig() { return read(KEYS.adminConfig, { notice: '' }); }
  function saveAdminConfig(cfg) { write(KEYS.adminConfig, cfg); }

  /* ===== currentUser ===== */
  function getCurrentUser() { return read(KEYS.currentUser, null); }
  function setCurrentUser(user) { write(KEYS.currentUser, user); }

  /* ===== tools（官方工具专区，仅管理员可增删改） ===== */
  // 数据模型：{ id, name, icon, version, size, desc, pkgName, pkgSize, downloadUrl, installNote }
  // downloadUrl 可配置真实 URL；留空时下载按钮指向 downloads/<pkgName>（本地占位安装包）
  function defaultTools() {
    return [
      {
        id: 't_screenshot',
        name: 'PyPlay 截图助手',
        icon: '🖼️',
        version: 'v1.2.0',
        size: '18.6 MB',
        desc: '一键区域截图、长截图拼接与延时截图，支持保存 PNG/JPG，图片管理更高效。',
        pkgName: 'pyplay-screenshot-helper.zip',
        pkgSize: 19503514,
        downloadUrl: '',
        installNote: '下载后解压，双击运行 PyPlayShot.exe 即可使用。'
      },
      {
        id: 't_pixelpaint',
        name: '像素画板 PixelPaint',
        icon: '🎨',
        version: 'v2.0.1',
        size: '32.4 MB',
        desc: '轻量像素绘图工具，支持图层、调色板与逐帧动画导出，适合像素风创作。',
        pkgName: 'pixelpaint.zip',
        pkgSize: 33973862,
        downloadUrl: '',
        installNote: '解压后运行 PixelPaint.exe；如需桌面快捷方式可右键发送到桌面。'
      },
      {
        id: 't_textreplace',
        name: '文本批量替换工具',
        icon: '📝',
        version: 'v1.5.3',
        size: '4.8 MB',
        desc: '批量查找并替换文本文件中的内容，支持正则与编码自动识别，处理百级文件秒级完成。',
        pkgName: 'text-batch-replacer.zip',
        pkgSize: 5033164,
        downloadUrl: '',
        installNote: '绿色免安装，解压后运行 TextReplacer.exe 即可。'
      },
      {
        id: 't_syncfolders',
        name: '文件夹同步备份',
        icon: '📁',
        version: 'v3.1.0',
        size: '27.2 MB',
        desc: '目录单向/双向同步与定时备份，支持增量复制与冲突提示，重要资料更安心。',
        pkgName: 'folder-sync-backup.zip',
        pkgSize: 28521267,
        downloadUrl: '',
        installNote: '解压后运行 SyncFolders.exe，首次使用按向导选择源目录与备份目录。'
      },
      {
        id: 't_cleaner',
        name: '系统清理助手 Cleaner Pro',
        icon: '🧹',
        version: 'v2.3.2',
        size: '12.9 MB',
        desc: '清理系统垃圾、浏览器缓存与无效注册表残留，一键体检，保持电脑流畅。',
        pkgName: 'cleaner-pro.zip',
        pkgSize: 13526630,
        downloadUrl: '',
        installNote: '下载后运行安装向导完成安装，安装完成后可从开始菜单启动。'
      },
      {
        id: 't_qrcode',
        name: '二维码生成器 QRTool',
        icon: '🔲',
        version: 'v1.0.5',
        size: '6.1 MB',
        desc: '将文本、网址或名片信息快速生成二维码，支持批量导出与高清打印。',
        pkgName: 'qrcode-generator.zip',
        pkgSize: 6396313,
        downloadUrl: '',
        installNote: '免安装，解压后双击 QRTool.exe；支持拖拽批量生成。'
      }
    ];
  }

  function getTools() {
    var list = read(KEYS.tools, null);
    if (list === null) {
      list = defaultTools();
      write(KEYS.tools, list);
    }
    return list;
  }
  function saveTools(list) { write(KEYS.tools, list); }
  function getToolById(id) {
    return getTools().filter(function (t) { return t.id === id; })[0] || null;
  }

  /* ===== 改名：同步用户昵称、该作者所有游戏的作者名、其他用户好友引用中的名字 ===== */
  function renameUser(userId, newName) {
    var name = String(newName || '').trim();
    if (!userId || !name) return null;
    var users = getUsers();
    var target = users.filter(function (u) { return u.id === userId; })[0];
    if (!target) return null;
    if (target.name === name) return target;
    target.name = name;
    saveUsers(users);
    var games = getGames();
    var changed = false;
    games.forEach(function (g) {
      if (g.authorId === userId && g.authorName !== name) {
        g.authorName = name;
        changed = true;
      }
    });
    if (changed) saveGames(games);
    var all = getUsers();
    var fChanged = false;
    all.forEach(function (u) {
      var fr = u.friends || [];
      fr.forEach(function (f) {
        if (f.id === userId && f.name !== name) {
          f.name = name;
          fChanged = true;
        }
      });
    });
    if (fChanged) saveUsers(all);
    return target;
  }

  /* ===== pendingFriends（候选朋友，存于本用户独立键） ===== */
  function getPendingFriends(userId) { return read(pendingKey(userId), []); }
  function savePendingFriends(userId, list) { write(pendingKey(userId), list); }

  return {
    PREFIX: PREFIX,
    KEYS: KEYS,
    uid: uid,
    now: now,
    getUsers: getUsers,
    saveUsers: saveUsers,
    findUserById: findUserById,
    findUserByName: findUserByName,
    getOrCreateUser: getOrCreateUser,
    getGames: getGames,
    saveGames: saveGames,
    getGameById: getGameById,
    getPlaySessions: getPlaySessions,
    savePlaySessions: savePlaySessions,
    countPlayers: countPlayers,
    getKickedPlayers: getKickedPlayers,
    saveKickedPlayers: saveKickedPlayers,
    isKicked: isKicked,
    getAdminConfig: getAdminConfig,
    saveAdminConfig: saveAdminConfig,
    getCurrentUser: getCurrentUser,
    setCurrentUser: setCurrentUser,
    getPendingFriends: getPendingFriends,
    savePendingFriends: savePendingFriends,
    getTools: getTools,
    saveTools: saveTools,
    getToolById: getToolById,
    renameUser: renameUser
  };
})();
