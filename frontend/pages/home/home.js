// ============================================================
// pages/home —— 首页：品牌栏 / 搜索 / 轮播 / 分类入口 / 精选好物
// 由 H5 HomePage.jsx 转换（wxml + js + wxss）
// ============================================================

const shop = require('../../store/shop')
const api = require('../../services/api')
const { getNavMeta } = require('../../utils/nav')

const CAT_ICON = {
  phone: 'smartphone',
  tablet: 'tablet',
  wearable: 'watch',
  audio: 'headphones',
}

Page({
  data: {
    navTop: 0,
    banners: [],
    slide: 0,
    currentBanner: null,
    bannerImgFail: {},
    query: '',
    cats: [],
    filteredProducts: [],
    likedMap: {},
  },

  onLoad() {
    const { navTop } = getNavMeta()
    this.setData({ navTop })
    this.__unsub = shop.subscribe(() => this.refresh())

    api.fetchBanners().then((list) => {
      if (!list.length) return
      this.setData({ banners: list })
      this.refresh()
    })

    this.refresh()
  },

  onUnload() {
    if (this.__unsub) this.__unsub()
  },

  refresh() {
    const keyword = this.data.query.trim().toLowerCase()
    // 搜索作用于全目录(无关键词时展示精选好物)
    let products = keyword ? shop.getProducts() : shop.getFeaturedProducts()
    if (keyword) {
      products = products.filter((p) =>
        `${p.name}${p.desc}${p.sub}`.toLowerCase().includes(keyword),
      )
    }
    const likedMap = {}
    products.forEach((p) => {
      likedMap[p.id] = shop.isLiked(p.id)
    })
    const cats = shop.getCategories().map((c) => ({
      id: c.id,
      label: c.label,
      note: c.note,
      // 图标优先用库内下发的 icon,未配置时回退本地映射
      icon: c.icon || CAT_ICON[c.id] || 'layout-grid',
    }))
    const banners = this.data.banners
    const slide = this.data.slide
    this.setData({
      filteredProducts: products,
      likedMap,
      cats,
      currentBanner: banners[slide] || banners[0] || null,
    })
  },

  // ---------- 搜索 ----------
  onSearchInput(e) {
    this.setData({ query: e.detail.value })
    this.refresh()
  },
  clearSearch() {
    this.setData({ query: '' })
    this.refresh()
  },
  applyHot(e) {
    this.setData({ query: e.currentTarget.dataset.kw })
    this.refresh()
  },

  // ---------- 轮播 ----------
  onSlide(e) {
    this.setData({ slide: e.detail.current })
    this.refresh()
  },
  gotoSlide(e) {
    this.setData({ slide: Number(e.currentTarget.dataset.index) })
    this.refresh()
  },
  prevSlide() {
    const len = this.data.banners.length
    if (!len) return
    this.setData({ slide: (this.data.slide - 1 + len) % len })
    this.refresh()
  },
  nextSlide() {
    const len = this.data.banners.length
    if (!len) return
    this.setData({ slide: (this.data.slide + 1) % len })
    this.refresh()
  },

  // ---------- 交互 ----------
  // 轮播图外链加载失败:记入失败表,该图隐藏,由 .hero 的深色渐变兜底
  onBannerImgError(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(index)) return
    this.setData({ [`bannerImgFail.${index}`]: true })
  },
  // 轮播 CTA:跳到横幅对应的商品详情;匹配不到则退到分类页
  onBannerCta() {
    const banner = this.data.currentBanner
    if (!banner) return
    const text = `${banner.eyebrow || ''} ${banner.title || ''}`.toLowerCase()
    const hit = shop
      .getProducts()
      .find((p) => text.includes(p.name.toLowerCase().replace(/^huawei\s*/i, '')))
    if (hit) {
      wx.navigateTo({ url: `/pages/product/product?id=${encodeURIComponent(hit.id)}` })
    } else {
      wx.switchTab({ url: '/pages/category/category' })
    }
  },
  goCategory() {
    wx.switchTab({ url: '/pages/category/category' })
  },
  goCategoryWithCat(e) {
    getApp().globalData.pendingCat = e.currentTarget.dataset.id
    wx.switchTab({ url: '/pages/category/category' })
  },
  onAdd(e) {
    shop.addToCart(e.detail.id)
  },
  onLike(e) {
    shop.toggleLike(e.detail.id)
  },
  goDetail(e) {
    wx.navigateTo({ url: `/pages/product/product?id=${encodeURIComponent(e.currentTarget.dataset.id)}` })
  },
})
