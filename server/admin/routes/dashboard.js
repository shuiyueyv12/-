// ============================================================
// 仪表盘汇总(只读聚合查询)
// GET /admin/api/dashboard
// ============================================================
const { Router } = require('express')
const { query, queryOne } = require('../../src/db')
const { h } = require('../../src/middlewares/error')

const router = Router()

router.get(
  '/',
  h(async (req, res) => {
    const [products] = [await queryOne('SELECT COUNT(*) AS n, COALESCE(SUM(stock),0) AS stock FROM products')]
    const orderStats = await queryOne(
      "SELECT COUNT(*) AS totalOrders, " +
        "COALESCE(SUM(CASE WHEN status IN ('待发货','待收货','已完成') THEN amount ELSE 0 END), 0) AS salesAmount, " +
        "COALESCE(SUM(CASE WHEN status = '待发货' THEN 1 ELSE 0 END), 0) AS pendingShip " +
        'FROM orders',
    )
    const [{ userCount }] = await query('SELECT COUNT(*) AS userCount FROM users')
    const [todayOrders] = [
      await queryOne('SELECT COUNT(*) AS n FROM orders WHERE DATE(created_at) = CURDATE()'),
    ]
    const recentOrders = await query(
      'SELECT order_no, receiver, amount, status, created_at FROM orders ORDER BY created_at DESC, order_no DESC LIMIT 5',
    )
    const topProducts = await query(
      'SELECT product_id, name_snapshot, SUM(qty) AS qty FROM order_items GROUP BY product_id, name_snapshot ORDER BY qty DESC LIMIT 5',
    )
    const statusCounts = await query('SELECT status, COUNT(*) AS n FROM orders GROUP BY status')

    res.json({
      productCount: Number(products.n),
      totalStock: Number(products.stock),
      orderCount: Number(orderStats.totalOrders),
      salesAmount: Number(orderStats.salesAmount),
      pendingShip: Number(orderStats.pendingShip),
      userCount: Number(userCount),
      todayOrders: Number(todayOrders.n),
      recentOrders,
      topProducts,
      statusCounts,
    })
  }),
)

module.exports = router
