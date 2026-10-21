// ============================================================
// 支付流水查询(payments 表,只读)
// GET /admin/api/payments  列表(分页/订单号检索)
// ============================================================
const { Router } = require('express')
const { query } = require('../../src/db')
const { h } = require('../../src/middlewares/error')

const router = Router()

const COLUMNS = 'id, order_no, user_id, method, amount, trade_no, status, paid_at, created_at'

router.get(
  '/',
  h(async (req, res) => {
    const { orderNo, status } = req.query
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)))
    const where = []
    const params = []

    if (orderNo) {
      where.push('order_no LIKE ?')
      params.push(`%${String(orderNo).trim()}%`)
    }
    if (status) {
      where.push('status = ?')
      params.push(String(status))
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM payments ${whereSql}`, params)
    const rows = await query(
      `SELECT ${COLUMNS} FROM payments ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    )
    res.json({ list: rows, total: Number(total), page, pageSize })
  }),
)

module.exports = router
