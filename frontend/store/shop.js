// ============================================================
// store/shop —— 全局共享状态(单例 + 订阅发布)
// 对应 H5 的 store/ShopContext.jsx,收敛跨页面状态:
//   用户会话 user、收藏 liked、购物车 cart、订单历史 orders、
//   商品目录 products/categories,以及全部派生数据与动作。
//
// 后端接入模式(USE_MOCK=false):
//   - 商品目录 / 分类 / 轮播:一律来自后端只读接口;
//   - 收藏 / 购物车 / 订单:登录后以「服务端为准」,本地乐观更新并异步同步;
//   - 注册 / 登录:用户名 + 密码,后端签发 token;退出:清 token 与账号态;
//   - bootstrap():启动时用本地 token 拉取账号数据,失效则清态;
//   - checkout():网络模式下未登录会提示先登录(订单需归属账号)。
//
// 离线/mock 模式(USE_MOCK=true,Node 回归与手动预览):
//   保持原「本地持久化 + 游客可用」行为不变。
// ============================================================

const api = require('../services/api')
const config = require('../services/config')
const { storage, KEYS } = require('../services/storage')
const { formatPrice, formatTime } = require('../utils/format')

const ONLINE = !config.USE_MOCK

const DEFAULT_STATE = {
  user: null, // 用户会话
  liked: [], // 收藏商品 id
  // 购物车行 =「商品 + 规格」,skuId '0' 表示无规格商品
  // [{ productId, skuId, qty, checked, spec, price, image }]
  // spec / price / image 是规格展示缓存,在线模式下由服务端购物车接口刷新覆盖
  cart: [],
  // 订单(含快照 items、收货信息 address、金额构成、状态时间轴 logs)
  orders: [],
}

/** 购物车行唯一键:同一商品的不同规格各占一行 */
const cartKey = (productId, skuId) => `${productId}#${skuId || 0}`
const normSkuId = (skuId) => String(skuId || 0)

/** 补齐规格展示缓存,统一本地行结构 */
function normalizeCartItem(i) {
  return {
    productId: i.productId,
    skuId: normSkuId(i.skuId),
    qty: i.qty,
    checked: !!i.checked,
    spec: i.spec || '',
    price: i.price != null && i.price !== '' ? Number(i.price) : null,
    image: i.image || '',
  }
}

// ---------- 内部状态 ----------
let state = loadInitialState()
let products = [] // 完整商品目录
let productsById = {}
let categories = []
let catalogReady = false
const listeners = new Set()

function loadInitialState() {
  const saved = storage.get(KEYS.shop)
  if (!saved || typeof saved !== 'object') return Object.assign({}, DEFAULT_STATE)
  return {
    user: saved.user != null ? saved.user : null,
    liked: Array.isArray(saved.liked) ? saved.liked.slice() : [],
    cart: Array.isArray(saved.cart) ? saved.cart.slice() : [],
    orders: Array.isArray(saved.orders) ? saved.orders.slice() : [],
  }
}

function persist() {
  storage.set(KEYS.shop, state)
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch (e) {
      // 页面回调异常不影响其他订阅者
    }
  })
}

function setState(partial) {
  state = Object.assign({}, state, partial)
  persist()
  notify()
}

function toast(message) {
  wx.showToast({ title: String(message), icon: 'none', duration: 2200 })
}

// ---------- 后端同步辅助 ----------
function canSync() {
  return ONLINE && !!state.user
}

// 推送给服务端的行结构(规格展示缓存不参与同步)
const cartRemote = (cart) =>
  cart.map((i) => ({
    productId: i.productId,
    skuId: normSkuId(i.skuId),
    qty: i.qty,
    checked: !!i.checked,
  }))

function sameCart(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].productId !== b[i].productId ||
      normSkuId(a[i].skuId) !== normSkuId(b[i].skuId) ||
      a[i].qty !== b[i].qty ||
      !!a[i].checked !== !!b[i].checked
    )
      return false
  }
  return true
}

