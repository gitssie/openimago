# Auth Dialog 邮箱验证流程 UI 图像生成 Prompts

> 本文档只针对 OpenImago 注册流程里的 **邮箱验证码 dialog / AuthPanel 内部流程**。
> 不要重新设计整页 `AuthPage` 背景，不要生成全屏登录页，不要生成独立 onboarding 页面。
> 目标是让图片模型产出可以嵌入现有 `AuthPanel.vue` 的小型弹窗/面板状态设计。

---

## 当前 UI 边界

现有系统已经有完整页面背景和 auth panel 风格：

- 页面外层已有深色渐变、cyan/violet 极光、棱镜、透视地面。
- `AuthPanel` 是宽约 `400px` 的深色玻璃卡片。
- UI 语言是 Quasar 表单：`q-input`、`q-btn`、`q-tabs`、圆角、outlined input、dark mode。
- 注册页目前包含：用户名、邮箱、验证码、发送验证码按钮、密码、注册按钮。

本次设计只应该改造“邮箱验证码步骤”的内部 dialog 流程：

- 不重画外层背景。
- 不重画整页登录/注册大场景。
- 不把验证码直接塞在注册表单一行里。
- 设计一个在注册表单上方打开的 compact dialog，或在 `AuthPanel` 内切换的小流程面板。

---

## 统一约束

所有 prompt 都必须遵守：

- 生成真实 Web App UI 截图，不是概念海报。
- 画面重点是一个 compact modal/dialog，宽度约 `400px`，高度按内容自适应。
- 背景只保留模糊后的现有 auth panel 或暗色遮罩，不要重新设计整页背景。
- dialog 视觉必须能搭配现有系统：深色半透明面板、细霓虹描边、Quasar dark input、紫色/青色按钮。
- UI 文案使用中文。
- 固定示例邮箱：`alex.chen@openimago.ai`。
- 每张图必须包含可读的邮箱、主按钮、次要操作、状态说明。
- 图标只作为辅助，不能超过 dialog 高度的 18%。
- 不要生成巨大的发光信封、3D 邮件物体、全屏故事板。

通用负向 prompt：

```text
full page redesign, landing page, standalone auth page, giant envelope illustration, cinematic poster, 3D mail object, storyboard, multiple screens in one image, browser chrome, operating system window, white SaaS UI, flat cartoon, unreadable fake text, missing email address, missing buttons, oversized background decoration, dashboard layout, mobile phone mockup, verification code inside the original registration form row
```

---

## Prompt 1 — 注册表单中的“发送验证码”入口

用于生成注册表单未发送验证码时的局部 UI。重点是邮箱字段下面的验证码入口，而不是完整页面。

```text
Design a compact dark-mode web app auth panel section for OpenImago, matching an existing Quasar/Vue authentication card.

Scope:
- Only design the register form area inside an existing 400px-wide glassmorphism auth panel.
- Do not redesign the full page background.
- The surrounding auth page is already dark neon; show it only as a blurred/dimmed context if needed.

UI content:
- Brand text at top: "openimago" in small cyan neon style.
- Register tab is active: "注册".
- Form fields in Chinese:
  - "用户名"
  - "邮箱地址" with value "alex.chen@openimago.ai"
  - "密码"
- Under the email field, show a compact verification callout row instead of a code input:
  - Small mail icon
  - Text: "需要验证邮箱后才能完成注册"
  - Primary small button: "发送验证码"
- Submit button at bottom is disabled or secondary-looking: "完成注册"
- Helper text under disabled submit: "请先完成邮箱验证"

Visual style:
- Match existing OpenImago AuthPanel: dark glass card, outlined dark inputs, cyan/violet glow, Quasar-like components.
- Keep spacing compact and realistic.
- No giant illustration.
- This should look like a real form design that can replace the current inline verification-code row.

Output:
- Single UI screenshot, 1 compact auth panel, no full-page redesign.
```

参数建议：`4:5` 或 `3:4`, high fidelity UI, readable Chinese text, compact modal UI

