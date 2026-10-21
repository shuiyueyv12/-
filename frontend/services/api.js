// ============================================================
// services/api —— 应用唯一的数据访问入口(面向接口编程)
//
// 双模式:
//   USE_MOCK=false(小程序内):全部走真实后端 HTTP API(wx.request)
//   USE_MOCK=true(Node 工具链回归 / 手动离线预览):保留原 mock 逻辑
//
// 两种模式下方法签名、返回契约完全一致,页面 / store 调用零差异。
// 商品的多图(images)与规格(skus)由 mock/specs.js 确定性派生,
// 与后端 db:seed 灌库结果一致,因此 mock 预览也能看到真实的规格联动。
// ============================================================

const config = require('./config')
const { USE_MOCK, API_BASE_URL } = config
const { storage, KEYS } = require('./storage')

// ---------- mock 依赖(仅 USE_MOCK=true 时启用) ----------
const { products } = require('../mock/products')
const { categories, banners } = require('../mock/categories')
const { mockUser } = require('../mock/user')
const { CAT_ICON, enrichProduct } = require('../mock/specs')

const delay = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms))
const clone = (data) => JSON.parse(JSON.stringify(data))

// ============================================================
// 登录态管理(storage 里单独存 token)
// ============================================================
function getToken() {
  return storage.get(KEYS.token, '')
}
function hasToken() {
  return !!getToken()
}
function setToken(token) {
  storage.set(KEYS.token, token)
}
function clearToken() {
  storage.remove(KEYS.token)
}

let unauthorizedHandler = null
/** 注册 401 全局回调(store 用于清除登录态) */
function onUnauthorized(fn) {
  unauthorizedHandler = fn
}

const createErr = (message, status = 0) => {
  const e = new Error(message || '请求失败')
  e.status = status
  return e
}

// ============================================================
// 网络层:wx.request Promise 封装(USE_MOCK=false)
// ============================================================
function request({ url, method = 'GET', data }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE_URL + url,
      method,
      data,
      header: {
        'content-type': 'application/json',
        ...(hasToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      success(res) {
        const status = res.statusCode || 0
        if (status >= 200 && status < 300) {
          resolve(res.data)
        } else if (status === 401) {
          clearToken()
          if (unauthorizedHandler) unauthorizedHandler()
          reject(createErr((res.data && res.data.message) || '登录已过期,请重新登录', 401))
        } else {
          reject(createErr((res.data && res.data.message) || `请求失败(${status})`, status))
        }
      },
      fail() {
        reject(createErr('网络请求失败,请检查后端服务与网络'))
      },
    })
  })
}

// ============================================================
// mock 实现(USE_MOCK=true),账号存本地 storage
// ============================================================

// 目录预派生:详情形态(含 images/skus)与列表形态(不含,与后端列表接口一致)
const MOCK_CATALOG = products.map((p, i) => enrichProduct(p, i, true))
const MOCK_CATALOG_LITE = MOCK_CATALOG.map((p) => {
  const lite = Object.assign({}, p)
  delete lite.images
  delete lite.skus
  return lite
})

function readMockUsers() {
  const all = storage.get(KEYS.users, {})
  return all && typeof all === 'object' ? all : {}
}

function issueMockToken() {
  const token = `mock-token-${Date.now()}`
  setToken(token)
  return token
}

// 与后端 models/orders.js 的状态机保持一致
const MOCK_TRANSITIONS = {
  pay: { from: '待付款', to: '待发货', timeField: 'paidAt', log: '买家已付款,等待商家发货' },
  ship: { from: '待发货', to: '待收货', timeField: 'shippedAt', log: '商家已发货' },
  receive: { from: '待收货', to: '已完成', timeField: 'finishedAt', log: '买家已确认收货' },
  cancel: { from: '待付款', to: '已取消', timeField: 'canceledAt', log: '订单已取消' },
}