// 购物车同步串行化(避免并发覆盖)
let cartSyncChain = Promise.resolve()
function pushCart(before, snapshot) {
  if (!canSync()) return Promise.resolve()
  cartSyncChain = cartSyncChain
    .catch(() => {})
    .then(() => api.syncCart(snapshot))
    .then((resp) => {
      // 真实后端返回过滤/去重后的购物车,以服务端为准刷新本地
      // (服务端会补回规格文案/单价/主图,这里一并采用)
      if (resp && Array.isArray(resp.items) && !sameCart(resp.items, snapshot)) {
        setState({ cart: resp.items.map(normalizeCartItem) })
      }
    })
    .catch(() => {
      // 仅当本地未再发生更新时回滚,避免覆盖更新的用户操作
      if (sameCart(cartRemote(state.cart), snapshot)) setState({ cart: before })
      toast('购物车同步失败,请检查网络')
    })
  return cartSyncChain
}

/** 登录后/合并完成后,把当前购物车推送到服务端 */
function pushCurrentCart() {
  return pushCart(state.cart.slice(), cartRemote(state.cart))
}

function pushLike(productId, isLike, before) {
  if (!canSync()) return Promise.resolve()
  const op = isLike ? api.addFavorite(productId) : api.removeFavorite(productId)
  return op.catch(() => {
    // 本地与本次操作目标一致时才回滚(防止覆盖更晚的切换)
    if (state.liked.indexOf(productId) > -1 === isLike) setState({ liked: before })
    toast('收藏同步失败,请检查网络')
  })
}

/** 合并购物车:服务端为底,补入本地(游客)新增;同「商品+规格」数量相加、勾选相或 */
function mergeCart(serverItems, localCart) {
  const map = new Map(
    serverItems.map((i) => [cartKey(i.productId, i.skuId), normalizeCartItem(i)]),
  )
  localCart.forEach((li) => {
    const item = normalizeCartItem(li)
    const ex = map.get(cartKey(item.productId, item.skuId))
    if (!ex) {
      map.set(cartKey(item.productId, item.skuId), item)
    } else {
      ex.qty = Math.min(99, ex.qty + item.qty)
      ex.checked = !!(ex.checked || item.checked)
      if (!ex.spec && item.spec) ex.spec = item.spec
    }
  })
  return Array.from(map.values())
}

/**
 * 登录成功后从服务端拉取用户态数据并合并:
 * 收藏取并集、购物车合并(同商品相加)、订单以服务端为准。
 * 仅在真实后端模式下生效(mock 保持原本地行为)。
 */
function afterLoginPull() {
  if (!ONLINE) return Promise.resolve()
  const localLiked = state.liked.slice()
  const localCart = state.cart.slice()
  return Promise.all([
    api.fetchFavorites().catch(() => null),
    api.fetchCart().catch(() => null),
    api.fetchOrders(10).catch(() => null),
  ]).then(async ([serverFavs, serverCartResp, serverOrders]) => {
    // 三个接口全挂(网络不可用):保留本地缓存,不做破坏性合并
    if (serverFavs == null && serverCartResp == null && serverOrders == null) return

    const serverLiked = Array.isArray(serverFavs) ? serverFavs.map((p) => p.id) : null
    const serverItems =
      serverCartResp && Array.isArray(serverCartResp.items) ? serverCartResp.items : null
    const serverOrderList = Array.isArray(serverOrders) ? serverOrders : null

    if (serverLiked != null) {
      const liked = Array.from(new Set(serverLiked.concat(localLiked)))
      setState({ liked })
      const serverSet = new Set(serverLiked)
      const localSet = new Set(localLiked)
      liked.forEach((id) => {
        if (!serverSet.has(id)) api.addFavorite(id).catch(() => {})
      })
      serverLiked.forEach((id) => {
        if (!localSet.has(id)) api.removeFavorite(id).catch(() => {})
      })
    }

    if (serverItems != null) {
      const merged = mergeCart(serverItems, localCart)
      setState({ cart: merged })
      // 合并结果与服务端不一致时回写(串行队列);登录后立刻下单需等它完成
      if (!sameCart(cartRemote(merged), cartRemote(serverItems))) {
        await pushCurrentCart()
      }
    }

    if (serverOrderList != null) {
      setState({ orders: serverOrderList.slice(0, 10) })
    }
  })
}

