// Mock 用户数据（纯数据）
// 账号密码注册/登录后，真实用户由 mock 本地账号表（storage）或后端 users 表返回；
// 这里仅作为「兜底用户模板」。

module.exports = {
  mockUser: {
    id: 'u_1001',
    username: 'huawei',
    nickname: '华友优选',
    avatar: '', // 空串时前端渲染占位头像
    phone: '138****8000',
    level: '黄金会员',
    points: 3280,
  },
}
