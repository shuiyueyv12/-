// Mock 商品目录（纯数据，与 H5 src/mock/products.js 一一对应）
// 将来接入真实后端后，本文件可被「数据库 + HTTP 接口」取代后整体删除。
// 价格统一使用 number（展示时再格式化）。

module.exports = {
  products: [
    // ===== 手机 phone =====
    {
      id: 'p101',
      name: 'HUAWEI Mate 70 Pro',
      desc: '麒麟芯 · 超强影像',
      price: 6999,
      tag: '新品',
      categoryId: 'phone',
      sub: 'Mate 系列',
      featured: true,
      image:
        'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=85',
    },
    {
      id: 'p102',
      name: 'HUAWEI Mate X6',
      desc: '折叠旗舰 · 全新形态',
      price: 13999,
      tag: '折叠旗舰',
      categoryId: 'phone',
      sub: 'Mate 系列',
      featured: false,
      image:
        'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=600&q=85',
    },
    {
      id: 'p103',
      name: 'HUAWEI Pura 70 Ultra',
      desc: '超聚光影像 · 红枫原色',
      price: 9999,
      tag: '旗舰影像',
      categoryId: 'phone',
      sub: 'Pura 系列',
      featured: false,
      image:
        'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=600&q=85',
    },
    {
      id: 'p104',
      name: 'HUAWEI nova 13 Pro',
      desc: '格纹新作 · 潮流影像',
      price: 3999,
      tag: '热卖',
      categoryId: 'phone',
      sub: 'nova 系列',
      featured: false,
      image:
        'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=600&q=85',
    },

    // ===== 平板 tablet =====
    {
      id: 'p201',
      name: 'HUAWEI MatePad Pro 13.2',
      desc: '旗舰大屏 · 轻薄随行',
      price: 5199,
      tag: '直降',
      categoryId: 'tablet',
      sub: 'MatePad Pro',
      featured: true,
      image:
        'https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?auto=format&fit=crop&w=600&q=85',
    },
    {
      id: 'p202',
      name: 'HUAWEI MatePad 11.5',
      desc: '鸿蒙生态 · 学习好搭档',
      price: 1899,
      tag: '超值',
      categoryId: 'tablet',
      sub: 'MatePad',
      featured: false,
      image:
        'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=600&q=85',
    },
    {
      id: 'p203',
      name: 'HUAWEI MatePad SE 11',
      desc: '护眼全面屏 · 全家共享',
      price: 1099,
      tag: '',
      categoryId: 'tablet',
      sub: 'MatePad SE',
      featured: false,
      image:
        'https://images.unsplash.com/photo-1561736778-92e52a7769ef?auto=format&fit=crop&w=600&q=85',
    },

    // ===== 穿戴 wearable =====
    {
      id: 'p301',
      name: 'HUAWEI WATCH 5',
      desc: '非凡腕上体验',
      price: 2699,
      tag: '新品',
      categoryId: 'wearable',
      sub: '智能手表',
      featured: true,
      image:
        'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=600&q=85',
    },
    {
      id: 'p302',
      name: 'HUAWEI WATCH GT 5 Pro',
      desc: '钛合金 · 专业运动',
      price: 2399,
      tag: '',
      categoryId: 'wearable',
      sub: '智能手表',
      featured: false,
      image:
        'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=600&q=85',
    },
    {
      id: 'p303',
      name: 'HUAWEI 手环 9',
      desc: '轻盈全天候健康监测',
      price: 269,
      tag: '热卖',
      categoryId: 'wearable',
      sub: '智能手环',
      featured: false,
      image:
        'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=600&q=85',
    },

    // ===== 耳机 audio =====
    {
      id: 'p401',
      name: 'HUAWEI FreeBuds Pro 4',
      desc: '旗舰降噪 · 纯净音质',
      price: 1499,
      tag: '热卖',
      categoryId: 'audio',
      sub: 'TWS 耳机',
      featured: true,
      image:
        'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=600&q=85',
    },
    {
      id: 'p402',
      name: 'HUAWEI FreeBuds 6i',
      desc: '智慧降噪 · 澎湃声场',
      price: 599,
      tag: '',
      categoryId: 'audio',
      sub: 'TWS 耳机',
      featured: false,
      image:
        'https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?auto=format&fit=crop&w=600&q=85',
    },
    {
      id: 'p403',
      name: 'HUAWEI FreeBuds Studio',
      desc: '头戴降噪 · 沉浸听感',
      price: 1999,
      tag: '',
      categoryId: 'audio',
      sub: '头戴耳机',
      featured: false,
      image:
        'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=600&q=85',
    },
    {
      id: 'p404',
      name: 'HUAWEI FreeClip',
      desc: '耳夹耳机 · 轻盈出街',
      price: 1299,
      tag: '新品',
      categoryId: 'audio',
      sub: 'TWS 耳机',
      featured: false,
      image:
        'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=600&q=85',
    },
  ],
}
