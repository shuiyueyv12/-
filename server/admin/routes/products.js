// ============================================================
// 商品管理 CRUD(同步 products / product_images / product_skus 三表)
// GET    /admin/api/products            列表(分页/关键词/分类/状态筛选)
// GET    /admin/api/products/:id        详情(含 images[] 与 skus[])
// POST   /admin/api/products            新建(id 可省,自动生成 pNNN)
// PUT    /admin/api/products/:id        编辑(事务:商品 + 多图全量替换 + SKU 合并)
// PUT    /admin/api/products/:id/status 上下架
// DELETE /admin/api/products/:id        删除(被订单/购物车/收藏引用 → 软删下架)
// ============================================================
const { Router } = require('express')
const { query, queryOne, tx } = require('../../src/db')
const { h, httpError } = require('../../src/middlewares/error')

const router = Router()

const COLUMNS =
  'id, name, `desc`, category_id, sub, price, original_price, stock, sales, tag, featured, image, status, sort'

// ---------- 校验与工具 ----------

function pickProduct(body) {
  const name = String(body.name || '').trim()
  if (!name) throw httpError(400, '商品名称不能为空')
  const price = Number(body.price)
  if (!(price >= 0)) throw httpError(400, '价格必须是非负数字')
  const stock = Number(body.stock || 0)
  if (!(stock >= 0)) throw httpError(400, '库存必须是非负整数')
  return {
    name,
    desc: String(body.desc || '').trim(),
    category_id: String(body.categoryId || body.category_id || '').trim(),
    sub: String(body.sub || '').trim(),
    price,
    original_price: Math.max(0, Number(body.originalPrice || 0) || 0),
    stock: Math.floor(stock),
    tag: String(body.tag || '').trim(),
    featured: body.featured ? 1 : 0,
    image: String(body.image || '').trim(),
    sort: Number(body.sort || 0) || 0,
  }
}

function normalizeImages(body) {
  const images = Array.isArray(body.images) ? body.images : []
  return images.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 20)
}

function normalizeSkus(body) {
  const skus = Array.isArray(body.skus) ? body.skus : []
  return skus
    .map((s) => ({
      id: s.id != null ? Number(s.id) : null, // 带 id = 已有 SKU(更新),否则新增
      spec_text: String(s.specText || s.spec_text || '').trim(),
      spec_values: s.specValues ? JSON.stringify(s.specValues) : String(s.spec_values || '{}'),
      price: Number(s.price),
      stock: Math.max(0, Math.floor(Number(s.stock || 0))),
      image: String(s.image || '').trim(),
      code: String(s.code || '').trim(),
      sort: Number(s.sort || 0) || 0,
    }))
    .filter((s) => s.spec_text && s.price >= 0)
}

async function nextProductId() {
  const rows = await query("SELECT id FROM products WHERE id REGEXP '^p[0-9]+$'")
  let max = 100
  for (const r of rows) {
    const n = Number(String(r.id).slice(1))
    if (n > max) max = n
  }
  return `p${max + 1}`
}

async function loadDetail(id) {
  const product = await queryOne(`SELECT ${COLUMNS} FROM products WHERE id = ?`, [id])
  if (!product) throw httpError(404, '商品不存在')
  const images = (await query(
    'SELECT url FROM product_images WHERE product_id = ? ORDER BY sort ASC, id ASC',
    [id],
  )).map((r) => r.url)
  const skus = await query(
    'SELECT id, spec_text, spec_values, price, stock, image, code, sort, status FROM product_skus ' +
      'WHERE product_id = ? ORDER BY sort ASC, id ASC',
    [id],
  )
  return {
    ...product,
    categoryId: product.category_id,
    originalPrice: product.original_price,
    images,
    skus: skus.map((s) => ({ ...s, specText: s.spec_text, specValues: JSON.parse(s.spec_values || '{}') })),
  }
}

// ---------- 路由 ----------

