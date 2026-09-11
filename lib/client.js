// dsh-multi-tts — client 端:消息旁朗读按钮 + 自动朗读开关 + 设置页(服务商/音色自选)
window.__ModuleLoader__.load({ id: "dsh-multi-tts", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const React = require("react");
const h = React.createElement;
const NS = "multi-tts";
const API = "/multi-tts";

// ---------------- 文本清洗:代码块/链接/路径不念 ----------------
function cleanForTts(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " 代码块 ")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/[^\s<>")]+/g, " 链接 ")
    .replace(/[A-Za-z]:\\[^\s<>")]+/g, " 路径 ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*---+\s*$/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/(\*\*|__|~~|\*|_)(?=\S)([\s\S]*?)(?<=\S)\1/g, "$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ---------------- 播放器 ----------------
function createPlayer() {
  let audio = null;
  let currentText = "";
  let playing = false;
  const subs = new Set();
  const notify = () => { for (const fn of [...subs]) { try { fn(); } catch (_) {} } };
  return {
    get playing() { return playing; },
    playingFor: (t) => playing && currentText === t,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    stop() {
      if (audio) { try { audio.pause(); } catch (_) {} audio = null; }
      playing = false; currentText = ""; notify();
    },
    async play(text, opts) {
      const body = { text: cleanForTts(text) };
      if (opts && opts.voice) body.voice = opts.voice;
      if (!body.text) return;
      this.stop();
      const r = await fetch(API + "/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        let msg = "HTTP " + r.status;
        try { const j = await r.json(); msg = j.message || j.error || msg; } catch (_) {}
        const e = new Error(msg); e.code = "synth-failed"; throw e;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      audio = new Audio(url);
      currentText = text;
      playing = true;
      notify();
      audio.onended = () => { playing = false; URL.revokeObjectURL(url); notify(); };
      audio.onerror = () => { playing = false; notify(); };
      await audio.play();
    },
  };
}

// ---------------- 会话节点选择器 ----------------
function selectText(snapshot, messageId) {
  for (const node of snapshot.nodes) {
    if (node.kind !== "assistant" || node.messageId !== messageId) continue;
    return (node.blocks ?? [])
      .filter((b) => b.kind === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}
function selectIsLatest(snapshot, messageId) {
  let latest = null;
  for (const node of snapshot.nodes) {
    if (node.kind !== "assistant" || node.messageId === undefined) continue;
    const o = { turn: node.turn ?? 0, step: node.step ?? 0, seq: node.seq ?? 0 };
    if (latest === null || o.turn > latest.turn ||
        (o.turn === latest.turn && o.step > latest.step) ||
        (o.turn === latest.turn && o.step === latest.step && o.seq > latest.seq)) {
      latest = { ...o, messageId: node.messageId };
    }
  }
  return latest !== null && latest.messageId === messageId;
}
function selectTime(snapshot, messageId) {
  for (const node of snapshot.nodes) {
    if (node.kind === "assistant" && node.messageId === messageId) return node.time ?? 0;
  }
  return 0;
}

// ---------------- 消息旁朗读按钮 ----------------
function Actions(props) {
  const { messageId, useChat, play, stop, playingFor, subscribe, autoReadOn, played, loadTime } = props;
  const text = useChat((s) => selectText({ nodes: s.legacy.nodes }, messageId));
  const isLatest = useChat((s) => selectIsLatest({ nodes: s.legacy.nodes }, messageId));
  const time = useChat((s) => selectTime({ nodes: s.legacy.nodes }, messageId));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [, force] = React.useState(0);
  const alive = React.useRef(true);

  React.useEffect(() => () => { alive.current = false; }, []);
  React.useEffect(() => subscribe(() => { if (alive.current) force((n) => n + 1); }), [subscribe]);
  React.useEffect(() => {
    if (!autoReadOn()) return;
    if (!isLatest || !text.trim() || time <= loadTime) return;
    if (played.has(messageId)) return;
    played.add(messageId);
    play(text).catch(() => played.delete(messageId));
  }, [isLatest, text, time, messageId, play, autoReadOn, loadTime, played]);

  if (!text.trim()) return null;
  const isPlaying = playingFor(text);
  const onClick = () => {
    if (isPlaying || busy) {
      stop(); setBusy(false); setErr(""); return;
    }
    setBusy(true); setErr("");
    play(text).then(() => { if (alive.current) setBusy(false); },
      (e) => { if (alive.current) { setBusy(false); setErr(e.message || "失败"); } });
  };
  return h("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 } },
    h("button", {
      type: "button",
      onClick,
      title: isPlaying ? "停止朗读" : (err || "朗读这条回复"),
      "data-active": isPlaying || undefined,
      style: {
        background: "transparent", border: "none", cursor: "pointer",
        fontSize: 14, lineHeight: 1, padding: "2px 4px", borderRadius: 6,
        color: isPlaying ? "var(--dsw-alias-brand-primary, #0ea5e9)" : "inherit",
        opacity: busy ? 0.5 : 0.75,
      },
    }, isPlaying ? "⏹" : "🔊"),
    err ? h("span", { style: { fontSize: 11, color: "#f87171" } }, err) : null,
  );
}

// ---------------- 输入框左侧:自动朗读开关 ----------------
function InputToggle(props) {
  const { get, set, subscribe } = props;
  const [, force] = React.useState(0);
  React.useEffect(() => subscribe(() => force((n) => n + 1)), [subscribe]);
  const on = get();
  return h("button", {
    type: "button",
    title: on ? "自动朗读:开(新回复自动念)" : "自动朗读:关",
    onClick: () => set(!on),
    style: {
      background: "transparent", border: "none", cursor: "pointer",
      fontSize: 15, padding: "2px 6px", borderRadius: 6, opacity: on ? 1 : 0.5,
      color: on ? "var(--dsw-alias-brand-primary, #0ea5e9)" : "inherit",
    },
  }, on ? "🔊" : "🔇");
}

// ---------------- 设置页 ----------------
function SettingsSection(props) {
  const { api } = props;
  const [cfg, setCfg] = React.useState(null);
  const [providers, setProviders] = React.useState([]);
  const [status, setStatus] = React.useState("");
  const [keyInput, setKeyInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    fetch(api + "/config").then((r) => r.json()).then((j) => {
      if (j && j.ok) { setCfg(j.config); setProviders(j.providers || []); }
    }).catch(() => {});
  }, [api]);
  React.useEffect(() => { load(); }, [load]);

  const save = (patch) => {
    setCfg((c) => ({ ...c, ...patch }));
    fetch(api + "/config", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(() => load()).catch(() => setStatus("保存失败"));
  };
  const test = () => {
    setBusy(true); setStatus("合成中…");
    fetch(api + "/synthesize", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "你好，这是一段语音合成测试，如果听到这段声音，说明朗读功能已经正常工作了。" }),
    }).then(async (r) => {
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || j.error || ("HTTP " + r.status)); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
      setStatus("✅ 播放中");
    }).catch((e) => setStatus("❌ " + (e.message || e))).finally(() => setBusy(false));
  };

  const row = { display: "flex", gap: 8, alignItems: "center", margin: "10px 0", flexWrap: "wrap" };
  const label = { minWidth: 78, fontSize: 13, opacity: 0.75 };
  const input = {
    background: "var(--dsw-alias-bg-layer-1, #0f2438)", color: "inherit",
    border: "1px solid var(--dsw-alias-border, #1e4976)", borderRadius: 8,
    padding: "6px 10px", fontSize: 13, minWidth: 160,
  };
  const btn = {
    background: "var(--dsw-alias-brand-primary, #0ea5e9)", color: "#03212f", fontWeight: 600,
    border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 13,
  };

  if (!cfg) return h("div", { style: { fontSize: 13, opacity: 0.7 } }, "加载中…");
  const cur = providers.find((p) => p.id === cfg.provider) || providers[0] || { voices: [] };

  return h("div", { style: { fontSize: 13 } },
    h("div", { style: { fontSize: 12, opacity: 0.6, marginBottom: 6 } },
      "语音朗读 — 每条回复旁的 🔊 按钮与自动朗读都使用这里的配置"),
    h("div", { style: row },
      h("span", { style: label }, "服务商"),
      h("select", {
        style: input, value: cfg.provider,
        onChange: (e) => {
          const p = providers.find((x) => x.id === e.target.value);
          save({ provider: e.target.value, voice: p ? p.defaultVoice : "", baseUrl: p ? (p.defaultBaseUrl || "") : "" });
        },
      }, providers.map((p) => h("option", { key: p.id, value: p.id }, p.label))),
    ),
    h("div", { style: row },
      h("span", { style: label }, "音色"),
      h("select", {
        style: input, value: cfg.voice,
        onChange: (e) => save({ voice: e.target.value }),
      },
        cur.voices.some((v) => v.id === cfg.voice) ? null : h("option", { value: cfg.voice }, cfg.voice || "(未选)"),
        cur.voices.map((v) => h("option", { key: v.id, value: v.id }, v.id + " — " + v.label)),
      ),
      h("input", {
        style: { ...input, minWidth: 200 }, placeholder: "或手动填音色 ID",
        onKeyDown: (e) => { if (e.key === "Enter") save({ voice: e.target.value.trim() }); },
      }),
    ),
    h("div", { style: row },
      h("span", { style: label }, "情绪/语速"),
      h("select", { style: input, value: cfg.emotion, onChange: (e) => save({ emotion: e.target.value }) },
        ["happy", "neutral", "sad", "angry", "fearful", "disgusted", "surprised"].map((x) => h("option", { key: x, value: x }, x))),
      h("input", {
        type: "number", step: "0.1", min: "0.5", max: "2", style: { ...input, minWidth: 80 }, value: cfg.speed,
        onChange: (e) => save({ speed: Number(e.target.value) || 1 }),
      }),
    ),
    h("div", { style: row },
      h("span", { style: label }, "模型"),
      h("input", { style: input, defaultValue: cfg.model, placeholder: "留空=默认(speech-2.8-hd / tts-1)",
        onBlur: (e) => save({ model: e.target.value.trim() }) }),
      cfg.provider === "openai"
        ? h("input", { style: { ...input, minWidth: 240 }, defaultValue: cfg.baseUrl, placeholder: "Base URL(如 https://api.openai.com/v1)",
            onBlur: (e) => save({ baseUrl: e.target.value.trim() }) })
        : null,
    ),
    h("div", { style: row },
      h("span", { style: label }, "API Key"),
      h("input", { type: "password", style: { ...input, minWidth: 260 }, placeholder: cfg.hasKey ? "已配置(留空=不改)" : "粘贴 API Key",
        value: keyInput, onChange: (e) => setKeyInput(e.target.value) }),
      h("button", { style: btn, onClick: () => { if (keyInput.trim()) { save({ apiKey: keyInput.trim() }); setKeyInput(""); setStatus("已保存 Key"); } } }, "保存 Key"),
      h("span", { style: { fontSize: 11, opacity: 0.6 } },
        cfg.hasKey ? (cfg.keyFromEnv ? "(来自环境/.env)" : "(已存本地)") : "(未配置)"),
    ),
    h("div", { style: row },
      h("button", { style: btn, disabled: busy, onClick: test }, busy ? "合成中…" : "🔊 测试朗读"),
      h("span", { style: { marginLeft: 4 } }, status),
    ),
    h("div", { style: { fontSize: 11, opacity: 0.55, marginTop: 8, lineHeight: 1.7 } },
      "MiniMax 音色 ID 例:female-shaonv(少女)、qiaopi_mengmei(俏皮萌妹)、lovely_girl(萌萌女童)。",
      h("br"),
      "OpenAI 兼容模式走 /audio/speech,可接任意兼容端点。Key 也可放 $DSH_HOME/.env:"),
    h("div", { style: { fontSize: 11, opacity: 0.5, fontFamily: "monospace", marginTop: 2 } },
      "MINIMAX_API_KEY=sk-...  /  OPENAI_API_KEY=sk-..."),
  );
}

// ---------------- 插件入口 ----------------
const inject = ["slots", "locale"];
function apply(ctx) {
  const player = createPlayer();
  const played = new Set();
  const loadTime = Date.now();
  let autoRead = false;
  const autoSubs = new Set();
  const notifyAuto = () => { for (const fn of [...autoSubs]) { try { fn(); } catch (_) {} } };

  fetch(API + "/config").then((r) => r.json()).then((j) => {
    if (j && j.ok && j.config) { autoRead = j.config.autoRead === true; notifyAuto(); }
  }).catch(() => {});

  ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
    name: "conversation.chat.assistant-actions",
    id: NS, order: 25, locale: NS,
    inject: () => ({
      play: (t) => player.play(t),
      stop: () => player.stop(),
      playingFor: (t) => player.playingFor(t),
      subscribe: (fn) => player.subscribe(fn),
      autoReadOn: () => autoRead,
      played, loadTime,
    }),
  }, Actions));

  ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
    name: "conversation.input.left",
    id: NS, order: 35, locale: NS,
    inject: () => ({
      get: () => autoRead,
      subscribe: (fn) => { autoSubs.add(fn); return () => autoSubs.delete(fn); },
      set: (v) => {
        autoRead = v; notifyAuto();
        fetch(API + "/config", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ autoRead: v }),
        }).catch(() => {});
      },
    }),
  }, InputToggle));

  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: NS, order: 55, locale: NS,
    label: () => "语音朗读",
    inject: () => ({ api: API }),
  }, SettingsSection));
}

exports.inject = inject;
exports.apply = apply;
return module.exports; } });
