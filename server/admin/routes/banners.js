// ============================================================
// 轮播图管理(banners 表)
// GET    /admin/api/banners      全量(按 sort 排序)
// POST   /admin/api/banners      新建
// PUT    /admin/api/banners/:id  编辑
// PUT    /admin/api/banners/sort 批量排序(传 id 数组,按数组顺序写 sort)
// DELETE /admin/api/banners/:id  删除
// ============================================================
const { Router } = require('express')
const { query, queryOne } = require('../../src/db')
const { h, httpError } = require('../../src/middlewares/error')

const router = Router()

function pickBanner(body) {
  const title = String(body.title || '').trim()
  if (!title) throw httpError(400, '轮播标题不能为空')
  return {
    eyebrow: String(body.eyebrow || '').trim(),
    title,
    copy: String(body.copy || '').trim(),
    action: String(body.action || '').trim(),
    image: String(body.image || '').trim(),
    tone: String(body.tone || '').trim(),
    enabled: body.enabled === 0 || body.enabled === false ? 0 : 1,
  }
}

router.get(
  '/',
  h(async (req, res) => {
    const rows = await query(
      'SELECT id, eyebrow, title, copy, action, image, tone, sort, enabled FROM banners ORDER BY sort ASC, id ASC',
    )
    res.json(rows.map((b) => ({ ...b, enabled: Number(b.enabled) })))
  }),
)

router.post(
  '/',
  h(async (req, res) => {
    const data = pickBanner(req.body || {})
    const [{ maxSort }] = await query('SELECT COALESCE(MAX(sort), -1) AS maxSort FROM banners')
    const r = await query(
      'INSERT INTO banners (eyebrow, title, copy, action, image, tone, sort, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.eyebrow, data.title, data.copy, data.action, data.image, data.tone, Number(maxSort) + 1, data.enabled],
    )
    res.status(201).json({ ok: true, id: r.insertId })
  }),
)

router.put(
  '/sort',
  h(async (req, res) => {
    const ids = Array.isArray((req.body || {}).ids) ? req.body.ids.map(Number).filter(Boolean) : []
    if (!ids.length) throw httpError(400, 'ids 不能为空')
    for (const [i, id] of ids.entries()) {
      await query('UPDATE banners SET sort = ? WHERE id = ?', [i, id])
    }
    res.json({ ok: true })
  }),
)

router.put(
  '/:id',
  h(async (req, res) => {
    const data = pickBanner(req.body || {})
    const r = await query(
      'UPDATE banners SET eyebrow = ?, title = ?, copy = ?, action = ?, image = ?, tone = ?, enabled = ? WHERE id = ?',
      [data.eyebrow, data.title, data.copy, data.action, data.image, data.tone, data.enabled, req.params.id],
    )
    if (!r.affectedRows) throw httpError(404, '轮播不存在')
    res.json({ ok: true })
  }),
)

router.delete(
  '/:id',
  h(async (req, res) => {
    const r = await query('DELETE FROM banners WHERE id = ?', [req.params.id])
    if (!r.affectedRows) throw httpError(404, '轮播不存在')
    res.json({ ok: true })
  }),
)

module.exports = router
