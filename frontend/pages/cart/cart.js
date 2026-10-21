// ============================================================
// pages/cart —— 购物车：选择 / 数量 / 删除 / 结算
// 由 H5 CartPage.jsx 转换
// 购物车行 =「商品 + 规格」,同一商品的不同颜色/版本各占一行,
// 因此每行的操作都要带 data-sku(无规格商品为 '0')。
// ============================================================

const shop = require('../../store/shop')
const { getNavMeta } = require('../../utils/nav')

Page({
  data: {
    navTop: 0,
    ready: false,
    empty: true,
    lines: [],
    cartTotalQty: 0,
    checkedCount: 0,
    checkedAmountText: '¥0',
    allChecked: false,
    editing: false,
    submitting: false,
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
    const ready = shop.isCatalogReady()
    const lines = shop.getCartLines()
    const checked = shop.getCheckedInfo()
    this.setData({
      ready,
      empty: lines.length === 0,
      lines,
      cartTotalQty: shop.getCartTotalQty(),
      checkedCount: checked.count,
      checkedAmountText: checked.amountText,
      allChecked: shop.getAllChecked(),
    })
  },

  toggleEditing() {
    this.setData({ editing: !this.data.editing })
  },

  onToggleLine(e) {
    const { id, sku, checked } = e.currentTarget.dataset
    shop.setItemChecked(id, checked !== '1', sku)
  },

  toggleAll() {
    shop.setAllChecked(!this.data.allChecked)
  },

  onQtyChange(e) {
    const { id, sku } = e.currentTarget.dataset
    shop.changeQty(id, e.detail.value, sku)
  },

  onRemoveLine(e) {
    const { id, sku } = e.currentTarget.dataset
    shop.removeFromCart(id, sku)
  },

  removeChecked() {
    shop.removeCheckedItems()
  },

  handleCheckout() {
    if (this.data.submitting || this.data.checkedCount === 0) return
    // 去确认订单页(地址/清单/金额),提交动作由该页完成
    wx.navigateTo({ url: '/pages/checkout/checkout?mode=cart' })
  },

  goBrowsing() {
    wx.switchTab({ url: '/pages/home/home' })
  },
})
