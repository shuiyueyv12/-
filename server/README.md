# 华为商城小程序 · 后端服务（Express + MySQL）

为 `wxapp` 前端提供完整商品目录、用户名 + 密码登录鉴权、收藏 / 购物车 / 订单 / 支付流水能力的 REST API，与小程序端同仓库、开箱即用。**本地开发已按「默认走真实后端」接好，启动本文档第 2 节即可全链路联调。**

> 技术栈：Node.js ≥ 18 · Express 4 · mysql2（连接池） · JWT（jsonwebtoken） · MySQL 8
> 运行目录：本目录 `server/`，已被 `project.config.json` 忽略，不会打进小程序包。
> **云服务器部署见 [DEPLOY.md](./DEPLOY.md)**（腾讯云 + 1Panel：MySQL / Node / OpenResty / SSL / 备份 / 备案）。

---

## 1. 目录结构

```
server/
├─ package.json / .env / .env.example     # 依赖 / 配置(密码与密钥不入库)
├─ README.md / DEPLOY.md                  # 本地开发 / 云端部署
├─ sql/
│  ├─ schema.sql                          # 全量建库建表(15 张表,可重复执行)
│  └─ migrations/                         # 增量迁移(保留已有数据,可重复执行)
├─ tools/
│  ├─ init-db.js                           # db:init 全量 / db:migrate 增量
│  ├─ seed.js                              # 灌入 mock 数据 + 初始化默认管理员(幂等)
│  ├─ smoke-api.js                         # API 端到端冒烟测试(85 项断言)
│  ├─ smoke-admin.js                       # 管理后台端到端冒烟测试(47 项断言)
│  └─ mysql-local.js                       # 管理「项目专用」本地 MySQL 实例(仅本机开发)
├─ admin/                                  # ★ Web 管理后台(独立进程)
│  ├─ app.js                               # 管理端 Express 入口(3001)
│  ├─ config.js                            # 管理端配置(ADMIN_PORT / ADMIN_JWT_SECRET)
│  ├─ middlewares/admin-auth.js            # role==='admin' 的 JWT 鉴权
│  ├─ routes/                              # auth/products/categories/banners/orders/users/payments/dashboard
│  └─ public/index.html                    # Vue3 单页管理界面(零构建)
└─ src/
   ├─ app.js                               # Express 入口(路由/错误处理/监听)
   ├─ config.js                            # 读取 .env
   ├─ db.js                                # mysql2 连接池 + query / tx 封装
   ├─ middlewares/{auth,error}.js          # JWT 鉴权 / 统一错误
   ├─ utils/{password,wechat,serializers}.js # scrypt 哈希 / code2session(预留) / 行->JSON 序列化
   ├─ models/{users,orders}.js             # 用户数据访问 / 订单状态机
   └─ routes/{auth,user,banners,categories,
              products,favorites,cart,orders,payments,addresses}.js
```

### 数据表（15 张）