---

## Prompt 2 — 发送验证码中 Dialog

用于点击“发送验证码”后的短暂处理中状态。

```text
Design a compact email verification dialog for OpenImago shown on top of the existing register auth panel.

Scope:
- Only the dialog matters.
- Background should be a dimmed and blurred existing auth panel, not a new page.
- Dialog width around 360-400px.

Dialog content:
- Header row:
  - Title: "发送验证码"
  - Close icon button on the right
- Body:
  - Small animated mail/send icon, subtle cyan glow, not large
  - Main text: "正在发送验证码..."
  - Email row:
    - Label: "发送至"
    - Value: "alex.chen@openimago.ai"
  - Status list:
    - "检查邮箱格式" with completed check
    - "生成 6 位验证码" with active spinner
    - "发送邮件" with pending dot
- Footer:
  - Disabled primary button: "发送中..."
  - Text button: "更换邮箱"

Visual style:
- Dark Quasar dialog, rounded corners, subtle cyan/violet border glow.
- Use real UI controls, labels, and readable Chinese text.
- Keep the layout practical and compact.
- Do not use a giant envelope as the main image.

Output:
- Single compact dialog UI state, not a whole authentication page.
```

参数建议：`4:5` 或 `1:1`, compact dialog, dark UI, readable Chinese labels

---

## Prompt 3 — 验证码已发送 Dialog

用于邮件发送成功后，让用户确认邮箱、输入验证码。

```text
Design a compact email verification dialog for OpenImago after the verification code has been sent.

Scope:
- Dialog displayed over a dimmed existing register auth panel.
- Do not redesign the full auth page.
- Dialog width around 400px.

Dialog content:
- Header:
  - Title: "验证邮箱"
  - Close icon button
- Body:
  - Small success/mail icon
  - Main text: "验证码已发送"
  - Description: "请输入发送到以下邮箱的 6 位验证码"
  - Email pill / info row: "alex.chen@openimago.ai"
  - Link next to email: "更换"
  - Six separated OTP input boxes, empty state, first box focused with cyan glow
  - Helper text: "验证码 10 分钟内有效"
  - Resend row: "未收到邮件？请检查垃圾邮件"
  - Countdown text button: "45s 后可重新发送"
- Footer:
  - Primary button: "验证并继续"
  - Secondary text button: "返回注册表单"

Visual style:
- Must match existing AuthPanel: dark glass, Quasar-like input boxes, violet/cyan accents.
- Keep icon small; OTP inputs and email context are the main focus.
- Make all Chinese text readable.

Output:
- Single compact dialog UI state, not a full-page design.
```

参数建议：`4:5`, OTP dialog UI, dark Quasar style, clear email context

---

## Prompt 4 — 验证码输入错误 Dialog

用于输入错误验证码或过期验证码后的恢复状态。

```text
Design a compact email verification error dialog for OpenImago.

Scope:
- Dialog shown over the existing dark register auth panel.
- No full-page redesign, no big illustration.

Dialog content:
- Header:
  - Title: "验证邮箱"
  - Close icon button
- Body:
  - Small warning icon, amber/red accent only
  - Error title: "验证码无效或已过期"
  - Error description: "请确认验证码是否正确，或重新发送新的验证码。"
  - Email info row:
    - Label: "邮箱"
    - Value: "alex.chen@openimago.ai"
  - Six OTP boxes showing an entered code state, with subtle error border
  - Inline error message under boxes: "验证码错误，请重新输入"
  - Helper row: "验证码 10 分钟内有效"
- Footer:
  - Primary button: "重新验证"
  - Secondary button: "重新发送验证码"
  - Text link: "更换邮箱"

Visual style:
- Keep OpenImago cyan/violet dark theme.
- Error is restrained: small amber/red accent, not a full red page.
- Match Quasar form controls and compact dialog proportions.
- Readable Chinese UI text.

Output:
- Single compact dialog UI state, realistic web app UI.
```

参数建议：`4:5`, compact error dialog, dark UI, readable Chinese text

