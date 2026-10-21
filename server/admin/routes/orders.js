// ============================================================
// 订单管理
// GET  /admin/api/orders                列表(分页/状态/关键词)
// GET  /admin/api/orders/:orderNo       详情(明细/时间轴/支付流水)
// POST /admin/api/orders/:orderNo/ship  发货 { shipCompany?, trackingNo? }
// POST /admin/api/orders/:orderNo/cancel 取消(自动回补库存)
// 发货/取消全部走 models/orders.js 的状态机:时间轴、库存回补与小程序侧零分叉
// ============================================================
const { Router } = require('express')
const { query, queryOne, tx } = require('../../src/db')
const { h, httpError } = require('../../src/middlewares/error')
const { transition, loadFullOrder } = require('../../src/models/orders')

const router = Router()

const LIST_COLUMNS =
  'order_no, user_id, status, goods_amount, freight, discount, amount, `count`, ' +
  'receiver, phone, region, detail, created_at, paid_at, shipped_at, tracking_no'

router.get(
  '/',
  h(async (req, res) => {
    const { status, keyword } = req.query
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)))
    const where = []
    const params = []

    if (status) {
      where.push('status = ?')
      params.push(String(status))
    }
    if (keyword) {
      const kw = String(keyword).trim()
      if (kw) {
        where.push('(order_no LIKE ? OR receiver LIKE ? OR phone LIKE ?)')
        params.push(`%${kw}%`, `%${kw}%`, `%${kw}%`)
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM orders ${whereSql}`, params)
    const rows = await query(
      `SELECT ${LIST_COLUMNS} FROM orders ${whereSql} ORDER BY created_at DESC, order_no DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    )

    // 状态汇总(供前端 Tab 角标)
    const counts = await query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status')

    res.json({ list: rows, total: Number(total), page, pageSize, counts })
  }),
)

router.get(
  '/:orderNo',
  h(async (req, res) => {
    // 管理端查任意用户订单:先按单号定位,再借 loadFullOrder 装配
    const order = await queryOne('SELECT order_no, user_id FROM orders WHERE order_no = ?', [
      req.params.orderNo,
    ])
    if (!order) throw httpError(404, '订单不存在')
    // loadFullOrder 约定 q.query(sql, params) 返回 [rows],这里用连接池适配
    res.json(
      await loadFullOrder(
        { query: async (sql, params) => [await query(sql, params)] },
        order.order_no,
        order.user_id,
      ),
    )
  }),
)

async function doTransition(orderNo, action, body, operator) {
  const order = await queryOne('SELECT order_no, user_id, status FROM orders WHERE order_no = ?', [
    orderNo,
  ])
  if (!order) throw httpError(404, '订单不存在')

  return tx(async (conn) => {
    const r = await transition(conn, {
      orderNo: order.order_no,
      userId: order.user_id,
      action,
      operator: operator || 'admin',
      shipCompany: body && body.shipCompany,
      trackingNo: body && body.trackingNo,
    })
    return r
  })
}

router.post(
  '/:orderNo/ship',
  h(async (req, res) => {
    const r = await doTransition(req.params.orderNo, 'ship', req.body || {}, 'admin')
    res.json(r)
  }),
)

router.post(
  '/:orderNo/cancel',
  h(async (req, res) => {
    const r = await doTransition(req.params.orderNo, 'cancel', null, 'admin')
    res.json(r)
  }),
)

module.exports = router
