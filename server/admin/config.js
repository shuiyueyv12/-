// ============================================================
// 管理后台配置:复用 .env 与数据库配置,叠加管理端专属项
// ============================================================
const base = require('../src/config')

const config = {
  ...base,

  // 管理端监听:独立进程,默认 127.0.0.1:3001
  // 云上如需直接对外,设 ADMIN_HOST=0.0.0.0(推荐仍走 OpenResty 反代)
  port: Number(process.env.ADMIN_PORT || 3001),
  host: process.env.ADMIN_HOST || '127.0.0.1',

  jwt: {
    // 管理端独立密钥,与小程序用户 token 隔离;未配置时退回 dev 缺省
    secret: process.env.ADMIN_JWT_SECRET || 'dev-admin-secret-change-me',
    expiresIn: process.env.ADMIN_JWT_EXPIRES || '12h',
  },
}

module.exports = config
