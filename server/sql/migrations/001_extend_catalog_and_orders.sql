-- ============================================================
-- 001_extend_catalog_and_orders.sql —— 增量迁移
-- 内容:商品多图 / 规格 SKU / 库存 / 支付流水 / 订单地址快照 / 状态时间轴
--
-- 适用场景:数据库已经建过表、且里面有不希望丢失的数据(真实账号等)。
-- 执行方式:
--     node tools/init-db.js --migrate
--   (等价于 npm run db:init -- --migrate)
--
-- 可重复执行:表已存在 / 列已存在 / 索引已存在 / 索引不存在 这四类错误会被
-- 自动忽略,所以重复执行不会报错。
--
-- 注意:
--   1. 全新建库请直接用 sql/schema.sql(全量脚本),不要跑本脚本。
--   2. 本文件由 tools/init-db.js --migrate 按「分号」切分成语句逐条执行,
--      因此每条语句内(包括字符串与注释)都不允许出现分号。
--   3. 一个 ALTER TABLE 只做一件事,便于失败时定位。
-- ============================================================

USE mall;

-- ------------------------------------------------------------
-- users:账号状态 + 最近登录时间
-- ------------------------------------------------------------
ALTER TABLE users ADD COLUMN status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '账号状态:1 正常 / 0 禁用';
ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL DEFAULT NULL COMMENT '最近登录时间';

-- ------------------------------------------------------------
-- categories:图标 + 启用开关
-- ------------------------------------------------------------
ALTER TABLE categories ADD COLUMN icon VARCHAR(32) NOT NULL DEFAULT '' COMMENT '图标名(对应 components/icon 的 name)';
ALTER TABLE categories ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 隐藏';

-- ------------------------------------------------------------
-- sub_categories:启用开关
-- ------------------------------------------------------------
ALTER TABLE sub_categories ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 隐藏';

-- ------------------------------------------------------------
-- products:划线价 / 可售库存 / 累计销量 / 时间戳 / 排序索引
-- ------------------------------------------------------------
ALTER TABLE products ADD COLUMN original_price DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '划线价,0 表示不展示';
ALTER TABLE products ADD COLUMN stock INT NOT NULL DEFAULT 0 COMMENT '可售库存,有规格商品以 product_skus.stock 之和为准';
ALTER TABLE products ADD COLUMN sales INT NOT NULL DEFAULT 0 COMMENT '累计销量';
ALTER TABLE products ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE products ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE products ADD KEY idx_status_sort (status, sort);

-- ------------------------------------------------------------
-- cart_items:规格维度。唯一键从 (user_id, product_id) 换成含 sku_id 的三元组
-- ------------------------------------------------------------
ALTER TABLE cart_items ADD COLUMN sku_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑外键 -> product_skus.id,0 表示无规格商品';
ALTER TABLE cart_items ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE cart_items DROP INDEX uk_user_product;
ALTER TABLE cart_items ADD UNIQUE KEY uk_user_product_sku (user_id, product_id, sku_id);
ALTER TABLE cart_items ADD KEY idx_user_checked (user_id, checked);

-- ------------------------------------------------------------
-- orders:金额构成 / 收货地址快照 / 备注物流 / 履约时间线
-- 同时修正 status 默认值(原为 '待发货',与「下单即待付款」的业务矛盾)
-- ------------------------------------------------------------
ALTER TABLE orders ALTER COLUMN status SET DEFAULT '待付款';
ALTER TABLE orders ADD COLUMN goods_amount DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '商品金额小计';
ALTER TABLE orders ADD COLUMN freight DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '运费,0 表示免运费';
ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '优惠金额';
ALTER TABLE orders ADD COLUMN receiver VARCHAR(64) NOT NULL DEFAULT '' COMMENT '收货人快照';
ALTER TABLE orders ADD COLUMN phone VARCHAR(32) NOT NULL DEFAULT '' COMMENT '收货电话快照';
ALTER TABLE orders ADD COLUMN region VARCHAR(128) NOT NULL DEFAULT '' COMMENT '省市区快照';
ALTER TABLE orders ADD COLUMN detail VARCHAR(255) NOT NULL DEFAULT '' COMMENT '详细地址快照';
ALTER TABLE orders ADD COLUMN remark VARCHAR(255) NOT NULL DEFAULT '' COMMENT '买家备注';
ALTER TABLE orders ADD COLUMN ship_company VARCHAR(64) NOT NULL DEFAULT '' COMMENT '快递公司';
ALTER TABLE orders ADD COLUMN tracking_no VARCHAR(64) NOT NULL DEFAULT '' COMMENT '运单号';
ALTER TABLE orders ADD COLUMN paid_at DATETIME NULL DEFAULT NULL COMMENT '支付时间';
ALTER TABLE orders ADD COLUMN shipped_at DATETIME NULL DEFAULT NULL COMMENT '发货时间';
ALTER TABLE orders ADD COLUMN finished_at DATETIME NULL DEFAULT NULL COMMENT '完成时间';
ALTER TABLE orders ADD COLUMN canceled_at DATETIME NULL DEFAULT NULL COMMENT '取消时间';
ALTER TABLE orders ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE orders ADD KEY idx_status (status);

