// uni-image-proxy.js — 统一图片生成代理服务器
// 支持多模型平台：Volcengine Seedream / DashScope Qwen / Google Gemini (Nano Banana)
// 接收 OpenAI 兼容请求，路由到对应平台 API

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Buffer } = require('buffer');
const log = require('./logger');

const CONFIG_PATH = path.join(os.homedir(), '.openclaw-dev', 'uni-image-config.json');
// 临时图片存储目录
const IMAGE_CACHE_DIR = path.join(os.homedir(), '.openclaw-dev', 'image-cache');

// 模型 → 平台 映射
const MODEL_PROVIDERS = {
  // Volcengine Seedream
  'doubao-seedream-5-0-260128': 'volcengine',
  'doubao-seedream-5-0-lite':   'volcengine',
  'doubao-seedream-4-5':        'volcengine',
  'doubao-seedream-4-0':        'volcengine',
  'doubao-seedream-3-0-t2i':    'volcengine',
  'doubao-seededit-3-0-i2i':    'volcengine',
  // DashScope Qwen / Wanx
  'qwen-image-plus':            'dashscope',
  'qwen-image-2.0-pro':         'dashscope',
  'qwen-image-2.0':             'dashscope',
  'wan2.6-t2i':                 'dashscope',
  'wan2.2-t2i-flash':           'dashscope',
  'wanx2.0-t2i-turbo':          'dashscope',
  // Google Gemini Nano Banana
  'gemini-3-pro-image-preview':     'google',
  'gemini-3.1-flash-image-preview': 'google',
  'gemini-2.5-flash-image':         'google',
};

// UI 展示用的模型列表
const IMAGE_MODELS = [
  { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0',  provider: 'volcengine', desc: '多角色超强一致性，中文处理能力极强', icon: '🎨', keyEnv: 'ARK_API_KEY' },
  { id: 'qwen-image-plus',            name: 'Qwen Image',    provider: 'dashscope',  desc: '单图一致性强，适合中文相关的多图处理场景', icon: '🖼️', keyEnv: 'DASHSCOPE_IMAGE_KEY' },
  { id: 'gemini-3-pro-image-preview', name: '香蕉 Pro',      provider: 'google',     desc: '最强修图模型，适合电商和专业设计', icon: '🍌', keyEnv: 'GOOGLE_API_KEY' },
  { id: 'gemini-3.1-flash-image-preview', name: '香蕉 V2',   provider: 'google',     desc: '最新香蕉模型，极致速度和超高性价比', icon: '🍌', keyEnv: 'GOOGLE_API_KEY' },
];

// ===== 配置管理 =====

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {}
  return {};
}

function saveConfig(cfg) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    log.error('image', '保存配置失败:', e.message);
  }
}

function getApiKey(provider) {
  const cfg = loadConfig();
  const keys = cfg.apiKeys || {};
  // 先查配置文件，再查环境变量
  if (provider === 'volcengine') return keys.volcengine || process.env.ARK_API_KEY || '';
  if (provider === 'dashscope')  return keys.dashscope  || process.env.DASHSCOPE_IMAGE_KEY || process.env.DASHSCOPE_API_KEY || '';
  if (provider === 'google')     return keys.google     || process.env.GOOGLE_API_KEY || '';
  return '';
}

// ===== HTTPS 请求工具 =====

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: options.timeout || 120000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: null, raw }); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Request timeout')); });
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      headers: headers || {},
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: null, raw }); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Request timeout')); });
  });
}

// ===== 保存图片到缓存 =====

function saveImageToCache(base64Data, ext) {
  try {
    if (!fs.existsSync(IMAGE_CACHE_DIR)) fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || 'png'}`;
    const filePath = path.join(IMAGE_CACHE_DIR, id);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return id;
  } catch { return null; }
}

// ===== Volcengine Seedream 生成 =====

async function generateVolcengine(params) {
  const apiKey = getApiKey('volcengine');
  if (!apiKey) throw new Error('未配置 Volcengine API Key (ARK_API_KEY)');

  const body = {
    model: params.model || 'doubao-seedream-5-0-260128',
    prompt: params.prompt,
    response_format: 'b64_json',
    size: (params.size || '1024x1024').replace('*', 'x'),
    n: 1,
  };
  if (params.negative_prompt) body.negative_prompt = params.negative_prompt;
  if (params.image) body.image = params.image;

  const result = await httpsRequest(
    'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(JSON.stringify(body)),
      },
    },
    JSON.stringify(body),
  );

  if (result.status !== 200 || !result.data) {
    throw new Error(result.data?.error?.message || result.raw?.slice(0, 300) || `HTTP ${result.status}`);
  }

  const items = result.data.data || [];
  return {
    data: items.map(item => {
      if (item.b64_json) {
        const id = saveImageToCache(item.b64_json, 'png');
        return { url: `data:image/png;base64,${item.b64_json}`, id };
      }
      return { url: item.url };
    }),
  };
}

// ===== DashScope Qwen / Wanx 生成 (异步任务) =====

async function generateDashscope(params) {
  const apiKey = getApiKey('dashscope');
  if (!apiKey) throw new Error('未配置 DashScope API Key (DASHSCOPE_IMAGE_KEY)');

  const model = params.model || 'qwen-image-plus';
  const sizeStr = (params.size || '1024x1024').replace('x', '*');
  const body = {
    model,
    input: { prompt: params.prompt },
    parameters: { size: sizeStr, n: 1 },
  };
  if (params.negative_prompt) body.input.negative_prompt = params.negative_prompt;

  // 提交异步任务
  const submitResult = await httpsRequest(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-DashScope-Async': 'enable',
        'Content-Length': Buffer.byteLength(JSON.stringify(body)),
      },
    },
    JSON.stringify(body),
  );

  if (!submitResult.data?.output?.task_id) {
    throw new Error(submitResult.data?.message || submitResult.raw?.slice(0, 300) || '任务提交失败');
  }

  const taskId = submitResult.data.output.task_id;
  log.info('image', `[DashScope] 任务已提交: ${taskId}`);

  // 轮询等待结果 (最多 120 秒)
  const maxWait = 120000;
  const start = Date.now();
  let pollInterval = 3000;

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    if (Date.now() - start > 30000) pollInterval = 5000;

    const pollResult = await httpsGet(
      `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
      { 'Authorization': `Bearer ${apiKey}` },
    );

    const status = pollResult.data?.output?.task_status;
    if (status === 'SUCCEEDED') {
      const results = pollResult.data.output.results || [];
      return { data: results.map(r => ({ url: r.url })) };
    }
    if (status === 'FAILED') {
      throw new Error(pollResult.data?.output?.message || '图像生成失败');
    }
    log.info('image', `[DashScope] 任务状态: ${status}...`);
  }

  throw new Error('图像生成超时 (120s)');
}

