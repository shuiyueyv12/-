// ============================================================
// components/icon —— lucide 图标渲染组件
// 把 icons-data.js 中的 SVG 元素数组拼成内联 SVG，再以
// `background-image: url("data:image/svg+xml,...")` 渲染到 view。
// 用法：
//   <icon name="heart" size="16" color="#c8102e" mode="stroke|fill" />
// ============================================================

const DATA = require('./icons-data.js')

function tagToXml(tag, attrs) {
  let s = `<${tag}`
  Object.keys(attrs).forEach((k) => {
    s += ` ${k}="${attrs[k]}"`
  })
  return `${s}/>`
}

Component({
  properties: {
    name: { type: String, value: '' },
    color: { type: String, value: '' },
    size: { type: Number, value: 16 },
    mode: { type: String, value: 'stroke' }, // stroke | fill
  },

  data: { style: '' },

  observers: {
    'name,color,size,mode'() {
      this.apply()
    },
  },

  lifetimes: {
    attached() {
      this.apply()
    },
  },

  methods: {
    apply() {
      const { name, color, size, mode } = this.data
      const node = DATA[name]
      if (!node || !color) {
        this.setData({ style: '' })
        return
      }
      const w = Math.round(size)
      const isFill = mode === 'fill'
      let inner = ''
      node.forEach((el) => {
        inner += tagToXml(el[0], el[1] || {})
      })
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" ` +
        `viewBox="0 0 24 24" fill="${isFill ? color : 'none'}" stroke="${isFill ? 'none' : color}" ` +
        `stroke-width="${isFill ? 0 : 2}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
      const uri = encodeURIComponent(svg)
      this.setData({
        style: `width:${w}px;height:${w}px;background-image:url("data:image/svg+xml,${uri}");`,
      })
    },
  },
})
