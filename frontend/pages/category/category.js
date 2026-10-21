// ============================================================
// pages/category —— 分类页：左栏一级分类 + 右栏商品（子类筛选 / 搜索）
// 由 H5 CategoryPage.jsx 转换。接收首页 globalData.pendingCat 定位。
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
    activeCat: 'all',
    sub: 'all',
    query: '',
    list: [],
    loading: true,
    catList: [],
    likedMap: {},
    displayTitle: '全部商品',
    isSearching: false,
    chips: [],
    chipActive: {},
  },

  __reqSeq: 0,

  onLoad() {
    const { navTop } = getNavMeta()
    this.setData({ navTop })
    // 订阅：目录加载完成后除刷新左栏外，还需重建当前筛选面板
    this.__unsub = shop.subscribe(() => {
      this.refreshMeta()
      this.rebuildPanel()
    })
    this.refreshMeta()
  },

  onShow() {
    // 消费首页「分类入口」跳转参数（等价 H5 的 ?cat=）
    const pending = getApp().globalData.pendingCat
    if (pending) {
      getApp().globalData.pendingCat = ''
      this.setData({ activeCat: pending, sub: 'all', query: '' })
    }
    this.load()
  },

  onUnload() {
    if (this.__unsub) this.__unsub()
  },

  refreshMeta() {
    const catList = shop.getCategories().map((c) => ({
      id: c.id,
      label: c.label,
      note: c.note,
      subs: (c.subs || []).slice(),
      // 图标优先用库内下发的 icon,未配置时回退本地映射
      icon: c.icon || CAT_ICON[c.id] || 'layout-grid',
    }))
    this.setData({ catList })
  },

  // 重建派生展示字段（标题 / chips / 收藏态）
  rebuildPanel() {
    const { activeCat, query, sub } = this.data
    const catList = this.data.catList
    const activeCategory = catList.find((c) => c.id === activeCat) || null
    const isSearching = query.trim().length > 0
    const chips = activeCat === 'all' ? [] : ['全部', ...(activeCategory ? activeCategory.subs : [])]
    const chipActive = {}
    chips.forEach((chip) => {
      chipActive[chip] =
        (chip === '全部' && sub === 'all') || (chip !== '全部' && sub === chip)
    })
    const panelTitle = isSearching
      ? `搜索 "${query.trim()}"`
      : activeCat === 'all'
        ? '全部商品'
        : `${activeCategory ? activeCategory.label : ''}专区`
    const likedMap = {}
    this.data.list.forEach((p) => {
      likedMap[p.id] = shop.isLiked(p.id)
    })
    this.setData({ isSearching, chips, chipActive, displayTitle: panelTitle, likedMap })
  },

  // 面向接口取数（将来由真实后端处理，签名不变）
  load() {
    const { activeCat, sub, query } = this.data
    const seq = ++this.__reqSeq
    this.setData({ loading: true, list: [] })
    api
      .fetchProducts({
        categoryId: activeCat === 'all' ? undefined : activeCat,
        sub: sub === 'all' ? undefined : sub,
        keyword: query.trim() || undefined,
      })
      .then((result) => {
        if (seq !== this.__reqSeq) return
        this.setData({ list: result, loading: false })
        this.rebuildPanel()
      })
      .catch(() => {
        if (seq !== this.__reqSeq) return
        this.setData({ list: [], loading: false })
        this.rebuildPanel()
      })
  },

  selectCat(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ activeCat: id, sub: 'all', query: '' }, () => {
      this.rebuildPanel()
      this.load()
    })
  },

  onSubChip(e) {
    const chip = e.currentTarget.dataset.chip
    this.setData({ sub: chip === '全部' ? 'all' : chip }, () => {
      this.rebuildPanel()
      this.load()
    })
  },

  onSearchInput(e) {
    this.setData({ query: e.detail.value }, () => {
      this.rebuildPanel()
      this.load()
    })
  },

  clearSearch() {
    this.setData({ query: '' }, () => {
      this.rebuildPanel()
      this.load()
    })
  },

  onLike(e) {
    shop.toggleLike(e.detail.id)
  },
  onAdd(e) {
    shop.addToCart(e.detail.id)
  },
  goDetail(e) {
    wx.navigateTo({ url: `/pages/product/product?id=${encodeURIComponent(e.currentTarget.dataset.id)}` })
  },
})
