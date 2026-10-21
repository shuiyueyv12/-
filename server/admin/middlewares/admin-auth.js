// ============================================================
// 管理端鉴权中间件:校验 Bearer JWT 且 payload.role === 'admin'
// 小程序用户 token(uid/openid)没有 role 字段,一律 401/403,
// 保证两套会话互不通用。
// ============================================================
const jwt = require('jsonwebtoken')
const config = require('../config')
const { httpError } = require('../../src/middlewares/error')

function adminAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return next(httpError(401, '未登录'))

  try {
    const payload = jwt.verify(token, config.jwt.secret)
    if (payload.role !== 'admin') return next(httpError(403, '无管理员权限'))
    req.adminId = Number(payload.aid)
    req.adminUsername = payload.username
    return next()
  } catch (e) {
    return next(httpError(401, '登录已过期,请重新登录'))
  }
}

module.exports = adminAuth
