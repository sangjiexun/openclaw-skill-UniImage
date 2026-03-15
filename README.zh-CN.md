# UniImage — 统一多平台 AI 图片生成

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenClaw Skill](https://img.shields.io/badge/OpenClaw-Skill-orange.svg)](https://github.com/sangjiexun/clawmate)

[English](README.md)

为 [OpenClaw](https://github.com/sangjiexun/clawmate) 打造的统一图片生成技能，通过单一 OpenAI 兼容 API 将请求路由到多个 AI 图片平台。

## 支持的平台

| 模型 ID | 显示名称 | 平台 | 说明 |
|---------|---------|------|------|
| `doubao-seedream-5-0-260128` | Seedream 5.0 | 火山引擎 Ark | 多角色超强一致性，中文处理能力极强 |
| `qwen-image-plus` | Qwen Image | 阿里通义千问 | 单图一致性强，适合中文相关的多图处理场景 |
| `gemini-3-pro-image-preview` | 香蕉 Pro | Google Gemini | 最强修图模型，适合电商和专业设计 |
| `gemini-3.1-flash-image-preview` | 香蕉 V2 | Google Gemini | 最新香蕉模型，极致速度和超高性价比 |

## 架构

```
客户端（OpenAI 兼容请求）
  ↓  POST /v1/images/generations
UniImage 代理（HTTP 服务器，端口 18800）
  ├── 火山引擎 Ark API  →  Seedream 系列
  ├── DashScope API     →  通义万象 / Qwen 系列（异步轮询）
  └── Google Gemini API →  Nano Banana 系列
```

## 快速开始

### 1. 安装

```bash
git clone https://github.com/sangjiexun/openclaw-skill-UniImage.git
cd openclaw-skill-UniImage
```

无需额外依赖——代理仅使用 Node.js 内置模块（`http`、`https`、`fs`、`path`、`os`）。

### 2. 配置 API Key

为需要使用的平台设置环境变量：

```bash
# 火山引擎 Ark（Seedream）
export ARK_API_KEY="你的火山引擎-ark-api-key"

# 阿里 DashScope（通义万象 / Qwen Image）
export DASHSCOPE_IMAGE_KEY="你的dashscope-api-key"

# Google AI（Gemini / Nano Banana）
export GOOGLE_API_KEY="你的google-api-key"
```

也可通过内置 UI 的 🔑 面板配置（密钥保存在 `~/.openclaw-dev/uni-image-config.json`）。

### 3. 独立运行

```bash
node uni-image-proxy.js
# 代理已启动: http://127.0.0.1:18800
```

### 4. 生成图片

```bash
# Seedream（火山引擎）
curl -X POST http://127.0.0.1:18800/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seedream-5-0-260128","prompt":"一只可爱的橘猫","size":"1024x1024"}'

# Qwen Image（通义千问）
curl -X POST http://127.0.0.1:18800/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-image-plus","prompt":"一只可爱的橘猫","size":"1024*1024"}'

# Gemini 香蕉 V2（Google）
curl -X POST http://127.0.0.1:18800/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-3.1-flash-image-preview","prompt":"一只可爱的橘猫"}'
```

## OpenClaw 集成

作为 OpenClaw 技能使用时，UniImage 集成到**绘画助手**页面：

1. 代理服务器在应用启动时自动运行
2. 绘画页面出现**模型平台**下拉框，可切换不同平台
3. **🔑** 按钮打开 API Key 配置面板
4. `fetch` 拦截器自动将图片生成请求路由到 UniImage 代理

### 文件说明

| 文件 | 说明 |
|------|------|
| `SKILL.md` | OpenClaw 技能清单 |
| `uni-image-proxy.js` | HTTP 代理服务器，多平台路由 |
| `uni-image-inject.js` | 渲染器注入脚本（fetch 包装 + 模型选择器 UI） |

## API 接口

### `POST /v1/images/generations`

OpenAI 兼容的图片生成接口。

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 否 | 模型 ID（默认：`doubao-seedream-5-0-260128`） |
| `prompt` | string | 是 | 图片描述文本 |
| `size` | string | 否 | 图片尺寸，如 `1024x1024`（默认） |
| `negative_prompt` | string | 否 | 不希望出现的内容（仅 Seedream/Qwen） |
| `image` | string | 否 | Base64 编码图片，用于图生图 |

**响应：**

```json
{
  "data": [
    { "url": "data:image/png;base64,..." }
  ]
}
```

### `GET /health`

健康检查。返回 `{ "ok": true, "proxy": "uni-image" }`。

### `GET /images/{id}`

通过 ID 获取缓存的生成图片。

## 平台详情

### 火山引擎 Ark（Seedream）

- **API 端点：** `https://ark.cn-beijing.volces.com/api/v3/images/generations`
- **认证：** `Authorization: Bearer <ARK_API_KEY>`
- **模型：** `doubao-seedream-5-0-260128`、`doubao-seedream-5-0-lite`、`doubao-seedream-4-5`、`doubao-seedream-4-0`、`doubao-seedream-3-0-t2i`、`doubao-seededit-3-0-i2i`
- **响应：** 同步，返回 base64 编码图片
- **文档：** [火山引擎 Ark 图片生成](https://www.volcengine.com/docs/82379/1399427)

### 阿里 DashScope（通义万象 / Qwen Image）

- **API 端点：** `https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis`
- **认证：** `Authorization: Bearer <DASHSCOPE_IMAGE_KEY>`
- **模型：** `qwen-image-plus`、`qwen-image-2.0-pro`、`qwen-image-2.0`、`wan2.6-t2i`、`wan2.2-t2i-flash`、`wanx2.0-t2i-turbo`
- **响应：** 异步——先提交任务，然后轮询 `GET /api/v1/tasks/{task_id}` 直到完成
- **文档：** [DashScope 图片生成](https://help.aliyun.com/zh/model-studio/text-to-image)

### Google Gemini（Nano Banana）

- **API 端点：** `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **认证：** `?key=<GOOGLE_API_KEY>` 查询参数
- **模型：** `gemini-3-pro-image-preview`、`gemini-3.1-flash-image-preview`、`gemini-2.5-flash-image`
- **响应：** 同步，返回 `candidates[0].content.parts` 中的 inline base64 图片
- **文档：** [Gemini 图片生成](https://ai.google.dev/gemini-api/docs/image-generation)

## 配置文件

API Key 和设置保存在 `~/.openclaw-dev/uni-image-config.json`：

```json
{
  "apiKeys": {
    "volcengine": "你的火山引擎key",
    "dashscope": "你的dashscope-key",
    "google": "你的google-api-key"
  }
}
```

## 许可证

[MIT](LICENSE)
