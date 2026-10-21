// ============================================================
// pages/checkout —— 确认订单:收货地址 + 商品清单 + 金额构成 + 备注 + 提交
//   ?mode=cart                          从购物车结算(已勾选项)
//   ?mode=buy&id=p101&qty=1[&sku=xx&price=..&spec=..&image=..]  立即购买
//
// 说明:
//   - 立即购买带上所选规格,结算时提交给服务端按规格取价;
//   - 金额展示为「商品金额 + 运费 - 优惠」,运费/优惠当前为 0(免运费、无优惠);
//   - 收货地址在下单瞬间由服务端固化成订单快照,地址后续被改/删都不影响历史订单。
// ============================================================

const shop = require('../../store/shop')
const api = require('../../services/api')
const config = require('../../services/config')
const { getNavMeta } = require('../../utils/nav')
const { formatPrice } = require('../../utils/format')

const ONLINE = !config.USE_MOCK

const showToast = (msg) => wx.showToast({ title: String(msg), icon: 'none', duration: 2000 })

Page({
  data: {
    navTop: 0,
    mode: 'cart', // cart | buy
    id: '',
    qty: 1,
    // 立即购买的规格上下文(由商品详情页通过 query 传入)
    skuId: '0',
    spec: '',
    unitPrice: null,
    unitImage: '',
    // [{ id, skuId, name, image, sub, tag, spec, price, qty, priceText, lineTotalText }]
    lines: [],
    count: 0,
    goodsAmountText: '¥0',
    freightText: '免运费',
    discountText: '',
    amountText: '¥0',
    address: null,
    remark: '',
    submitting: false,
  },

  onLoad(query) {
    const { navTop } = getNavMeta()
    const price = Number(query.price)
    this.setData({
      navTop,
      mode: query.mode === 'buy' ? 'buy' : 'cart',
      id: query.id || '',
      qty: Math.max(1, Number(query.qty) || 1),
      skuId: String(query.sku || 0),
      spec: query.spec ? decodeURIComponent(query.spec) : '',
      unitPrice: price > 0 ? price : null,
      unitImage: query.image ? decodeURIComponent(query.image) : '',
    })
    this.__unsub = shop.subscribe(() => this.refresh())
  },

  onShow() {
    this.loadAddress()
    this.refresh()
  },

  onUnload() {
    if (this.__unsub) this.__unsub()
  },

  // 默认地址(或地址页回传的选中地址)
  loadAddress() {
    // 网络模式下游客请求受保护接口会 401,未登录先跳过(提交时会引导登录)
    if (ONLINE && !shop.getUser()) {
      this.setData({ address: null })
      return
    }
    api
      .fetchAddresses()
      .then((list) => {
        if (!Array.isArray(list) || !list.length) {
          this.setData({ address: null })
          return
        }
        const pending = getApp().globalData.pendingAddressId
        let chosen = list.find((a) => a.id === pending)
        if (!chosen) chosen = list.find((a) => a.isDefault) || list[0]
        this.setData({ address: chosen })
      })
      .catch(() => this.setData({ address: null }))
  },

  refresh() {
    const { mode, id, qty, skuId, spec, unitPrice, unitImage } = this.data
    let raw = []

    if (mode === 'buy') {
      const p = shop.getProductsById()[id]
      if (p) {
        raw = [
          {
            id: p.id,
            name: p.name,
            // 规格主图优先,缺失时回退商品主图
            image: unitImage || p.image,
            sub: p.sub || '',
            tag: p.tag || '',
            price: unitPrice != null ? unitPrice : Number(p.price),
            spec,
            skuId,
            qty: Math.max(1, Math.min(99, qty)),
          },
        ]
      }
    } else {
      raw = shop
        .getCartLines()
        .filter((l) => l.checked)
        .map((l) => ({
          id: l.productId,
          name: l.product.name,
          image: l.product.image,
          sub: l.product.sub || '',
          tag: l.product.tag || '',
          // getCartLines 已按规格取价与取图
          price: l.product.price,
          spec: l.spec || '',
          skuId: l.skuId,
          qty: l.qty,
        }))
    }

    const lines = raw.map((p) => ({
      // 列表 key:同一商品的不同规格各占一行,不能用商品 id 当 key
      key: `${p.id}#${p.skuId || '0'}`,
      id: p.id,
      skuId: p.skuId || '0',
      name: p.name,
      image: p.image,
      sub: p.sub || '',
      tag: p.tag || '',
      spec: p.spec || '',
      price: p.price,
      qty: p.qty,
      priceText: formatPrice(p.price),
      lineTotalText: formatPrice(p.price * p.qty),
    }))

    const count = lines.reduce((n, l) => n + l.qty, 0)
    const goodsAmount = lines.reduce((s, l) => s + l.price * l.qty, 0)
    // 运费与优惠当前为 0(免运费、无优惠),字段先就位以便后续接优惠券
    const freight = 0
    const discount = 0

    this.setData({
      lines,
      count,
      goodsAmountText: formatPrice(goodsAmount),
      freightText: freight > 0 ? formatPrice(freight) : '免运费',
      discountText: discount > 0 ? `-${formatPrice(discount)}` : '',
      amountText: formatPrice(goodsAmount + freight - discount),
    })
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/cart/cart' })
  },

  chooseAddress() {
    wx.navigateTo({ url: '/pages/address/address?picker=1' })
  },

  goAddressManage() {
    wx.navigateTo({ url: '/pages/address/address' })
  },

  submit() {
    if (this.data.submitting || !this.data.lines.length) return
    // 订单必须有收货信息才能固化快照
    if (!this.data.address) {
      showToast('请先选择收货地址')
      return
    }

    this.setData({ submitting: true })

    const { mode, id, qty, skuId, address, remark } = this.data
    // 立即购买:服务端按明细结算;购物车:传空数组,服务端结算已勾选项并清车
    const buyNowItems = mode === 'buy' ? [{ productId: id, skuId, qty }] : null

    shop
      .checkout(buyNowItems, {
        addressId: address.id,
        // mock 模式据此生成本地订单的地址快照(真实模式由服务端按 addressId 取)
        addressSnapshot: {
          receiver: address.receiver,
          phone: address.phone,
          region: address.region,
          detail: address.detail,
        },
        remark,
      })
      .then((order) => {
        if (!order) return
        // 清掉地址回传的临时选择
        getApp().globalData.pendingAddressId = ''
        wx.redirectTo({
          url: `/pages/order-detail/order-detail?id=${encodeURIComponent(order.orderId)}`,
        })
      })
      .catch((err) => {
        if (err && err.needLogin) wx.navigateTo({ url: '/pages/login/login' })
      })
      .finally(() => this.setData({ submitting: false }))
  },
})
