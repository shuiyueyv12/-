// ============================================================
// pages/product —— 商品详情
// 多图轮播 / 规格选择(价格·库存·主图联动) / 参数 / 加购 / 立即购买
//
// 规格数据来自 GET /products/:id 的 skus[](mock 模式由 mock/specs.js 派生):
//   specValues: { 颜色: '曜金黑', 版本: '12GB+256GB' }  ← 决定维度与维度值
//   specText  : '曜金黑 · 12GB+256GB'                  ← 展示与加购快照文案
//   price / stock / image                              ← 每个规格独立
// ============================================================

const shop = require('../../store/shop')
const api = require('../../services/api')
const { getNavMeta } = require('../../utils/nav')
const { formatPrice } = require('../../utils/format')

const showToast = (msg) => wx.showToast({ title: String(msg), icon: 'none', duration: 2000 })

const SERVICES = [
  { icon: 'check', label: '华为原装正品' },
  { icon: 'truck', label: '全国包邮(偏远除外)' },
  { icon: 'refresh-ccw', label: '7 天无理由退换' },
  { icon: 'life-buoy', label: '一年质保 · 全国联保' },
]

/** 规格键:把 specValues 归一成可比较的字符串 */
function specKey(values) {
  const v = values || {}
  return Object.keys(v)
    .sort()
    .map((k) => `${k}:${v[k]}`)
    .join('|')
}

/** 由 SKU 列表推导规格维度组(保持维度与取值出现顺序) */
function buildGroups(skus) {
  const groups = []
  ;(skus || []).forEach((s) => {
    const values = s.specValues || {}
    Object.keys(values).forEach((name) => {
      let g = null
      for (let i = 0; i < groups.length; i++) if (groups[i].name === name) g = groups[i]
      if (!g) {
        g = { name: name, values: [] }
        groups.push(g)
      }
      if (g.values.indexOf(values[name]) === -1) g.values.push(values[name])
    })
  })
  return groups
}

/** 库存文案与档位(决定详情页库存文案颜色) */
function stockMeta(stock) {
  if (stock <= 0) return { text: '已售罄', level: 'out' }
  if (stock <= 5) return { text: `仅剩 ${stock} 件`, level: 'low' }
  return { text: `现货 ${stock} 件`, level: 'ok' }
}

/** 传给 store.addToCart 的规格描述(用于购物车行的规格文案与规格价) */
function toSkuArg(sku) {
  return { id: sku.id, specText: sku.specText, price: sku.price, image: sku.image }
}

