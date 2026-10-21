// ============================================================
// pages/order-detail —— 订单详情
//   ?id=订单号
// 展示:状态 / 商品快照(含规格) / 金额构成 / 收货信息 / 支付信息 /
//       物流运单号 / 状态时间轴
// 操作:待付款[模拟支付/取消] → 待发货[模拟发货] → 待收货[确认收货] → 已完成
//
// 数据来源:GET /orders/:orderNo(全量明细 + 时间轴 + 支付方式),
// 因此不再依赖「最近 10 单」列表里被截断的前 3 条明细。
// ============================================================

const shop = require('../../store/shop')
const { getNavMeta } = require('../../utils/nav')
const { formatPrice, formatTime } = require('../../utils/format')

const STATUS_TIPS = {
  待付款: '请在 24 小时内完成支付,超时订单将自动取消',
  待发货: '商家正在为你打包商品',
  待收货: '商品已在途中,请注意查收',
  已完成: '交易完成,感谢购买',
  已取消: '订单已取消',
}

const ACTIONS_BY_STATUS = {
  待付款: [
    { action: 'pay', label: '模拟支付', primary: true },
    { action: 'cancel', label: '取消订单', primary: false },
  ],
  待发货: [{ action: 'ship', label: '模拟发货', primary: true }],
  待收货: [{ action: 'receive', label: '确认收货', primary: true }],
}

/** 正常流转的 4 个节点;已取消订单只保留「提交」与「取消」 */
const NORMAL_STEPS = [
  ['create', '提交订单'],
  ['pay', '付款成功'],
  ['ship', '商品出库'],
  ['receive', '确认收货'],
]
const CANCELED_STEPS = [
  ['create', '提交订单'],
  ['cancel', '订单取消'],
]

/** 由 order_logs 生成时间轴(有日志的节点为已完成,红色实心) */
function buildTimeline(order) {
  const byAction = {}
  ;(order.logs || []).forEach((l) => {
    if (l && l.action && !byAction[l.action]) byAction[l.action] = l
  })
  const steps = order.status === '已取消' ? CANCELED_STEPS : NORMAL_STEPS
  return steps.map((pair) => {
    const log = byAction[pair[0]]
    return {
      key: pair[0],
      title: pair[1],
      done: !!log,
      remark: log ? log.remark : '',
      timeText: log ? formatTime(log.createdAt) : '',
    }
  })
}

const PAY_METHOD_TEXT = { wechat: '微信支付', mock: '模拟支付' }

Page({
  data: {
    navTop: 0,
    id: '',
    order: null,
    statusTip: '',
    actions: [], // [{ action, label, primary }]
    busy: false,
    // 派生展示字段
    amountText: '',
    goodsAmountText: '',
    freightText: '',
    discountText: '',
    timeText: '',
    paidTimeText: '',
    shippedTimeText: '',
    finishedTimeText: '',
    hasAddress: false,
    addressText: '',
    receiver: '',
    phone: '',
    hasLogistics: false,
    logisticsText: '',
    trackingNo: '',
    paymentText: '',
    timeline: [],
  },

  onLoad(query) {
    const { navTop } = getNavMeta()
    this.setData({ navTop, id: query.id || '' })
    this.__unsub = shop.subscribe(() => this.render())
  },

  onShow() {
    this.loadDetail()
  },

  onUnload() {
    if (this.__unsub) this.__unsub()
  },

  /** 拉取订单详情(含全量明细与时间轴) */
  loadDetail() {
    const id = this.data.id
    if (!id) return
    shop.getOrderDetail(id).then((order) => {
      this.__full = order
      this.render()
    })
  },

  render() {
    const order = this.__full || shop.getRecentOrders().find((o) => o.orderId === this.data.id)
    if (!order) {
      this.setData({ order: null })
      return
    }

    const addr = order.address || {}
    const hasAddress = !!(addr.receiver || addr.detail)
    const payment = order.payment || null

    // 明细补展示字段(同一商品的不同规格各占一行,key 需含 skuId)
    const items = (order.items || []).map((it) =>
      Object.assign({}, it, {
        key: `${it.id}#${it.skuId || '0'}`,
        priceText: formatPrice(it.price),
        lineTotalText: formatPrice(it.price * it.qty),
      }),
    )

    this.setData({
      order: Object.assign({}, order, { items }),
      statusTip: STATUS_TIPS[order.status] || '',
      actions: ACTIONS_BY_STATUS[order.status] || [],

      amountText: formatPrice(order.amount),
      goodsAmountText: formatPrice(order.goodsAmount != null ? order.goodsAmount : order.amount),
      freightText: Number(order.freight) > 0 ? formatPrice(order.freight) : '免运费',
      discountText: Number(order.discount) > 0 ? `-${formatPrice(order.discount)}` : '',
      timeText: order.createdAt ? formatTime(order.createdAt) : '',
      paidTimeText: order.paidAt ? formatTime(order.paidAt) : '',
      shippedTimeText: order.shippedAt ? formatTime(order.shippedAt) : '',
      finishedTimeText: order.finishedAt ? formatTime(order.finishedAt) : '',

      hasAddress,
      receiver: addr.receiver || '',
      phone: addr.phone || '',
      addressText: `${addr.region || ''} ${addr.detail || ''}`.trim(),

      hasLogistics: !!order.trackingNo,
      logisticsText: order.shipCompany || '',
      trackingNo: order.trackingNo || '',
      paymentText: payment ? PAY_METHOD_TEXT[payment.method] || payment.method : '',

      timeline: buildTimeline(order),
    })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/profile/profile' })
  },

  /** 长按运单号复制 */
  copyTrackingNo() {
    if (!this.data.trackingNo) return
    wx.setClipboardData({
      data: this.data.trackingNo,
      success: () => wx.showToast({ title: '运单号已复制', icon: 'none' }),
    })
  },

  runAction(e) {
    if (this.data.busy) return
    const action = e.currentTarget.dataset.action
    if (action === 'cancel') {
      wx.showModal({
        title: '取消订单',
        content: '确定取消这个订单吗?',
        confirmColor: '#c8102e',
        success: (res) => {
          if (res.confirm) this.doAction(action)
        },
      })
      return
    }
    if (action === 'pay') {
      // 走 /payments 模拟支付:写支付流水 + 触发订单 pay 流转
      wx.showModal({
        title: '模拟支付',
        content: `确认支付 ${this.data.amountText} 吗?(演示流程,不接入真实微信支付)`,
        confirmColor: '#c8102e',
        success: (res) => {
          if (res.confirm) this.doAction(action)
        },
      })
      return
    }
    this.doAction(action)
  },

  doAction(action) {
    this.setData({ busy: true })
    shop
      .updateOrderStatus(this.data.id, action)
      .then((updated) => {
        if (!updated) return
        // 服务端/本地均返回完整订单(含新时间轴节点),直接作为最新全量数据
        this.__full = updated
        this.render()
      })
      .finally(() => this.setData({ busy: false }))
  },
})
