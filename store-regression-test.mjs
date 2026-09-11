// dsh-multi-tts 配置存储回归测试（防清空 / 自愈 / 原子写）
// 用法：先把本文件的断言段拼到 lib/index.js 尾部（同时把 `export { Config }` 改成
// `export { Config, makeStore }`），存成 profiles/web/__t.mjs 再跑，见下方注释中的命令。
// 2026-09-11 结果：16 项断言全绿（见 memory\工作\项目统筹\2026-09-11_片①-记忆库skill化-memory-hygiene.md）
//
// 拼接命令（PowerShell，注意必须 -Encoding UTF8，否则中文注释会变乱码导致语法错误）：
//   $lines = Get-Content lib/index.js -Encoding UTF8
//   $n = 找到 'export { Config }' 的行号；替换为 'export { Config, makeStore }'
//   ($lines[0..$n] + (本文件断言段)) -join "`r`n" | Set-Content profiles/web/__t.mjs -Encoding UTF8
//   $env:TEST_HOME = 临时目录; node __t.mjs   # 必须在 profiles/web 下跑，才能解析 @deepseek-ai/schemastery

const D = { stateDir: join(process.env.TEST_HOME, "multi-tts") }
const F = join(D.stateDir, "config.json")
const B = F + ".bak"
let pass = 0, fail = 0
const ck = (x, c) => { console.log((c ? "PASS " : "FAIL ") + x); c ? pass++ : fail++ }
const rd = (p) => JSON.parse(readFileSync(p, "utf8"))

let st1 = makeStore(D)
ck("A1 load missing -> empty", Object.keys(st1.load()).length === 0)
st1.save({ provider: "minimax", voice: "female-shaonv", apiKey: "KEY-1" })
ck("A2 save persists", rd(F).apiKey === "KEY-1")
ck("A3 no tmp left", !existsSync(F + ".tmp"))
ck("A4 no bak on first create", !existsSync(B))
st1.save({ voice: "female-tianmei" })
ck("A5 merge keeps apiKey", rd(F).apiKey === "KEY-1")
ck("A6 first-change backup taken", existsSync(B))
ck("A7 bak = snapshot before first change", rd(B).voice === "female-shaonv")
st1.save({ speed: 1.2 })
ck("A8 bak not overwritten", rd(B).speed === undefined)
ck("A9 live file has newest", rd(F).voice === "female-tianmei" && rd(F).speed === 1.2)

writeFileSync(F, "{} broken json !!")
const st2 = makeStore(D)
ck("B1 corrupt file kept as evidence", existsSync(B))
const rl = st2.load()
ck("B2 recovered apiKey", rl.apiKey === "KEY-1")
ck("B3 recovered provider", rl.provider === "minimax")
ck("B4 recovered voice from bak", rl.voice === "female-shaonv")
st2.save({ voice: "recovered" })
ck("B5 save builds on recovered base", rd(F).apiKey === "KEY-1" && rd(F).voice === "recovered" && rd(F).provider === "minimax")

const st3 = makeStore(D)
ck("C1 fresh instance reads back", st3.load().voice === "recovered")
ck("C2 provider never lost", st3.load().provider === "minimax")

console.log("RESULT pass=" + pass + " fail=" + fail)
process.exit(fail === 0 ? 0 : 1)
