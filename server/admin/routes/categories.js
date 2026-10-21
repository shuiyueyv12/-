// ============================================================
// 分类管理(categories + sub_categories 两表)
// GET    /admin/api/categories        全量(含子分类,按 sort 排序)
// POST   /admin/api/categories        新建一级分类(id 由前端提供,如 phone)
// PUT    /admin/api/categories/:id    编辑(含子分类全量同步)
// DELETE /admin/api/categories/:id    删除(有商品/子分类引用则拒绝)
// ============================================================
const { Router } = require('express')
const { query, queryOne, tx } = require('../../src/db')
const { h, httpError } = require('../../src/middlewares/error')

const router = Router()

async function listAll() {
  const cats = await query(
    'SELECT id, label, note, icon, sort, enabled FROM categories ORDER BY sort ASC, id ASC',
  )
  const subs = await query(
    'SELECT id, category_id, name, sort, enabled FROM sub_categories ORDER BY sort ASC, id ASC',
  )
  return cats.map((c) => ({
    ...c,
    enabled: Number(c.enabled),
    subs: subs
      .filter((s) => s.category_id === c.id)
      .map((s) => ({ ...s, enabled: Number(s.enabled) })),
  }))
}

function pickCategory(body) {
  const label = String(body.label || '').trim()
  if (!label) throw httpError(400, '分类名称不能为空')
  return {
    label,
    note: String(body.note || '').trim(),
    icon: String(body.icon || '').trim(),
    sort: Number(body.sort || 0) || 0,
    enabled: body.enabled === 0 || body.enabled === false ? 0 : 1,
  }
}

router.get(
  '/',
  h(async (req, res) => {
    res.json(await listAll())
  }),
)

router.post(
  '/',
  h(async (req, res) => {
    const id = String((req.body || {}).id || '').trim()
    if (!id) throw httpError(400, '分类 ID 不能为空(如 phone/tablet)')
    if (await queryOne('SELECT id FROM categories WHERE id = ?', [id])) {
      throw httpError(400, `分类 ID ${id} 已存在`)
    }
    const data = pickCategory(req.body || {})
    await query(
      'INSERT INTO categories (id, label, note, icon, sort, enabled) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.label, data.note, data.icon, data.sort, data.enabled],
    )
    res.status(201).json({ ok: true })
  }),
)

router.put(
  '/:id',
  h(async (req, res) => {
    const id = req.params.id
    if (!(await queryOne('SELECT id FROM categories WHERE id = ?', [id]))) {
      throw httpError(404, '分类不存在')
    }
    const data = pickCategory(req.body || {})
    // 子分类:提交的 subs 全量同步(name 相同的保留原 id,新名字插入,缺席的删除)
    const subs = (Array.isArray((req.body || {}).subs) ? req.body.subs : [])
      .map((s, i) => ({ id: s.id != null ? Number(s.id) : null, name: String(s.name || '').trim(), sort: s.sort ?? i, enabled: s.enabled === 0 || s.enabled === false ? 0 : 1 }))
      .filter((s) => s.name)

    await tx(async (conn) => {
      await conn.query('UPDATE categories SET label = ?, note = ?, icon = ?, sort = ?, enabled = ? WHERE id = ?', [
        data.label, data.note, data.icon, data.sort, data.enabled, id,
      ])
      const keepIds = subs.filter((s) => s.id).map((s) => s.id)
      if (keepIds.length) {
        await conn.query(
          `DELETE FROM sub_categories WHERE category_id = ? AND id NOT IN (${keepIds.map(() => '?').join(',')})`,
          [id, ...keepIds],
        )
      } else {
        await conn.query('DELETE FROM sub_categories WHERE category_id = ?', [id])
      }
      for (const s of subs) {
        if (s.id) {
          await conn.query('UPDATE sub_categories SET name = ?, sort = ?, enabled = ? WHERE id = ? AND category_id = ?', [
            s.name, s.sort, s.enabled, s.id, id,
          ])
        } else {
          await conn.query('INSERT INTO sub_categories (category_id, name, sort, enabled) VALUES (?, ?, ?, ?)', [
            id, s.name, s.sort, s.enabled,
          ])
        }
      }
    })
    res.json({ ok: true })
  }),
)

router.delete(
  '/:id',
  h(async (req, res) => {
    const id = req.params.id
    const inProducts = await queryOne('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', [id])
    const inSubs = await queryOne('SELECT COUNT(*) AS n FROM sub_categories WHERE category_id = ?', [id])
    if (Number(inProducts.n) > 0 || Number(inSubs.n) > 0) {
      throw httpError(400, `该分类下仍有 ${Number(inProducts.n)} 个商品 / ${Number(inSubs.n)} 个子分类,请先迁移或删除`)
    }
    await query('DELETE FROM categories WHERE id = ?', [id])
    res.json({ ok: true })
  }),
)

module.exports = router
