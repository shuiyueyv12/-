// ============================================================
// 用户管理(users 表,只改状态,不动用户密码)
// GET /admin/api/users             列表(分页/关键词/状态)
// PUT /admin/api/users/:id/status  禁用(0)/启用(1)
// 禁用后:该用户小程序登录 403、/user/me 401(小程序侧已实现 isActive 校验)
// ============================================================
const { Router } = require('express')
const { query, queryOne } = require('../../src/db')
const { h, httpError } = require('../../src/middlewares/error')

const router = Router()

const COLUMNS = 'id, username, nickname, avatar, phone, level, points, status, last_login_at, created_at'

router.get(
  '/',
  h(async (req, res) => {
    const { keyword, status } = req.query
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)))
    const where = []
    const params = []

    if (keyword) {
      const kw = `%${String(keyword).trim().toLowerCase()}%`
      where.push('(LOWER(username) LIKE ? OR LOWER(nickname) LIKE ? OR phone LIKE ?)')
      params.push(kw, kw, `%${String(keyword).trim()}%`)
    }
    if (status === '0' || status === '1') {
      where.push('status = ?')
      params.push(Number(status))
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params)
    const rows = await query(
      `SELECT ${COLUMNS} FROM users ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    )
    res.json({ list: rows, total: Number(total), page, pageSize })
  }),
)

router.put(
  '/:id/status',
  h(async (req, res) => {
    const status = Number(req.body && req.body.status)
    if (status !== 0 && status !== 1) throw httpError(400, 'status 只能是 0 或 1')
    const r = await query('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id])
    if (!r.affectedRows) throw httpError(404, '用户不存在')
    res.json({ ok: true, status })
  }),
)

module.exports = router
