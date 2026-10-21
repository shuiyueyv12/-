// 通用格式化工具（纯函数，与 H5 src/utils/format.js 对应）

/** 金额格式化：6999 -> ¥6,999 */
function formatPrice(value) {
  return `¥${Number(value || 0).toLocaleString('en-US')}`
}

/** 日期时间格式化（展示用） */
function formatTime(timestamp) {
  const date = new Date(timestamp)
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

module.exports = { formatPrice, formatTime }
