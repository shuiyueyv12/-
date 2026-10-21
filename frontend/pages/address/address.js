// ============================================================
// pages/address —— 收货地址管理:列表 / 新增 / 编辑 / 删除 / 设默认
//   ?picker=1  由确认订单页进入,点击地址即回传并返回
// ============================================================

const api = require('../../services/api')
const shop = require('../../store/shop')
const config = require('../../services/config')
const { getNavMeta } = require('../../utils/nav')

const showToast = (msg) => wx.showToast({ title: String(msg), icon: 'none', duration: 2000 })
const ONLINE = !config.USE_MOCK

const EMPTY_FORM = { id: '', receiver: '', phone: '', region: '', detail: '' }

Page({
  data: {
    navTop: 0,
    picker: false,
    list: [],
    editing: false, // 是否显示表单
    isDefault: false,
    form: EMPTY_FORM,
    saving: false,
  },

  onLoad(query) {
    const { navTop } = getNavMeta()
    this.setData({ navTop, picker: query.picker === '1' })
  },

  onShow() {
    this.load()
  },

  /** 网络模式下游客请求受保护接口会 401,未登录直接显示空态 */
  guestBlocked() {
    return ONLINE && !shop.getUser()
  },

  load() {
    if (this.guestBlocked()) {
      this.setData({ list: [] })
      return
    }
    api
      .fetchAddresses()
      .then((list) => this.setData({ list: Array.isArray(list) ? list : [] }))
      .catch(() => showToast('地址加载失败,请重试'))
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/profile/profile' })
  },

  // ---------- 选择模式 ----------
  onItemTap(e) {
    if (this.data.picker) this.pickAddress(e)
    else this.startEdit(e)
  },

  pickAddress(e) {
    if (!this.data.picker) return
    getApp().globalData.pendingAddressId = e.currentTarget.dataset.id
    wx.navigateBack()
  },

  // ---------- 表单 ----------
  startAdd() {
    this.setData({ editing: true, isDefault: this.data.list.length === 0, form: EMPTY_FORM })
  },

  startEdit(e) {
    const addr = this.data.list.find((a) => a.id === e.currentTarget.dataset.id)
    if (!addr) return
    this.setData({
      editing: true,
      isDefault: !!addr.isDefault,
      form: {
        id: addr.id,
        receiver: addr.receiver,
        phone: addr.phone,
        region: addr.region || '',
        detail: addr.detail,
      },
    })
  },

  cancelEdit() {
    this.setData({ editing: false, form: EMPTY_FORM })
  },

  onField(e) {
    const key = e.currentTarget.dataset.field
    this.setData({ [`form.${key}`]: e.detail.value })
  },

  toggleDefault() {
    this.setData({ isDefault: !this.data.isDefault })
  },

  save() {
    if (this.data.saving) return
    if (this.guestBlocked()) return showToast('请先登录后管理地址')
    const { form, isDefault } = this.data
    if (!form.receiver.trim()) return showToast('请填写收货人')
    if (!/^\d{6,20}$/.test(form.phone.trim())) return showToast('请填写正确的手机号')
    if (!form.detail.trim()) return showToast('请填写详细地址')

    const payload = {
      receiver: form.receiver.trim(),
      phone: form.phone.trim(),
      region: form.region.trim(),
      detail: form.detail.trim(),
      isDefault,
    }
    this.setData({ saving: true })
    const task = form.id
      ? api.updateAddress(form.id, payload)
      : api.saveAddress(payload)
    task
      .then(() => {
        showToast(form.id ? '地址已更新' : '地址已保存')
        this.setData({ editing: false, form: EMPTY_FORM })
        this.load()
      })
      .catch((err) => showToast((err && err.message) || '保存失败,请重试'))
      .finally(() => this.setData({ saving: false }))
  },

  // ---------- 行操作 ----------
  setDefault(e) {
    if (this.guestBlocked()) return showToast('请先登录后管理地址')
    const id = e.currentTarget.dataset.id
    const addr = this.data.list.find((a) => a.id === id)
    if (!addr || addr.isDefault) return
    api
      .updateAddress(id, {
        receiver: addr.receiver,
        phone: addr.phone,
        region: addr.region || '',
        detail: addr.detail,
        isDefault: true,
      })
      .then(() => this.load())
      .catch((err) => showToast((err && err.message) || '设置失败'))
  },

  removeAddress(e) {
    if (this.guestBlocked()) return showToast('请先登录后管理地址')
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除地址',
      content: '确定删除这个收货地址吗?',
      confirmColor: '#c8102e',
      success: (res) => {
        if (!res.confirm) return
        api
          .removeAddress(id)
          .then(() => this.load())
          .catch((err) => showToast((err && err.message) || '删除失败'))
      },
    })
  },
})