Page({
  data: {
    navTop: 0,
    id: '',
    product: null,
    images: [],
    imageIndex: 0,
    priceText: '',
    originalPriceText: '',
    liked: false,
    qty: 1,
    params: [],
    services: SERVICES,
    cartQty: 0,
    // ---- 规格 ----
    hasSku: false,
    specGroups: [], // [{ name, values: [{ value, selected, available }] }]
    selected: {}, // { 颜色: '曜金黑', 版本: '12GB+256GB' }
    currentSku: null,
    specText: '',
    stockText: '',
    stockLevel: 'ok',
    soldOut: false,
  },

  onLoad(query) {
    const { navTop } = getNavMeta()
    this.__skus = []
    this.setData({ navTop, id: query.id || '' })
    this.__unsub = shop.subscribe(() => this.refresh())
    this.load()
  },

  onUnload() {
    if (this.__unsub) this.__unsub()
  },

  load() {
    const id = this.data.id
    if (!id) return
    // 先用目录缓存渲染基础信息(秒开),再用详情接口补多图与规格
    const cached = shop.getProductsById()[id]
    if (cached) this.applyProduct(cached)
    api
      .fetchProduct(id)
      .then((p) => this.applyProduct(p))
      .catch(() => {
        if (!cached) showToast('商品不存在或已下架')
      })
  },

  applyProduct(product) {
    if (!product) return
    const images =
      Array.isArray(product.images) && product.images.length
        ? product.images
        : product.image
          ? [product.image]
          : []
    const skus = Array.isArray(product.skus) ? product.skus : []
    this.__skus = skus

    // 默认落在第一个「有货」的规格组合上,进页面就能直接下单
    let selected = {}
    if (skus.length) {
      const first = skus.filter((s) => s.stock > 0)[0] || skus[0]
      selected = Object.assign({}, first.specValues)
    }

    const cats = shop.getCategories()
    const cat = cats.filter((c) => c.id === product.categoryId)[0]

    this.setData(
      {
        product,
        images,
        imageIndex: 0,
        params: [
          { k: '分类', v: cat ? cat.label : '' },
          { k: '系列', v: product.sub || '' },
          { k: '编号', v: product.id },
        ],
        hasSku: skus.length > 0,
        selected,
      },
      () => {
        this.syncSpec()
        this.refresh()
      },
    )
  },

  /**
   * 汇总规格状态:维度可选性 / 当前规格 / 价格 / 库存 / 是否售罄。
   * 每次选中值变化都会重算,保证价格、库存文案与置灰态同步刷新。
   */
  syncSpec() {
    const product = this.data.product
    if (!product) return
    const skus = this.__skus || []
    const selected = this.data.selected || {}

    const specGroups = buildGroups(skus).map((g) => ({
      name: g.name,
      values: g.values.map((value) => ({
        value,
        selected: selected[g.name] === value,
        // 该维度值下只要还有一个有货的组合,就让它可点;全无货则置灰
        available: skus.some((s) => (s.specValues || {})[g.name] === value && s.stock > 0),
      })),
    }))

    const wanted = specKey(selected)
    const currentSku = skus.length ? skus.filter((s) => specKey(s.specValues) === wanted)[0] || null : null

    const price = currentSku ? Number(currentSku.price) : Number(product.price)
    const stock = currentSku ? Number(currentSku.stock) : Number(product.stock || 0)
    const meta = stockMeta(stock)

    this.setData({
      specGroups,
      currentSku,
      priceText: formatPrice(price),
      originalPriceText:
        Number(product.originalPrice) > price ? formatPrice(product.originalPrice) : '',
      stockText: meta.text,
      stockLevel: meta.level,
      soldOut: stock <= 0,
      specText: currentSku ? currentSku.specText : '',
    })
  },

  /** 选中规格值:自动补齐其他维度,并让主图跟随第一维度 */
  onSpecTap(e) {
    const group = e.currentTarget.dataset.group
    const value = e.currentTarget.dataset.value
    const skus = this.__skus || []
    const candidates = skus.filter((s) => (s.specValues || {})[group] === value && s.stock > 0)
    if (!candidates.length) {
      showToast('该规格暂时无货')
      return
    }
    // 优先保持用户已选的其他维度不变;不可行时跳到该值下的第一个有货组合
    const selected = this.data.selected || {}
    const keep =
      candidates.filter((s) =>
        Object.keys(selected).every(
          (k) => k === group || (s.specValues || {})[k] === selected[k],
        ),
      )[0] || candidates[0]

    const firstGroup = (this.data.specGroups[0] || {}).name
    let imageIndex = this.data.imageIndex
    if (group === firstGroup) {
      const idx = (this.data.specGroups[0].values || []).findIndex((v) => v.value === value)
      if (idx > -1) imageIndex = Math.min(idx, Math.max(0, this.data.images.length - 1))
    }

    this.setData({ selected: Object.assign({}, keep.specValues), imageIndex }, () => this.syncSpec())
  },

  onSwiperChange(e) {
    this.setData({ imageIndex: e.detail.current })
  },

  /** 规格是否已就绪(无规格商品直接通过) */
  assertBuyable() {
    const { soldOut, hasSku, currentSku } = this.data
    if (soldOut) {
      showToast('该规格暂时售罄')
      return false
    }
    if (hasSku && !currentSku) {
      showToast('请选择商品规格')
      return false
    }
    return true
  },

  refresh() {
    const { product, id } = this.data
    if (!product) return
    this.setData({
      liked: shop.isLiked(id),
      cartQty: cartQtyOf(id),
    })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/home/home' })
  },

  onLike() {
    shop.toggleLike(this.data.id)
  },

  onQtyChange(e) {
    this.setData({ qty: e.detail.value })
  },

  addCart() {
    if (!this.assertBuyable()) return
    const { id, qty, currentSku } = this.data
    shop.addToCart(id, qty, currentSku ? toSkuArg(currentSku) : undefined)
  },

  buyNow() {
    if (!this.assertBuyable()) return
    const { id, qty, currentSku } = this.data
    const parts = ['mode=buy', `id=${encodeURIComponent(id)}`, `qty=${qty}`]
    if (currentSku) {
      parts.push(`sku=${encodeURIComponent(currentSku.id)}`)
      parts.push(`price=${currentSku.price}`)
      parts.push(`spec=${encodeURIComponent(currentSku.specText)}`)
      if (currentSku.image) parts.push(`image=${encodeURIComponent(currentSku.image)}`)
    }
    wx.navigateTo({ url: `/pages/checkout/checkout?${parts.join('&')}` })
  },
})

/** 当前商品在购物车中的总件数(同一商品的不同规格累加) */
function cartQtyOf(id) {
  return shop
    .getCartLines()
    .filter((l) => l.productId === id)
    .reduce((n, l) => n + l.qty, 0)
}
