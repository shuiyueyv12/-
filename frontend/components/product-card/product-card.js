// ============================================================
// components/product-card —— 商品卡片（首页 / 分类页共用）
// 事件：add -> { id }；like -> { id }
// ============================================================

const { formatPrice } = require('../../utils/format')

Component({
  properties: {
    product: { type: Object, value: {} },
    liked: { type: Boolean, value: false },
  },

  data: { priceText: '' },

  observers: {
    'product.price'(price) {
      this.setData({ priceText: formatPrice(price) })
    },
  },

  lifetimes: {
    attached() {
      const p = this.data.product
      if (p && p.price !== undefined) {
        this.setData({ priceText: formatPrice(p.price) })
      }
    },
  },

  methods: {
    onLike() {
      this.triggerEvent('like', { id: this.data.product.id })
    },
    onAdd() {
      this.triggerEvent('add', { id: this.data.product.id })
    },
  },
})
