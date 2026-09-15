# 分阶段落地路线

## 第 1 阶段：本地 MVP

目标：先把客户开发的工作流跑通。

已完成：

- 线索录入
- CSV 导入
- 线索状态管理
- 开发信草稿生成
- 跟进看板
- CSV 导出
- 合规检查清单

验收标准：

- 能录入 50-200 条目标客户
- 能按状态推进客户
- 能生成可人工修改的开发信
- 能导出数据给业务人员复盘

## 第 2 阶段：真实 AI 邮件生成

目标：把模板生成升级成个性化生成。

需要接入：

- OpenAI API
- 行业画像 prompt
- 公司官网摘要
- 邮件标题 A/B 版本
- 多语言版本

建议输出：

- 首封开发信
- 第一次 follow-up
- 第二次 follow-up
- 已回复客户的下一步建议

## 第 2.5 阶段：联系人发现自动化

目标：减少人工搜索公司联系方式的时间，但仍保留来源和验证。

建议接入：

- Google Custom Search / SerpAPI：查官网 contact、team、procurement 页面
- Hunter / Apollo / Snov：按公司域名查询公开或供应商授权数据
- 邮箱验证 API：验证规则推测邮箱是否可达

必须记录：

- 联系方式来源 URL
- 是否公开页面
- 是否已验证
- 是否允许触达
- 最近验证时间

不做：

- 绕过登录限制抓取平台数据
- 批量抓取私人资料
- 使用无来源、无验证的邮箱库

## 第 3 阶段：后端与数据库

目标：从单机工具升级为团队系统。

建议技术：

- Backend：Python FastAPI
- Database：PostgreSQL
- Queue：Redis
- Frontend：Next.js 或保留轻量前端

核心表：

- users
- companies
- contacts
- campaigns
- email_drafts
- send_events
- unsubscribes

## 第 4 阶段：邮箱验证与发送

目标：降低退信率，保护域名信誉。

当前已完成：

- 本地批量预检查
- MailboxValidator API 后端代理
- 可发送/需复核/无效分级
- 验证结果写回线索备注
- 导出可发送名单

优先接入：

- ZeroBounce / NeverBounce / Hunter Email Verifier 作为后续备选
- SendGrid / Mailgun / Amazon SES

必须实现：

- SPF/DKIM/DMARC 检查
- 退订列表
- 退信记录
- 每日发送限额
- 已回复客户自动停止跟进
- 投诉和退订客户永久排除

## 第 5 阶段：线索来源合规化

目标：可持续获得客户线索。

建议来源：

- 公司官网公开联系方式
- 展会名录
- 用户上传客户表
- B2B 平台公开询盘
- 合规数据供应商

不建议：

- 绕过平台限制抓取私人资料
- 使用来路不明的邮箱库
- 使用误导性身份或标题
- 隐藏退订方式

## 下一步建议

下一步最适合做第 2 阶段：把当前本地模板换成 OpenAI API 生成，并给每个客户保存邮件草稿。
