# 于大龙外贸助手 · Dragon sales box

## 2.1.1 客户开发与邮件工作台版

品牌 Logo 为 DSB，作者为 Spyro Yu，联系邮箱 y1921127348@gmail.com。项目继续使用 outreach-desk 仓库及原有应用数据目录。

- 首页：世界时间、工作日办公时段、跟进任务、每日参考汇率和换算。
- 客户：手动录入、图片/文字 AI 识别与公开网页补全，A–D 分级、覆盖全球的外贸大区多选筛选、单元格跟进安排、沟通历史、Excel/CSV 导入导出。
- 客户开发：AI 规划行业定向检索，整理官网与公开联系人信息，生成唯一编号，自动或勾选导入「待研究」客户。
- 邮件：按等级/分类选择客户，AI 编写、富文本、图片、签名、附件、SMTP 登录测试、逐封预览与发送。按联系人或公司邮箱自动生成称呼；发送成功自动写入带日期、主题和收件邮箱的沟通记录。
- 产品：基础资料、尺寸重量、外箱参数、CBM、销售话术、问答、本地素材及列表缩略图。
- 单据：报价单、PI、销售合同、商业发票、PL、防亏报价助手；客户/产品模糊搜索带入、报价产品图片开关、草稿和版本记录、PDF及Excel导出。
- 模板：每类单据独立保存布局、颜色、字体大小、抬头、列名和顺序、页脚；可导入HTML模板，历史单据保存模板快照。
- 邮箱验证：使用姓名和公司域名生成候选邮箱，继续使用 MailboxValidator 验证，并在验证成功后关联已有客户公司或新建客户。
- 设置：清爽蓝白/磨砂玻璃主题；SMTP、AI、搜索及邮箱验证API都在程序内配置。

### 运行与数据

Windows 解压版：打开 `dist/win-unpacked/Dragon sales box.exe`，分发时保留整个目录，不能只复制该EXE。单文件便携版为 `dist/Dragon-Sales-Box-2.1.1.exe`。

开发启动：`pnpm desktop`；浏览器预览：`pnpm start`。

数据写入应用用户目录的 `workspace-data.json`，配置为 `settings.json` 和 `workspace-settings.json`。数据写入采用临时文件替换并保留 `.bak`。桌面启动会尝试从同一用户目录中旧版localhost来源的localStorage迁移客户，并按ID/邮箱去重；原始记录保留。被其他程序占用的旧端口会留待下次启动重试。

`DSB_DATA_DIR` 可覆盖桌面数据目录，主要用于隔离测试。不要将真实配置文件或数据文件提交到公开仓库。

### 自定义单据模板

进入“单据模板”创建模板，再在单据编辑器中选择。PDF使用模板的布局；Excel采用表格布局并使用模板的抬头、颜色、列顺序、列名和页脚。自定义HTML不是Excel工作簿模板。

HTML模板可使用 `{{document}}` 或组合 `{{items}}`、`{{number}}`、`{{date}}`、`{{buyer}}`、`{{seller}}`、`{{total}}`、`{{currency}}`、`{{terms}}`。脚本和外部资源不执行；Logo可在单据编辑器上传。

### 配置与限制

