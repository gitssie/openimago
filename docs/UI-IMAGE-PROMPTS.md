# openimago UI 图像生成设计简报

> 本文档面向图像生成模型（Midjourney / DALL·E / SD / Flux），为 openimago 平台生成高品质 UI 设计概念图。
> 所有 prompt 可直接复制粘贴使用，强调**专业 AI 创意工作室**氛围，拒绝泛化 SaaS 仪表盘风格。

---

## 一、设计诊断：当前痛点

### 视觉层面

| 问题 | 描述 |
|------|------|
| **Dark+Neon 执行不彻底** | 背景色落在 `#0a0a0f ~ #12121a` 区间，但卡片、面板缺乏层次区分，亮部与暗部的对比关系模糊，"夜景霓虹"感受弱。 |
| **留白与信息密度失衡** | 会话工作台三栏布局（会话列表 / 聊天区 / 结果面板）在无内容时大面积漆黑空洞，有内容时又因文本/控件密集而压抑。 |
| **材质感缺失** | 当前界面几乎是纯色块拼接，缺少磨砂玻璃、微纹理、光晕渐变、边缘辉光等让"暗色界面"不沉闷的材质层次。 |
| **霓虹色使用零散** | 主色 `#00f0ff`（cyan）和 `#a855f7`（purple）出现在个别按钮/图标上，视觉锚点不够集中，整体感受偏灰而非"璀璨"。 |
| **字体节奏单一** | 全界面依赖 Quasar 默认无衬线体，缺少从 display（大标题）到 caption（辅助标注）的字重/字号韵律变化。 |

### 交互与产品体验层面

| 问题 | 描述 |
|------|------|
| **Agent 思考过程不可见** | 用户发送 prompt → 长时间等待 → 图片突然出现。AI 推理、工具调用、步骤推进的全过程缺乏可视化引导，用户处于"黑箱等待"焦虑中。 |
| **对话流与结果面板割裂** | 左侧聊天区是纯文本流，右侧"生成结果"面板目前只有占位图标。生成完成的图片出现在聊天消息内，右侧空面板毫无信息，三栏变成"一栏干活、两栏吃灰"。 |
| **聚光输入框视觉承诺未兑现** | PRD 定义"暗底上霓虹光晕聚焦在唯一输入点"的记忆点，但当前输入区只是一个标准 Quasar input，缺乏光晕、辉光涟漪、聚焦动效等视觉兑现。 |
| **会话管理操作沉重** | 新建会话仅一个+按钮，会话列表缺少分组、标签、搜索等轻量组织能力；切换会话时无过渡，内容瞬间跳变。 |
| **缺少产品调性载体** | 仪表盘/项目列表/资产库等子页面的视觉语言与核心工作台脱节，用户在不同页面间切换时感受不到统一的"工作室"身份。 |

---

## 二、产品定位：专业 AI 创意工作室

openimago 不是"又一个 ChatGPT 套壳"，而是——

**一个面向视觉创作者的 AI 创意工作室 (AI Creative Studio)**

| 维度 | 定位关键词 |
|------|-----------|
| **用户画像** | 设计师、摄影师、视频创作者、视觉内容团队 |
| **核心价值** | AI 作为创作伙伴（Agent），用户通过自然语言对话驱动图像/视频生成，Agent 可自主使用工具链（代码执行、文件读写、Shell 操作）完成复杂创意任务 |
| **情感基调** | 沉静、专注、技术感，让用户在暗色空间中沉浸，生成的图像如作品在"画廊"中展示 |
| **差异点** | OpenCode Agent 驱动力 — AI 不仅是生成器，还是能思考推理、规划步骤、操作工具的"数字创作助理"。UI 必须让这个过程**可视化**而非隐藏。 |

---

## 三、全局视觉语言 (Global Visual Language)

### 色彩系统

| 角色 | 色值 | 用途 |
|------|------|------|
| Base BG (最深) | `#06060c` | 页面底色、侧栏背景 |
| Card BG | `#0f0f18` | 面板、消息气泡、输入区 |
| Surface BG | `#181824` | 高亮面板、悬浮层、侧面板 |
| Neon Cyan | `#00e5ff` | 主交互色：按钮、链接、选中态、输入聚焦辉光 |
| Neon Purple | `#8b5cf6` | 辅助交互色：进度指示、AI 思考标识、强调标注 |
| Neon Amber | `#f59e0b` | 警告/待处理色：权限请求、队列项、Todo |
| Text Primary | `#e8e8ed` | 正文 |
| Text Secondary | `#9494a6` | 辅助文字、占位符 |
| Border Subtle | `rgba(255,255,255,0.06)` | 分割线、卡片边框 |