// ---------- 商品目录 ----------
function rebuildIndex(list) {
  products = list
  productsById = {}
  list.forEach((p) => {
    productsById[p.id] = p
  })
}

/** 初始化:拉取商品目录与分类(仅需一次) */
function init() {
  api.fetchProducts().then((list) => {
    rebuildIndex(list)
    catalogReady = true
    notify()
  })
  api.fetchCategories().then((list) => {
    categories = list
    notify()
  })
}

/** 页面列表装饰:补展示字段 */
function decorate(product) {
  if (!product) return product
  if (product.priceText !== undefined) return product
  return Object.assign({}, product, {
    priceText: formatPrice(product.price),
  })
}

// ============================================================
// 对外只读视图(页面订阅后从这里取值渲染)
// ============================================================
const view = {
  getUser() {
    return state.user
  },
  getOrders() {
    return state.orders
  },
  isLiked(id) {
    return state.liked.indexOf(id) > -1
  },
  isCatalogReady() {
    return catalogReady
  },

  getProducts() {
    return products.slice()
  },
  getProductsById() {
    return productsById
  },
  getCategories() {
    return categories.slice()
  },
  /** 精选好物(首页) */
  getFeaturedProducts() {
    return products.filter((p) => p.featured).map(decorate)
  },

  /**
   * 购物车行(join 商品目录后的完整视图)。
   * 有规格的行,product.price / priceText / image 已被规格值覆盖,
   * 因此「按规格取价、按行取主图」在购物车与结算页都自然生效。
   */
  getCartLines() {
    return state.cart
      .map((item) => {
        const product = productsById[item.productId]
        if (!product) return null
        const skuId = normSkuId(item.skuId)
        const price = item.price != null ? item.price : Number(product.price)
        const image = item.image || product.image
        return {
          key: cartKey(item.productId, skuId),
          productId: item.productId,
          skuId,
          spec: item.spec || '',
          price,
          image,
          qty: item.qty,
          checked: item.checked,
          product: Object.assign({}, decorate(product), {
            price,
            priceText: formatPrice(price),
            image,
          }),
        }
      })
      .filter(Boolean)
  },

  getCartTotalQty() {
    return state.cart.reduce((sum, item) => sum + item.qty, 0)
  },

  getCheckedInfo() {
    const lines = view.getCartLines().filter((l) => l.checked)
    const count = lines.reduce((sum, l) => sum + l.qty, 0)
    const amount = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0)
    return { count, amount, amountText: formatPrice(amount) }
  },

  getAllChecked() {
    const lines = view.getCartLines()
    return lines.length > 0 && lines.every((l) => l.checked)
  },

  getCartCount() {
    return state.cart.length
  },

  /** 收藏商品完整列表(我的页) */
  getFavoriteProducts() {
    return state.liked
      .map((id) => productsById[id])
      .filter(Boolean)
      .map(decorate)
  },

  /** 最近订单(含展示文本) */
  getRecentOrders() {
    return state.orders.map((order) =>
      Object.assign({}, order, {
        amountText: formatPrice(order.amount),
        timeText: formatTime(order.createdAt),
      }),
    )
  },
}

// ============================================================
// 动作
// ============================================================
function toggleLike(id) {
  const before = state.liked.slice()
  const isLike = before.indexOf(id) === -1
  setState({ liked: isLike ? before.concat(id) : before.filter((x) => x !== id) })
  toast(isLike ? '已收藏' : '已取消收藏')
  pushLike(id, isLike, before)
}

