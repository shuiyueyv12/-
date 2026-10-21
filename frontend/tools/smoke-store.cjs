// ============================================================
// tools/smoke-store.cjs —— 全局状态单例回归测试（Node 环境模拟 wx）
// 运行：node tools/smoke-store.cjs
// 说明：根 package.json 为 "type": "module"，故测试文件用 .cjs 扩展名；
//      小程序内 JS 均为 CommonJS，不受影响。
// ============================================================

// ---- 模拟 wx 小程序环境 ----
const memStorage = {}
global.wx = {
  getStorageSync: (k) => (k in memStorage ? memStorage[k] : ''),
  setStorageSync: (k, v) => { memStorage[k] = v },
  removeStorageSync: (k) => { delete memStorage[k] },
  showToast: () => {},
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const shop = require('../store/shop')
  const { products } = require('../mock/products')
  const assert = require('assert')

  assert.ok(!shop.isCatalogReady(), '目录初始未就绪')

  shop.init()
  await sleep(400)
  assert.ok(shop.isCatalogReady(), 'init 后目录就绪')
  assert.strictEqual(shop.getCategories().length, 4, '分类 4 个')
  assert.strictEqual(shop.getFeaturedProducts().length, 4, '精选 4 个')
  assert.ok(shop.getFeaturedProducts()[0].priceText, '装饰 priceText')

  const p1 = products[0]
  const p2 = products[4]

  // 收藏
  shop.toggleLike(p1.id)
  assert.ok(shop.isLiked(p1.id), '已收藏 p1')
  assert.strictEqual(shop.getFavoriteProducts().length, 1, '收藏列表 1')
  shop.toggleLike(p1.id)
  assert.ok(!shop.isLiked(p1.id), '取消收藏')

  // 加购
  shop.addToCart(p1.id)
  shop.addToCart(p1.id)
  shop.addToCart(p2.id)
  assert.strictEqual(shop.getCartTotalQty(), 3, '购物车总数 3')
  assert.strictEqual(shop.getCartLines().length, 2, '购物车行数 2')
  assert.strictEqual(shop.getCartCount(), 2, 'SKU 数 2')

  // 勾选 / 改量
  shop.setItemChecked(p2.id, false)
  let checked = shop.getCheckedInfo()
  assert.strictEqual(checked.count, 2, '勾选数量 2')
  assert.strictEqual(checked.amount, p1.price * 2, '勾选金额')
  assert.ok(!shop.getAllChecked(), '未全选')
  shop.setAllChecked(true)
  assert.ok(shop.getAllChecked(), '全选')

  shop.changeQty(p1.id, 5)
  assert.strictEqual(shop.getCartTotalQty(), 6, '改量后总数 6')

  // 结算前仅勾选 p1（p2 保持未勾选，结算后应保留）
  shop.setItemChecked(p2.id, false)

  // 结算下单
  const order = await shop.checkout()
  assert.ok(order && order.orderId, '下单成功')
  assert.strictEqual(order.status, '待付款', '订单初始状态待付款')
  assert.strictEqual(shop.getOrders().length, 1, '订单记录 1')
  assert.strictEqual(shop.getCartLines().length, 1, '结算后仅剩未勾选商品')
  assert.strictEqual(shop.getCartLines()[0].productId, p2.id, '剩余商品为 p2')
  assert.strictEqual(shop.getRecentOrders()[0].orderId, order.orderId, '最近订单一致')
  assert.ok(shop.getRecentOrders()[0].amountText, '订单金额文本')

  // 订单状态机:待付款 → 待发货 → 待收货 → 已完成
  const paid = await shop.updateOrderStatus(order.orderId, 'pay')
  assert.ok(paid && paid.status === '待发货', '支付后待发货')
  const shipped = await shop.updateOrderStatus(order.orderId, 'ship')
  assert.ok(shipped && shipped.status === '待收货', '发货后待收货')
  const done = await shop.updateOrderStatus(order.orderId, 'receive')
  assert.ok(done && done.status === '已完成', '确认收货后已完成')
  assert.ok(!(await shop.updateOrderStatus(order.orderId, 'pay')), '已完成订单不可再流转')

  // 立即购买:按明细下单,不清购物车
  const buyOrder = await shop.checkout([{ productId: p2.id, qty: 2 }])
  assert.ok(buyOrder && buyOrder.status === '待付款' && buyOrder.count === 2, '立即购买下单')
  assert.strictEqual(shop.getCartLines().length, 1, '立即购买不影响购物车')
  const cancelled = await shop.updateOrderStatus(buyOrder.orderId, 'cancel')
  assert.ok(cancelled && cancelled.status === '已取消', '取消订单')

  // 注册 / 登录 / 登出（用户名 + 密码）
  const regUser = await shop.register('tester', 'abc123')
  assert.ok(regUser && shop.getUser() && shop.getUser().nickname === 'tester', '注册后自动登录')
  await shop.register('tester', 'abc123').then(
    () => assert.fail('重复用户名注册应失败'),
    (e) => assert.strictEqual(e.status, 409, '重复用户名注册 → 409'),
  )
  await shop.login('tester', 'wrongpass').then(
    () => assert.fail('密码错误登录应失败'),
    (e) => assert.strictEqual(e.status, 401, '密码错误登录 → 401'),
  )
  await shop.logout()
  assert.strictEqual(shop.getUser(), null, '登出')

  const user = await shop.login('tester', 'abc123')
  assert.ok(user && shop.getUser() && shop.getUser().nickname === 'tester', '登录成功')

  // 删除与持久化
  shop.removeFromCart(p2.id)
  assert.strictEqual(shop.getCartLines().length, 0, '删除后购物车空')
  await shop.logout()
  assert.strictEqual(shop.getUser(), null, '登出')

  assert.ok(global.wx.getStorageSync('red-tech-mall:v1:shop'), '持久化已写入')

  console.log('smoke-store: ALL PASS OK')
}

main().catch((e) => {
  console.error('smoke-store: FAIL')
  console.error(e)
  process.exit(1)
})