---

## Prompt 5 — 验证中 Dialog

用于用户点击“验证并继续”后的处理中状态。

```text
Design a compact processing dialog for OpenImago email verification.

Scope:
- Dialog over dimmed existing register auth panel.
- Only design the dialog state.

Dialog content:
- Header:
  - Title: "验证邮箱"
- Body:
  - Small circular cyan scanner / spinner, subtle glow, compact size
  - Main text: "正在验证..."
  - Description: "正在检查 alex.chen@openimago.ai 的验证码"
  - Summary rows:
    - "邮箱" value "alex.chen@openimago.ai"
    - "验证码" value "••••••"
    - "状态" value "验证中"
- Footer:
  - Disabled primary button: "验证中..."

Visual style:
- Practical product UI, not a sci-fi poster.
- Existing OpenImago dark glass dialog style.
- Cyan/violet accents only.
- No giant scanner or large 3D object.

Output:
- Single compact dialog UI state.
```

参数建议：`4:5`, compact processing dialog, dark glassmorphism UI

---

## Prompt 6 — 验证成功 Dialog

用于邮箱验证成功后，回到注册流程前的确认状态。

```text
Design a compact email verification success dialog for OpenImago.

Scope:
- Dialog shown over the existing register auth panel.
- Do not create a full success page.

Dialog content:
- Header:
  - Title: "邮箱验证完成"
  - Close icon button optional
- Body:
  - Small neon check icon, compact and elegant
  - Main text: "邮箱已验证"
  - Description: "alex.chen@openimago.ai 已通过验证，可以继续完成注册。"
  - Success checklist:
    - "验证码匹配" checked
    - "邮箱状态已确认" checked
    - "注册表单已解锁" checked
- Footer:
  - Primary button: "继续注册"
  - Secondary text link: "返回登录"

Visual style:
- Match existing auth modal: dark glass, subtle cyan/violet glow, compact Quasar-style controls.
- Celebration must be restrained, no confetti, no full-screen portal.
- Readable Chinese text and realistic UI spacing.

Output:
- Single compact dialog UI state.
```

参数建议：`4:5`, compact success dialog, dark UI, readable Chinese text

---

## Prompt 7 — 验证完成后的注册表单状态

用于邮箱验证成功后，返回注册表单，显示“已验证”状态并允许提交。

```text
Design a compact OpenImago register form section after email verification has succeeded.

Scope:
- Only design the existing 400px-wide AuthPanel register tab.
- No full-page redesign.
- This is the form state after closing the verification dialog.

UI content:
- Brand text: "openimago"
- Active tab: "注册"
- Form fields:
  - "用户名"
  - "邮箱地址" with value "alex.chen@openimago.ai"
  - Under email, show verified status row:
    - Green/cyan check icon
    - Text: "邮箱已验证"
    - Link: "重新验证"
  - "密码"
- Primary submit button enabled: "完成注册"
- Security note at bottom: "安全加密保护 · 您的数据绝对安全"

Visual style:
- Match current AuthPanel exactly: dark glass, outlined Quasar inputs, cyan/violet glow.
- No OTP input visible in the form.
- The verified email status row replaces the old inline verification-code input row.
- Practical production UI, compact, readable.

Output:
- Single compact auth panel state, not a whole page.
```

参数建议：`4:5`, compact auth panel, dark Quasar form UI

---

## 已注册但未验证用户的登录拦截流程

这个流程不同于“注册时验证”。这里的前提是：

- 用户已经注册过，数据库中已经有用户记录和邮箱。
- 用户注册当天没有完成邮箱验证。
- 过了一段时间后，用户再次输入邮箱和密码登录。
- 登录凭据正确，但账号 `emailVerified=false`。
- 系统不能直接进入主应用，需要弹出 dialog 阻断继续访问。
- Dialog 需要先告知“账号存在，但邮箱还没有验证”。
- 因为之前的验证码已经过期或不存在，用户必须重新点击“发送验证码”。
- 点击“发送验证码”并发送成功后，才显示验证码输入框。