/**
 * 加入购物车。
 * @param {string} id
 * @param {number} [qty]
 * @param {{id: string|number, specText?: string, price?: number, image?: string}} [sku]
 *   商品详情页选中规格后传入,用于记录规格维度与展示缓存(文案/单价/主图);
 *   列表卡片加购不传,等价于「无规格商品」(skuId = 0)。
 */
function addToCart(id, qty, sku) {
  const add = Math.max(1, Math.min(99, Number(qty) || 1))
  const skuId = normSkuId(sku && sku.id)
  const key = cartKey(id, skuId)
  const before = state.cart.slice()
  const existed = state.cart.some((item) => cartKey(item.productId, item.skuId) === key)
  const patch = {
    spec: (sku && sku.specText) || '',
    price: sku && sku.price != null ? Number(sku.price) : null,
    image: (sku && sku.image) || '',
  }
  const cart = existed
    ? state.cart.map((item) =>
        cartKey(item.productId, item.skuId) === key
          ? Object.assign({}, item, patch, { qty: Math.min(99, item.qty + add) })
          : item,
      )
    : state.cart.concat(Object.assign({ productId: id, skuId, qty: add, checked: true }, patch))
  setState({ cart })
  toast('已加入购物车')
  pushCart(before, cartRemote(cart))
}

function changeQty(productId, qty, skuId) {
  const key = cartKey(productId, skuId)
  const before = state.cart.slice()
  const cart = state.cart
    .map((item) =>
      cartKey(item.productId, item.skuId) === key
        ? Object.assign({}, item, { qty: Math.max(1, qty) })
        : item,
    )
    .filter((item) => item.qty > 0)
  setState({ cart })
  pushCart(before, cartRemote(cart))
}

function removeFromCart(productId, skuId) {
  const key = cartKey(productId, skuId)
  const before = state.cart.slice()
  const cart = state.cart.filter((item) => cartKey(item.productId, item.skuId) !== key)
  setState({ cart })
  toast('已删除')
  pushCart(before, cartRemote(cart))
}

function setItemChecked(productId, checked, skuId) {
  const key = cartKey(productId, skuId)
  const before = state.cart.slice()
  const cart = state.cart.map((item) =>
    cartKey(item.productId, item.skuId) === key ? Object.assign({}, item, { checked }) : item,
  )
  setState({ cart })
  pushCart(before, cartRemote(cart))
}

function setAllChecked(checked) {
  const before = state.cart.slice()
  const cart = state.cart.map((item) => Object.assign({}, item, { checked }))
  setState({ cart })
  pushCart(before, cartRemote(cart))
}

/** 编辑模式:删除全部勾选项 */
function removeCheckedItems() {
  const willRemove = state.cart.filter((item) => item.checked).length
  if (willRemove === 0) {
    toast('请先选择要删除的商品')
    return
  }
  const before = state.cart.slice()
  const cart = state.cart.filter((item) => !item.checked)
  setState({ cart })
  toast(`已删除 ${willRemove} 件商品`)
  pushCart(before, cartRemote(cart))
}

/**
 * 结算:提交订单。
 * @param {Array<{productId: string, skuId?: string|number, qty: number, spec?: string, price?: number, image?: string}>} [buyNowItems]
 *   立即购买明细;不传 = 结算购物车已勾选项(下单后清掉勾选项)。
 * @param {{addressId?: string|number, addressSnapshot?: object, remark?: string}} [options]
 *   addressId 为服务端收货地址 id(下单时固化成地址快照);
 *   addressSnapshot 仅 mock 模式用于生成本地订单的地址快照;
 *   remark 为买家备注。
 * 成功返回 order(初始状态「待付款」,含金额构成与状态时间轴)。
 */