### 材质与氛围

- **磨砂玻璃 (Frosted Glass)**：面板、抽屉、模态框使用 `backdrop-filter: blur(16px) saturate(120%)` + 半透明背景 + 极细亮边
- **微光晕 (Ambient Glow)**：焦点区域 (聚光输入框、选中卡片、生成结果) 发出弥散霓虹光晕，模拟真实光源散射
- **网格底纹 (Dot Grid/Hex Grid)**：空态区域使用半透明网格纹理，暗示"画布 / 工作台"空间感
- **渐变辉光边框 (Gradient Glow Border)**：重要容器边缘使用细微的 cyan→purple 渐变描边，仅在悬浮/选中时增强
- **墨水扩散 (Ink Bloom)**：用户发送消息时，消息气泡底部出现微妙的霓虹光扩散动效

### 字体系统

| 层级 | 描述 |
|------|------|
| Display | 品牌标题、页面大标题 — 字重 700-800，letter-spacing: -0.02em |
| Heading | 面板标题、会话标题 — 字重 600 |
| Body | 对话正文、描述文本 — 字重 400，line-height: 1.6 |
| Code | Agent 推理输出、代码片段 — 等宽字体，半透明终端风格背景 |
| Caption | 时间戳、元信息、辅助标注 — 字重 400，较小字号，text-secondary 色 |

### 动效原则

- 微动效 (150-250ms)：hover 辉光、焦点切换、图标状态变化
- 中动效 (300-500ms)：面板展开/收起、消息进入流、生成完成过渡
- 大动效 (600-800ms)：页面切换、首次加载、全局面板重组
- **避免**：弹跳、回弹、夸张缓动 — 保持专业克制感
- **强调**：光晕呼吸（生成中）、粒子汇聚（结果出现）、流式打字（Agent 推理）

---

## 四、图像生成 Prompt 清单

### Prompt 1 — 主会话工作台 (Main Session Workspace)

#### 构图与布局

三栏水平布局，比例为 **1 : 3 : 2**：
- **左栏（会话侧栏）**：窄条，左侧边缘一条竖直按钮导轨（图标导航 rail），右侧为会话列表面板（磨砂玻璃材质，顶部 + 号新建按钮，下方分组标题"会话流"，带时间戳的会话条目，选中态高亮）
- **中栏（聊天区）**：最宽，顶部会话标题面包屑导航，中间消息流（包含用户消息气泡 + AI 多轮响应，Agent 推理展开块、工具调用卡片、生成的 16:9 图片位于 AI 消息内），底部是 **聚光输入框**
- **右栏（结果面板）**：带顶部 tab（生成结果 / 画布 / 提示词），当前选中"生成结果"tab，面板内平铺展示最近生成的多张缩略图卡片

#### 视觉风格

- 暗黑创意工坊 (Dark + Neon)：最深底色 `#06060c`，面板区 `#0f0f18`，右面板 `#181824`
- 磨砂玻璃材质面板：左栏会话列表和右栏结果面板呈现毛玻璃效果，带微妙边缘亮线
- 霓虹光晕：聚光输入框周围散发 `#00e5ff` 青色柔和光晕，向外弥散衰减
- 消息区域有 AI 生成内容的丰富展示：Agent 推理流、工具调用状态、已生成的图片
- 整体感受：专业、沉浸、高级 — 像在"数字暗房"中工作

#### 交互线索

- 左栏会话 rail 第一个图标 (聊天气泡) 处于活跃态，带青色霓虹发光
- 中栏焦点：聚光输入框内有半透明光标闪烁，边框有辉光脉冲
- 右栏有生成的图片缩略图网格，其中一张刚生成，带淡入动画迹象
- AI 消息内有展开的"推理过程"区块，显示 Agent 的思考步骤

#### 应包含的细节

- 左侧 rail 导航图标：聊天、项目、资产、模板、设置，第一个处于活跃态（发青色光）
- 会话列表中至少 6 条，最新一条高亮选中，标题为"科幻城市夜景海报设计"
- 聊天区至少 2 个完整 turn：用户消息 + AI 回应（含推理面板 + 生成的赛博朋克城市夜景图）
- 聚光输入框下方有轻量的快捷键提示文字（`Enter 发送 · Shift+Enter 换行 · / 命令`）
- 右栏"生成结果"tab 内 6 张缩略图网格，上面 3 张有内容（不同风格的城市夜景），下面有下载/收藏图标
- 整体时间感：界面中有人在工作了一段时间的痕迹，不是"新手上路"的空白界面

