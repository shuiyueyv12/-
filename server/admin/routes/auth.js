// ============================================================
// 管理员登录 / 会话信息
// POST /admin/api/auth/login  { username, password } → { token, admin }
// GET  /admin/api/auth/me     → 当前管理员信息
// PUT  /admin/api/auth/password { oldPassword, newPassword }
// ============================================================
const { Router } = require('express')
const jwt = require('jsonwebtoken')
const config = require('../config')
const adminAuth = require('../middlewares/admin-auth')
const { query, queryOne } = require('../../src/db')
const { verifyPassword, hashPassword } = require('../../src/utils/password')
const { h, httpError } = require('../../src/middlewares/error')

const router = Router()

function adminJSON(a) {
  return { id: a.id, username: a.username, nickname: a.nickname, lastLoginAt: a.last_login_at }
}

async function getAdminByUsername(username) {
  return queryOne('SELECT * FROM admins WHERE username = ?', [String(username || '').trim()])
}

router.post(
  '/login',
  h(async (req, res) => {
    const { username, password } = req.body || {}
    if (!username || !password) throw httpError(400, '请输入用户名和密码')

    const admin = await getAdminByUsername(username)
    if (!admin || !verifyPassword(password, admin.password)) {
      throw httpError(400, '用户名或密码错误')
    }
    if (Number(admin.status) !== 1) throw httpError(403, '该管理员账号已被禁用')

    const token = jwt.sign(
      { role: 'admin', aid: admin.id, username: admin.username },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn },
    )
    await query('UPDATE admins SET last_login_at = NOW() WHERE id = ?', [admin.id])

    res.json({ token, admin: { ...adminJSON(admin), lastLoginAt: new Date().toISOString() } })
  }),
)

router.get(
  '/me',
  adminAuth,
  h(async (req, res) => {
    const admin = await queryOne(
      'SELECT id, username, nickname, status, last_login_at FROM admins WHERE id = ?',
      [req.adminId],
    )
    if (!admin || Number(admin.status) !== 1) throw httpError(401, '账号状态已变化,请重新登录')
    res.json(adminJSON(admin))
  }),
)

router.put(
  '/password',
  adminAuth,
  h(async (req, res) => {
    const { oldPassword, newPassword } = req.body || {}
    if (!oldPassword || !newPassword) throw httpError(400, '请填写原密码和新密码')
    if (String(newPassword).length < 6) throw httpError(400, '新密码至少 6 位')

    const admin = await queryOne('SELECT * FROM admins WHERE id = ?', [req.adminId])
    if (!admin || !verifyPassword(oldPassword, admin.password)) {
      throw httpError(400, '原密码错误')
    }
    await query('UPDATE admins SET password = ? WHERE id = ?', [
      hashPassword(newPassword),
      admin.id,
    ])
    res.json({ ok: true })
  }),
)

module.exports = router
