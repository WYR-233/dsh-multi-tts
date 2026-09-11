# dsh-multi-tts

Read assistant replies aloud in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — pick your own TTS provider and voice.

> English | [中文](#中文说明)

A multi-provider text-to-speech plugin for DSH: a 🔊 button next to every assistant reply, an auto-read toggle in the composer, and a settings page where you choose the provider, the voice, the emotion and the speed. No build step — plain ESM + hand-written React.

## Features

- 🔊 **Per-reply read-aloud** — a button on every assistant message; click again to stop.
- 🔇 **Auto-read toggle** — sits in the composer's left slot; new replies are spoken automatically.
- ⚙️ **Multi-provider settings page** — provider dropdown, voice dropdown, manual voice ID, emotion, speed, model, base URL, API key, and a one-click test button.
- 🧹 **TTS-friendly text cleanup** — code blocks, inline code, URLs, file paths, markdown emphasis and list bullets are stripped before speaking.
- 🔑 **Flexible key resolution** — plugin config → environment variable → `$DSH_HOME/.env` → common key names in `.env`.
- 📦 **Zero build** — the client bundle is hand-written `React.createElement` shipped as-is in `lib/`.

## Providers

| Provider | Endpoint | Built-in voices | Emotion |
| --- | --- | --- | --- |
| `minimax` | MiniMax (Hailuo) `/v1/t2a_v2` | 12 Chinese voices (e.g. `female-shaonv`, `qiaopi_mengmei`, `lovely_girl`) | ✅ |
| `openai` | any OpenAI-compatible `/audio/speech` | 6 voices (`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`) | — |

Any OpenAI-compatible endpoint works through the `openai` provider — just set the base URL (OpenAI, DashScope, SiliconFlow, local servers, …).

## Install

```bash
dsh plugin --profile web add dsh-multi-tts
```

Then add the package to the profile's bundle list (`dsh plugin add` only writes the dependency — `dsh.profile.bundles` is what actually mounts the plugin):

```json
{
  "dsh": {
    "profile": {
      "bundles": ["dsh-multi-tts"]
    }
  }
}
```

Restart DSH, then open **Settings → Multi TTS / 语音朗读**.

## Configure

1. Open the plugin's settings section.
2. Pick a provider, then a voice (or paste any voice ID).
3. Paste an API key, or put one in `$DSH_HOME/.env`:

```dotenv
MINIMAX_API_KEY=sk-...
OPENAI_API_KEY=sk-...
```

4. Click **🔊 测试朗读 / Test** to verify. The key status label shows `(from env/.env)` when the key comes from the environment.

Config is stored in `$DSH_HOME/multi-tts/config.json` (override the directory with the `stateDir` option).

## Routes

The host half registers four routes on the DSH web server:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/multi-tts/synthesize` | `{ text, voice?, provider?, speed? }` → audio bytes (char count in `x-tts-chars`) |
| `GET` | `/multi-tts/status` | active provider / voice / key presence |
| `GET` `POST` | `/multi-tts/config` | read / patch the stored config |
| `GET` | `/multi-tts/voices` | voice list of the active provider |

## Notes

- Peer dependency: `@deepseek-ai/cordis ^4.0.1`, provided by the DSH host.
- Text is capped at 4000 characters per request.
- Requires Node.js ≥ 22 (uses the global `fetch`).

## License

MIT

---

## 中文说明

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 里把助手的回复念出来——服务商与音色都由你自己挑。

DSH 的多服务商语音朗读插件：每条回复旁有 🔊 朗读按钮，输入框有自动朗读开关，设置页里可选服务商、音色、情绪与语速。零构建，纯 ESM + 手写 React。

### 功能

- 🔊 **每条回复旁朗读**——点一下开口，再点一下停止。
- 🔇 **自动朗读开关**——输入框左侧，新回复自动念。
- ⚙️ **多服务商设置页**——服务商下拉、音色下拉、手填音色 ID、情绪、语速、模型、Base URL、API Key，外加一键测试朗读。
- 🧹 **朗读前文本清洗**——代码块、行内代码、网址、文件路径、Markdown 强调与列表符号都不会念出来。
- 🔑 **Key 多路兜底**——插件配置 → 环境变量 → `$DSH_HOME/.env` → `.env` 常见键名。
- 📦 **零构建**——client 端是手写 `React.createElement`，直接以 `lib/` 里的源文件形式分发。

### 服务商

| 服务商 | 接口 | 内置音色 | 情绪 |
| --- | --- | --- | --- |
| `minimax` | MiniMax(海螺)`/v1/t2a_v2` | 12 个中文音色(`female-shaonv` 少女音、`qiaopi_mengmei` 俏皮萌妹、`lovely_girl` 萌萌女童……) | ✅ |
| `openai` | 任意 OpenAI 兼容 `/audio/speech` | 6 个音色(`alloy`、`echo`、`fable`、`onyx`、`nova`、`shimmer`) | — |

凡是 OpenAI 兼容的语音端点都能用 `openai` 这条通道接进来——改 Base URL 即可(OpenAI、DashScope、SiliconFlow、本地服务……)。

### 安装

```bash
dsh plugin --profile web add dsh-multi-tts
```

再把包名加进 profile 的 bundles 清单(`dsh plugin add` 只写依赖,**bundles 才是挂载清单**):

```json
{
  "dsh": {
    "profile": {
      "bundles": ["dsh-multi-tts"]
    }
  }
}
```

重启 DSH,打开**设置 → 语音朗读**。

### 配置

1. 打开插件设置页;
2. 选服务商、再选音色(也可直接手填音色 ID);
3. 粘贴 API Key,或写进 `$DSH_HOME/.env`:

```dotenv
MINIMAX_API_KEY=sk-...
OPENAI_API_KEY=sk-...
```

4. 点 **🔊 测试朗读** 验证。Key 来自环境变量时,状态会显示「(来自环境/.env)」。

配置存在 `$DSH_HOME/multi-tts/config.json`(可用 `stateDir` 选项改目录)。

### 路由

host 端在 DSH web 服务器上挂 4 条路由:

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/multi-tts/synthesize` | `{ text, voice?, provider?, speed? }` → 音频字节(字符数在 `x-tts-chars`) |
| `GET` | `/multi-tts/status` | 当前服务商 / 音色 / 是否已配 Key |
| `GET` `POST` | `/multi-tts/config` | 读 / 改配置 |
| `GET` | `/multi-tts/voices` | 当前服务商的音色表 |

### 说明

- peer 依赖:`@deepseek-ai/cordis ^4.0.1`,由 DSH 本体提供。
- 单次合成文本上限 4000 字符。
- 需要 Node.js ≥ 22(用到全局 `fetch`)。

### 许可

MIT