#### 应避免的细节

- 不要出现中文 UI 文字之外的泛化英文仪表盘标签（如 "Dashboard", "Analytics", "Reports"）
- 不要让图片生成风格过于卡通或 Q 版，保持写实 / 概念艺术 / 3D 渲染风格
- 不要出现多个窗口/操作系统边框 — 这是 Web 应用内界面
- 不要让霓虹色覆盖面积过大，保持暗色主导
- 不要使用 Material Design 风格的阴影 — 暗色主题中应使用发光而非投影

#### 参数

- **宽高比**: 16:9（横屏桌面界面）
- **分辨率**: 高清，建议生成分辨率不低于 1920×1080
- **负向 Prompt (可选)**:
  ```
  cartoon, illustration, flat design, minimal, childish, light theme, shadows, 
  drop shadow, material design, iOS style, white background, bright interface,
  colorful dashboard, excessive neon overexposure, blue light filter, blurry text,
  mobile phone frame, windowed application, taskbar, browser chrome
  ```

---

### Prompt 2 — 空新会话 (Empty / New Session)

#### 构图与布局

与主工作台相同的三栏结构，但中栏聊天区为空：
- **中栏顶部**：会话标题显示"新会话"（或空白标题占位）
- **中栏中央**：空态引导区 — 一个精致的欢迎视觉中心
  - 中央一个微弱的霓虹发光圆环（暗示"等待输入"的关注点）
  - 圆环内显示 openimago 的极简 logomark（抽象的 "OI" 连字 + 霓虹辉光）
  - 下方一行文案："描述你想要的画面，AI 即刻创作"
  - 再下方 4-6 个示例 prompt 建议标签（如"赛博朋克街道"、"东方水墨山水"、"3D 产品渲染"）
- **底部**：聚光输入框处于聚焦态，更突出的光晕强调"从这里开始"

#### 视觉风格

- 同样 Dark + Neon 调性，但暗色更深沉（`#04040a`），因为没有消息内容填充视野
- 中央环带有呼吸光效，缓慢明暗交替，暗示系统就绪
- 侧面板全部带磨砂质感，半透明，让底层微网格纹理透出
- 极简、克制 — 这是"工作开始前的静默"

#### 交互线索

- 中央环带微动效呼吸，吸引视线到"创作入口"
- 示例 prompt 标签 hover 有霓虹辉光
- 聚光输入框有较强的光晕脉冲（比有消息时更强），主动邀请输入

#### 应包含的细节

- 左侧会话列表仅 2-3 条旧会话（灰显，非选中态）
- 右侧面板为空态占位：三个 tab 均显示"暂无内容"的图标 + 文字
- 中央 openimago logomark 清晰可见
- 示例 prompt 标签布局优雅
- 整体界面干净、安静、有呼吸感

#### 应避免的细节

- 不要让界面看起来像"404 错误页"或"broken state"
- 不要在空态区域堆放过多的营销文案
- 不要出现教程步骤数字（1-2-3）
- 不要使用灰色大块空白 — 用微纹理填补空区域

#### 参数

- **宽高比**: 16:9
- **分辨率**: 高清 ≥1920×1080
- **负向 Prompt (可选)**:
  ```
  error page, 404, broken interface, cluttered empty state, tutorial steps,
  numbered guide, overwhelming, colorful onboarding, light theme, white background,
  bright glow, overexposed, harsh neon, messy layout, heavy text wall,
  mobile phone, windowed, taskbar, browser frame
  ```

---

### Prompt 3 — 活跃生成/流式响应 (Active Generation / Streaming)

#### 构图与布局

三栏布局，中栏聊天区处于"正在进行中"状态：
- **中栏顶部**：会话标题区域有一条正在进行的进度指示器（霓虹 purple 细线脉冲）
- **中栏消息流底部**：
  - 最新一条用户消息在上方（例如"生成一个未来主义风格的产品展示视频分镜"）
  - 下方 AI 响应区块处于活跃生成状态：
    - Agent 推理面板（Reasoning）半展开，内部有流式文字正在逐字出现（视觉表现为：末尾有闪烁光标 + 最近几行文字带淡入效果）
    - 推理面板下方有一个或多个工具调用卡片（Tool Call），显示正在执行的操作："正在搜索参考图片..."、"正在运行图片生成脚本..."，每个卡片右侧有状态图标（loading spinner / checkmark）
    - 生成进度条：一条霓虹渐变条（cyan→purple），表示生成步骤进度
    - 图片生成区域显示一个占位框，内部有微弱的生成中粒子/噪点动效（暗示"图像正在从噪声中涌现"）
