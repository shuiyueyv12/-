// app.js —— 小程序入口
// 全局状态(store/shop.js)以 CommonJS 单例方式被各页面直接 require,
// 因此这里只做最小启动钩子:目录预加载 + 静默登录恢复账号态。
App({
  globalData: {
    // 跨页面瞬时参数(等价 H5 的 URL query)
    pendingCat: '', // 首页分类宫格 -> 分类页的联动目标('all' | categoryId)
    pendingAddressId: '', // 地址页 -> 确认订单页的选中地址
  },

  onLaunch() {
    const shop = require('./store/shop')
    // 预加载商品目录与分类(全局状态单例缓存,供各页面同步消费)
    shop.init()
    // 静默登录:有 token 则刷新用户信息并拉取收藏/购物车/订单(失败不打扰)
    shop.bootstrap()
  },
})
