// dsh-multi-tts — 语音朗读插件(多服务商:MiniMax / OpenAI 兼容)
// host 端:注册 HTTP 路由给 client 调用;配置存储在 $DSH_HOME/multi-tts/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import s from '@deepseek-ai/schemastery'

const NS = 'multi-tts'

// ---------- 服务商表 ----------
const PROVIDERS = {
  minimax: {
    label: 'MiniMax(海螺)',
    env: 'MINIMAX_API_KEY',
    defaultVoice: 'female-shaonv',
    supportEmotion: true,
    voices: [
      { id: 'female-shaonv', label: '少女音色' },
      { id: 'female-tianmei', label: '甜美女性音色' },
      { id: 'qiaopi_mengmei', label: '俏皮萌妹' },
      { id: 'diadia_xuemei', label: '嗲嗲学妹' },
      { id: 'female-yujie', label: '御姐音色' },
      { id: 'female-chengshu', label: '成熟女性音色' },
      { id: 'lovely_girl', label: '萌萌女童' },
      { id: 'cute_boy', label: '可爱男童' },
      { id: 'clever_boy', label: '聪明男童' },
      { id: 'male-qn-qingse', label: '青涩青年音色' },
      { id: 'male-qn-jingying', label: '精英青年音色' },
      { id: 'male-qn-badao', label: '霸道青年音色' },
    ],
  },
  openai: {
    label: 'OpenAI 兼容 TTS',
    env: 'OPENAI_API_KEY',
    defaultVoice: 'alloy',
    defaultBaseUrl: 'https://api.openai.com/v1',
    supportEmotion: false,
    voices: [
      { id: 'alloy', label: 'alloy' },
      { id: 'echo', label: 'echo' },
      { id: 'fable', label: 'fable' },
      { id: 'onyx', label: 'onyx' },
      { id: 'nova', label: 'nova' },
      { id: 'shimmer', label: 'shimmer' },
    ],
  },
}

const Config = s.object({
  provider: s.string().default('minimax'),
  voice: s.string().default(''),
  model: s.string().default(''),
  emotion: s.string().default('happy'),
  speed: s.number().default(1),
  baseUrl: s.string().default(''),
  apiKey: s.string().default(''),
  apiKeyEnv: s.string().default(''),
  stateDir: s.string().default(''),
})

const MAX_TEXT = 4000

// ---------- 辅助 ----------
function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

function readJson(raw) {
  try { return JSON.parse(raw.toString('utf8') || '{}') } catch { return null }
}

function readDotenvKey(file, key) {
  try {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (t === '' || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq <= 0) continue
      if (t.slice(0, eq).trim() === key) return t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* missing file is fine */ }
  return ''
}

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')

// ---------- 配置存储 ----------
function makeStore(config) {
  const dir = (config.stateDir ?? '').trim() || join(HOME, NS)
  const file = join(dir, 'config.json')
  let cache = null
  const load = () => {
    if (cache !== null) return cache
    try { cache = JSON.parse(readFileSync(file, 'utf8')) } catch { cache = {} }
    return cache
  }
  const save = (patch) => {
    const next = { ...load(), ...patch }
    cache = next
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(file, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 })
    } catch { /* best effort */ }
    return next
  }
  const effective = () => {
    const saved = load()
    const provider = (saved.provider ?? config.provider ?? 'minimax')
    const p = PROVIDERS[provider] ?? PROVIDERS.minimax
    return {
      provider,
      voice: (saved.voice ?? '').trim() || p.defaultVoice,
      model: (saved.model ?? '').trim(),
      emotion: (saved.emotion ?? config.emotion ?? 'happy'),
      speed: Number(saved.speed ?? config.speed ?? 1) || 1,
      baseUrl: (saved.baseUrl ?? '').trim() || p.defaultBaseUrl || '',
      autoRead: saved.autoRead === true,
    }
  }
  const apiKey = () => {
    const saved = load()
    const direct = (saved.apiKey ?? config.apiKey ?? '').trim()
    if (direct !== '') return direct
    const eff = effective()
    const envName = (saved.apiKeyEnv ?? config.apiKeyEnv ?? '').trim() || (PROVIDERS[eff.provider]?.env ?? '')
    if (envName && (process.env[envName] ?? '').trim() !== '') return process.env[envName].trim()
    const dotenv = join(HOME, '.env')
    if (envName) {
      const fromHome = readDotenvKey(dotenv, envName)
      if (fromHome !== '') return fromHome
    }
    // 兜底:直接扫 .env 里的常见 key 名
    for (const cand of ['MINIMAX_API_KEY', 'OPENAI_API_KEY']) {
      const v = readDotenvKey(dotenv, cand)
      if (v !== '') return v
    }
    return ''
  }
  return { load, save, effective, apiKey, dir }
}

// ---------- 服务商调用 ----------
async function synthMinimax(text, eff, key) {
  const body = {
    model: eff.model || 'speech-2.8-hd',
    text,
    stream: false,
    voice_setting: { voice_id: eff.voice, speed: eff.speed, vol: 1, pitch: 0, emotion: eff.emotion || 'happy' },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
  }
  const r = await fetch('https://api.minimax.cn/v1/t2a_v2', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })
  const j = await r.json().catch(() => null)
  if (!j) throw new Error('minimax: invalid response')
  const code = j?.base_resp?.status_code
  if (code !== 0) throw new Error(`minimax ${code}: ${j?.base_resp?.status_msg ?? 'error'}`)
  const hex = j?.data?.audio
  if (typeof hex !== 'string' || hex === '') throw new Error('minimax: empty audio')
  return { audio: Buffer.from(hex, 'hex'), mime: 'audio/mpeg', chars: j?.extra_info?.usage_characters ?? text.length }
}

