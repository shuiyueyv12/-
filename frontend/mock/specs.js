// ============================================================
// mock/specs —— 商品「多图 / 规格 SKU / 库存 / 销量」的确定性派生
//
// 为什么要有这个文件:
//   商品的多图与规格不是手写数据,而是从「商品本身 + 序号」确定性推出来的
//   (同一个商品永远得到同一份规格与库存)。前端 mock 预览与后端
//   server/tools/seed.js 灌库共用这一份实现,避免两处逻辑漂移。
//
// 纯函数、无依赖,可同时被小程序端(CommonJS)与 Node 工具链 require。
// ============================================================

// ---------- 分类图标(与 pages/home/home.js 的 CAT_ICON 一致,改为数据驱动) ----------
const CAT_ICON = {
  phone: 'smartphone',
  tablet: 'tablet',
  wearable: 'watch',
  audio: 'headphones',
}

// ---------- 商品图池(全部取自 mock 已有、已验证可访问的 unsplash 图) ----------
const IMAGE_POOL = [
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1561736778-92e52a7769ef?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=85',
  'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=600&q=85',
]

// ---------- 规格模板:每个品类两组维度(维度名 + 候选值) ----------
const SPEC_TEMPLATES = {
  phone: [
    ['颜色', ['曜金黑', '雪域白', '星河蓝']],
    ['版本', ['12GB+256GB', '12GB+512GB']],
  ],
  tablet: [
    ['颜色', ['曜石黑', '冰霜银']],
    ['版本', ['12GB+256GB', '16GB+512GB']],
  ],
  wearable: [
    ['表带', ['氟橡胶', '米兰尼斯', '真皮']],
    ['尺寸', ['42mm', '46mm']],
  ],
  audio: [
    ['颜色', ['陶瓷白', '曜石黑']],
    ['版本', ['标准版', '至臻版']],
  ],
}

/** 展示划线价的角标 */
const PROMO_TAGS = ['直降', '超值', '热卖']

/**
 * FNV-1a:相邻 key(如 p101-0-0 / p101-0-1)也能得到差异很大的哈希,
 * 避免库存/销量出现 52、53 这种连号,演示数据更自然。
 */
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/** 规格库存:约每 11 个规格出现 1 个售罄(0),其余 3~60 */
function stockOf(key) {
  const h = hash(key)
  return h % 11 === 0 ? 0 : 3 + (h % 58)
}

/** 销量:200~5200 */
function salesOf(key) {
  return 200 + (hash(`sales-${key}`) % 5000)
}

/** 多图:主图 + 图池中另外两张(图池去重后长 13 为奇数,(2i) 与 (2i+1) 取模必不相同) */
function buildGallery(product, index) {
  const others = IMAGE_POOL.filter((u) => u !== product.image)
  if (!others.length) return product.image ? [product.image] : []
  return [product.image, others[(index * 2) % others.length], others[(index * 2 + 1) % others.length]]
}

const pad2 = (n) => String(n).padStart(2, '0')

/** 规格 SKU:两组维度的全组合,主维度(颜色/表带)决定规格主图 */
function buildSkus(product, index) {
  const gallery = buildGallery(product, index)
  const template = SPEC_TEMPLATES[product.categoryId] || SPEC_TEMPLATES.phone
  const [dimA, valuesA] = template[0]
  const [dimB, valuesB] = template[1]
  const skus = []
  for (let ai = 0; ai < valuesA.length; ai++) {
    for (let bi = 0; bi < valuesB.length; bi++) {
      const values = {}
      values[dimA] = valuesA[ai]
      values[dimB] = valuesB[bi]
      skus.push({
        id: `${product.id}-${pad2(ai + 1)}${pad2(bi + 1)}`,
        productId: product.id,
        specValues: values,
        specText: `${valuesA[ai]} · ${valuesB[bi]}`,
        price: product.price + bi * Math.max(100, Math.round((product.price * 0.06) / 100) * 100),
        stock: stockOf(`${product.id}-${ai}-${bi}`),
        image: gallery[ai % gallery.length] || '',
        code: `${product.id}-${pad2(ai + 1)}${pad2(bi + 1)}`,
        sort: ai * valuesB.length + bi,
      })
    }
  }
  return skus
}

/**
 * 把一条商品数据补全为「目录形态」或「详情形态」。
 * @param {object} product mock 商品
 * @param {number} index   在目录中的序号(决定多图选片)
 * @param {boolean} [withDetail] true 时附带 images / skus(仅详情接口需要)
 */
function enrichProduct(product, index, withDetail) {
  const skus = buildSkus(product, index)
  const base = Object.assign({}, product, {
    originalPrice: PROMO_TAGS.indexOf(product.tag) > -1 ? Math.round(product.price * 1.08) : 0,
    stock: skus.reduce((n, s) => n + s.stock, 0),
    sales: salesOf(product.id),
  })
  if (!withDetail) return base
  base.images = buildGallery(product, index)
  base.skus = skus
  return base
}

module.exports = {
  CAT_ICON,
  IMAGE_POOL,
  SPEC_TEMPLATES,
  PROMO_TAGS,
  hash,
  stockOf,
  salesOf,
  buildGallery,
  buildSkus,
  enrichProduct,
}