名片图片识别需要支持视觉的模型。搜索和AI结果应核对后入库；公开网页采集不保证找到个人邮箱。MailboxValidator只反映验证时点的状态。汇率使用 [ExchangeRate-API每日公开汇率](https://www.exchangerate-api.com/docs/free)，不是实时交易报价。

邮件使用用户的SMTP账号直接发送，客户端提供最终发送确认。SMTP接受代表发件服务器已接受，不代表已读或最终送达。关闭程序会中断未完成队列，发送记录用于人工核对，避免重复发送。

### 测试

`node scripts/verify-workspace.cjs` 检查持久化、迁移去重、跟进、计算、版本、Excel及模拟SMTP成功/失败/退订。

`scripts/verify-ui.cjs` 使用Playwright及Edge检查各页面和桌面/手机视图；`scripts/verify-electron.cjs` 检查真实Electron启动及PDF导出。可通过 `DSB_PLAYWRIGHT_PATH` 指定Playwright模块路径，`DSB_EXE` 指定打包后的EXE。

Electron 31内置Node 20，`sanitize-html` 固定在2.17.0以避免较新版本依赖ESM-only解析器造成启动失败。依赖升级必须重新跑桌面测试。

以下为旧版功能说明，供历史版本参考。

---

这是一个合规 B2B 开发信工作台。当前版本已经改成可桌面化的结构，可以在程序内配置邮箱验证 API 和 AI 邮件生成 API。

Author: **Spyro Yu**  
Contact: **y1921127348@gmail.com**  
GitHub: [Spyro043/DALONG-SALES-BOX](https://github.com/Spyro043/DALONG-SALES-BOX)

## 启动方式

### 桌面程序方式

安装依赖后运行：

```powershell
npm run desktop
```

打开程序后进入 `设置`，填写：

- MailboxValidator API Key
- 全网搜索 API Key：SerpAPI、Brave Search、Bing Web Search 或自定义搜索 API
- 邮件生成服务：ChatGPT/OpenAI、豆包、Kimi 或自定义
- Base URL
- 模型名
- AI API Key

配置会保存在本机程序数据目录，不需要手动编辑代码。

### 本地服务器方式

也可以继续用本地服务器：

```powershell
.\start-server.ps1
```

然后打开：

```text
http://localhost:5173
```

### 环境变量方式

如果你不想在界面里配置，也可以复制 `.env.example` 为 `.env`，填写：

```env
MAILBOXVALIDATOR_API_KEY=你的 MailboxValidator API Key
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4.1-mini
PORT=5173
```

界面保存的设置优先用于程序运行。

## 打包 EXE

安装依赖后运行：

```powershell
npm run build:win
```

生成文件会在 `dist/` 目录里，例如 `Outreach-Desk-0.1.0.exe`。

如果需要安装包版本：

```powershell
npm run build:win-installer
```

API Key 只保存在本机配置文件，不写到浏览器页面或前端 JS 里。

## 当前能力

- 根据行业、公司类型、关键词进行全网目标公司发现
- 自动生成多组搜索语句并返回公司官网、LinkedIn/目录来源
- 已知公司名/官网时，联网搜索公开联系人候选
- 从公司名/官网生成公开搜索入口
- 根据姓名和域名生成常见邮箱格式候选
- 确认公开来源后加入线索池
- 批量邮箱本地预检查
- MailboxValidator API 邮箱验证
- 验证结果写回线索备注
- 导出可发送名单
- OpenAI 自动生成开发信
- 手动新增客户线索
- 导入 CSV 线索
- 本地保存线索数据
- 按状态管理跟进阶段
- 基于客户信息生成开发信草稿
- 导出 CSV
- 发送前合规检查清单

## 怎么从公司找到联系人

如果你还不知道公司名，可以先打开 `市场发现`：

1. 输入目标行业，例如 `FPSO 船东`、`海上平台`、`溢油类产品`。
2. 输入公司类型，例如 `船东`、`代理商`、`贸易商`、`海上平台运营商`。
3. 输入产品/场景关键词。
4. 点击 `开始全网搜索`。
5. 系统会过滤新闻、百科、论坛、文章、招聘和普通内容页，只保留有效公司候选。
6. 在公司列表里打开官网、LinkedIn 或目录来源。
7. 点击 `找联系人`，系统会把公司信息带入“找联系人”页面继续挖联系人。

没有配置搜索 API 时，程序会使用公开搜索 fallback；配置 SerpAPI、Brave Search API 或 Bing Web Search API 后会更稳定、速度更快、结果更结构化。

1. 打开 `找联系人`。
2. 输入公司名、官网、目标职位和业务关键词。
3. 点击 `联网搜索联系人`，软件会自动搜索公开网页、公司官网、LinkedIn/目录来源里的联系人线索。
4. 看到候选联系人后，点击 `填入线索`。
5. 如需人工复核，也可以点击 `查看搜索入口` 打开备用搜索链接。
5. 如果找到联系人姓名但没有邮箱，填写姓名和域名，生成常见邮箱格式。
6. 也可以点击 `打开 Mailmeteor 查询`，系统会按 `name` 和 `domain` 自动打开 Mailmeteor Email Finder。
7. 点击 `复制所有邮箱` 可以把候选邮箱复制到剪贴板。
8. 点击 `导入到验证页` 会把候选邮箱放进验证页的手动邮箱列表。
9. 点击 `验证所有候选邮箱`，先筛掉明显错误或高风险邮箱。
10. 候选邮箱旁边的 `外部验证` 会打开 Mailmeteor Email Verifier 页面。
11. 选择通过验证的候选邮箱，系统会填入“确认后加入线索”表单。
12. 用邮箱验证 API 做最终确认后，再加入线索池。
13. 保留来源说明，方便后续判断是否合规、是否可联系。

这一步的目标不是偷偷抓取私人资料，而是把公开、授权或合规供应商提供的信息整理成可跟进的销售线索。

## 怎么使用邮箱验证

打开 `验证` 页面后有两种方式：

1. 选择 `线索池邮箱`，系统会读取当前线索池里所有邮箱。
2. 选择 `手动粘贴`，把邮箱列表贴进去，每行一个或用逗号分隔。

点击 `开始验证` 后，当前版本会先做本地预检查：

- 邮箱格式是否正确
- 是否明显是一次性邮箱
- 是否是免费邮箱
- 是否是 info、sales、contact 这类角色邮箱
- 是否存在明显域名异常

结果分为：

- `可发送`：格式正常，但仍建议接 API 做最终验证。
- `需复核`：可能能用，但建议人工确认或 API 验证。
- `无效`：不建议发送。

点击 `写回线索状态` 会把验证结果写入线索备注。点击 `导出可发送` 会导出通过预检查的线索。

注意：浏览器本地无法可靠检查 MX、SMTP、收件箱是否存在。当前版本已经通过后端接入 MailboxValidator；如果没有配置 API Key，会退回本地预检查。

## ChatGPT/OpenAI 开发信生成

邮件页的 `生成邮件草稿` 已经改为调用本地后端 `/api/generate-email`，再由后端调用你在 `设置` 里选择的 AI 服务。

如果生成失败，通常是：

- 没有在 `设置` 里填写 AI API Key
- Base URL 或模型名不正确
- 当前模型没有权限
- 本地服务器没有运行

## Mailmeteor 集成方式

当前版本采用深链集成：

- Email Finder：`https://mailmeteor.com/tools/email-finder?name=姓名&domain=域名`
- Email Verifier：`https://mailmeteor.com/tools/email-verifier?email=邮箱`

这样可以直接跳到 Mailmeteor 的查询页面，避免重复输入。

如果要把 Mailmeteor 的结果自动显示在本工具里，需要 Mailmeteor 提供官方 API。不要直接抓取网页结果，因为页面结构会变、可能受登录/验证码限制，也可能违反对方服务条款。

## CSV 字段

支持英文或中文表头：

- `company` / `公司`
- `website` / `网站`
- `name` / `联系人`
- `title` / `职位`
- `email` / `邮箱`
- `region` / `国家` / `国家/地区`
- `source` / `来源`
- `status` / `状态`
- `notes` / `备注` / `业务备注`

## 后续落地路线

1. 接搜索 API 或合规数据供应商 API，减少人工打开页面的动作。
2. 接 PostgreSQL，把浏览器本地数据换成团队共享数据。
3. 接 OpenAI API，把本地模板升级为真正的个性化邮件生成。
4. 接邮箱验证服务，降低退信率，并把 API 结果写回验证页。
5. 接 SendGrid、Mailgun 或 Amazon SES，记录发送和回复。
6. 加退订列表、黑名单、发送限速、SPF/DKIM/DMARC 检查。

## 合规边界

这个项目建议只处理公开、授权或合规供应商提供的 B2B 线索。不要绕过平台限制抓取私人资料，不要隐藏退订入口，不要用误导性标题或伪造身份发送邮件。
