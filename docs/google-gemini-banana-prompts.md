# Google Gemini Banana — UI 图片生成提示词

> **用途**: 将这些提示词输入 AI 图片生成工具 (Google Gemini / Midjourney / DALL-E / Stable Diffusion)，生成 openimago 前端 UI 的视觉设计参考图。
> **风格调性**: Dark Creative Workshop (暗黑创意工坊) — 对标 Midjourney / RunwayML 的视觉质量
> **核心关键词**: dark mode, neon cyberpunk, glassmorphism, dark purple, cyan glow, futuristic UI, minimalist, high contrast, dark theme, cinematic lighting

---

## 目录

1. [全局风格参考](#1-全局风格参考)
2. [认证页 — Login/Register](#2-认证页)
3. [项目列表页 — Projects](#3-项目列表页)
4. [项目详情页 — Project Detail](#4-项目详情页)
5. [会话工作台 — Session Workspace](#5-会话工作台)
6. [资产库 — Assets Gallery](#6-资产库)
7. [Prompt 模板页 — Prompts](#7-prompt-模板页)
8. [设置页 — Settings](#8-设置页)
9. [管理后台 — Admin](#9-管理后台)
10. [全局导航/布局 — Navigation Shell](#10-全局导航布局)
11. [标志性元素特写 — Signature Elements](#11-标志性元素特写)

---

## 1. 全局风格参考

### Prompt 1.1 — 整体氛围

```
A dark futuristic AI creative platform UI, dark mode design, deep dark blue-black background (#0a0a0f), ambient cyan and purple neon glow, glassmorphism cards with backdrop blur, sleek minimalist interface, cinematic lighting, high contrast between dark background and neon accents, 4K detail, ultra wide angle, Unreal Engine 5 quality, volumetric lighting, professional UI design, no text lorem ipsum, modern tech aesthetic, dark purple and cyan color scheme, style of Midjourney and RunwayML
```

### Prompt 1.2 — 色彩 mood board

```
Color palette mood board for dark mode creative platform: deep dark #0a0a0f background, vibrant cyan #00f0ff as primary accent, rich purple #a855f7 as secondary, hot pink #ff2d95 for errors, neon green #39ff14 for success states, glass panel with blur effect, dark cyberpunk aesthetic, high-tech startup feel, 3D abstract geometric shapes in background, subtle gradient overlays, 4K
```

---

## 2. 认证页

### Prompt 2.1 — 登录页全屏

```
Dark login page for AI creative platform, full screen centered layout, dark gradient background with subtle cyan and purple ambient light rays from corners, a glassmorphism card in the center (420px width, blurred background, rounded corners 20px, subtle border), platform logo "openimago" in glowing cyan neon text at top, two tab buttons for login/register, email input field with cyan icon prefix, password input field with lock icon, full width login button with rounded pill shape, divider line with "or" text, two OAuth buttons for GitHub and Google in outline style, minimal and clean, cinematic lighting, dark cyberpunk UI, 4K, ultra realistic render
```

### Prompt 2.2 — 注册页

```
Dark registration page, same glassmorphism centered card layout, three input fields stacked vertically: username (person icon), email (email icon), password (lock icon), purple accent color theme for register tab, full width secondary purple register button, subtle floating particles in background, dark aesthetic, modern UI design, volumetric shadows, 4K
```

### Prompt 2.3 — 认证页空灵背景

```
Dark abstract background for authentication page, deep space-like dark gradient from #08080d to #141420, cyan radial glow from top-left corner, purple radial glow from bottom-right corner, subtle pink center ambient light, floating geometric particles, cinematic volumetric fog, minimalist, atmospheric, 4K quality
```

---

## 3. 项目列表页

### Prompt 3.1 — 项目列表 (有数据)

```
Project management page in dark mode, left side navigation drawer in mini mode, header bar with hamburger menu and user avatar dropdown, page title "项目" in glowing cyan neon text, "+ 新建项目" button in cyan primary color with rounded pill shape, responsive card grid layout (3 columns), each card is a dark semi-transparent panel with subtle border (1px rgba white), card hover effect with cyan border glow and slight upward lift, card shows project name, description in grey text, active status badge in neon green, dark background with ambient lighting, modern SaaS dashboard aesthetic, AI creative platform, 4K
```

### Prompt 3.2 — 空状态

```
Empty state for project list page, dark background, centered layout, large folder icon in semi-transparent style, encouraging text "还没有项目，创建第一个吧" in grey, a glowing "+" creation button below, subtle ambient cyan glow, minimalist, clean, modern empty state design, dark theme UI, atmospheric lighting, 4K
```

### Prompt 3.3 — 新建项目弹窗

```
Modal dialog for creating a new project, dark glassmorphism card overlay with backdrop blur, dialog title "新建项目" in white, input field for project name with autofocus glow, textarea for optional description, two action buttons at bottom right: "取消" flat button and "创建" primary cyan button with loading state, dark semi-transparent backdrop, clean modern dialog design, cyberpunk UI, 4K
```

---

## 4. 项目详情页

### Prompt 4.1 — 项目详情 + 会话列表

```
Project detail page, dark theme, back arrow button at top left, project name in large cyan neon text, project ID shown in small grey caption below, horizontal divider line, "会话" section header with "+ 新建会话" action button on the right, bordered list of chat sessions below, each list item shows chat icon in cyan, session title, and date caption, clickable hover effect with subtle highlight, clean modern dark UI, AI creative workspace, professional dashboard design, 4K
```

---

## 5. 会话工作台

### Prompt 5.1 — 三面板全貌 (核心页面)

```
Three-panel AI chat workspace interface, dark cyberpunk theme, left sidebar (220px) shows session list with "+ 新建会话" button at top and list of chat sessions with active state highlighted by cyan left border, center panel is the main chat area with scrolling message history, right-side is the main content area, user messages aligned right with cyan-tinted bubbles (rounded corners 18px asymmetric), AI messages aligned left with purple-tinted bubbles, bottom of chat area has the signature "spotlight input" — a dark rounded input field with multi-layer cyan and purple glow effect on focus, placeholder text in muted grey, send button on the right, overall cinematic dark UI, neon glow effects, glassmorphism elements, 4K, Unreal Engine 5 quality, futuristic design
```

### Prompt 5.2 — 会话侧栏 (特写)

```
Close up of left sidebar for AI chat workspace, dark glass background with blur effect, narrow 220px width, "+ 新建会话" button in full width cyan at top, separator line, list of chat sessions as clickable items each with small chat icon and truncated title, one session highlighted with 2px cyan left border and subtle cyan background tint, timestamp in small grey caption below each title, scrollbar in subtle purple, dark aesthetic, modern UI component, 4K
```

### Prompt 5.3 — 聚光输入框 (标志性元素特写)

```
Extreme close-up of "spotlight input" — the signature UI element, a dark rounded input field (border-radius 16px) with deep dark blue background (rgba 16,16,28), when focused it emits a stunning multi-layer neon glow: inner cyan glow, outer purple glow spread across the surrounding area, subtle inset glow effect, cyan blinking cursor, faint placeholder text "描述你想创作的图片或视频...", a glowing cyan send button on the right side, cinematic lighting, macro shot of UI element, dark cyberpunk aesthetic, 4K, ray tracing reflections
```

### Prompt 5.4 — 用户消息气泡

```
Close up of user chat bubble in AI workspace, right-aligned message, dark semi-transparent cyan-tinted background (rgba 0,240,255,0.06), 1px cyan border (rgba 0,240,255,0.08), asymmetric border radius (top-left 18px, top-right 18px, bottom-left 18px, bottom-right 4px), white text content, glowing effect around the bubble, dark background, neon cyberpunk UI style, 4K detail
```

### Prompt 5.5 — AI 消息气泡

```
Close up of AI assistant chat bubble, left-aligned message, dark semi-transparent purple-tinted background (rgba 168,85,247,0.04), 1px purple border (rgba 168,85,247,0.06), asymmetric border radius (top-left 18px, top-right 18px, bottom-right 18px, bottom-left 4px), white text content, three small action buttons below: refresh/regenerate in grey, a generated image embedded within the message, glowing purple ambient effect, dark cyberpunk AI interface, 4K
```

### Prompt 5.6 — AI 流式生成中

```
AI is generating response in chat workspace, a streaming indicator shown as animated dots spinner in purple, text "AI 正在创作..." in grey next to the spinner, semi-transparent purple bubble container, dark background with subtle ambient animation, the spotlight input below shows a stop button (red square icon) instead of send button, cyberpunk AI interface, dynamic glowing effects, 4K
```

### Prompt 5.7 — 空会话状态

```
Empty chat workspace, centered layout, large glowing purple "auto_awesome" star icon with neon glow effect, text "输入 prompt 开始创作" below in grey, dark atmospheric background with subtle ambient lighting, the spotlight input at the bottom with its characteristic glow, minimalist, clean, modern empty state, AI creative platform, 4K
```

### Prompt 5.8 — AI 生成图片展示

```
AI generated image displayed within a chat message, a beautiful high-quality image (e.g. fantasy landscape or cute cat) embedded in the purple AI message bubble, three action buttons below the image: preview icon, download icon, regenerate icon, all in subtle grey with hover glow effect, the image has a soft glow border matching the purple theme, dark chat background, cinematic UI, 4K
```

---

## 6. 资产库

### Prompt 6.1 — 资产库网格

```
Media asset gallery in dark theme, page title "资产库" in cyan neon text, a compact upload button (q-uploader style) on the top right, responsive grid layout of media thumbnails (4 columns), each thumbnail card shows a square image with subtle glow effect "media-glow", a small delete button (red trash icon) positioned at the bottom-right corner of each image overlay, filename in caption below each thumbnail in grey text, dark background with ambient lighting, modern media library UI, AI creative platform, 4K
```

### Prompt 6.2 — 资产库空状态

```
Empty media gallery, centered layout, large semi-transparent image icon with subtle glow, text "还没有上传资产" in grey, upload area below ready for drag-and-drop, dark atmospheric background, minimalist empty state, creative platform UI, 4K
```

---

## 7. Prompt 模板页

### Prompt 7.1 — Prompt 模板列表

```
Prompt template library in dark theme, page title "Prompt 模板" in glowing cyan, "+ 新建模板" button in cyan, responsive card grid, each card shows template title in white semi-bold, content preview in grey text truncated, colored tags/badges in cyan, delete button at bottom-right of each card in red, dark semi-transparent card backgrounds with subtle borders, modern template gallery UI, AI creative platform, dark cyberpunk, 4K
```

### Prompt 7.2 — 新建模板弹窗

```
Modal dialog for creating a prompt template, dark glassmorphism overlay, dialog title "新建模板", three input fields: title (single line), content (multi-line textarea with 5 rows), tags (comma-separated, shown as chip preview), "取消" flat button and "创建" primary button at bottom right, dark cyberpunk dialog design, 4K
```

---

## 8. 设置页

### Prompt 8.1 — 个人设置

```
User settings page in dark theme, page title "设置" in cyan neon text, a single glassmorphism card (max-width 600px), card title "个人设置", two input fields: display name and email, a grey caption showing "Workspace ID: user_xxx" at the bottom, a single "保存" button in cyan primary color, dark background with ambient glow, minimal clean settings UI, modern dashboard design, 4K
```

---

## 9. 管理后台

### Prompt 9.1 — 用户管理表格

```
Admin user management page, dark theme, page title "用户管理" in cyan, a data table with dark flat bordered style, columns: username, email, role (with inline dropdown selector showing user/admin options), registration date, table rows in alternating subtle dark shades, inline role selector as a compact dark dropdown, overall professional admin dashboard UI, dark cyberpunk aesthetic, 4K
```

---

## 10. 全局导航/布局

### Prompt 10.1 — 应用 Shell (布局结构)

```
Full application shell layout in dark mode, top header bar with glass blur effect (backdrop-filter blur 16px, dark semi-transparent background, subtle bottom border), left side navigation drawer in mini/collapsed mode showing only icons (folder, image, star, settings, admin shield) with hover-to-expand overlay behavior, main content area filling the rest of the space, overall structure showing the three-part layout (header + drawer + content), dark cyberpunk theme, professional SaaS dashboard, AI creative platform, 4K, wide angle
```

### Prompt 10.2 — 导航展开态

```
Left side navigation drawer expanded, dark glass panel with blur effect, navigation items listed vertically: folder icon + "项目", image icon + "资产", star icon + "Prompt", separator line, settings icon + "设置", admin shield icon + "管理" (only shown for admin), the active item has a 2px cyan left border and subtle cyan background tint, clean minimal navigation design, dark cyberpunk UI, 4K
```

### Prompt 10.3 — 用户头像下拉菜单

```
User avatar dropdown menu in dark theme, triggered by clicking the account circle icon in the header, small dark menu card with rounded corners, two items: settings icon with "设置" text, separator line, logout icon with "退出登录" text, hover effect with subtle highlight, dark cyberpunk UI component, 4K
```

---

## 11. 标志性元素特写

### Prompt 11.1 — Neon 文字效果

```
Close-up macro shot of glowing neon text effect, the word "openimago" written in vibrant cyan with multi-layer glow shadow, dark background, the text appears to emit light with volumetric glow effect, tech cyberpunk aesthetic, cinematic lighting, 4K, ray tracing, Unreal Engine 5
```

### Prompt 11.2 — 玻璃卡片 (.glass-card)

```
Macro shot of glassmorphism UI card, translucent dark background (rgba 18,18,32,0.6) with strong backdrop-blur effect, 1px subtle white border at 6% opacity, 20px border radius, multi-layer box shadow creating depth, the card appears to float above the dark background with cyan ambient light reflecting on its edges, dark cyberpunk glass UI element, 4K, cinematic
```

### Prompt 11.3 — 暗色输入框焦点光晕

```
Extreme close-up of a dark UI input field in focused state, deep dark background, the input border glows with a beautiful cyan halo (box-shadow spread effect), the glow has multiple layers: inner cyan ring and outer soft purple spread, subtle inset shadow, a blinking cursor in cyan, faint grey placeholder text, cinematic macro UI shot, dark cyberpunk aesthetic, 4K
```

### Prompt 11.4 — 背景环境光晕效果

```
Dark background texture for UI, showing the ambient lighting effect: large soft cyan radial glow from top-left area of the screen, soft purple radial glow from bottom-right, very subtle pink glow from center, creates a rich atmospheric depth on the dark #08080f base, cinematic volumetric lighting, dark cyberpunk ambient, 4K texture
```

---

## 使用说明

1. **推荐工具**: Google Gemini (image generation), Midjourney v6, DALL-E 3, Stable Diffusion XL
2. **最佳实践**: 
   - 英文提示词效果最好 (保留英文原句)
   - 可加上参数: `--ar 16:9` (Midjourney) 或 `--ar 3:2` 获得宽屏 UI 截图
   - 部分工具可能需要移除中文描述
3. **迭代方式**: 
   - 先用全局风格 prompt 生成背景/氛围参考
   - 再用页面 prompt 生成具体页面布局
   - 最后用特写 prompt 生成 UI 元素细节
4. **参考对标**: Midjourney / RunwayML / Vercel 的暗色 UI 设计

---

> **版本**: v1.0 | **日期**: 2026-05-20
> **基于**: openimago 现有代码分析 + PRD-frontend.md 设计规范
