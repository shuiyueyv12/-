// ============================================================
// services/config —— 环境配置(接后端开关 + 接口地址)
// - 前端独立运行阶段:MANUAL_USE_MOCK=true,全部走本地 mock,无需后端
// - 接入后端后:把 MANUAL_USE_MOCK 改回 false,自动切到 wx.request 真接口
// - Node 工具链(回归测试,无 wx 全局)一律走 mock,避免误触 wx.request
// ============================================================

const MANUAL_USE_MOCK = false // ← 本地/云端后端联调中;想回到纯 mock 预览改回 true 即可

// 以「具备 wx.request 能力」判定真实小程序环境:
// Node 回归测试里虽定义了 wx storage/toast stub,但没有 request,仍按 mock 处理。
const runningInMiniProgram =
  typeof wx !== 'undefined' && typeof wx.request === 'function'
const USE_MOCK = MANUAL_USE_MOCK || !runningInMiniProgram

// ------------------------------------------------------------
// 接口地址
//   开发联调(微信开发者工具 + 本机后端) → 用 DEV
//   局域网真机调试 → 把 DEV 临时改成电脑的局域网 IP,如 http://192.168.1.10:3000/api
//   上线 → 打开 USE_PROD_API,并把 PROD 改成你「已备案域名」的 HTTPS 地址
//
// 注意:小程序正式环境强制要求 request 合法域名是「已备案域名的 HTTPS」,
//       未备案前只能在开发者工具勾选「不校验合法域名」做调试。
// ------------------------------------------------------------
const API_BASE_URL_DEV = 'http://127.0.0.1:3000/api' // ← 本地后端;真机调试改成电脑局域网 IP
const API_BASE_URL_PROD = 'https://your-domain.com/api' // ← 改成你已备案的域名

// 手动开关,与 MANUAL_USE_MOCK 同风格的显式切换,避免忘记改地址就发版
const USE_PROD_API = false

const API_BASE_URL = USE_PROD_API ? API_BASE_URL_PROD : API_BASE_URL_DEV

if (USE_PROD_API && API_BASE_URL_PROD.indexOf('your-domain.com') > -1) {
  console.warn('[config] USE_PROD_API 已开启,但 API_BASE_URL_PROD 仍是占位域名,请先填写真实域名')
}

module.exports = { USE_MOCK, API_BASE_URL, MANUAL_USE_MOCK, USE_PROD_API }
