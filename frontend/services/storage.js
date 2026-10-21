// 本地持久化封装
// 与 H5 src/services/storage.js 同签名,内部改为小程序 wx storage。
// 上层调用方(store / api)无需关心实现。

const PREFIX = 'red-tech-mall:v1'

const KEYS = {
  shop: `${PREFIX}:shop`,
  token: `${PREFIX}:token`,
  users: `${PREFIX}:users`, // mock 模式本地账号表 { [username]: { password, user } }
  session: `${PREFIX}:session`, // mock 模式当前登录用户名
  addresses: `${PREFIX}:addresses`, // mock 模式本地收货地址
}

const storage = {
  get(key, fallback = null) {
    try {
      const raw = wx.getStorageSync(key)
      if (raw === '' || raw == null) return fallback
      // 小程序 storage 保存的是原生值(对象/数组/字符串),无需统一 JSON.parse。
      // 仅当读到的确实是「字符串形态的 JSON」时才解析,否则原样返回——
      // 否则 token / 用户名这类普通字符串会被 JSON.parse 抛错吞成 fallback。
      if (typeof raw !== 'string') return raw
      try {
        return JSON.parse(raw)
      } catch (e) {
        return raw
      }
    } catch (e) {
      return fallback
    }
  },
  set(key, value) {
    try {
      wx.setStorageSync(key, value)
    } catch (e) {
      // 忽略写入失败
    }
  },
  remove(key) {
    try {
      wx.removeStorageSync(key)
    } catch (e) {
      // ignore
    }
  },
}

module.exports = { KEYS, storage }