function checkout(buyNowItems, options) {
  const opts = options || {}
  let items = null
  if (buyNowItems) {
    items = buyNowItems
      .map((i) => ({
        productId: i.productId,
        skuId: normSkuId(i.skuId),
        qty: Math.max(1, Math.min(99, Number(i.qty) || 1)),
        spec: i.spec || '',
        price: i.price != null ? Number(i.price) : null,
        image: i.image || '',
      }))
      .filter((i) => productsById[i.productId])
    if (!items.length) {
      toast('商品不存在或已下架')
      return Promise.resolve(null)
    }
  } else if (!state.cart.some((item) => item.checked)) {
    toast('请先选择要结算的商品')
    return Promise.resolve(null)
  }

  const lines = (buyNowItems ? items : state.cart.filter((item) => item.checked))
    .map((item) => {
      const product = productsById[item.productId]
      if (!product) return null
      // 有规格时以规格价 / 规格主图为准(与购物车行同一套取价规则)
      const price = item.price != null ? item.price : Number(product.price)
      return {
        id: product.id,
        skuId: normSkuId(item.skuId),
        name: product.name,
        image: item.image || product.image,
        spec: item.spec || '',
        price,
        qty: item.qty,
      }
    })
    .filter(Boolean)
  const totalAmount = lines.reduce((sum, line) => sum + line.price * line.qty, 0)
  const count = lines.reduce((n, l) => n + l.qty, 0)

  const payload = {
    // mock 模式据此生成本地订单;完整明细(不再是前 3 条),便于订单详情页展示
    items: lines,
    totalAmount,
    count,
    remark: opts.remark || '',
    addressId: opts.addressId || 0,
    addressSnapshot: opts.addressSnapshot || null,
    // 网络模式:有值 = 服务端按明细结算(立即购买);无 = 结算购物车并清车
    buyNowItems: buyNowItems
      ? items.map((i) => ({ productId: i.productId, skuId: i.skuId, qty: i.qty }))
      : null,
  }

  const doSubmit = () =>
    api
      .submitOrder(payload)
      .then((order) => {
        setState({
          cart: buyNowItems ? state.cart : state.cart.filter((item) => !item.checked),
          orders: [order].concat(state.orders).slice(0, 10),
        })
        toast(`下单成功 · 订单号 ${order.orderId}`)
        return order
      })
      .catch((err) => {
        toast((err && err.message) || '下单失败,请重试')
        throw err
      })

  if (!state.user && ONLINE) {
    // 网络模式:订单需归属账号,未登录时提示先登录(页面据此跳转登录页)
    const err = new Error('请先登录后再结算')
    err.needLogin = true
    toast('请先登录后再结算')
    return Promise.reject(err)
  }
  return doSubmit()
}

// ---------- 订单状态机(与后端一致) ----------
const ORDER_ACTIONS = {
  pay: { from: '待付款', to: '待发货', tip: '支付成功' },
  ship: { from: '待发货', to: '待收货', tip: '已发货' },
  receive: { from: '待收货', to: '已完成', tip: '确认收货成功' },
  cancel: { from: '待付款', to: '已取消', tip: '订单已取消' },
}

/**
 * 订单状态流转:pay 支付 / ship 发货 / receive 确认收货 / cancel 取消。
 * 服务端会返回完整订单(全量明细 + 收货信息 + 履约时间 + 状态时间轴),
 * 这里整体覆盖本地缓存,订单详情页因此能立刻拿到新增的时间轴节点。
 * pay 走 /payments 接口(写支付流水),其余走订单状态接口。
 * @param {string} orderId
 * @param {'pay'|'ship'|'receive'|'cancel'} action
 * @param {string} [method] 支付方式 'mock' | 'wechat'
 */