设计重点：这是一个“历史未验证账号登录后”的强制验证 dialog，不是注册表单的一部分，也不是拿旧验证码继续验证。

---

## Prompt 8 — 已注册但邮箱未验证的登录拦截 Dialog

用于用户隔天或之后再次登录，系统发现账号存在但邮箱未验证时，先弹出说明 dialog。此时还不显示验证码输入框。

```text
Design a compact required email verification dialog for OpenImago, shown after a returning user logs in but the account email is still not verified.

Scope:
- Only design the modal dialog.
- Background should be the existing OpenImago app/auth screen dimmed and blurred.
- Do not redesign the full page.
- Dialog width around 400px, matching Quasar dark dialog style.

Scenario:
- The user has already registered.
- The user did not complete email verification during the original registration.
- The user returns later and logs in successfully with email and password.
- The account email exists in the database, but the email is still not verified.
- Any old verification code is expired or unavailable.
- The app blocks access until email verification is completed.

Dialog content:
- Header:
  - Title: "需要验证邮箱"
  - Close icon optional, but visually de-emphasized because this is a required step
- Body:
  - Small shield/mail icon, subtle cyan-violet glow
  - Main message: "你的账号已创建，但邮箱尚未验证"
  - Description: "为了保护账号安全，需要重新发送验证码并完成邮箱验证后才能继续使用 OpenImago。"
  - Email info row:
    - Label: "账号邮箱"
    - Value: "alex.chen@openimago.ai"
  - Status badge: "未验证"
  - Small note: "之前的验证码可能已过期。点击发送验证码后，我们会向该邮箱发送新的 6 位验证码。"
- Footer:
  - Primary button: "发送验证码"
  - Secondary text button: "退出登录"

Visual style:
- Match existing AuthPanel: dark glass, compact Quasar dialog, outlined info rows, cyan/violet accents.
- This should feel like a required security checkpoint, not a registration page.
- No OTP boxes yet.
- No large envelope illustration.
- All Chinese UI text must be readable.

Output:
- Single compact required-verification dialog UI state.
```

参数建议：`4:5`, compact required dialog, dark Quasar UI, readable Chinese text

---

## Prompt 9 — 重新发送新验证码中 Dialog

用于用户在未验证告知 dialog 中点击“发送验证码”后，系统重新生成并发送新验证码的处理中状态。

```text
Design a compact processing dialog for OpenImago required email verification after login, specifically for sending a new verification code to an existing unverified account.

Scope:
- Only the modal dialog is being designed.
- Existing app/auth screen behind it is dimmed and blurred.
- Do not redesign the full page.

Dialog content:
- Header:
  - Title: "发送验证码"
- Body:
  - Small mail-send icon or spinner, compact size
  - Main message: "正在发送新的验证码..."
  - Description: "我们正在为这个未验证账号生成新的验证码。"
  - Email info row:
    - Label: "账号邮箱"
    - Value: "alex.chen@openimago.ai"
  - Status list:
    - "确认账号未验证" checked
    - "生成新的 6 位验证码" active spinner
    - "发送验证邮件" pending dot
- Footer:
  - Disabled primary button: "发送中..."
  - Secondary text button: "退出登录"

Visual style:
- Dark compact Quasar dialog with subtle cyan/violet border glow.
- Practical product UI, not a sci-fi poster.
- Keep all text readable and layout compact.

Output:
- Single compact dialog state.
```

参数建议：`4:5`, compact processing dialog, dark UI, readable Chinese labels

---

## Prompt 10 — 输入新验证码 Dialog

用于新验证码发送成功后显示输入框。注意：这个输入框是在 dialog 里出现，不是在登录表单里出现。

