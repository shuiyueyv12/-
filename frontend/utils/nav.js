// utils/nav —— 自定义导航安全区计算
// 全局 navigationStyle:custom，页面内容需避开顶部胶囊按钮。

function getNavMeta() {
  let win = {}
  if (wx.getWindowInfo) {
    try {
      win = wx.getWindowInfo()
    } catch (e) { /* ignore */ }
  } else if (wx.getSystemInfoSync) {
    try {
      win = wx.getSystemInfoSync()
    } catch (e) { /* ignore */ }
  }
  const statusBarHeight = win.statusBarHeight || 20

  let menuBottom = statusBarHeight + 32 + 6
  if (wx.getMenuButtonBoundingClientRect) {
    try {
      menuBottom = wx.getMenuButtonBoundingClientRect().bottom
    } catch (e) { /* ignore */ }
  }

  // 内容起点：胶囊按钮底部 + 间距（单位 px）
  const navTop = menuBottom + 4
  return {
    statusBarHeight,
    navTop,
    menuBottom,
  }
}

module.exports = { getNavMeta }
