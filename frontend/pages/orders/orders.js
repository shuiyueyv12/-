// ============================================================
// pages/orders —— 全部订单:状态筛选 / 列表 / 去操作(详情页)
//   ?status=待付款 可带初始筛选
// ============================================================

const shop = require('../../store/shop')
const { getNavMeta } = require('../../utils/nav')

const TABS = ['全部', '待付款', '待发货', '待收货', '已完成']

Page({
  data: {
    navTop: 0,
    tabs: TABS,
    active: '全部',
    list: [],
  },

  onLoad(query) {
    const { navTop } = getNavMeta()
    const status = query.status || '全部'
    this.setData({ navTop, active: TABS.indexOf(status) > -1 ? status : '全部' })
    this.__unsub = shop.subscribe(() => this.refresh())
  },

  onShow() {
    // 网络模式从服务端拉最新订单
    shop.refreshOrders().then(() => this.refresh())
    this.refresh()
  },

  onUnload() {
    if (this.__unsub) this.__unsub()
  },

  refresh() {
    let list = shop.getRecentOrders()
    if (this.data.active !== '全部') {
      list = list.filter((o) => o.status === this.data.active)
    }
    this.setData({ list })
  },

  onTab(e) {
    this.setData({ active: e.currentTarget.dataset.tab }, () => this.refresh())
  },

  goDetail(e) {
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?id=${encodeURIComponent(e.currentTarget.dataset.id)}`,
    })
  },

  goBrowsing() {
    wx.switchTab({ url: '/pages/home/home' })
  },
})
