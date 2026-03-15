# UniImage — Unified Multi-Platform AI Image Generation

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenClaw Skill](https://img.shields.io/badge/OpenClaw-Skill-orange.svg)](https://github.com/sangjiexun/clawmate)

[中文文档](README.zh-CN.md)

A unified image generation skill for [OpenClaw](https://github.com/sangjiexun/clawmate) that routes requests to multiple AI image providers through a single OpenAI-compatible API.

## Supported Providers

| Model ID | Display Name | Provider | Description |
|----------|-------------|----------|-------------|
| `doubao-seedream-5-0-260128` | Seedream 5.0 | Volcengine Ark | Strong multi-character consistency, excellent Chinese prompt handling |
| `qwen-image-plus` | Qwen Image | Alibaba DashScope | Great single-image consistency, ideal for Chinese multi-image scenarios |
| `gemini-3-pro-image-preview` | Banana Pro | Google Gemini | Top-tier inpainting model, ideal for e-commerce and professional design |
| `gemini-3.1-flash-image-preview` | Banana V2 | Google Gemini | Latest Banana model, blazing fast with outstanding cost efficiency |

## Architecture

```
Client (OpenAI-compatible request)
  ↓  POST /v1/images/generations
UniImage Proxy (HTTP server, port 18800)
  ├── Volcengine Ark API  →  Seedream models
  ├── DashScope API       →  Qwen / Wanx models (async polling)
  └── Google Gemini API   →  Nano Banana models
```

## Quick Start

### 1. Install

```bash
git clone https://github.com/sangjiexun/openclaw-skill-UniImage.git
cd openclaw-skill-UniImage
```

No additional dependencies are required — the proxy uses only Node.js built-in modules (`http`, `https`, `fs`, `path`, `os`).

### 2. Configure API Keys

Set environment variables for the providers you want to use:

```bash
# Volcengine Ark (Seedream)
export ARK_API_KEY="your-volcengine-ark-api-key"

# Alibaba DashScope (Qwen Image)
export DASHSCOPE_IMAGE_KEY="your-dashscope-api-key"

# Google AI (Gemini / Nano Banana)
export GOOGLE_API_KEY="your-google-api-key"
```

Or configure via the built-in UI key panel (keys are stored in `~/.openclaw-dev/uni-image-config.json`).

### 3. Run Standalone

```bash
node uni-image-proxy.js
# Proxy started at http://127.0.0.1:18800
```

### 4. Generate Images

```bash
# Seedream (Volcengine)
curl -X POST http://127.0.0.1:18800/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seedream-5-0-260128","prompt":"a cute orange cat","size":"1024x1024"}'

# Qwen Image (DashScope)
curl -X POST http://127.0.0.1:18800/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-image-plus","prompt":"a cute orange cat","size":"1024*1024"}'

# Gemini Banana V2 (Google)
curl -X POST http://127.0.0.1:18800/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-3.1-flash-image-preview","prompt":"a cute orange cat"}'
```

## OpenClaw Integration

When used as an OpenClaw skill, UniImage integrates into the **Paint** (绘画助手) page:

1. The proxy server starts automatically on app launch
2. A **Model Platform** dropdown appears on the paint page to switch providers
3. A **🔑** button opens the API key configuration panel
4. The `fetch` interceptor transparently routes image generation requests to the UniImage proxy

### Files

| File | Description |
|------|-------------|
| `SKILL.md` | OpenClaw skill manifest |
| `uni-image-proxy.js` | HTTP proxy server with multi-provider routing |
| `uni-image-inject.js` | Renderer injection script (fetch wrapper + model selector UI) |

## API Reference

### `POST /v1/images/generations`

OpenAI-compatible image generation endpoint.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | No | Model ID (default: `doubao-seedream-5-0-260128`) |
| `prompt` | string | Yes | Text description of the image to generate |
| `size` | string | No | Image size, e.g. `1024x1024` (default) |
| `negative_prompt` | string | No | Content to exclude (Seedream/Qwen only) |
| `image` | string | No | Base64-encoded image for image-to-image generation |

**Response:**

```json
{
  "data": [
    { "url": "data:image/png;base64,..." }
  ]
}
```

### `GET /health`

Health check endpoint. Returns `{ "ok": true, "proxy": "uni-image" }`.

### `GET /images/{id}`

Retrieve a cached generated image by ID.

## Provider Details

### Volcengine Ark (Seedream)

- **API Endpoint:** `https://ark.cn-beijing.volces.com/api/v3/images/generations`
- **Auth:** `Authorization: Bearer <ARK_API_KEY>`
- **Models:** `doubao-seedream-5-0-260128`, `doubao-seedream-5-0-lite`, `doubao-seedream-4-5`, `doubao-seedream-4-0`, `doubao-seedream-3-0-t2i`, `doubao-seededit-3-0-i2i`
- **Response:** Synchronous, returns base64-encoded image data
- **Docs:** [Volcengine Ark Image Generation](https://www.volcengine.com/docs/82379/1399427)

### Alibaba DashScope (Qwen Image)

- **API Endpoint:** `https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis`
- **Auth:** `Authorization: Bearer <DASHSCOPE_IMAGE_KEY>`
- **Models:** `qwen-image-plus`, `qwen-image-2.0-pro`, `qwen-image-2.0`, `wan2.6-t2i`, `wan2.2-t2i-flash`, `wanx2.0-t2i-turbo`
- **Response:** Asynchronous — submits a task, then polls `GET /api/v1/tasks/{task_id}` until completion
- **Docs:** [DashScope Image Generation](https://help.aliyun.com/zh/model-studio/text-to-image)

### Google Gemini (Nano Banana)

- **API Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Auth:** `?key=<GOOGLE_API_KEY>` query parameter
- **Models:** `gemini-3-pro-image-preview`, `gemini-3.1-flash-image-preview`, `gemini-2.5-flash-image`
- **Response:** Synchronous, returns inline base64 image data in `candidates[0].content.parts`
- **Docs:** [Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)

## Configuration File

API keys and settings are stored in `~/.openclaw-dev/uni-image-config.json`:

```json
{
  "apiKeys": {
    "volcengine": "your-ark-api-key",
    "dashscope": "your-dashscope-key",
    "google": "your-google-api-key"
  }
}
```

## License

[MIT](LICENSE)
