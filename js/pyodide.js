/* pyodide.js — Pyodide 解释器封装
 * 通过 CDN 引入 Python 解释器，在浏览器中真实运行 Python 代码。
 * 提供：verify（发布前验证）/ play（游玩运行）
 */
window.PyRunner = (function () {
  'use strict';

  var VERSION = 'v0.26.4';
  var CDN_URL = 'https://cdn.jsdelivr.net/pyodide/' + VERSION + '/full/pyodide.js';
  var INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/' + VERSION + '/full/';

  var pyodideInstance = null;
  var loadingPromise = null;

  function loadPyodide() {
    if (pyodideInstance) return Promise.resolve(pyodideInstance);
    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise(function (resolve, reject) {
      function boot() {
        if (typeof window.loadPyodide !== 'function') {
          reject(new Error('Pyodide 未正确加载'));
          return;
        }
        window.loadPyodide({ indexURL: INDEX_URL })
          .then(function (py) {
            pyodideInstance = py;
            resolve(py);
          })
          .catch(function (err) {
            reject(new Error('Pyodide 初始化失败：' + (err && err.message ? err.message : err)));
          });
      }

      if (typeof window.loadPyodide === 'function') {
        boot();
        return;
      }
      var s = document.createElement('script');
      s.src = CDN_URL;
      s.onload = boot;
      s.onerror = function () {
        reject(new Error('Pyodide CDN 加载失败，请检查网络连接'));
      };
      document.head.appendChild(s);
    });
    return loadingPromise;
  }

  /* 判断代码是否含交互/阻塞特性（input、图形库、无限循环） */
  function hasBlocker(code) {
    return /\binput\s*\(/.test(code) ||
      /\bpygame\b|\bturtle\b|\btkinter\b/.test(code) ||
      /\bwhile\s+True\b/.test(code);
  }

  /* 仅做语法检查（不执行代码） */
  function syntaxCheck(code) {
    if (!pyodideInstance) return { ok: false, error: 'Pyodide 未加载' };
    try {
      var payload = JSON.stringify(code); // 转义为 Python 字符串字面量
      pyodideInstance.setStdin({ stdin: function () { return ''; } });
      pyodideInstance.runPython('compile(' + payload + ', "<game>", "exec")');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  /* 安装代码 import 的第三方包（如 numpy / pygame） */
  async function installPackages(code) {
    if (!pyodideInstance) return;
    try {
      await pyodideInstance.loadPackagesFromImports(code);
    } catch (e) {
      // 安装失败不阻塞运行，交由后续执行报错提示
    }
  }

  /* 发布前验证：可运行即视为编译通过 */
  async function verify(code) {
    try {
      await loadPyodide();
      var syn = syntaxCheck(code);
      if (!syn.ok) {
        return { ok: false, stage: '语法检查', error: syn.error };
      }
      if (hasBlocker(code)) {
        return {
          ok: true,
          note: '代码包含 input()/图形库/循环等交互特性，已通过 Python 语法检查（真实交互运行需在游玩沙箱中进行）'
        };
      }
      await installPackages(code);
      var output = '';
      try {
        pyodideInstance.setStdout({ batched: function (txt) { output += String(txt) + '\n'; } });
        pyodideInstance.setStdin({ stdin: function () { return ''; } });
        pyodideInstance.runPython(code);
        return { ok: true, output: output.trim() };
      } catch (e) {
        return { ok: false, stage: '试运行', error: String(e && e.message ? e.message : e), output: output.trim() };
      }
    } catch (e) {
      return { ok: false, stage: '加载', error: String(e && e.message ? e.message : e) };
    }
  }

  /* 游玩运行：输出回调到沙箱容器 */
  async function play(code, onOutput) {
    try {
      await loadPyodide();
      var output = '';
      await installPackages(code);
      pyodideInstance.setStdout({
        batched: function (txt) {
          var line = String(txt) + '\n';
          output += line;
          if (typeof onOutput === 'function') onOutput(line);
        }
      });
      pyodideInstance.setStdin({ stdin: function () { return ''; } });
      pyodideInstance.runPython(code);
      return { ok: true, output: output.trim() };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  return {
    VERSION: VERSION,
    CDN_URL: CDN_URL,
    loadPyodide: loadPyodide,
    verify: verify,
    play: play,
    hasBlocker: hasBlocker
  };
})();