```text
Design a compact required email verification code dialog for OpenImago after a returning unverified user requests a new verification code.

Scope:
- Only design the modal dialog.
- Background is the existing app/auth screen dimmed and blurred.
- Do not show the original login or register form as active UI.

Scenario:
- User logged in with an existing account.
- Access is blocked because email is not verified.
- A new verification code has just been sent because any previous registration code is expired.

Dialog content:
- Header:
  - Title: "验证账号邮箱"
  - Small required badge: "必需"
- Body:
  - Main message: "请输入新的验证码"
  - Description: "我们已向 alex.chen@openimago.ai 重新发送 6 位验证码。"
  - Email pill:
    - "alex.chen@openimago.ai"
    - Status badge: "待验证"
  - Six separated OTP input boxes, first box focused with cyan glow
  - Helper text: "新验证码 10 分钟内有效"
  - Resend row:
    - "未收到邮件？"
    - Countdown action: "45s 后可重新发送"
  - Small support text: "请检查垃圾邮件或邮件过滤规则。"
- Footer:
  - Primary button: "验证并进入"
  - Secondary text button: "退出登录"

Visual style:
- Match existing OpenImago dark AuthPanel/Dialog style.
- OTP boxes and email context are the focus.
- No full-page redesign.
- No giant illustration.
- Readable Chinese UI text and realistic Quasar-like controls.

Output:
- Single compact required verification code dialog UI state.
```

参数建议：`4:5`, compact OTP dialog, required email verification, dark Quasar UI

---

## Prompt 11 — 新验证码未收到 / 重新发送 Dialog

用于用户等待一段时间后仍未收到新验证码，需要重新发送的状态。不要把它设计成“登录后验证码错误”的场景。

```text
Design a compact resend-needed state for OpenImago required email verification after login, when a returning unverified user has not received the newly sent verification code.

Scope:
- Only design the modal dialog.
- Existing app/auth screen is dimmed behind it.
- This is not a register form and not a full page.
- This is not about an old code being wrong; it is about sending another new code for an existing unverified account.

Dialog content:
- Header:
  - Title: "验证账号邮箱"
  - Required badge: "必需"
- Body:
  - Small mail/waiting icon with restrained amber accent
  - Message: "还没有收到验证码？"
  - Description: "请检查垃圾邮件或邮件过滤规则。如果仍未收到，可以重新发送新的验证码。"
  - Email info row:
    - Label: "账号邮箱"
    - Value: "alex.chen@openimago.ai"
  - Six OTP boxes remain empty or partially empty, not an error state
  - Helper text: "每次重新发送都会生成新的验证码，旧验证码将不可用。"
  - Cooldown row: "12s 后可重新发送" or enabled state "重新发送验证码"
- Footer:
  - Primary button: "重新发送验证码"
  - Secondary button: "我已收到，继续输入"
  - Text button: "退出登录"

Visual style:
- Keep OpenImago cyan/violet dark theme.
- This should feel like a recovery/resend state, not a validation error page.
- Compact Quasar dialog proportions.
- All Chinese text must be readable.

Output:
- Single compact resend/recovery dialog state.
```

参数建议：`4:5`, compact resend dialog, dark UI, required verification

---

## Prompt 12 — 登录后邮箱验证成功 Dialog

用于登录后强制验证完成，允许进入系统。

```text
Design a compact success dialog for OpenImago required email verification after login.

Scope:
- Only the modal dialog is being designed.
- Background is the existing app/auth screen dimmed and blurred.
- Do not create a full success page.

Dialog content:
- Header:
  - Title: "邮箱验证完成"
- Body:
  - Small cyan check icon, compact and elegant
  - Main message: "邮箱已验证"
  - Description: "alex.chen@openimago.ai 已完成验证，现在可以继续使用 OpenImago。"
  - Success checklist:
    - "账号邮箱已确认" checked
    - "登录状态已恢复" checked
    - "即将进入工作区" checked
- Footer:
  - Primary button: "进入 OpenImago"

Visual style:
- Match existing compact dark dialog style.
- Restrained success, no confetti, no giant portal.
- Cyan/violet accent glow only.
- Readable Chinese UI text.

Output:
- Single compact success dialog UI state.
```

参数建议：`4:5`, compact success dialog, dark Quasar UI, readable Chinese text
