// Mock 分类与轮播数据（纯数据，与 H5 src/mock/categories.js 对应）

module.exports = {
  categories: [
    {
      id: 'phone',
      label: '手机',
      note: 'Mate · Pura',
      subs: ['Mate 系列', 'Pura 系列', 'nova 系列'],
    },
    {
      id: 'tablet',
      label: '平板',
      note: 'MatePad',
      subs: ['MatePad Pro', 'MatePad', 'MatePad SE'],
    },
    {
      id: 'wearable',
      label: '穿戴',
      note: 'WATCH',
      subs: ['智能手表', '智能手环'],
    },
    {
      id: 'audio',
      label: '耳机',
      note: 'FreeBuds',
      subs: ['TWS 耳机', '头戴耳机'],
    },
  ],

  banners: [
    {
      eyebrow: 'HUAWEI Pura 80 系列',
      title: '影像新美学',
      copy: '记录每一个值得被看见的瞬间',
      action: '立即探索',
      image:
        'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=1000&q=85',
      tone: 'banner-dark',
    },
    {
      eyebrow: 'HUAWEI WATCH 5',
      title: '腕间见未来',
      copy: '健康与智能，时刻在线',
      action: '了解更多',
      image:
        'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=85',
      tone: 'banner-sand',
    },
    {
      eyebrow: 'MatePad Pro 13.2”',
      title: '灵感，一触即发',
      copy: '让创作从此没有边界',
      action: '立即购买',
      image:
        'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=1000&q=85',
      tone: 'banner-blue',
    },
  ],
}