async function synthOpenai(text, eff, key) {
  const base = (eff.baseUrl || PROVIDERS.openai.defaultBaseUrl).replace(/\/$/, '')
  const body = { model: eff.model || 'tts-1', input: text, voice: eff.voice || 'alloy', speed: eff.speed }
  const r = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })
  if (!r.ok) throw new Error(`openai-tts ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`)
  const audio = Buffer.from(await r.arrayBuffer())
  return { audio, mime: r.headers.get('content-type') || 'audio/mpeg', chars: text.length }
}

async function synthesize(text, eff, key) {
  if (eff.provider === 'openai') return await synthOpenai(text, eff, key)
  return await synthMinimax(text, eff, key)
}

// ---------- 插件主体 ----------
export const name = 'multi-tts'
export { Config }

export function apply(ctx, config) {
  const store = makeStore(config)
  let mounted = false

  const mount = () => {
    const web = ctx.get('webServer')
    if (web === undefined || mounted) return
    mounted = true

    // 合成音频
    ctx.effect(() => web.register({
      kind: 'exact',
      path: `/${NS}/synthesize`,
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
        const raw = await readBody(req)
        const body = readJson(raw)
        if (!body) return sendJson(res, 400, { ok: false, error: 'bad-json' })
        const text = typeof body.text === 'string' ? body.text.trim() : ''
        if (text === '') return sendJson(res, 400, { ok: false, error: 'text-required' })
        if (text.length > MAX_TEXT) return sendJson(res, 413, { ok: false, error: 'text-too-large' })
        const eff = store.effective()
        if (typeof body.voice === 'string' && body.voice.trim() !== '') eff.voice = body.voice.trim()
        if (typeof body.provider === 'string' && PROVIDERS[body.provider]) eff.provider = body.provider
        if (body.speed !== undefined) eff.speed = Number(body.speed) || 1
        const key = store.apiKey()
        if (key === '') return sendJson(res, 400, { ok: false, error: 'api-key-missing', message: `未配置 ${eff.provider} 的 API Key` })
        try {
          const out = await synthesize(text, eff, key)
          res.writeHead(200, {
            'content-type': out.mime,
            'content-length': out.audio.length,
            'x-tts-chars': String(out.chars),
            'cache-control': 'no-store',
          })
          res.end(out.audio)
        } catch (error) {
          sendJson(res, 502, { ok: false, error: 'synth-failed', message: String(error?.message ?? error) })
        }
      },
    }), `${NS}: synthesize route`)

    // 状态
    ctx.effect(() => web.register({
      kind: 'exact',
      path: `/${NS}/status`,
      handler: (req, res) => {
        const eff = store.effective()
        sendJson(res, 200, { ok: true, provider: eff.provider, voice: eff.voice, hasKey: store.apiKey() !== '', providers: Object.keys(PROVIDERS) })
      },
    }), `${NS}: status route`)

    // 配置读写
    ctx.effect(() => web.register({
      kind: 'exact',
      path: `/${NS}/config`,
      handler: async (req, res) => {
        if (req.method === 'GET') {
          const saved = store.load()
          const eff = store.effective()
          return sendJson(res, 200, {
            ok: true,
            config: {
              provider: eff.provider,
              voice: eff.voice,
              model: eff.model,
              emotion: eff.emotion,
              speed: eff.speed,
              baseUrl: eff.baseUrl,
              autoRead: eff.autoRead,
              hasKey: store.apiKey() !== '',
              keyFromEnv: (saved.apiKey ?? '') === '',
            },
            providers: Object.entries(PROVIDERS).map(([id, p]) => ({
              id, label: p.label, voices: p.voices, defaultVoice: p.defaultVoice,
              defaultBaseUrl: p.defaultBaseUrl ?? '', env: p.env, supportEmotion: p.supportEmotion,
            })),
          })
        }
        if (req.method === 'POST') {
          const body = readJson(await readBody(req))
          if (!body) return sendJson(res, 400, { ok: false, error: 'bad-json' })
          const patch = {}
          for (const k of ['provider', 'voice', 'model', 'emotion', 'speed', 'baseUrl', 'apiKey', 'apiKeyEnv', 'autoRead']) {
            if (body[k] !== undefined) patch[k] = body[k]
          }
          store.save(patch)
          return sendJson(res, 200, { ok: true })
        }
        sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
      },
    }), `${NS}: config route`)

    // 音色列表
    ctx.effect(() => web.register({
      kind: 'exact',
      path: `/${NS}/voices`,
      handler: (req, res) => {
        const eff = store.effective()
        const p = PROVIDERS[eff.provider] ?? PROVIDERS.minimax
        sendJson(res, 200, { ok: true, provider: eff.provider, voices: p.voices, defaultVoice: p.defaultVoice })
      },
    }), `${NS}: voices route`)

    ctx.logger?.info?.(`[${NS}] routes mounted (/synthesize /status /config /voices)`)
  }

  if (ctx.get('webServer') !== undefined) mount()
  else ctx.on('internal/service', (service) => { if (service === 'webServer') mount() })
}