router.get(
  '/',
  h(async (req, res) => {
    const { keyword, categoryId, status } = req.query
    const page = Math.max(1, Number(req.query.page || 1))
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)))
    const where = []
    const params = []

    if (keyword) {
      where.push('(LOWER(name) LIKE ? OR LOWER(id) LIKE ?)')
      params.push(`%${String(keyword).trim().toLowerCase()}%`, `%${String(keyword).trim().toLowerCase()}%`)
    }
    if (categoryId) {
      where.push('category_id = ?')
      params.push(categoryId)
    }
    if (status === '0' || status === '1') {
      where.push('status = ?')
      params.push(Number(status))
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [{ total }] = await query(
      `SELECT COUNT(*) AS total FROM products ${whereSql}`,
      params,
    )
    const rows = await query(
      `SELECT ${COLUMNS} FROM products ${whereSql} ORDER BY sort ASC, id ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    )
    res.json({ list: rows, total: Number(total), page, pageSize })
  }),
)

router.get(
  '/:id',
  h(async (req, res) => {
    res.json(await loadDetail(req.params.id))
  }),
)

router.post(
  '/',
  h(async (req, res) => {
    const data = pickProduct(req.body || {})
    if (!data.category_id) throw httpError(400, '请选择商品分类')
    const images = normalizeImages(req.body || {})
    const skus = normalizeSkus(req.body || {})
    if (!data.image && images.length) data.image = images[0]

    const id = String(req.body.id || '').trim() || (await nextProductId())
    const exists = await queryOne('SELECT id FROM products WHERE id = ?', [id])
    if (exists) throw httpError(400, `商品 ID ${id} 已存在`)

    await tx(async (conn) => {
      await conn.query(
        'INSERT INTO products (id, name, `desc`, category_id, sub, price, original_price, stock, sales, tag, featured, image, status, sort) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?)',
        [id, data.name, data.desc, data.category_id, data.sub, data.price, data.original_price,
          data.stock, data.tag, data.featured, data.image, data.sort],
      )
      for (const [i, url] of images.entries()) {
        await conn.query('INSERT INTO product_images (product_id, url, sort) VALUES (?, ?, ?)', [id, url, i])
      }
      for (const [i, s] of skus.entries()) {
        await conn.query(
          'INSERT INTO product_skus (product_id, spec_values, spec_text, price, stock, image, code, sort, status) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
          [id, s.spec_values, s.spec_text, s.price, s.stock, s.image, s.code, s.sort ?? i],
        )
      }
    })
    res.status(201).json(await loadDetail(id))
  }),
)

router.put(
  '/:id',
  h(async (req, res) => {
    const id = req.params.id
    const product = await queryOne('SELECT id FROM products WHERE id = ?', [id])
    if (!product) throw httpError(404, '商品不存在')

    const data = pickProduct(req.body || {})
    if (!data.category_id) throw httpError(400, '请选择商品分类')
    const images = normalizeImages(req.body || {})
    const skus = normalizeSkus(req.body || {})
    if (!data.image && images.length) data.image = images[0]

    await tx(async (conn) => {
      await conn.query(
        'UPDATE products SET name = ?, `desc` = ?, category_id = ?, sub = ?, price = ?, original_price = ?, ' +
          'stock = ?, tag = ?, featured = ?, image = ?, sort = ? WHERE id = ?',
        [data.name, data.desc, data.category_id, data.sub, data.price, data.original_price,
          data.stock, data.tag, data.featured, data.image, data.sort, id],
      )

      // 多图:全量替换(纯展示数据,无引用方)
      await conn.query('DELETE FROM product_images WHERE product_id = ?', [id])
      for (const [i, url] of images.entries()) {
        await conn.query('INSERT INTO product_images (product_id, url, sort) VALUES (?, ?, ?)', [id, url, i])
      }

      // SKU:带 id 的更新 / 不带 id 的新增 / 缺席的已有 SKU 停用(status=0),
      // 不物理删除,避免 order_items / cart_items 的 sku_id 悬空
      const keepIds = skus.filter((s) => s.id).map((s) => s.id)
      if (keepIds.length) {
        await conn.query(
          `UPDATE product_skus SET status = 0 WHERE product_id = ? AND id NOT IN (${keepIds.map(() => '?').join(',')})`,
          [id, ...keepIds],
        )
      } else {
        await conn.query('UPDATE product_skus SET status = 0 WHERE product_id = ?', [id])
      }
      for (const [i, s] of skus.entries()) {
        if (s.id) {
          await conn.query(
            'UPDATE product_skus SET spec_values = ?, spec_text = ?, price = ?, stock = ?, image = ?, code = ?, sort = ?, status = 1 WHERE id = ? AND product_id = ?',
            [s.spec_values, s.spec_text, s.price, s.stock, s.image, s.code, s.sort ?? i, s.id, id],
          )
        } else {
          await conn.query(
            'INSERT INTO product_skus (product_id, spec_values, spec_text, price, stock, image, code, sort, status) ' +
              'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
            [id, s.spec_values, s.spec_text, s.price, s.stock, s.image, s.code, s.sort ?? i],
          )
        }
      }
    })
    res.json(await loadDetail(id))
  }),
)

router.put(
  '/:id/status',
  h(async (req, res) => {
    const status = Number(req.body && req.body.status)
    if (status !== 0 && status !== 1) throw httpError(400, 'status 只能是 0 或 1')
    const r = await query('UPDATE products SET status = ? WHERE id = ?', [status, req.params.id])
    if (!r.affectedRows) throw httpError(404, '商品不存在')
    res.json({ ok: true, status })
  }),
)

router.delete(
  '/:id',
  h(async (req, res) => {
    const id = req.params.id
    const product = await queryOne('SELECT id, name, status FROM products WHERE id = ?', [id])
    if (!product) throw httpError(404, '商品不存在')

    // 被业务表引用 → 物理删除会破坏历史订单快照,改为下架软删
    const refs = await queryOne('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?', [id])
    const inCart = await queryOne('SELECT COUNT(*) AS n FROM cart_items WHERE product_id = ?', [id])
    const inFav = await queryOne('SELECT COUNT(*) AS n FROM favorites WHERE product_id = ?', [id])
    if (Number(refs.n) > 0 || Number(inCart.n) > 0 || Number(inFav.n) > 0) {
      await query('UPDATE products SET status = 0 WHERE id = ?', [id])
      return res.json({
        ok: true,
        softDeleted: true,
        message: '商品已被订单/购物车/收藏引用,已改为下架(软删除),历史数据不受影响',
      })
    }

    await tx(async (conn) => {
      await conn.query('DELETE FROM product_images WHERE product_id = ?', [id])
      await conn.query('DELETE FROM product_skus WHERE product_id = ?', [id])
      await conn.query('DELETE FROM products WHERE id = ?', [id])
    })
    res.json({ ok: true, softDeleted: false })
  }),
)

module.exports = router