- **底部**：聚光输入框变为"取消生成"模式 — 输入框灰显（disabled），旁边出现红色中止按钮

#### 视觉风格

- 暗色基础色不变，但多了"活跃态"的色彩点缀：
  - purple 色推理面板（Agent 在"思考"）
  - amber 色工具调用卡片（Agent 在"操作"）
  - cyan 色进度条（生成在进行）
- 消息流底部的"进行中"区域是视觉重心，上方历史消息自然变暗/模糊（景深效果）
- 图片生成占位框内的粒子动效呈现紫色→青色渐变，暗示"从混沌到清晰"

#### 交互线索

- 推理面板文字末尾的闪烁光标
- 工具调用卡片的状态动画
- 中止按钮的红色脉冲
- 上方已生成完成的图片轻微变暗，让视线聚焦到"正在发生"的区域

#### 应包含的细节

- Agent 推理面板内显示 3-5 行思考文本（中文 + 英文技术关键词混排）
- 至少 2 个工具调用卡片，其中 1 个已完成（带绿色勾）、1 个进行中（带旋转 spinner）
- 图片生成占位框内噪点明显，中心开始隐约出现图像轮廓
- 进度条显示约 65-70% 完成
- 底部输入框有红色中止按钮
- 右侧"生成结果"面板中，之前的生成缩略图可见，最新空位显示 loading

#### 应避免的细节

- 不要让界面看起来"卡住了" — 必须有明确的进行中动效暗示
- 不要把生成占位框做成纯黑/纯灰方块 — 必须有点缀（粒子、噪点、扫描线等）
- 不要在推理面板中显示"假装"的 AI 文本 — 文字应该读起来像真正 Agent 推理流程
- 避免过度"赛博朋克"科幻感（大量扫描线/绿色终端文本）— 保持现代专业感

#### 参数

- **宽高比**: 16:9
- **分辨率**: 高清 ≥1920×1080
- **负向 Prompt (可选)**:
  ```
  frozen interface, static, idle, completed, finished, blank generation area,
  hacker terminal, crude wireframe, placeholder text, lorem ipsum, unreadable text,
  dark void, pure black, plain gray placeholder, outdated UI, 90s terminal,
  excessive green on black, matrix code, security camera overlay, bright white light
  ```

---

### Prompt 4 — 生成结果查看 (Generated Image Result Review)

#### 构图与布局

聚焦于右面板和中栏的图片结果区域：
- **右面板**最大化展开（通过拖拽或点击扩大），占据约 40% 的屏幕宽度
- **右面板"生成结果"tab**内：
  - 顶部一张大尺寸预览图（约占面板高度 60%），是一张高品质的 AI 生成图片（例如：未来主义产品渲染图，金属质感 + 霓虹光效）
  - 图片带有微妙的内发光边框（cyan 霓虹边框），暗示"这是作品"
  - 图片下方：操作按钮栏（下载 / 全屏 / 复制 Prompt / 收藏 / 分享）
  - 操作按钮下方：一组 4-5 张变体缩略图（同一 prompt 的不同种子生成结果），当前选中的带选中边框
- **中栏对话流**：最新 AI 消息中包含同一张图的较小渲染版本 + 生成参数信息（模型、种子、尺寸、耗时）
- **左栏**保持不变但缩小/变暗，视线聚焦右侧

#### 视觉风格

- 暗色背景将生成图片托举得如同在"画廊"中展示
- 图片边缘的霓虹辉光边框是核心视觉特征 — 它区分"系统 UI"和"创意作品"
- 变体缩略图网格采用无间隙平铺，选中态有 cyan 发光边框
- 操作按钮使用磨砂玻璃材质，与面板背景融为一体但不失可点击感

#### 交互线索

- 大预览图支持点击放大到全屏的暗示（角落有展开图标）
- 变体缩略图选中态的发光边框是视觉焦点
- 下载按钮 hover 有微光效

#### 应包含的细节

- 生成图片本身高质量、有细节、光影饱满（不是模糊占位图）
- 图片下方参数信息清晰可读
- 变体缩略图 4-5 张，品质各异但风格一致
- 面板 tab 指示器高亮"生成结果"
- 左侧聊天区中对应的 AI 消息可看到，内容与右侧关联

