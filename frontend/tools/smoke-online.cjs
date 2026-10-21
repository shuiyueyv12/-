// ============================================================
// tools/smoke-online.cjs —— 前端数据层 ↔ 真实后端的集成校验
//
// 与 smoke-store.cjs 的分工:
//   smoke-store.cjs  在 mock 模式下跑 store 逻辑(Node 内,不发网络请求)
//   smoke-online.cjs 拉起一个 wx 桩,把 USE_MOCK 压成 false,用真实 HTTP 跑通
//                     「目录 → 商品详情(多图/规格) → 注册登录 → 按规格加购 →
//                      下单 → 支付 → 发货 → 收货 → 订单详情」全链路
//
// 前置:
//   1) 后端已启动      cd server && npm run dev
//   2) 已建表并灌数    cd server && npm run db:init && npm run db:seed
// 运行:
//   cd frontend && node tools/smoke-online.cjs
//
// 注意:本文件只做校验,不会写入任何工程文件;测试账号为每次运行的临时账号。
// ============================================================

let passed = 0
let failed = 0

function check(name, cond, extra) {
  if (cond) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.error(`  FAIL  ${name}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 轮询等待条件成立(store 的目录预加载是 fire-and-forget,没有可 await 的 Promise) */
async function waitFor(fn, timeout = 6000, interval = 100) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (fn()) return true
    await sleep(interval)
  }
  return false
}

// ------------------------------------------------------------
// wx 桩:只需要 storage / toast / request 三类能力
// ------------------------------------------------------------
const memory = {}
const toasts = []

const wxStub = {
  getStorageSync: (key) => (key in memory ? memory[key] : ''),
  setStorageSync: (key, value) => {
    memory[key] = value
  },
  removeStorageSync: (key) => {
    delete memory[key]
  },
  showToast: (opt) => toasts.push((opt && opt.title) || ''),
  showModal: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  navigateTo: () => {},
  redirectTo: () => {},
  switchTab: () => {},
  navigateBack: () => {},
  setClipboardData: () => {},
  /** 对应小程序 wx.request:回调式 → 这里桥接到 fetch */
  request(opt) {
    const method = (opt.method || 'GET').toUpperCase()
    const init = { method, headers: Object.assign({}, opt.header) }
    if (method !== 'GET' && opt.data !== undefined) init.body = JSON.stringify(opt.data)
    fetch(opt.url, init)
      .then(async (res) => {
        const text = await res.text()
        let data = null
        try {
          data = text ? JSON.parse(text) : null
        } catch (e) {
          data = text
        }
        if (opt.success) opt.success({ statusCode: res.status, data })
      })
      .catch((err) => {
        if (opt.fail) opt.fail(err)
      })
  },
}

global.wx = wxStub

// config 在模块加载时把 USE_MOCK 解构出去,因此必须在 require 业务模块之前覆盖它
const config = require('../services/config')
config.USE_MOCK = false

const api = require('../services/api')
const shop = require('../store/shop')

async function main() {
  console.log(`[smoke-online] 目标后端 ${config.API_BASE_URL}\n`)

  const stamp = Date.now()
  const username = `onl_${stamp}`
  const password = 'online123'

  // ---------- 1) 商品目录 ----------
  const products = await api.fetchProducts()
  check('商品列表 14 条', Array.isArray(products) && products.length === 14, products.length)
  check(
    '列表带 库存/销量/划线价',
    products.every(
      (p) =>
        typeof p.stock === 'number' && typeof p.sales === 'number' && typeof p.originalPrice === 'number',
    ),
    products[0],
  )

  const cats = await api.fetchCategories()
  check('分类含 icon 与 subs', cats.length === 4 && cats.every((c) => !!c.icon && c.subs.length > 0), cats[0])

  // ---------- 2) 商品详情:多图 + 规格 ----------
  const detail = await api.fetchProduct('p101')
  check('详情带多图(≥3)', Array.isArray(detail.images) && detail.images.length >= 3, detail.images && detail.images.length)
  check('详情带规格(≥2)', Array.isArray(detail.skus) && detail.skus.length >= 2, detail.skus && detail.skus.length)

  const sku = detail.skus.filter((s) => s.stock >= 5)[0]
  check(
    '规格字段完整(specValues/specText/price/stock)',
    sku && Object.keys(sku.specValues).length >= 2 && !!sku.specText && typeof sku.price === 'number',
    sku,
  )

  // ---------- 3) 注册 / 登录 / 会话 ----------
  await api.register({ username, password })
  check('注册后已写入 token', api.hasToken())
  const me = await api.fetchMe()
  check('fetchMe 返回本人', me && me.username === username, me && me.username)

  await shop.login(username, password)
  check('store 登录后 user 就绪', !!shop.getUser(), shop.getUser())

  await shop.bootstrap()
  shop.init()
  const catalogReady = await waitFor(() => Object.keys(shop.getProductsById()).length === 14)
  const catalog = shop.getProductsById()
  check('store 目录已加载 14 个商品', catalogReady, Object.keys(catalog).length)
  check(
    'store 商品带规格与划线价所需字段',
    catalog.p101 && typeof catalog.p101.stock === 'number' && typeof catalog.p101.originalPrice === 'number',
    catalog.p101,
  )

  // ---------- 4) 按规格加购 → 同步到服务端 ----------
  shop.addToCart('p101', 2, {
    id: sku.id,
    specText: sku.specText,
    price: sku.price,
    image: sku.image,
  })
  shop.addToCart('p102', 1)
  await sleep(800) // 等 store 的串行同步队列完成

  const serverCart = await api.fetchCart()
  check('服务端购物车 2 行(1 规格 + 1 无规格)', serverCart.items.length === 2, serverCart.items)

  const skuLine = serverCart.items.filter((i) => i.skuId !== '0')[0]
  check('服务端回填规格文案', skuLine && skuLine.spec === sku.specText, skuLine && skuLine.spec)
  check('服务端按规格取价', skuLine && skuLine.price === Number(sku.price), skuLine && skuLine.price)

  // 本地视图(购物车页/结算页直接消费的结构)
  const lines = shop.getCartLines()
  check('getCartLines 行带 key/skuId/spec', lines.every((l) => !!l.key && l.skuId !== undefined && l.spec !== undefined), lines[0])
  check(
    'getCartLines 用规格价覆盖商品价',
    lines.filter((l) => l.skuId !== '0').every((l) => l.product.price === Number(sku.price) && l.price === Number(sku.price)),
    lines.map((l) => ({ skuId: l.skuId, price: l.price, productPrice: l.product.price })),
  )

  // ---------- 5) 下单(购物车结算 + 地址快照 + 备注) ----------
  const addr = await api.saveAddress({
    receiver: '集成测试',
    phone: '13800138000',
    region: '广东省深圳市',
    detail: '坂田基地 A 座',
  })
  check('地址创建成功', !!addr.id, addr)

  const order = await shop.checkout(null, { addressId: addr.id, remark: '集成校验' })
  check('下单成功并进入待付款', order && order.status === '待付款', order && order.status)
  check(
    '订单固化收货地址快照',
    order.address && order.address.receiver === '集成测试' && order.address.detail === '坂田基地 A 座',
    order.address,
  )
  check('订单备注落库', order.remark === '集成校验', order.remark)
  check(
    '金额构成 商品金额 + 运费 - 优惠',
    order.goodsAmount === order.amount && order.freight === 0 && order.discount === 0,
    { goods: order.goodsAmount, amount: order.amount, freight: order.freight, discount: order.discount },
  )
  const orderSkuItem = order.items.filter((i) => i.skuId !== '0')[0]
  check('订单明细带规格快照且按规格取价', orderSkuItem && orderSkuItem.spec === sku.specText && orderSkuItem.price === Number(sku.price), orderSkuItem)
  check('初始时间轴仅 create 一条', order.logs.length === 1 && order.logs[0].action === 'create', order.logs)

  await shop.refreshOrders()
  check('购物车结算后已勾选项被清空', (await api.fetchCart()).items.length === 0)

  // ---------- 6) 支付(写支付流水)→ 发货 → 收货 ----------
  const paid = await shop.updateOrderStatus(order.orderId, 'pay')
  check('支付后进入待发货并记录 paidAt', paid.status === '待发货' && paid.paidAt > 0, paid.status)

  const afterPay = await shop.getOrderDetail(order.orderId)
  check('订单详情带支付方式', afterPay.payment && afterPay.payment.status === '已支付', afterPay.payment)
  check('支付流水号已生成', !!(afterPay.payment && afterPay.payment.tradeNo), afterPay.payment)

  const shipped = await shop.updateOrderStatus(order.orderId, 'ship')
  check(
    '发货后带快递公司与运单号',
    shipped.status === '待收货' && !!shipped.shipCompany && !!shipped.trackingNo,
    { status: shipped.status, c: shipped.shipCompany, n: shipped.trackingNo },
  )

  const received = await shop.updateOrderStatus(order.orderId, 'receive')
  check('确认收货后已完成', received.status === '已完成', received.status)

  const finalOrder = await shop.getOrderDetail(order.orderId)
  check('时间轴 4 个节点全部就绪', finalOrder.logs.length === 4, finalOrder.logs.map((l) => l.action))
  check(
    '订单详情页所需派生字段齐备',
    finalOrder.goodsAmount != null &&
      finalOrder.freight != null &&
      finalOrder.discount != null &&
      !!finalOrder.finishedAt &&
      !!finalOrder.address.receiver,
    { goods: finalOrder.goodsAmount, finished: finalOrder.finishedAt },
  )

  // ---------- 7) 库存扣减 ----------
  const skuAfter = (await api.fetchProduct('p101')).skus.filter((s) => s.id === sku.id)[0]
  check('规格库存已扣减 2', skuAfter && skuAfter.stock === sku.stock - 2, { before: sku.stock, after: skuAfter && skuAfter.stock })

  // ---------- 8) 错误路径 ----------
  api.clearToken()
  let err401 = null
  try {
    await api.fetchMe()
  } catch (e) {
    err401 = e
  }
  check('无 token 访问受保护接口 → 401', err401 && err401.status === 401, err401 && err401.status)
  check('401 已清空登录态', !shop.getUser())

  let err404 = null
  try {
    await api.fetchProduct('p999')
  } catch (e) {
    err404 = e
  }
  check('不存在的商品 → 404', err404 && err404.status === 404, err404 && err404.status)

  console.log(`\n[smoke-online] 通过 ${passed} / ${passed + failed}`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error('[smoke-online] 异常:', e)
  process.exit(1)
})
