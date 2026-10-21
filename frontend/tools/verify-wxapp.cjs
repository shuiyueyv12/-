// ============================================================
// tools/verify-wxapp.cjs —— 小程序工程静态一致性校验
// 检查：
//   1) app.json pages / tabBar icon 文件是否存在
//   2) WXML 中事件处理器是否在对应 .js 中定义
//   3) WXML 中静态 <icon name> 是否存在于 icons-data.js
//   4) 自定义组件标签是否在页面 json usingComponents 注册且文件存在
// 运行：node tools/verify-wxapp.cjs
// ============================================================

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const errors = []
const warn = (msg) => errors.push(msg)

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

// ---- 1. app.json ----
const app = JSON.parse(read(path.join(ROOT, 'app.json')))
app.pages.forEach((pagePath) => {
  ;['.js', '.json', '.wxml', '.wxss'].forEach((ext) => {
    if (!fs.existsSync(path.join(ROOT, pagePath + ext))) {
      warn(`缺少页面文件: ${pagePath}${ext}`)
    }
  })
})
if (app.tabBar && app.tabBar.list) {
  app.tabBar.list.forEach((t) => {
    ;[t.iconPath, t.selectedIconPath].forEach((p) => {
      if (!p) return
      if (!fs.existsSync(path.join(ROOT, p))) warn(`tabBar 图标缺失: ${p}`)
    })
  })
}

const iconsDataPath = path.join(ROOT, 'components', 'icon', 'icons-data.js')
const iconsData = fs.existsSync(iconsDataPath)
  ? Object.keys(require(iconsDataPath))
  : []
if (!fs.existsSync(iconsDataPath)) warn('icons-data.js 未生成，请先运行 build-icons.mjs')

// ---- 2/3/4. 逐目录扫描 ----
function scanDir(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f)
    const st = fs.statSync(full)
    if (st.isDirectory()) {
      scanDir(full)
      continue
    }
    if (!f.endsWith('.wxml')) continue
    const rel = path.relative(ROOT, full).replace(/\\/g, '/')
    const base = full.slice(0, -5) // 去掉 .wxml
    const jsFile = base + '.js'
    const jsonFile = base + '.json'
    const js = read(jsFile) || ''
    const json = JSON.parse(read(jsonFile) || '{}')
    const wxml = read(full)

    // 事件处理器
    const handlers = []
    const re = /\b(?:bind|catch)[a-z-]*="([A-Za-z_$][\w$]*)"/g
    let m
    while ((m = re.exec(wxml))) handlers.push(m[1])
    handlers.forEach((h) => {
      if (h.startsWith('{{')) return
      if (!js.includes(`${h}(`)) {
        warn(`[${rel}] 事件处理器 ${h} 未在 ${path.basename(jsFile)} 定义`)
      }
    })

    // 自定义组件标签 vs json 注册
    const comps = {}
    const cre = /<([a-z][a-z0-9-]*)(\s|\/|>)/g
    while ((m = cre.exec(wxml))) {
      const tag = m[1]
      if (tag === 'view' || tag === 'text' || tag === 'image' || tag === 'icon' ||
          tag === 'input' || tag === 'swiper' || tag === 'swiper-item' ||
          tag === 'scroll-view' || tag === 'block' || tag === 'button' || tag === 'header' || tag === 'section') {
        continue
      }
      comps[tag] = true
    }
    const regs = (json.usingComponents || {})
    Object.keys(comps).forEach((tag) => {
      if (tag === 'qty-stepper' || tag === 'product-card') {
        const alias = regs[tag]
        if (!alias) {
          warn(`[${rel}] 组件 <${tag}> 未在 json usingComponents 注册`)
          return
        }
        const compPath = alias.replace(/^\//, '')
        const p = path.join(ROOT, compPath)
        if (!fs.existsSync(p + '.js')) warn(`[${rel}] 组件路径不存在: ${alias}`)
      } else {
        warn(`[${rel}] 未知标签 <${tag}>（疑似组件未注册）`)
      }
    })

    // 静态 icon name
    const ire = /<(?:icon)\b[^>]*\bname="([a-z0-9-]+)"/g
    while ((m = ire.exec(wxml))) {
      if (!iconsData.includes(m[1])) {
        warn(`[${rel}] icon "${m[1]}" 不在 icons-data.js（重新运行 build-icons.mjs）`)
      }
    }
  }
}

scanDir(path.join(ROOT, 'pages'))
scanDir(path.join(ROOT, 'components'))

if (errors.length) {
  console.log('verify: FAIL (' + errors.length + ' issue(s))')
  errors.forEach((e) => console.log('  - ' + e))
  process.exit(1)
}
console.log('verify-wxapp: ALL PASS OK')