const MOCK_SHIP_COMPANY = '顺丰速运'

function readMockOrders() {
  const saved = storage.get(KEYS.shop, {}) || {}
  return { saved, orders: Array.isArray(saved.orders) ? saved.orders : [] }
}

function writeMockOrders(saved, orders) {
  saved.orders = orders
  storage.set(KEYS.shop, saved)
}

const mock = {
  fetchBanners() {
    return delay().then(() => clone(banners))
  },
  fetchCategories() {
    // 补 icon,与后端 /categories 的下发字段一致
    return delay(60).then(() =>
      clone(
        categories.map((c) => Object.assign({}, c, { icon: CAT_ICON[c.id] || '' })),
      ),
    )
  },
  fetchProducts(filter = {}) {
    return delay(120).then(() => {
      let list = clone(MOCK_CATALOG_LITE)
      const { categoryId, sub, keyword } = filter
      if (categoryId) list = list.filter((p) => p.categoryId === categoryId)
      if (sub) list = list.filter((p) => p.sub === sub)
      if (keyword) {
        const kw = String(keyword).trim().toLowerCase()
        if (kw) {
          list = list.filter((p) =>
            `${p.name}${p.desc}${p.sub}`.toLowerCase().includes(kw),
          )
        }
      }
      return list
    })
  },
  fetchProductByIds(ids = []) {
    return delay(60).then(() => {
      const set = {}
      ids.forEach((id) => (set[id] = true))
      return clone(MOCK_CATALOG_LITE.filter((p) => set[p.id]))
    })
  },
  /** 商品详情(含多图 images 与规格 skus) */
  fetchProduct(id) {
    return delay(80).then(() => {
      const p = MOCK_CATALOG.find((x) => x.id === id)
      if (!p) throw createErr('商品不存在或已下架', 404)
      return clone(p)
    })
  },
  /** 注册:用户名唯一,成功后自动登录 */
  register({ username, password }) {
    return delay(320).then(() => {
      const users = readMockUsers()
      if (users[username]) throw createErr('该用户名已被注册', 409)
      const user = {
        id: `u_${Date.now()}`,
        username,
        nickname: username,
        avatar: '',
        phone: '',
        level: '黄金会员',
        points: 0,
      }
      users[username] = { password, user }
      storage.set(KEYS.users, users)
      storage.set(KEYS.session, username)
      return { token: issueMockToken(), user: clone(user) }
    })
  },
  /** 登录:校验用户名 + 密码 */
  login({ username, password }) {
    return delay(300).then(() => {
      const record = readMockUsers()[username]
      if (!record) throw createErr('该用户名尚未注册', 401)
      if (record.password !== password) throw createErr('用户名或密码错误', 401)
      storage.set(KEYS.session, username)
      return { token: issueMockToken(), user: clone(record.user) }
    })
  },
  fetchMe() {
    return delay(150).then(() => {
      const record = readMockUsers()[storage.get(KEYS.session, '')]
      return clone(record ? record.user : mockUser)
    })
  },
  logout() {
    return delay(120).then(() => {
      clearToken()
      storage.remove(KEYS.session)
      return { ok: true }
    })
  },
  // 以下方法仅在「真实后端」模式下由 store 登录同步调用;
  // mock 模式下不会被调用,保留空实现以防万一。
  fetchFavorites() {
    return delay(50).then(() => [])
  },
  addFavorite() {
    return delay(50).then(() => ({ ok: true }))
  },
  removeFavorite() {
    return delay(50).then(() => ({ ok: true }))
  },
  fetchCart() {
    return delay(50).then(() => ({ items: [] }))
  },
  syncCart() {
    return delay(50).then(() => ({ items: [] }))
  },
  fetchOrders() {
    return delay(50).then(() => [])
  },

  /** 订单详情(mock:直接读本地订单,含时间轴与地址快照) */
  fetchOrderDetail(orderNo) {
    return delay(60).then(() => {
      const { orders } = readMockOrders()
      const order = orders.find((o) => o && o.orderId === orderNo)
      if (!order) throw createErr('订单不存在', 404)
      return clone(order)
    })
  },

  /**
   * 下单(本地生成订单号与快照),返回与后端一致的完整 order 对象。
   * payload.items 为完整明细(不再是前 3 条),便于订单详情页展示。
   */
  submitOrder(payload) {
    return delay(420).then(() => {
      const createdAt = Date.now()
      const orderId = `HT${String(createdAt).slice(-8)}${String(
        Math.floor(Math.random() * 100),
      ).padStart(2, '0')}`
      const items = (payload.items || []).map((l) => ({
        id: l.id,
        skuId: String(l.skuId || 0),
        name: l.name,
        image: l.image,
        spec: l.spec || '',
        price: l.price,
        qty: l.qty,
      }))
      const goodsAmount = items.reduce((s, l) => s + l.price * l.qty, 0)
      const freight = 0
      const discount = 0
      return {
        orderId,
        status: '待付款',
        amount: goodsAmount + freight - discount,
        goodsAmount,
        freight,
        discount,
        count: items.reduce((n, l) => n + l.qty, 0),
        remark: payload.remark || '',
        createdAt,
        // 收货地址快照(真实后端按下单时选的地址固化)
        address: clone(
          payload.addressSnapshot || { receiver: '', phone: '', region: '', detail: '' },
        ),
        shipCompany: '',
        trackingNo: '',
        paidAt: null,
        shippedAt: null,
        finishedAt: null,
        canceledAt: null,
        items,
        logs: [
          {
            id: `${orderId}-1`,
            orderNo: orderId,
            fromStatus: '',
            toStatus: '待付款',
            action: 'create',
            operator: 'user',
            remark: '订单已提交,等待付款',
            createdAt,
          },
        ],
      }
    })
  },

  /** 订单状态流转(与后端状态机一致:改状态 + 记时间 + 写时间轴 + 补物流) */
  updateOrderStatus(orderId, action) {
    return delay(200).then(() => {
      const rule = MOCK_TRANSITIONS[action]
      if (!rule) throw createErr('不支持的操作', 400)
      const { saved, orders } = readMockOrders()
      const order = orders.find((o) => o && o.orderId === orderId)
      if (!order) throw createErr('订单不存在', 404)
      if (order.status !== rule.from) throw createErr(`当前状态(${order.status})不支持该操作`, 400)

      const now = Date.now()
      order.status = rule.to
      order[rule.timeField] = now
      if (action === 'ship') {
        order.shipCompany = MOCK_SHIP_COMPANY
        order.trackingNo = `SF${now}000`
      }
      const logs = order.logs || []
      logs.push({
        id: `${orderId}-${logs.length + 1}`,
        orderNo: orderId,
        fromStatus: rule.from,
        toStatus: rule.to,
        action,
        operator: 'user',
        remark: action === 'ship' ? `${rule.log} · ${order.shipCompany} ${order.trackingNo}` : rule.log,
        createdAt: now,
      })
      order.logs = logs
      writeMockOrders(saved, orders)
      return { ok: true, order: clone(order) }
    })
  },

  // ---------- 收货地址(mock 本地持久化) ----------
  fetchAddresses() {
    return delay(60).then(() => clone(storage.get(KEYS.addresses, []) || []))
  },
  saveAddress(data) {
    return delay(200).then(() => {
      const list = (storage.get(KEYS.addresses, []) || []).slice()
      const isFirst = list.length === 0
      const addr = {
        id: `a_${Date.now()}`,
        receiver: data.receiver,
        phone: data.phone,
        region: data.region || '',
        detail: data.detail,
        isDefault: isFirst || !!data.isDefault,
      }
      if (addr.isDefault) list.forEach((a) => (a.isDefault = false))
      list.unshift(addr)
      storage.set(KEYS.addresses, list)
      return clone(addr)
    })
  },
  updateAddress(id, data) {
    return delay(200).then(() => {
      const list = (storage.get(KEYS.addresses, []) || []).slice()
      const addr = list.find((a) => a.id === id)
      if (!addr) throw createErr('地址不存在', 404)
      addr.receiver = data.receiver
      addr.phone = data.phone
      addr.region = data.region || ''
      addr.detail = data.detail
      addr.isDefault = !!data.isDefault
      if (addr.isDefault) list.forEach((a) => (a.id !== id && (a.isDefault = false)))
      storage.set(KEYS.addresses, list)
      return clone(addr)
    })
  },
  removeAddress(id) {
    return delay(150).then(() => {
      const list = (storage.get(KEYS.addresses, []) || []).filter((a) => a.id !== id)
      storage.set(KEYS.addresses, list)
      return { ok: true }
    })
  },
}

