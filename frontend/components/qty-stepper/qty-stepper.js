// ============================================================
// components/qty-stepper —— 数量加减器（购物车行内使用）
// 事件：change -> { value: number }
// ============================================================

Component({
  properties: {
    value: { type: Number, value: 1 },
    min: { type: Number, value: 1 },
    max: { type: Number, value: 99 },
  },

  methods: {
    change(delta) {
      const next = this.data.value + delta
      if (next < this.data.min || next > this.data.max) return
      this.triggerEvent('change', { value: next })
    },
    onMinus() {
      this.change(-1)
    },
    onPlus() {
      this.change(1)
    },
  },
})
