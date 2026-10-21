// ============================================================
// tools/build-icons.mjs —— 图标构建脚本（Node，零第三方依赖）
//
// 功能：
//  1) 从已安装的 lucide-react 中抽取本项目用到的图标 shape 数据，
//     输出 CommonJS 数据文件：wxapp/components/icon/icons-data.js
//  2) 用抗锯齿「线段距离场」光栅化 4 个 tab 图标，并 PNG 编码输出：
//     wxapp/assets/icons/{home,category,cart,profile}[-active].png
//
// 运行：node tools/build-icons.mjs
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LUCIDE_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'node_modules',
  'lucide-react',
  'dist',
  'esm',
  'icons',
)

// ---------- 1. 抽取图标 shape 数据 ----------

// 页面 UI 图标（key 为实际使用名，value 为 lucide 文件名）
const UI_ICONS = [
  'menu', 'search', 'x', 'chevron-left', 'chevron-right', 'arrow-right',
  'smartphone', 'tablet', 'watch', 'headphones',
  'heart', 'shopping-bag', 'layout-grid', 'check', 'trash-2',
  'minus', 'plus', 'credit-card', 'truck', 'refresh-ccw',
  'map-pin', 'life-buoy', 'info', 'log-out', 'user-round', 'package',
  'lock',
]

// tabBar 图标（灰 / 红各一张）
const TAB_ICONS = {
  home: { file: 'home', colors: [['#a3a5aa', 'home.png'], ['#c8102e', 'home-active.png']] },
  category: { file: 'package', colors: [['#a3a5aa', 'category.png'], ['#c8102e', 'category-active.png']] },
  cart: { file: 'shopping-bag', colors: [['#a3a5aa', 'cart.png'], ['#c8102e', 'cart-active.png']] },
  profile: { file: 'user-round', colors: [['#a3a5aa', 'profile.png'], ['#c8102e', 'profile-active.png']] },
}