// ============================================================
// 统一 API(对外)
// ============================================================
const api = {
  getToken,
  hasToken,
  clearToken,
  onUnauthorized,

  /** 首页轮播 */
  fetchBanners() {
    if (USE_MOCK) return mock.fetchBanners()
    return request({ url: '/banners' })
  },

  /** 分类树(含子分类 subs 与图标 icon) */
  fetchCategories() {
    if (USE_MOCK) return mock.fetchCategories()
    return request({ url: '/categories' })
  },

  /**
   * 商品列表 / 搜索
   * @param {{categoryId?: string, sub?: string, keyword?: string}} filter
   */
  fetchProducts(filter = {}) {
    if (USE_MOCK) return mock.fetchProducts(filter)
    const qs = []
    const { categoryId, sub, keyword } = filter
    if (categoryId) qs.push(`categoryId=${encodeURIComponent(categoryId)}`)
    if (sub) qs.push(`sub=${encodeURIComponent(sub)}`)
    if (keyword && String(keyword).trim()) qs.push(`keyword=${encodeURIComponent(keyword)}`)
    return request({ url: `/products${qs.length ? `?${qs.join('&')}` : ''}` })
  },

  /** 按 id 批量取商品 */
  fetchProductByIds(ids = []) {
    if (USE_MOCK) return mock.fetchProductByIds(ids)
    const arr = ids.filter(Boolean)
    if (!arr.length) return Promise.resolve([])
    return request({ url: `/products?ids=${arr.map(encodeURIComponent).join(',')}` })
  },

  /** 商品详情(含多图 images[] 与规格 skus[]) */
  fetchProduct(id) {
    if (USE_MOCK) return mock.fetchProduct(id)
    return request({ url: `/products/${encodeURIComponent(id)}` })
  },

  /**
   * 注册:用户名 + 密码,成功后自动登录
   * @param {{username: string, password: string}} payload
   * @returns {Promise<{token: string, user: object}>}
   */
  register({ username, password }) {
    if (USE_MOCK) return mock.register({ username, password })
    return request({ url: '/auth/register', method: 'POST', data: { username, password } }).then(
      (r) => {
        if (r && r.token) setToken(r.token)
        return r || {}
      },
    )
  },

  /**
   * 登录:用户名 + 密码
   * @param {{username: string, password: string}} payload
   * @returns {Promise<{token: string, user: object}>}
   */
  login({ username, password }) {
    if (USE_MOCK) return mock.login({ username, password })
    return request({ url: '/auth/login', method: 'POST', data: { username, password } }).then((r) => {
      if (r && r.token) setToken(r.token)
      return r || {}
    })
  },

  /** 启动静默登录:token 换最新用户信息(401 会触发登出) */
  fetchMe() {
    if (USE_MOCK) return mock.fetchMe()
    return request({ url: '/user/me' })
  },

  logout() {
    if (USE_MOCK) return mock.logout()
    // 服务端登出为扩展预留,前端以清除 token 为主
    clearToken()
    return Promise.resolve({ ok: true })
  },

  // ---- 收藏 ----
  fetchFavorites() {
    if (USE_MOCK) return mock.fetchFavorites()
    return request({ url: '/favorites' })
  },
  addFavorite(productId) {
    if (USE_MOCK) return mock.addFavorite()
    return request({ url: `/favorites/${productId}`, method: 'POST' })
  },
  removeFavorite(productId) {
    if (USE_MOCK) return mock.removeFavorite()
    return request({ url: `/favorites/${productId}`, method: 'DELETE' })
  },

  // ---- 购物车(服务端整单覆盖同步;行 = 商品 + 规格) ----
  fetchCart() {
    if (USE_MOCK) return mock.fetchCart()
    return request({ url: '/cart' })
  },
  /** @param {Array<{productId, skuId?, qty, checked}>} items */
  syncCart(items) {
    if (USE_MOCK) return mock.syncCart()
    return request({ url: '/cart', method: 'PUT', data: { items } })
  },

  // ---- 订单 ----
  fetchOrders(limit = 10) {
    if (USE_MOCK) return mock.fetchOrders()
    return request({ url: `/orders?limit=${limit}` })
  },

  /** 订单详情(全部明细 + 收货信息 + 支付方式 + 状态时间轴) */
  fetchOrderDetail(orderNo) {
    if (USE_MOCK) return mock.fetchOrderDetail(orderNo)
    return request({ url: `/orders/${encodeURIComponent(orderNo)}` })
  },

  /**
   * 提交订单。
   * @param {{items: Array, count: number, buyNowItems: Array|null,
   *          addressId?: string|number, addressSnapshot?: object, remark?: string}} payload
   * payload.buyNowItems = [{productId, skuId, qty}]:立即购买(服务端按明细结算);
   * 为 null/空:结算购物车已勾选项(服务端清车)。返回完整 order(初始状态待付款)。
   * payload.addressSnapshot 仅 mock 模式用于固化地址快照。
   */
  submitOrder(payload) {
    if (USE_MOCK) return mock.submitOrder(payload)
    const items = (payload && payload.buyNowItems) || []
    return request({
      url: '/orders',
      method: 'POST',
      data: {
        items,
        addressId: (payload && payload.addressId) || 0,
        remark: (payload && payload.remark) || '',
      },
    })
  },

  /** 订单状态流转。action: pay | ship | receive | cancel。返回 { ok, order } */
  updateOrderStatus(orderId, action) {
    if (USE_MOCK) return mock.updateOrderStatus(orderId, action)
    return request({
      url: `/orders/${encodeURIComponent(orderId)}/status`,
      method: 'POST',
      data: { action },
    })
  },

  /**
   * 支付流水(模拟支付:写流水 + 触发订单 pay 流转)。
   * mock 模式直接复用状态流转,行为与后端一致。
   * @param {string} orderNo
   * @param {string} [method] 'mock' | 'wechat'
   */
  payOrder(orderNo, method) {
    if (USE_MOCK) return mock.updateOrderStatus(orderNo, 'pay')
    return request({ url: '/payments', method: 'POST', data: { orderNo, method: method || 'mock' } })
  },

  // ---- 收货地址 ----
  fetchAddresses() {
    if (USE_MOCK) return mock.fetchAddresses()
    return request({ url: '/addresses' })
  },
  saveAddress(data) {
    if (USE_MOCK) return mock.saveAddress(data)
    return request({ url: '/addresses', method: 'POST', data })
  },
  updateAddress(id, data) {
    if (USE_MOCK) return mock.updateAddress(id, data)
    return request({ url: `/addresses/${encodeURIComponent(id)}`, method: 'PUT', data })
  },
  removeAddress(id) {
    if (USE_MOCK) return mock.removeAddress(id)
    return request({ url: `/addresses/${encodeURIComponent(id)}`, method: 'DELETE' })
  },
}

module.exports = api