| 分类 | 表 | 说明 |
|---|---|---|
| 账号 | `users` | 用户名 + scrypt 密码；`openid` 预留微信绑定；`status` 可禁用账号 |
| | `addresses` | 收货地址，每个用户全局最多一个默认地址 |
| | `admins` | **后台管理员**（与小程序用户完全隔离，管理端独立登录） |
| 商品目录 | `categories` | 一级分类（含 `icon` 图标名、`enabled` 开关） |
| | `sub_categories` | 二级分类 |
| | `products` | 商品：现价 / **划线价** / **可售库存** / 销量 / 主图 / 上下架 |
| | `product_images` | **商品多图**（详情页轮播，按 `sort` 排序） |
| | `product_skus` | **商品规格**：`spec_values`(JSON) + `spec_text` + 独立价格/库存/主图/编码 |
| 运营 | `banners` | 首页轮播 |
| 用户行为 | `favorites` | 收藏（`uk_user_product` 防重） |
| | `cart_items` | 购物车，**最小行 = 商品 + 规格**，`uk_user_product_sku` 防重 |
| 交易 | `orders` | 订单：金额构成 + **收货地址快照** + 备注 + 物流 + 履约时间线 |
| | `order_items` | 订单明细**快照**（名称/图/单价/**规格**），商品改价下架不影响历史订单 |
| | `order_logs` | **订单状态时间轴**，每次流转一条 |
| | `payments` | **支付流水**：支付方式 / 金额 / 第三方交易号 / 支付状态 |

设计要点：

- **`products.id` 沿用 mock 的字符串主键（`p101`…）**：`productId`、收藏、购物车、订单快照全链路依赖它，不改类型；
- **`sku_id = 0 表示「无规格商品」**（不用 `NULL`）：MySQL 唯一索引允许多个 `NULL`，会让 `(user_id, product_id, sku_id)` 去重失效；
- **不加物理外键约束**：关系以索引 + 注释表达，由应用层保证一致，同时保留 `TRUNCATE` 式幂等灌数能力；
- 金额统一 `DECIMAL(10,2)`，全库 `InnoDB` + `utf8mb4`。

> 优惠券 / 积分 / 会员中心在「我的」页面目前只是占位入口、无真实功能，故不建死表；设计意图记在 `sql/schema.sql` 文件末尾，二期按需补 `coupons` / `user_coupons` / `points_logs` / `member_levels`。

---

## 2. 快速开始

### 方式 A：用「项目专用」本地 MySQL 实例（推荐，零账号配置）

仓库自带管理脚本，在 `%LOCALAPPDATA%\mall-mysql` 初始化**独立的** MySQL 8 实例（端口 **3307**，root 空密码），完全不影响你本机已有 MySQL 的数据与密码。

```bash
cd server
npm install                                  # 安装依赖(首次)
npm run mysql:init                           # 首次:初始化独立数据目录(约 30 秒)
npm run mysql:start                          # 启动 3307 实例
npm run db:init                              # 建库建表(schema.sql → mall 库,14 张表)
npm run db:seed                              # 灌入 4 分类 / 14 商品 / 42 张图 / 70 个规格 / 3 轮播
npm run dev                                  # 启动 API,http://127.0.0.1:3000
```

配套命令：`npm run mysql:stop` / `npm run mysql:status`。`.env` 已默认指向 3307/root 空密码，无需修改即可跑通。

### 启动 Web 管理后台（另一个终端）

```bash
npm run admin:start        # http://127.0.0.1:3001/admin
```

默认账号 **admin / admin123**（`db:seed` 自动创建），登录后请立即修改密码。管理商品 / 分类 / 轮播 / 订单发货 / 用户禁用 / 支付流水，所有操作实时同步到数据库。详见下文「Web 管理后台」。

> `mysql-local.js` 顶部 `BIN` 写死的是本机 `C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe`；如果你的 MySQL 装在其他路径，改这一行即可。

### 方式 B：使用你自己的 MySQL

```bash
cd server
npm install
copy .env.example .env     # Windows: copy;mac/linux: cp .env.example .env
# 编辑 .env,填入你的 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD
npm run db:init            # 要求该账号有建库权限(会创建 mall 库)
npm run db:seed
npm run dev
```

### 验证

```bash
npm run smoke     # 85 项端到端断言,应全部 PASS
```

也可浏览器打开 `http://127.0.0.1:3000/api/health` 看到 `{"ok":true,...}`。

### 数据库变更怎么走

| 场景 | 命令 | 影响 |
|---|---|---|
| 全新环境 / 想重置演示数据 | `npm run db:init` | 执行 `sql/schema.sql`，**DROP + CREATE 全部表**，业务数据清空 |
| 线上或有真实数据的库 | `npm run db:migrate` | 逐条执行 `sql/migrations/*.sql`，**只加列/加表**，自动跳过已存在的列与索引 |
| 重新灌演示数据 | `npm run db:seed` | 先 `TRUNCATE` 再插入，**保留 `users` / `addresses`**，可重复执行 |

---

## 3. 配置项（.env）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | API 端口 |
| `HOST` | `127.0.0.1` | 监听地址。默认只监听本机，云上由 OpenResty 反代对外；局域网真机调试才改 `0.0.0.0` |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | MySQL 地址（项目专用实例为 3307） |
| `DB_USER` / `DB_PASSWORD` | `root` / 空 | MySQL 账号（专用实例为空密码）；**生产用专用账号** |
| `DB_NAME` | `mall` | 业务库名 |
| `JWT_SECRET` | dev 占位 | 生产务必改成随机长串 |
| `JWT_EXPIRES` | `7d` | token 有效期 |
| `WECHAT_APPID` | `wx` 开头的 18 位 AppID | 小程序 AppID（预留：微信绑定，当前登录不使用） |
| `WECHAT_APPSECRET` | 空 | 预留：code2session。当前用户名密码登录不依赖此配置 |
| `ALLOW_MOCK_LOGIN` | `true` | 预留：微信开发降级登录开关（当前登录不使用）。**生产改 `false`** |
| `ADMIN_PORT` / `ADMIN_HOST` | `3001` / `127.0.0.1` | 管理后台监听（云上保持 127.0.0.1，由反代对外） |
| `ADMIN_JWT_SECRET` | dev 占位 | 管理端独立 JWT 密钥，与 `JWT_SECRET` 分开，生产必须改随机长串 |
| `ADMIN_JWT_EXPIRES` | `12h` | 管理端会话有效期 |

---

## 4. API 一览

基础路径：`http://127.0.0.1:3000/api`。响应 = 业务 JSON 直接返回；错误统一为 `{ message }` + 状态码。

### 公共只读（无需登录）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/banners` | 首页轮播（仅 enabled，按 sort） |
| GET | `/categories` | 分类树，含 `subs` 子分类与 **`icon` 图标名**（仅 enabled） |
| GET | `/products` | 商品列表。query 支持：`categoryId`、`sub`、`keyword`、`featured=1`、`ids=p101,p102`（批量）。每条含 `stock` / `sales` / `originalPrice` |
| GET | `/products/:id` | 商品详情，额外返回 **`images[]`（多图）** 与 **`skus[]`（规格）** |

### 鉴权与用户

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | body `{ username, password, nickname? }`；用户名唯一，返回 `{ token, user }` |
| POST | `/auth/login` | body `{ username, password }`；返回 `{ token, user }`；账号被禁用返回 403 |
| POST | `/auth/logout` | 登出（前端以清 token 为主），返回 `{ ok: true }` |
| GET | `/user/me` | token 换当前用户（启动会话恢复 / 刷新） |

### 用户态（请求头带 `Authorization: Bearer <token>`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/favorites` | 收藏商品完整列表（join products，含库存字段） |
| POST | `/favorites/:productId` | 收藏（唯一索引防重） |
| DELETE | `/favorites/:productId` | 取消收藏 |
| GET | `/cart` | `{ items: [{ productId, skuId, qty, checked, spec, price, image }] }` |
| PUT | `/cart` | body `{ items:[{productId, skuId?, qty, checked}] }` **整单覆盖**；服务端过滤已下架商品与失效规格 |
| POST | `/orders` | 下单（初始状态**待付款**，下单即占用库存）。body 不传或 `items` 为空 = 结算购物车勾选项并清车；传 `{ items:[{productId, skuId?, qty}], addressId?, remark? }` = 按明细结算（立即购买，不动购物车） |
| POST | `/orders/:orderNo/status` | 状态流转。body `{ action }`：`pay` / `ship` / `receive` / `cancel` |
| GET | `/orders?limit=10` | 最近订单（每单带**前 3 条** items 快照 + 时间轴） |
| GET | `/orders/:orderNo` | 订单详情（**全部** items 快照 + 收货信息 + 支付方式 + 时间轴） |
| POST | `/payments` | 模拟支付：body `{ orderNo, method?: 'wechat'\|'mock' }`，写支付流水并触发 `pay` 流转，返回 `{ ok, order, payment }` |
| GET | `/payments/:orderNo` | 某订单的支付流水（倒序） |
| GET / POST | `/addresses` | 收货地址列表 / 新增 `{ receiver, phone, region, detail, isDefault }` |
| PUT / DELETE | `/addresses/:id` | 更新（传 `isDefault=true` 自动清掉其他默认）/ 删除 |

### 下单（order）返回契约（与前端 store 完全一致）

```json
{
  "orderId": "HT1788944252830436",
  "status": "待付款",
  "goodsAmount": 13998,
  "freight": 0,
  "discount": 0,
  "amount": 13998,
  "count": 2,
  "createdAt": 1788944253000,
  "remark": "请工作日送货",
  "address": {
    "receiver": "张三",
    "phone": "13800138000",
    "region": "广东省深圳市",
    "detail": "天安云谷 6 栋"
  },
  "shipCompany": "",
  "trackingNo": "",
  "paidAt": null,
  "shippedAt": null,
  "finishedAt": null,
  "canceledAt": null,
  "items": [
    { "id": "p101", "skuId": "12", "name": "...", "image": "...", "spec": "曜金黑 · 12GB+256GB", "price": 6999, "qty": 2 }
  ],
  "logs": [
    { "action": "create", "fromStatus": "", "toStatus": "待付款", "remark": "订单已提交,等待付款", "createdAt": 1788944253000 }
  ]
}
```

业务规则：

- **金额以服务端为准**：`POST /orders` 无论购物车还是明细模式，一律按数据库实时价格重算（有规格取规格价），不信任前端传价；`amount = goodsAmount + freight - discount`（当前免运费、无优惠，字段先就位）；
- **库存下单即占用**：`UPDATE ... SET stock = stock - ? WHERE id = ? AND stock >= ?` 并校验 `affectedRows`，并发下不超卖；库存不足返回 400。`cancel` 会自动回补库存；
- **收货地址在下单瞬间快照**进 `orders` 表，地址后续被改/删都不影响历史订单；传 `addressId` 用指定地址，不传则取该用户默认地址；
- 下单在事务内完成：扣库存 → 写 `orders` → 写 `order_items`（快照） → 购物车模式下删除已购项 → 写 `order_logs`；任一步失败整体回滚；
- **订单状态机**：`待付款 --pay--> 待发货 --ship--> 待收货 --receive--> 已完成`；`待付款 --cancel--> 已取消`。非法流转返回 400。状态流转规则、履约时间线、库存回补统一在 `models/orders.js`，`POST /orders/:orderNo/status` 与 `POST /payments` 共用同一份实现；
- `ship` 会写入模拟的快递公司与运单号，供订单详情页展示；
- 列表接口的 `items` 仅带前 3 条（与 mock 时代的前端展示口径一致），完整明细通过订单详情接口取。

---

## 4.5 Web 管理后台（独立进程 3001）

`npm run admin:start` 启动后，浏览器打开 **http://127.0.0.1:3001/admin**：

- **登录**：`admins` 表 + scrypt 密码校验，签发带 `role:'admin'` 的独立 JWT（与小程序 token 互不通用，即使密钥泄露也不串权）；支持登录后修改密码；
- **模块**：仪表盘（商品/订单/销售额/待发货统计 + 最近订单 + 热销 TOP5）、商品管理（多图 URL 列表 + 规格 SKU 表格一并维护）、分类管理（含子分类）、轮播图（增删改 + 拖动排序）、订单管理（状态 Tab + 详情抽屉 + 发货/取消）、用户管理（禁用/启用）、支付流水（按订单号检索）；
- **数据一致性**：
  - 商品编辑在事务内同步 `products` + `product_images`（全量替换）+ `product_skus`（有 id 更新 / 无 id 新增 / 缺席的停用，不物理删除以保护订单快照）；
  - 被订单/购物车/收藏引用的商品执行删除时自动转为**下架软删**；
  - 发货/取消复用 `models/orders.js` 状态机，与小程序侧共用时间轴与库存回补逻辑；
  - 分类删除前校验子分类与商品引用；
- **管理 API**：`/admin/api/*`（登录接口外全部要求 `role==='admin'`）；
- **测试**：`npm run smoke:admin`（47 项端到端断言，需两个服务都在运行）。

> 管理页为 Vue3 单文件（`admin/public/index.html`，Vue 已本地化到 `admin/public/vendor/`），零构建、零新增 npm 依赖；云上部署见 DEPLOY.md 第 7.3 节。

---

## 5. 登录鉴权说明

1. **注册**：`POST /api/auth/register` 传 `{ username, password }`，用户名需 3-20 位字母 / 数字 / 下划线且唯一；密码 6-64 位，服务端用 Node 内置 `crypto.scrypt` 加盐哈希后入库（不存明文），注册成功直接返回 token；
2. **登录**：`POST /api/auth/login` 传 `{ username, password }`，校验通过后签发 JWT（默认 7 天）并回写 `users.last_login_at`；「用户名不存在」与「密码错误」统一返回 `401 用户名或密码错误`，避免暴露账号是否存在；
3. **账号禁用**：`users.status = 0` 的账号登录返回 403；已登录的账号被禁用后，`/user/me` 返回 401，前端会自动清登录态；
4. **微信 code2session 为预留能力**（`utils/wechat.js` 与 `.env` 的 `WECHAT_*`），当前登录流程不依赖。

鉴权中间件对所有 `/api/favorites` `/api/cart` `/api/orders` `/api/payments` `/api/user/me` 生效；token 缺失/过期返回 401，前端 `services/api.js` 收到 401 会自动清登录态并通知 store。

---

## 6. 小程序端如何接

小程序端数据层（`services/api.js` / `store/shop.js`）已按「服务端模式」改造完毕，页面层零改动。

- **模式判定**在 `services/config.js`：
  - 微信开发者工具/真机环境（存在 `wx.request`）默认 `USE_MOCK=false`，走真实后端 `http://127.0.0.1:3000/api`；
  - 离线看 UI / 后端没启动时，把 `MANUAL_USE_MOCK` 临时改为 `true` 即可切回本地 mock；
  - Node 回归测试会自动识别为 mock，不影响。
- **接口地址**同样在 `services/config.js`：开发用 `API_BASE_URL_DEV`；上线把 `API_BASE_URL_PROD` 改成已备案 HTTPS 域名并打开 `USE_PROD_API`（忘记改域名会有控制台提醒）。
- 本地调试务必勾选开发者工具 **详情 → 本地设置 → 不校验合法域名…**（访问 `127.0.0.1` 必需）；真机预览需把 `API_BASE_URL` 改成电脑局域网 IP（并令后端 `.env` 的 `HOST=0.0.0.0`）。
- 登录态数据（收藏/购物车/订单）存服务端，换设备/清缓存不丢；游客加购/收藏在登录瞬间自动与服务端**合并**（同「商品 + 规格」数量相加、勾选相或）。
- **商品多图与规格**由 `frontend/mock/specs.js` 确定性派生，`npm run db:seed` 与小程序 mock 预览共用这一份实现，因此两种模式看到的规格、库存、价格完全一致。
- 结算前若未登录，`checkout()` 会提示先登录（错误带 `needLogin`），确认订单页据此跳转登录页；未选收货地址也会被拦下提示。

前端回归：

```bash
cd wxapp/frontend
node tools/smoke-store.cjs     # 全局状态单例全链路(mock 模式,不发网络请求)
node tools/verify-wxapp.cjs    # 工程静态一致性(页面四件套/事件绑定等)
node tools/smoke-online.cjs    # 前端数据层 ↔ 真实后端集成(需先启动 npm run dev)
```

---

## 7. 上线 checklist

详见 **[DEPLOY.md](./DEPLOY.md)**（腾讯云 + 1Panel 完整步骤）第 14 节。核心项：

- [ ] `.env` 填入真实 `WECHAT_APPSECRET`，`ALLOW_MOCK_LOGIN=false`，`HOST=127.0.0.1`；
- [ ] `JWT_SECRET` 改为随机长字符串，妥善保管；
- [ ] 数据库使用专用账号（非 root），仅授权 `mall` 库；
- [ ] 后端部署到云服务器，配 HTTPS 域名 + OpenResty 反向代理，3000/3306 不对外；
- [ ] 1Panel 计划任务做数据库定时备份；
- [ ] 微信公众平台 → 开发管理 → 服务器域名：把 `https://你的域名` 加入 **request 合法域名**；`images.unsplash.com` 加入 **downloadFile 合法域名**（或把商品图迁移到自有 CDN 并重新 seed）；
- [ ] 前端 `services/config.js` 的 `USE_PROD_API = true` 且域名正确；
- [ ] 数据库变更一律文件化：全量用 `sql/schema.sql`，增量用 `sql/migrations/*.sql` + `npm run db:migrate`。

---

## 8. 常见问题

| 问题 | 处理 |
|---|---|
| `npm run dev` 报数据库连接失败 | 确认 MySQL 已启动：方式 A 先 `npm run mysql:start`；方式 B 核对 `.env` 的账号密码与端口 |
| 3306 是你系统已有 MySQL、root 有密码 | 用方式 A（独立 3307 实例）即可互不干扰；或把自己的密码填入 `.env` |
| `mysql-local.js` 找不到 mysqld | 把顶部 `BIN` 改成你的 `mysqld.exe` 绝对路径 |
| 想重置数据重新演示 | `npm run db:init && npm run db:seed`（会重建全部表并重灌数据） |
| 已有数据但想升级表结构 | `npm run db:migrate`（只加列/加表，不丢数据；已存在的对象自动跳过） |
| 改了 seed 数据不生效 | seed 先 TRUNCATE 再插入，直接重跑即可 |
| 端口 3000 被占用 | 改 `.env` 的 `PORT`，并同步改小程序 `services/config.js` 的 `API_BASE_URL` |
| 云上启动报 `ECONNREFUSED 127.0.0.1:3306` | 1Panel 的 MySQL 是容器化部署，确认 3306 已映射到宿主机（详见 DEPLOY.md 第 13 节） |