async function loadIconData(name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`icon cycle: ${name}`)
  seen.add(name)
  const file = path.join(LUCIDE_DIR, `${name}.mjs`)
  const src = fs.readFileSync(file, 'utf8')
  // 部分图标是 re-export 包装（如 home -> house），跟随真实来源
  const wrapper = src.match(/from\s+['"]\.\/([a-z0-9-]+)\.mjs['"]/)
  if (wrapper && !src.includes('__iconData')) {
    return loadIconData(wrapper[1], seen)
  }
  // 直接以 ESM 加载模块，读取其导出的 __iconData（避免脆弱文本解析）
  const url = pathToFileURL(file).href
  const mod = await import(url)
  const data = mod.__iconData
  if (!data || !Array.isArray(data.node)) throw new Error(`bad icon data: ${name}`)
  return data.node
}

async function collectIcons() {
  const map = {}
  for (const name of UI_ICONS) {
    map[name] = await loadIconData(name)
  }
  return map
}

// ---------- 2. SVG path -> 折线采样 ----------

const TWO_PI = Math.PI * 2

function parsePath(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
  const polylines = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let i = 0
  let curCmd = ''

  const num = () => {
    const v = parseFloat(tokens[i])
    i += 1
    return v
  }

  while (i < tokens.length) {
    let cmd = tokens[i]
    if (/^[a-zA-Z]$/.test(cmd)) {
      curCmd = cmd
      i += 1
    } else {
      cmd = curCmd
    }
    const up = cmd.toUpperCase()
    const isRel = cmd !== up

    if (up === 'M' || up === 'L') {
      const nx = num()
      const ny = num()
      let x = nx
      let y = ny
      if (up === 'M') {
        if (isRel) { x = nx + cx; y = ny + cy }
        sx = x; sy = y
        polylines.push([[x, y]])
        cx = x; cy = y
      } else {
        if (isRel) { x = nx + cx; y = ny + cy }
        cx = x; cy = y
        polylines[polylines.length - 1].push([x, y])
      }
      // M 后跟多组坐标按隐式 L 处理
      while (i < tokens.length && /^-?\d/.test(tokens[i])) {
        const px = num(); const py = num()
        const ax = isRel ? px + cx : px
        const ay = isRel ? py + cy : py
        polylines[polylines.length - 1].push([ax, ay])
        cx = ax; cy = ay
      }
    } else if (up === 'H') {
      const v = num()
      cx = isRel ? cx + v : v
      polylines[polylines.length - 1].push([cx, cy])
    } else if (up === 'V') {
      const v = num()
      cy = isRel ? cy + v : v
      polylines[polylines.length - 1].push([cx, cy])
    } else if (up === 'Q' || up === 'T') {
      const x0 = cx; const y0 = cy
      let qx; let qy
      if (up === 'T') {
        qx = x0; qy = y0
      } else {
        qx = num(); qy = num()
      }
      const endx = num(); const endy = num()
      const ax = isRel ? endx + x0 : endx
      const ay = isRel ? endy + y0 : endy
      const cqx = isRel ? qx + x0 : qx
      const cqy = isRel ? qy + y0 : qy
      const SEG = 14
      const last = polylines[polylines.length - 1]
      for (let s = 1; s <= SEG; s++) {
        const t = s / SEG
        const mt = 1 - t
        last.push([mt * mt * x0 + 2 * mt * t * cqx + t * t * ax, mt * mt * y0 + 2 * mt * t * cqy + t * t * ay])
      }
      cx = ax; cy = ay
    } else if (up === 'C') {
      const x0 = cx; const y0 = cy
      const x1 = num(); const y1 = num()
      const x2 = num(); const y2 = num()
      const x3 = num(); const y3 = num()
      const ax = isRel ? x3 + x0 : x3
      const ay = isRel ? y3 + y0 : y3
      const c1x = isRel ? x1 + x0 : x1
      const c1y = isRel ? y1 + y0 : y1
      const c2x = isRel ? x2 + x0 : x2
      const c2y = isRel ? y2 + y0 : y2
      const SEG = 18
      const last = polylines[polylines.length - 1]
      for (let s = 1; s <= SEG; s++) {
        const t = s / SEG
        const mt = 1 - t
        const px = mt * mt * mt * x0 + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * ax
        const py = mt * mt * mt * y0 + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * ay
        last.push([px, py])
      }
      cx = ax; cy = ay
    } else if (up === 'A') {
      const rx = Math.abs(num()); const ry = Math.abs(num())
      const rot = (num() * Math.PI) / 180
      const largeArc = num() !== 0
      const sweep = num() !== 0
      const ex = num(); const ey = num()
      const x0 = cx; const y0 = cy
      const tx = isRel ? ex + x0 : ex
      const ty = isRel ? ey + y0 : ey
      const pts = arcPoints(x0, y0, rx, ry, rot, largeArc, sweep, tx, ty)
      const last = polylines[polylines.length - 1]
      pts.forEach((p) => last.push(p))
      cx = tx; cy = ty
    } else if (up === 'Z') {
      const last = polylines[polylines.length - 1]
      last.push([sx, sy])
      last.closed = true
      cx = sx; cy = sy
    } else {
      throw new Error(`unsupported path cmd ${cmd}`)
    }
  }
  return polylines
}

function arcPoints(x1, y1, rx, ry, phi, largeArc, sweep, x2, y2) {
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  let rrx = Math.abs(rx)
  let rry = Math.abs(ry)
  let lambda = (x1p * x1p) / (rrx * rrx) + (y1p * y1p) / (rry * rry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rrx *= s
    rry *= s
  }
  const rx2 = rrx * rrx
  const ry2 = rry * rry
  const x1p2 = x1p * x1p
  const y1p2 = y1p * y1p
  let radicand = Math.max(0, (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2))
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(radicand)
  const cxp = (coef * rrx * y1p) / rry
  const cyp = (coef * -rry * x1p) / rrx
  const cxx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cyy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const ux = (x1p - cxp) / rrx
  const uy = (y1p - cyp) / rry
  const vx = (-x1p - cxp) / rrx
  const vy = (-y1p - cyp) / rry
  let angle1 = Math.atan2(uy, ux)
  let angleDelta = Math.atan2(vy, vx) - angle1
  if (sweep && angleDelta < 0) angleDelta += TWO_PI
  if (!sweep && angleDelta > 0) angleDelta -= TWO_PI
  const steps = Math.max(3, Math.ceil(Math.abs(angleDelta) / (Math.PI / 12)))
  const pts = []
  for (let k = 1; k <= steps; k++) {
    const a = angle1 + (angleDelta * k) / steps
    pts.push([
      cxx + rrx * Math.cos(a) * cos - rry * Math.sin(a) * sin,
      cyy + rrx * Math.cos(a) * sin + rry * Math.sin(a) * cos,
    ])
  }
  return pts
}

function nodeToPolylines(node) {
  const out = []
  node.forEach((item) => {
    const tag = item[0]
    const attrs = item[1] || {}
    if (tag === 'path') {
      const pls = parsePath(attrs.d || '')
      pls.forEach((pl) => out.push({ pts: pl }))
    } else if (tag === 'polyline') {
      const pts = (attrs.points || '').trim().split(/\s+/).map((p) => p.split(',').map(Number))
      out.push({ pts })
    } else if (tag === 'line') {
      out.push({
        pts: [[Number(attrs.x1), Number(attrs.y1)], [Number(attrs.x2), Number(attrs.y2)]],
      })
    } else if (tag === 'circle') {
      const r = Number(attrs.r)
      const ccx = Number(attrs.cx)
      const ccy = Number(attrs.cy)
      const pts = []
      const SEG = 24
      for (let k = 0; k < SEG; k++) {
        const a = (k / SEG) * TWO_PI
        pts.push([ccx + r * Math.cos(a), ccy + r * Math.sin(a)])
      }
      pts.push([pts[0][0], pts[0][1]])
      out.push({ pts })
    }
  })
  return out
}

// ---------- 3. 光栅化（线段距离场 + 4x4 超采样） ----------

function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function renderIcon(shapes, colorHex, size) {
  const SS = 4
  const canvas = size * SS
  const scale = canvas / 24
  const strokeHalf = scale // lucide stroke-width=2 (viewBox 24) -> 半径 = 1 unit
  const hitRadius2 = (strokeHalf + 0.9 * scale) * (strokeHalf + 0.9 * scale)

  const segs = []
  const caps = []
  shapes.forEach((sh) => {
    const pts = sh.pts
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1]
      const b = pts[j]
      segs.push([a[0] * scale, a[1] * scale, b[0] * scale, b[1] * scale])
    }
    if (pts.length) {
      caps.push([pts[0][0] * scale, pts[0][1] * scale])
      if (pts.length > 1) caps.push([pts[pts.length - 1][0] * scale, pts[pts.length - 1][1] * scale])
    }
  })

  const rgb = hexToRgb(colorHex)
  const buf = Buffer.alloc(size * size * 4)
  const hits = Buffer.alloc(canvas * canvas)

  for (let py = 0; py < canvas; py++) {
    for (let px = 0; px < canvas; px++) {
      const x = px + 0.5
      const y = py + 0.5
      let minD2 = Infinity
      for (let s = 0; s < segs.length; s++) {
        const seg = segs[s]
        const dx = seg[2] - seg[0]
        const dy = seg[3] - seg[1]
        const len2 = dx * dx + dy * dy
        let t = 0
        if (len2 > 0) {
          t = ((x - seg[0]) * dx + (y - seg[1]) * dy) / len2
          t = Math.max(0, Math.min(1, t))
        }
        const ex = seg[0] + dx * t - x
        const ey = seg[1] + dy * t - y
        const d = ex * ex + ey * ey
        if (d < minD2) minD2 = d
      }
      for (let c = 0; c < caps.length; c++) {
        const ex = caps[c][0] - x
        const ey = caps[c][1] - y
        const d = ex * ex + ey * ey
        if (d < minD2) minD2 = d
      }
      if (minD2 <= hitRadius2) hits[py * canvas + px] = 1
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          sum += hits[(y * SS + sy) * canvas + (x * SS + sx)]
        }
      }
      const idx = (y * size + x) * 4
      const alpha = Math.round((sum / (SS * SS)) * 255)
      buf[idx] = rgb[0]
      buf[idx + 1] = rgb[1]
      buf[idx + 2] = rgb[2]
      buf[idx + 3] = alpha
    }
  }
  return buf
}

