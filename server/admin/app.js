// ============================================================
// 管理后台独立进程入口
//   - /admin/api/*      管理 REST API(全部要求 role==='admin' 的 JWT,登录接口除外)
//   - 其余 GET          托管 admin/public 静态页(Vue3 单页,零构建)
//
// 与小程序 API(src/app.js)完全隔离:独立端口、独立密钥、独立表(admins)。
// 云上部署:1Panel 再建一个 Node 项目指向本文件即可,详见 DEPLOY.md。
// ============================================================
const path = require('path')
const express = require('express')
const cors = require('cors')
const config = require('./config')
const adminAuth = require('./middlewares/admin-auth')
const { errorHandler, notFound } = require('../src/middlewares/error')

const app = express()

app.use(cors())
app.use(express.json({ limit: '1mb' }))

// 登录接口公开,其余 /admin/api 全部鉴权
app.use('/admin/api/auth', require('./routes/auth'))
app.use('/admin/api', adminAuth)
app.use('/admin/api/dashboard', require('./routes/dashboard'))
app.use('/admin/api/products', require('./routes/products'))
app.use('/admin/api/categories', require('./routes/categories'))
app.use('/admin/api/banners', require('./routes/banners'))
app.use('/admin/api/orders', require('./routes/orders'))
app.use('/admin/api/users', require('./routes/users'))
app.use('/admin/api/payments', require('./routes/payments'))

// 健康检查(探活用)
app.get('/admin/api/health', (req, res) => res.json({ ok: true, service: 'mall-admin' }))

// 托管管理页静态资源;非 /admin/api 的 GET 一律回退到 index.html(单页应用)
const PUBLIC_DIR = path.join(__dirname, 'public')
app.use(express.static(PUBLIC_DIR))
app.get(/^\/(?!admin\/api).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'))
})

// 统一 404 与错误输出(与小程序端同一套中间件)
app.use(notFound)
app.use(errorHandler)

app.listen(config.port, config.host, () => {
  const shown = config.host === '0.0.0.0' ? '127.0.0.1' : config.host
  console.log(
    `[mall-admin] listening on http://${shown}:${config.port}/admin (bind ${config.host})`,
  )
})
