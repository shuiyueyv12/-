// ============================================================
// pages/profile —— 我的：用户信息 / 订单 / 收藏 / 服务入口
// 由 H5 ProfilePage.jsx 转换
// ============================================================

const shop = require('../../store/shop')
const { getNavMeta } = require('../../utils/nav')

const showToast = (msg) => wx.showToast({ title: String(msg), icon: 'none', duration: 2000 })

const ORDER_QUICK = [
  { icon: 'credit-card', label: '待付款', goto: '/pages/orders/orders?status=' + encodeURIComponent('待付款') },
  { icon: 'package', label: '待发货', goto: '/pages/orders/orders?status=' + encodeURIComponent('待发货') },
  { icon: 'truck', label: '待收货', goto: '/pages/orders/orders?status=' + encodeURIComponent('待收货') },
  { icon: 'refresh-ccw', label: '退换 / 售后' },
]

const CELLS = [
  { icon: 'map-pin', label: '收货地址', goto: '/pages/address/address' },
  { icon: 'headphones', label: '联系客服' },
  { icon: 'life-buoy', label: '帮助与反馈' },
  { icon: 'info', label: '关于我们' },
]

Page({
  data: {
    navTop: 0,
    user: null,
    userSub: '',
    avatarChar: 'H',
    orders: [],
    fav: [],
    favCount: 0,
    pointsText: '--',
    orderQuick: ORDER_QUICK,
    cells: CELLS,
  },

  onLoad() {
    const { navTop } = getNavMeta()
    this.setData({ navTop })
    this.__unsub = shop.subscribe(() => this.refresh())
  },

  onUnload() {
    if (this.__unsub) this.__unsub()
  },

  refresh() {
    const user = shop.getUser()
    const orders = shop.getRecentOrders()
    const fav = shop.getFavoriteProducts()
    const points = Number((user && user.points) || 0)
    const userSub = user ? user.phone || '' : ''
    this.setData({
      user,
      userSub,
      avatarChar: user ? (user.nickname || 'H').slice(0, 1) : 'H',
      orders,
      fav,
      favCount: fav.length,
      pointsText: user ? points.toLocaleString('en-US') : '--',
    })
  },

  handleLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  handleLogout() {
    shop.logout()
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/orders' })
  },

  goOrderDetail(e) {
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${encodeURIComponent(e.currentTarget.dataset.id)}`,
    })
  },

  comingSoonLabel(e) {
    const { goto, label } = e.currentTarget.dataset
    if (goto) {
      wx.navigateTo({ url: goto })
      return
    }
    showToast(`${label}功能即将上线`)
  },
  comingSoonCollect() {
    showToast('我的收藏功能即将上线')
  },
  comingSoonCoupon() {
    showToast('优惠券功能即将上线')
  },
  openPoints() {
    if (this.data.user) showToast('积分中心功能即将上线')
    else showToast('请先登录')
  },

  onToggleLike(e) {
    shop.toggleLike(e.currentTarget.dataset.id)
  },
  onAdd(e) {
    shop.addToCart(e.currentTarget.dataset.id)
  },
  goBrowsing() {
    wx.switchTab({ url: '/pages/home/home' })
  },
})