// ---------- 4. PNG 编码（零依赖） ----------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- 5. 主流程 ----------

async function main() {
  const iconsDir = path.join(ROOT, 'assets', 'icons')
  fs.mkdirSync(iconsDir, { recursive: true })
  const iconCompDir = path.join(ROOT, 'components', 'icon')
  fs.mkdirSync(iconCompDir, { recursive: true })

  // 5.1 页面图标数据 -> components/icon/icons-data.js
  const map = await collectIcons()
  const dataLines = [
    '// 由 tools/build-icons.mjs 自动生成，勿手改',
    '// 结构：{ [iconName]: [ [tag, attrs], ... ] }（与 lucide-react 同源）',
    'module.exports = {',
  ]
  Object.keys(map).forEach((name) => {
    dataLines.push(`  ${JSON.stringify(name)}: ${JSON.stringify(map[name])},`)
  })
  dataLines.push('}')
  fs.writeFileSync(path.join(iconCompDir, 'icons-data.js'), dataLines.join('\n'), 'utf8')
  console.log(`[icons-data] ${Object.keys(map).length} icons written`)

  // 5.2 tabBar PNG（81x81）
  const SIZE = 81
  for (const key of Object.keys(TAB_ICONS)) {
    const conf = TAB_ICONS[key]
    const node = await loadIconData(conf.file)
    const shapes = nodeToPolylines(node)
    for (const [hex, filename] of conf.colors) {
      const rgba = renderIcon(shapes, hex, SIZE)
      const png = encodePNG(SIZE, rgba)
      fs.writeFileSync(path.join(iconsDir, filename), png)
      console.log(`[png] ${filename}`)
    }
  }
  console.log('build-icons done')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