// ===== Google Gemini Nano Banana 生成 =====

async function generateGoogle(params) {
  const apiKey = getApiKey('google');
  if (!apiKey) throw new Error('未配置 Google API Key (GOOGLE_API_KEY)');

  const model = params.model || 'gemini-3.1-flash-image-preview';

  // 构建请求体
  const contents = [{ parts: [{ text: params.prompt }] }];

  // 图生图：添加图片 inline_data
  if (params.image) {
    let imageBase64 = params.image;
    if (params.image.startsWith('data:')) {
      imageBase64 = params.image.split(',')[1] || params.image;
    }
    contents[0].parts.unshift({
      inline_data: { mime_type: 'image/png', data: imageBase64 },
    });
  }

  // 解析尺寸 → 宽高比
  const sizeToAspect = {
    '1024x1024': '1:1', '1024*1024': '1:1',
    '1664x928': '16:9', '1664*928': '16:9',
    '928x1664': '9:16', '928*1664': '9:16',
    '1472x1104': '4:3', '1472*1104': '4:3',
    '1104x1472': '3:4', '1104*1472': '3:4',
    '1328x1328': '1:1', '1328*1328': '1:1',
  };
  const aspectRatio = sizeToAspect[params.size] || '1:1';

  const body = {
    contents,
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio, imageSize: '2K' },
    },
  };

  const bodyStr = JSON.stringify(body);
  const result = await httpsRequest(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
      timeout: 120000,
    },
    bodyStr,
  );

  if (result.status !== 200 || !result.data) {
    const errMsg = result.data?.error?.message || result.raw?.slice(0, 300) || `HTTP ${result.status}`;
    throw new Error(errMsg);
  }

  // 从 candidates 中提取图片
  const parts = result.data.candidates?.[0]?.content?.parts || [];
  const images = parts.filter(p => p.inline_data?.mime_type?.startsWith('image/'));

  if (!images.length) throw new Error('未返回图片');

  return {
    data: images.map(img => {
      const mime = img.inline_data.mime_type;
      const b64 = img.inline_data.data;
      const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
      const id = saveImageToCache(b64, ext);
      return { url: `data:${mime};base64,${b64}`, id };
    }),
  };
}

// ===== 统一入口 =====

async function generateImage(params) {
  const model = params.model || 'doubao-seedream-5-0-260128';
  const provider = MODEL_PROVIDERS[model];

  if (!provider) throw new Error(`不支持的模型: ${model}`);

  log.info('image', `生成图片 [${model}] provider=${provider} prompt=${(params.prompt || '').slice(0, 50)}`);

  if (provider === 'volcengine') return generateVolcengine(params);
  if (provider === 'dashscope')  return generateDashscope(params);
  if (provider === 'google')     return generateGoogle(params);

  throw new Error(`未实现的平台: ${provider}`);
}

// ===== HTTP 代理服务器 =====

let _port = 18800;
let _server = null;

function startImageProxy() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // 健康检查
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, proxy: 'uni-image' }));
      return;
    }

    // 图片缓存静态服务: /images/{id}
    if (req.method === 'GET' && req.url.startsWith('/images/')) {
      const id = path.basename(req.url);
      // 防止路径遍历
      if (id.includes('..') || id.includes('/') || id.includes('\\')) {
        res.writeHead(400); res.end('Bad Request'); return;
      }
      const filePath = path.join(IMAGE_CACHE_DIR, id);
      if (!filePath.startsWith(IMAGE_CACHE_DIR)) {
        res.writeHead(400); res.end('Bad Request'); return;
      }
      try {
        const data = fs.readFileSync(filePath);
        const ext = path.extname(id).slice(1);
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'max-age=3600' });
        res.end(data);
      } catch {
        res.writeHead(404); res.end('Not Found');
      }
      return;
    }

    // 图片生成
    if (req.method === 'POST' && req.url.includes('/images/generations')) {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const params = JSON.parse(body);
          const result = await generateImage(params);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          log.error('image', '图片生成失败:', err.message);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
          }
          try {
            res.end(JSON.stringify({ error: { message: err.message } }));
          } catch {}
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log.info('image', `端口 ${_port} 被占用，尝试 +1`);
      _port++;
      server.listen(_port, '127.0.0.1');
    } else {
      log.error('image', '代理服务错误:', err.message);
    }
  });

  server.listen(_port, '127.0.0.1', () => {
    log.info('image', `统一图片代理已启动: http://127.0.0.1:${_port}`);
  });

  _server = server;
}

function getPort() { return _port; }

module.exports = {
  startImageProxy,
  getPort,
  generateImage,
  loadConfig,
  saveConfig,
  getApiKey,
  IMAGE_MODELS,
};
