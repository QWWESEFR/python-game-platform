# Python 小游戏发布平台（python-game-platform）

纯前端静态网页项目：发布 / 修改 / 管理 Python 小游戏，数据用 localStorage 模拟，Python 代码由 Pyodide（CDN）在浏览器真实运行验证与游玩。

## 项目结构

```
python-game-platform/
├── index.html          # 主页面（游戏发布平台）
├── admin.html          # 管理员后台（不公开、不发布，内嵌 index.html）
├── css/
│   └── style.css       # 全局样式（两个页面共用）
├── downloads/          # 官方工具安装包存放目录（占位 zip 已内置，可被管理端替换）
└── js/
    ├── storage.js      # 数据层统一封装（localStorage，键名带 pgp_v1_ 版本前缀）
    ├── pyodide.js      # Pyodide 封装（verify 验证 / play 游玩运行）
    ├── app.js          # 主页面逻辑
    └── admin.js        # 管理员后台逻辑
```

## 数据模型（localStorage 键名）

| 键名 | 内容 |
| --- | --- |
| `pgp_v1_users` | 用户列表（含 friends 好友关系） |
| `pgp_v1_games` | 游戏列表（title/code/visibility/status/authorId 等） |
| `pgp_v1_playSessions` | 游玩会话（实时人数统计） |
| `pgp_v1_kickedPlayers` | 被管理员踢出的玩家 |
| `pgp_v1_adminConfig` | 管理员配置 |
| `pgp_v1_currentUser` | 当前登录用户 |
| `pgp_v1_pendingFriends_<uid>` | 待确认的朋友候选 |
| `pgp_v1_tools` | 官方工具列表（name/icon/version/size/desc/pkgName/pkgSize/downloadUrl/installNote） |

## 本地打开方式

由于 Pyodide 通过 CDN（jsdelivr）加载，需在有网络的环境下打开：

1. 双击打开 `index.html`（主页面）或 `admin.html`（管理员后台）；或
2. 在项目目录下启动静态服务后访问：
   ```
   python -m http.server 8000
   # 浏览器打开 http://localhost:8000/index.html
   ```

两个页面同目录同源，共享 localStorage，数据互通。

## 功能说明

- 发布流程：右上角「创作」→ 取名后可编辑代码（粘贴 / 上传 .py）→「验证并发布」用 Pyodide 真实运行验证，通过后发布。
- 修改 / 管理：个人中心「已发布」页签 → 修改小游戏（修改期间游戏标记「禁止游玩」，保存或退出时询问是否保存）/ 删除小游戏（二次确认）。
- 搜索与可见设置：顶部搜索框按名称 / 作者搜索；可见范围四档（所有人 / 仅自己 / 仅朋友 / 仅朋友和自己），列表按可见范围过滤。
- 取名与朋友：未取名不能创作 / 发布 / 游玩；个人中心输入朋友名字 → 添加朋友 → 点击朋友 → 确定 → 建立好友关系。
- 游玩：沙箱容器运行 Python 代码（Pyodide），显示实时在线人数。
- 改名：个人中心可修改自己已取的名字，改名后该作者所有游戏的作者名、好友列表中的名字同步更新；管理端「游戏管理」可修改游戏名称。
- 实用的工具（官方下载专区）：主站左上角「实用的工具」仅浏览下载、仅电脑版；管理端「官方工具管理」可新增 / 编辑 / 删除，可修改工具名称，可选择发送 Windows 安装包（.exe/.msi/.zip，自动记录文件名与大小）；下载链接留空时主站下载按钮指向 `downloads/` 下同名文件，也可配置真实 URL。
- 管理员后台：iframe 内嵌平台；删除游戏（二次确认）、修改游戏名称；创作者视角仅显示实时人数；玩家管理可踢出 / 解除（被踢玩家在平台侧被拦截，解除后可再游玩）。