#### 应避免的细节

- 不要把预览图做成"截图"感（即不要显示浏览器 chrome 或操作系统的图片查看器）
- 不要让操作按钮过于笨重或占据面板太多空间
- 避免变体缩略图与主图完全相同 — 应该展示不同的种子/细微变化
- 不要让图片看起来像 stock photo — 应该是 AI 生成风格的独特作品

#### 参数

- **宽高比**: 16:9
- **分辨率**: 高清 ≥1920×1080
- **负向 Prompt (可选)**:
  ```
  screenshot, browser window, photo viewer, stock photo, watermark, low quality,
  pixelated, blurry image, small preview, macOS finder, windows explorer,
  social media sharing panel, gallery lightbox with dark overlay, mobile phone,
  camera UI, cropping tool, editing sliders, filter presets
  ```

---

### Prompt 5 — 项目仪表盘 (Project Dashboard)

#### 构图与布局

全宽单页布局（非三栏），带左侧 QDrawer 导航：
- **左侧 Drawer**：项目 / 资产 / Prompt / 设置 导航项，当前"项目"处于选中态
- **页面顶部**：页面标题"我的项目" + 右侧搜索框 + 新建按钮
- **主体区域**：项目卡片网格（3 列），每张卡片包含：
  - 顶部预览缩略图（该项目内最近生成的 2×2 四格拼图缩略图）
  - 项目名称 + 简短描述
  - 元信息行：会话数量、最近活跃时间
  - 右下角选项菜单 (···)
- **卡片材质**：磨砂玻璃面板，hover 时边框发出微弱 cyan 辉光
- 第一个卡片高亮（选中/悬停态）

#### 视觉风格

- 与工作台一致的 Dark + Neon 调性
- 卡片使用磨砂玻璃，让背景微网格透出
- 网格布局有节奏感 — 卡片间距均匀，信息密度适中
- 预览缩略图使用圆角，内部图片风格多样（不同项目产出的作品）
- 新建按钮使用霓虹 cyan 填充，是页面上最亮的元素

#### 交互线索

- 卡片 hover：轻微的 scale(1.02) + 边框辉光
- 新建按钮有明显微光，暗示这是主要操作
- 搜索框处于默认状态（有占位文字）

#### 应包含的细节

- 至少 6 个项目卡片，内容各不相同
- 预览缩略图中有真实的 AI 生成图片风格（不重复）
- 项目名称和专业视觉创意项目相符
- 导航 Drawer 清晰可见
- 页面左上角有 openimago 品牌标识

#### 应避免的细节

- 不要让卡片看起来像通用 SaaS 项目管理系统
- 避免使用图标缺失或彩色几何图形代替真实预览图
- 不要出现与 AI 创作无关的项目（如"报销审批"、"站会记录"）
- 避免左栏 Drawer 占据过宽或过窄

#### 参数

- **宽高比**: 16:9
- **分辨率**: 高清 ≥1920×1080
- **负向 Prompt (可选)**:
  ```
  SaaS dashboard, analytics, bar chart, pie chart, kanban board, scrum board,
  task management, issue tracker, github style, CRM, spreadsheet, table,
  generic project management, jira, asana, linear, trello, colorful icons,
  generic icons, abstract placeholder, gradient squares, data visualization
  ```

---

### Prompt 6 — 资产库 (Asset Library)

#### 构图与布局

与项目仪表盘相同的单页布局：
- **左侧 Drawer**："资产"导航选中
- **页面顶部**：标题"资产库" + 搜索框 + 上传按钮 + 视图切换（网格/列表） + 筛选（类型/时间）
- **主体区域**：资产网格（4 列），每个资产卡片：
  - 图片/视频预览（为主要内容）
  - 文件名（截断）
  - 文件类型 icon 标记
  - 文件大小 + 上传时间
  - hover 时出现操作 overlay：下载 / 删除
- 网格使用无边框设计，图片之间有微间距，靠暗色背景区隔
- 几个资产卡片中的预览图风格多样（摄影图、3D 渲染、矢量图形等）
- 页面整体呈现"数字资产收藏室"的氛围

#### 视觉风格

- 图片为主要视觉内容，UI 克制退后
- 卡片使用暗色半透明背景，让图片颜色成为页面主要色彩来源
- 上传按钮使用 cyan 霓虹色，与项目仪表盘新建按钮保持一致
- 筛选标签使用胶囊按钮样式（pill），选中态有紫色高亮