function updateOrderStatus(orderId, action, method) {
  const rule = ORDER_ACTIONS[action]
  const order = state.orders.find((o) => o && o.orderId === orderId)
  if (!rule || !order) {
    toast('订单不存在')
    return Promise.resolve(null)
  }
  if (order.status !== rule.from) {
    toast(`当前状态(${order.status})不支持该操作`)
    return Promise.resolve(null)
  }

  const applyOrder = (serverOrder) => {
    const updated = Object.assign({}, order, serverOrder || {}, {
      status: (serverOrder && serverOrder.status) || rule.to,
    })
    setState({ orders: state.orders.map((o) => (o.orderId === orderId ? updated : o)) })
    toast(rule.tip)
    return updated
  }

  const req = action === 'pay' ? api.payOrder(orderId, method) : api.updateOrderStatus(orderId, action)
  return req
    .then((resp) => applyOrder(resp && resp.order))
    .catch((err) => {
      toast((err && err.message) || '操作失败,请重试')
      return null
    })
}

/**
 * 订单详情:拉全量明细 + 收货信息 + 支付方式 + 状态时间轴。
 * 接口失败时回退本地缓存,保证弱网下详情页仍可展示。
 */
function getOrderDetail(orderId) {
  const local = state.orders.find((o) => o && o.orderId === orderId) || null
  return api
    .fetchOrderDetail(orderId)
    .then((order) => {
      if (!order) return local
      const merged = Object.assign({}, local, order)
      setState({ orders: state.orders.map((o) => (o.orderId === orderId ? merged : o)) })
      return merged
    })
    .catch(() => local)
}

/** 刷新订单列表(网络模式从服务端拉取;mock 本地即权威,直接返回) */
function refreshOrders() {
  if (!ONLINE) return Promise.resolve(state.orders)
  return api
    .fetchOrders(10)
    .then((list) => {
      setState({ orders: Array.isArray(list) ? list.slice(0, 10) : [] })
      return state.orders
    })
    .catch(() => state.orders)
}

/**
 * 登录(用户名 + 密码)。失败会 reject,由页面提示错误信息。
 * 成功后写入会话,网络模式下继续拉取/合并账号数据。
 */
function login(username, password) {
  return api.login({ username, password }).then(({ user }) => {
    if (!user) return null
    setState({ user })
    if (ONLINE) return afterLoginPull().catch(() => {}).then(() => user)
    return user
  })
}

/** 注册(用户名 + 密码),成功后自动登录。失败会 reject。 */
function register(username, password) {
  return api.register({ username, password }).then(({ user }) => {
    if (!user) return null
    setState({ user })
    if (ONLINE) return afterLoginPull().catch(() => {}).then(() => user)
    return user
  })
}

/** 退出登录:清 token 与账号态(收藏/购物车/订单) */
function logout() {
  return api
    .logout()
    .catch(() => {})
    .then(() => {
      setState({ user: null, liked: [], cart: [], orders: [] })
      toast('已退出登录')
    })
}

/**
 * 启动钩子:注册 401 回调 + 会话恢复。
 * - 真实后端:本地有 token → /user/me 刷新并拉取账号数据;
 * - mock:登录态已由本地 storage 恢复,无需额外处理。
 */
function bootstrap() {
  if (!ONLINE) return Promise.resolve(null)
  api.onUnauthorized(() => {
    setState({ user: null, liked: [], cart: [], orders: [] })
  })
  if (!api.hasToken()) return Promise.resolve(null)
  return api
    .fetchMe()
    .then((user) => {
      setState({ user })
      return afterLoginPull().catch(() => {})
    })
    .catch((err) => {
      // 401 已在 api 层清 token,这里同步清账号态;网络错误则沿用本地缓存
      if (err && err.status === 401) {
        setState({ user: null, liked: [], cart: [], orders: [] })
      }
    })
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

module.exports = Object.assign(
  {
    init,
    bootstrap,
    subscribe,
    toggleLike,
    addToCart,
    changeQty,
    removeFromCart,
    setItemChecked,
    setAllChecked,
    removeCheckedItems,
    checkout,
    updateOrderStatus,
    getOrderDetail,
    refreshOrders,
    login,
    register,
    logout,
  },
  view,
)
