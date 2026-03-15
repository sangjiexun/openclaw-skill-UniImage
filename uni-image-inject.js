// uni-image-inject.js — 注入到渲染器的 UniImage 模型选择器和 fetch 拦截器
// 由 main.js 读取后通过 executeJavaScript 注入到主窗口
// 占位符 /* __UNI_IMAGE_CONFIG__ */ 会在注入前被替换为实际配置

(function() {
  if (window.__uniImageInjected) return;
  window.__uniImageInjected = true;

  /* __UNI_IMAGE_CONFIG__ */

  var PORT = window.__uniImagePort || 18800;
  var MODELS = window.__uniImageModels || [];

  // ===== Fetch 拦截器：重定向图片生成请求到 UniImage 代理 =====
  var _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (typeof url === 'string' && url.indexOf('/images/generations') >= 0 && opts && opts.body) {
      try {
        var body = JSON.parse(opts.body);
        var selectedModel = localStorage.getItem('uni-image-model');
        if (selectedModel) body.model = selectedModel;
        opts = Object.assign({}, opts, { body: JSON.stringify(body) });
        url = url.replace(/http:\/\/(?:localhost|127\.0\.0\.1):\d+/, 'http://127.0.0.1:' + PORT);
      } catch(e) { /* ignore parse errors */ }
    }
    return _origFetch.call(this, url, opts);
  };

  // ===== CSS 样式 =====
  var sty = document.createElement('style');
  sty.textContent = [
    '.uni-ms{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}',
    '.uni-sel{padding:5px 10px;border-radius:8px;font-size:13px;cursor:pointer;',
    'border:1px solid hsl(var(--border));background:hsl(var(--background));',
    'color:hsl(var(--foreground));outline:none;min-width:140px}',
    '.uni-sel:focus{border-color:hsl(var(--primary));box-shadow:0 0 0 2px hsl(var(--primary)/0.2)}',
    '.uni-kb{padding:4px 8px;border-radius:6px;font-size:14px;cursor:pointer;',
    'border:1px solid hsl(var(--border));background:transparent;line-height:1}',
    '.uni-kb:hover{background:hsl(var(--accent))}',
    '.uni-kp{margin-top:8px;padding:12px;border-radius:8px;border:1px solid hsl(var(--border));',
    'background:hsl(var(--card));display:none;max-width:420px}',
    '.uni-kp.show{display:block}',
    '.uni-kr{display:flex;align-items:center;gap:8px;margin-bottom:6px}',
    '.uni-kl{font-size:12px;min-width:80px;color:hsl(var(--muted-foreground))}',
    '.uni-ki{flex:1;padding:4px 8px;border-radius:6px;font-size:12px;',
    'border:1px solid hsl(var(--border));background:hsl(var(--background));',
    'color:hsl(var(--foreground));outline:none;font-family:monospace}',
    '.uni-ks{padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;',
    'border:none;background:hsl(var(--primary));color:hsl(var(--primary-foreground))}',
    '.uni-ks:hover{opacity:0.9}',
    '.uni-status{font-size:11px;color:hsl(var(--muted-foreground));margin-left:4px}',
  ].join('\n');
  document.head.appendChild(sty);

  // ===== 模型选择器注入 =====
  var PROVIDERS = [
    { key: 'volcengine', label: '\u706b\u5c71\u5f15\u64ce', ph: 'ARK_API_KEY' },
    { key: 'dashscope',  label: '\u901a\u4e49\u5343\u95ee', ph: 'DASHSCOPE_IMAGE_KEY' },
    { key: 'google',     label: 'Google AI', ph: 'GOOGLE_API_KEY' },
  ];

  function injectSelector() {
    var h1 = document.querySelector('h1');
    if (!h1 || (h1.textContent || '').indexOf('\u7ed8\u753b\u52a9\u624b') < 0) return;
    if (h1.parentElement.querySelector('.uni-ms')) return;

    // 模型选择器容器
    var c = document.createElement('div');
    c.className = 'uni-ms';

    var label = document.createElement('span');
    label.style.cssText = 'font-size:13px;color:hsl(var(--muted-foreground))';
    label.textContent = '\u6a21\u578b\u5e73\u53f0:';

    var sel = document.createElement('select');
    sel.className = 'uni-sel';
    var cur = localStorage.getItem('uni-image-model') || (MODELS[0] && MODELS[0].id) || 'doubao-seedream-5-0-260128';
    MODELS.forEach(function(m) {
      var o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.icon + ' ' + m.name;
      if (m.id === cur) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function() { localStorage.setItem('uni-image-model', sel.value); };

    // API Key 配置按钮
    var keyBtn = document.createElement('button');
    keyBtn.className = 'uni-kb';
    keyBtn.textContent = '\uD83D\uDD11';
    keyBtn.title = '\u914d\u7f6e API Key';

    // API Key 配置面板
    var keyPanel = document.createElement('div');
    keyPanel.className = 'uni-kp';

    PROVIDERS.forEach(function(p) {
      var row = document.createElement('div');
      row.className = 'uni-kr';
      var lb = document.createElement('span');
      lb.className = 'uni-kl';
      lb.textContent = p.label;
      var inp = document.createElement('input');
      inp.className = 'uni-ki';
      inp.type = 'password';
      inp.placeholder = p.ph;
      inp.dataset.provider = p.key;
      row.appendChild(lb);
      row.appendChild(inp);
      keyPanel.appendChild(row);
    });

    // 加载已保存的 key（如果有 electronAPI）
    if (window.electronAPI && window.electronAPI.getImageKeys) {
      window.electronAPI.getImageKeys().then(function(keys) {
        if (!keys) return;
        var inputs = keyPanel.querySelectorAll('.uni-ki');
        inputs.forEach(function(inp) {
          var v = keys[inp.dataset.provider];
          if (v) inp.value = v;
        });
      }).catch(function() {});
    }

    // 保存按钮
    var saveRow = document.createElement('div');
    saveRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:8px;gap:8px;align-items:center';
    var statusSpan = document.createElement('span');
    statusSpan.className = 'uni-status';
    var saveBtn = document.createElement('button');
    saveBtn.className = 'uni-ks';
    saveBtn.textContent = '\u4FDD\u5B58';
    saveBtn.onclick = function() {
      var inputs = keyPanel.querySelectorAll('.uni-ki');
      var keys = {};
      inputs.forEach(function(inp) {
        var v = inp.value.trim();
        if (v) keys[inp.dataset.provider] = v;
      });
      if (window.electronAPI && window.electronAPI.setImageKeys) {
        window.electronAPI.setImageKeys(keys).then(function() {
          statusSpan.textContent = '\u2705 \u5DF2\u4FDD\u5B58';
          setTimeout(function() { statusSpan.textContent = ''; keyPanel.classList.remove('show'); }, 1200);
        }).catch(function() {
          statusSpan.textContent = '\u274C \u4FDD\u5B58\u5931\u8D25';
        });
      } else {
        statusSpan.textContent = '\u274C electronAPI \u4E0D\u53EF\u7528';
      }
    };
    saveRow.appendChild(statusSpan);
    saveRow.appendChild(saveBtn);
    keyPanel.appendChild(saveRow);

    keyBtn.onclick = function() { keyPanel.classList.toggle('show'); };

    c.appendChild(label);
    c.appendChild(sel);
    c.appendChild(keyBtn);
    h1.parentElement.appendChild(c);
    h1.parentElement.appendChild(keyPanel);
  }

  // MutationObserver 监听 DOM 变化，检测绘画页面
  var obs = new MutationObserver(function() { requestAnimationFrame(injectSelector); });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(injectSelector, 800);
})();