#### 交互线索

- 上传按钮发光
- 文件类型标记使用微小彩色标签
- hover 时 overlay 带有毛玻璃背景

#### 应包含的细节

- 至少 12 个资产卡片，不同类型（图片、视频、3D 模型预览）
- 图片风格多样，涵盖各种 AI 创作类型
- 上传按钮突出
- 搜索框和筛选栏可见且清晰

#### 应避免的细节

- 不要变成"文件管理器"（树形目录、属性列）
- 避免资产卡片同质化 — 不同类型/颜色/风格的预览
- 不要有文件夹/嵌套结构
- 避免过于复杂的筛选面板

#### 参数

- **宽高比**: 16:9
- **分辨率**: 高清 ≥1920×1080
- **负向 Prompt (可选)**:
  ```
  file explorer, folder tree, macOS finder, windows explorer, file manager,
  spreadsheet view, column layout, file properties panel, permissions dialog,
  empty grid, loading skeleton, broken images, missing thumbnails, recycle bin,
  trash interface, file copy dialog, progress bar for upload
  ```

---

### Prompt 7 — Prompt 模板库 (Prompt Template Library)

#### 构图与布局

单页布局：
- **左侧 Drawer**："Prompt"导航选中
- **页面顶部**：标题"提示词模板" + 搜索 + 新建按钮
- **主体区域**：模板卡片列表（2 列宽的卡片），每个卡片包含：
  - 卡片左侧：生成的示例小图（该模板 produce 的作品缩略图）
  - 卡片右侧：模板标题、简短描述、分类标签（如"摄影"、"插画"、"3D 渲染"）
  - 底部：复制按钮 + 使用次数
  - 卡片有暗色代码风格底框展示 prompt 文本片段
- 布局整体呈现"创意食谱书"气质 — 模板是配方，图片是成品
- 第一张卡片高亮（hover/选中）

#### 视觉风格

- 暗色背景 + 霓虹点缀保持不变
- 模板卡片使用磨砂玻璃，图文并茂
- Prompt 文本预览区块使用终端风格（等宽字体 + 暗绿色/暗青色底）
- 分类标签使用小尺寸胶囊，颜色中性（不抢图片焦点）
- 新建按钮 cyan 发光

#### 交互线索

- 复制按钮 hover 发微光
- 卡片 hover 有边框辉光
- 使用次数标记不抢眼但可见

#### 应包含的细节

- 至少 6 张模板卡片，类别各异
- 每张卡片的示例图风格不同
- Prompt 文本区块可见真实 prompt 写法
- 分类标签清晰

#### 应避免的细节

- 不要让卡片看起来像"代码仓库"（过于代码/终端化）
- 避免示例图为重复的抽象几何图形
- 不要有太强的"开发者工具"感 — 保持创意工具氛围

#### 参数

- **宽高比**: 16:9
- **分辨率**: 高清 ≥1920×1080
- **负向 Prompt (可选)**:
  ```
  code repository, github, bitbucket, code review, pull request, terminal window,
  code editor, IDE, developer console, command line, dark code theme only,
  abstract code blocks, blank cards, duplicate images, documentation page
  ```

---

## 五、附录：取色参考卡

可粘贴到图像模型的风格参考中：

```
COLOR PALETTE:
Primary BG: #06060c (deepest black-blue)
Card BG: #0f0f18 (dark indigo)
Panel BG: #181824 (dark violet-gray)
Accent Cyan: #00e5ff (neon cyan glow)
Accent Purple: #8b5cf6 (neon violet)
Accent Amber: #f59e0b (warm amber for alerts)
Text: #e8e8ed (off-white)
Text Secondary: #9494a6 (muted lavender-gray)
Border: rgba(255,255,255,0.06) (barely visible)

MATERIALS:
Frosted glass panels with subtle edge highlight
Ambient neon glow around focused elements
Micro dot-grid pattern in empty areas
Gradient glow borders on hover/selection only

TYPOGRAPHY:
Geometric sans-serif, high x-height
Monospace for code/prompt blocks (terminal aesthetic)
Hierarchy: Display (700-800 weight) → Heading (600) → Body (400) → Caption (400, muted)

TONE:
Dark creative studio, not SaaS dashboard
Professional, focused, immersive
Images are the hero — UI recedes into darkness
Neon accents guide attention, not decorate
```

---

*文档版本: v1.0 · 创建于 2026-05 · 适用于 openimago 设计探索阶段*
