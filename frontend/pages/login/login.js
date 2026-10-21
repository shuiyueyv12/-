// ============================================================
// pages/login —— 用户名 + 密码 登录 / 注册
// ============================================================

const shop = require('../../store/shop')
const { getNavMeta } = require('../../utils/nav')

const showToast = (msg) => wx.showToast({ title: String(msg), icon: 'none', duration: 2000 })

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/

Page({
  data: {
    navTop: 0,
    mode: 'login', // login | register
    username: '',
    password: '',
    confirm: '',
    busy: false,
  },

  onLoad() {
    const { navTop } = getNavMeta()
    this.setData({ navTop })
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode || mode === this.data.mode || this.data.busy) return
    // 切换登录/注册时清空密码,避免误提交
    this.setData({ mode, password: '', confirm: '' })
  },

  onUsername(e) {
    this.setData({ username: e.detail.value })
  },
  onPassword(e) {
    this.setData({ password: e.detail.value })
  },
  onConfirm(e) {
    this.setData({ confirm: e.detail.value })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/profile/profile' })
  },

  submit() {
    if (this.data.busy) return
    const username = this.data.username.trim()
    const { password, confirm, mode } = this.data

    if (!USERNAME_RE.test(username)) {
      showToast('用户名需为 3-20 位字母、数字或下划线')
      return
    }
    if (password.length < 6 || password.length > 64) {
      showToast('密码长度需为 6-64 位')
      return
    }
    if (mode === 'register' && password !== confirm) {
      showToast('两次输入的密码不一致')
      return
    }

    this.setData({ busy: true })
    const task =
      mode === 'register' ? shop.register(username, password) : shop.login(username, password)
    task
      .then((user) => {
        if (!user) return
        showToast(mode === 'register' ? '注册成功，已自动登录' : `欢迎回来，${user.nickname}`)
        setTimeout(() => this.goBack(), 700)
      })
      .catch((err) => showToast((err && err.message) || '操作失败，请重试'))
      .finally(() => this.setData({ busy: false }))
  },
})