-- 老订单回填商品金额,避免确认订单/详情页金额构成出现断层
UPDATE orders SET goods_amount = amount WHERE goods_amount = 0 AND amount > 0;

-- ------------------------------------------------------------
-- order_items:规格维度与规格快照
-- ------------------------------------------------------------
ALTER TABLE order_items ADD COLUMN sku_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '下单时的规格 id,0 表示无规格商品';
ALTER TABLE order_items ADD COLUMN spec_snapshot VARCHAR(160) NOT NULL DEFAULT '' COMMENT '规格文案快照';

-- ------------------------------------------------------------
-- 新表:商品多图
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_images (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id VARCHAR(16)     NOT NULL COMMENT '逻辑外键 -> products.id',
  url        VARCHAR(512)    NOT NULL,
  sort       INT             NOT NULL DEFAULT 0,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_product_sort (product_id, sort)
) ENGINE=InnoDB COMMENT='商品多图';

-- ------------------------------------------------------------
-- 新表:商品规格 SKU
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_skus (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  VARCHAR(16)     NOT NULL COMMENT '逻辑外键 -> products.id',
  spec_values VARCHAR(512)    NOT NULL DEFAULT '{}' COMMENT '规格键值对(JSON),如 {"颜色":"曜金黑","版本":"12GB+512GB"}',
  spec_text   VARCHAR(160)    NOT NULL DEFAULT '' COMMENT '规格可读文案(展示/加购/订单快照),如 曜金黑 · 12GB+512GB',
  price       DECIMAL(10,2)   NOT NULL COMMENT '该规格售价',
  stock       INT             NOT NULL DEFAULT 0 COMMENT '该规格可售库存',
  image       VARCHAR(512)    NOT NULL DEFAULT '' COMMENT '规格主图,空则回退 products.image',
  code        VARCHAR(64)     NOT NULL DEFAULT '' COMMENT '规格编码',
  sort        INT             NOT NULL DEFAULT 0,
  status      TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 停用',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_spec (product_id, spec_text),
  KEY idx_product_sort (product_id, sort)
) ENGINE=InnoDB COMMENT='商品规格 SKU';

-- ------------------------------------------------------------
-- 新表:订单状态时间轴
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no    VARCHAR(32)  NOT NULL COMMENT '逻辑外键 -> orders.order_no',
  from_status VARCHAR(16)  NOT NULL DEFAULT '' COMMENT '流转前状态,创建订单时为空',
  to_status   VARCHAR(16)  NOT NULL DEFAULT '' COMMENT '流转后状态',
  action      VARCHAR(16)  NOT NULL DEFAULT '' COMMENT 'create/pay/ship/receive/cancel',
  operator    VARCHAR(64)  NOT NULL DEFAULT 'user' COMMENT '操作者:user 本人 / system 系统',
  remark      VARCHAR(255) NOT NULL DEFAULT '' COMMENT '时间轴展示文案',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_time (order_no, created_at)
) ENGINE=InnoDB COMMENT='订单状态时间轴';

-- ------------------------------------------------------------
-- 新表:支付流水
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no   VARCHAR(32)     NOT NULL COMMENT '逻辑外键 -> orders.order_no',
  user_id    BIGINT UNSIGNED NOT NULL COMMENT '逻辑外键 -> users.id',
  method     VARCHAR(32)     NOT NULL DEFAULT 'mock' COMMENT '支付方式:wechat 微信支付 / mock 模拟支付',
  amount     DECIMAL(10,2)   NOT NULL COMMENT '支付金额',
  trade_no   VARCHAR(64)     NULL DEFAULT NULL COMMENT '第三方交易号,唯一,允许多个 NULL',
  status     VARCHAR(16)     NOT NULL DEFAULT '待支付' COMMENT '待支付/已支付/已退款/已关闭',
  paid_at    DATETIME        NULL DEFAULT NULL COMMENT '支付成功时间',
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_trade_no (trade_no),
  KEY idx_order (order_no),
  KEY idx_user_time (user_id, created_at)
) ENGINE=InnoDB COMMENT='支付流水';

-- ------------------------------------------------------------
-- 老订单补一条「创建」时间轴,避免订单详情页时间轴空白
-- 用 LEFT JOIN 判空(而非 NOT EXISTS 子查询),保证可重复执行且语义明确
-- ------------------------------------------------------------
INSERT INTO order_logs (order_no, from_status, to_status, action, operator, remark, created_at)
SELECT o.order_no, '', o.status, 'create', 'user', '订单已提交', o.created_at
FROM orders o
LEFT JOIN order_logs l ON l.order_no = o.order_no
WHERE l.id IS NULL;
