# 冒险王国 v2 技术方案

## 项目现状概述

- **架构**：单体 Express.js 后端 + 原生 HTML/CSS/JS SPA 前端
- **数据库**：JSON 文件 `h5/data.json`，含 7 个集合（users, tasks, records, treasures, pets, badges, rewards）
- **认证**：JWT（30天过期）、bcrypt 密码哈希、4位 PIN 家长模式验证
- **路由**：无前端路由库，纯 DOM 显隐切换（`.active` CSS class）
- **API 层**：全部 28 个端点集中在 `h5/server.js`，前端通过 `fetch()` 直调
- **前端状态**：单一全局对象 `S`（`app.html` 第842行附近）
- **关键文件**：
  - `h5/server.js`（656行）— 全部后端逻辑
  - `h5/public/index.html`（325行）— 登录/注册页
  - `h5/public/app.html`（1895行）— 主应用（孩子端6屏 + 家长端5屏 + 所有 JS 逻辑）

---

## 功能一：注册流程改造

### 需求
注册完成后不进入孩子端，而是进入家长端配置页。

### 当前流程
```
index.html 注册 → POST /api/auth/register → 返回 token + user → 直接跳转 app.html
server.js L110-111: user.onboarding_done = true（注册即完成初始化，跳过 onboarding）
```

### 改造方案

#### 1.1 数据模型变更

**User 对象**（`server.js` L93-107）新增字段：

```javascript
// 在 user 对象创建时新增：
role: 'parent',        // 'parent' | 'child' — 当前登录角色身份
parent_name: p.parentName || '',  // 家长昵称
```

注册接口响应（L124-125）新增 `role` 和 `parentName` 字段。

#### 1.2 后端 API 变更

| 变更 | 端点 | 行号 | 说明 |
|------|------|------|------|
| 修改 | `POST /api/auth/register` | L86-126 | 注册成功后 `onboarding_done` 设为 `false`（而非 `true`），返回 `role: 'parent'` |
| 新增 | `POST /api/auth/switch-role` | L406 之后 | 切换当前用户角色（parent/child），保存到 `user.role` |

`switch-role` 请求体：
```json
{ "role": "parent" }  或 { "role": "child", "childId": 0 }
```

#### 1.3 前端变更

**`h5/public/index.html`**（L253-302 `handleSubmit` 函数）：

| 行号 | 变更 | 说明 |
|------|------|------|
| L266-270 | 修改 | 登录成功后，检查 `json.data.user.role`：若是 `parent` 则跳转到 `app.html?mode=parent`；若是 `child` 则跳到 `app.html` |
| L292-302 | 修改 | 注册成功后，强制跳转 `app.html?mode=parent`（携带 mode 参数） |

**`h5/public/app.html`** boot 逻辑（L1499-1512）：

| 行号 | 变更 | 说明 |
|------|------|------|
| L1499-1512 | 修改 | 检测 URL 参数 `?mode=parent`：若存在，直接进入家长模式并跳过 onboarding；若为新用户首次进入，展示**新的家长配置页**（创建孩子资料页，见功能二） |

#### 1.4 风险评估
- **低风险**：改动集中在登录跳转逻辑和注册返回值，不影响现有 API 结构
- **回退兼容**：保留 `onboarding_done` 字段，旧用户不受影响

---

## 功能二：家长创建孩子资料

### 需求
家长在配置页为孩子设置小名、年龄、选择头像，生成独立子账号。

### 当前状态
- 已有 `POST /api/children`（L448-472）创建孩子
- 已有 `POST /api/children/switch`（L474-517）切换孩子
- 前端已有"添加孩子"弹窗（`#child-add-modal`，L786-806），但仅在家长"我的"页面中，且需要家长模式才能访问

### 改造方案

#### 2.1 数据模型变更

**Child 对象**（`server.js` L458-467）新增字段：

```javascript
// 新增字段：
age: req.body.age || 4,           // 孩子年龄（用于任务推荐）
avatar: req.body.avatar || '🦊',   // 保留现有字段
hatched: false,                    // 是否已完成首次宠物孵化
```

**User 对象**新增：

```javascript
parent_name: p.parentName || '',    // 家长昵称（用于显示"国王爸爸/妈妈"）
```

#### 2.2 后端 API 变更

| 变更 | 端点 | 行号 | 说明 |
|------|------|------|------|
| 修改 | `POST /api/children` | L448-472 | 接收 `parentName`、`age`、`avatar` 字段，同时将 `parentName` 写入 `user.parent_name` |
| 新增 | `GET /api/children/:id/setup-status` | L472 之后 | 检查某孩子是否已完成首次孵化（`hatched` 字段） |
| 新增 | `POST /api/children/:id/mark-hatched` | L472 之后 | 标记孩子已完成首次宠物孵化 |

#### 2.3 前端变更

**新增页面：家长首次配置页** `h5/public/parent-setup.html`：

```
文件：h5/public/parent-setup.html（新文件）
内容：
  - 家长称呼输入（"国王爸爸" / "国王妈妈"）
  - 孩子小名（必填）
  - 孩子年龄（1-12岁滑块）
  - 头像选择器（🦊🐯🐰🐱🐶🐼🐨🐸）
  - "创建并进入"按钮
  - 视觉风格：绘本卡片风格，与 index.html 保持一致
```

**`h5/public/app.html`** boot 逻辑修改（L1499-1512）：

| 行号 | 变更 | 说明 |
|------|------|------|
| L1499-1512 | 修改 | 若 URL 参数 `?mode=parent`，重定向到 `parent-setup.html` |
| 新增 | — | 在家长配置完成后，跳转到 `app.html` 并进入家长模式 |

**`h5/public/parent-setup.html`** 提交逻辑：

```javascript
// 1. POST /api/children 创建孩子（携带 parentName, age, avatar）
// 2. POST /api/auth/switch-role 切换到 parent 角色（如果需要）
// 3. POST /api/auth/onboard-done 标记配置完成
// 4. 跳转 app.html?mode=parent
```

#### 2.4 文件改动清单

| 文件 | 行号 | 变更类型 | 说明 |
|------|------|----------|------|
| `h5/server.js` | L458-472 | 修改 | `POST /api/children` 新增 age/hatched/parentName 处理 |
| `h5/server.js` | L472 之后 | 新增 | `GET /api/children/:id/setup-status` |
| `h5/server.js` | L472 之后 | 新增 | `POST /api/children/:id/mark-hatched` |
| `h5/server.js` | L86-126, L124-125 | 修改 | register 返回 role 字段，onboarding_done=false |
| `h5/server.js` | L406 之后 | 新增 | `POST /api/auth/switch-role` |
| `h5/server.js` | L93-107 | 修改 | user 新增 role, parent_name |
| `h5/public/index.html` | L266-270, L292-302 | 修改 | 登录注册跳转逻辑 |
| `h5/public/parent-setup.html` | — | 新增 | 家长首次配置页面（约 200 行） |
| `h5/public/app.html` | L1499-1512 | 修改 | URL 参数检测，重定向逻辑 |
| `h5/public/app.html` | L1738-1740 | 修改 | 加载 parentName 显示 |

#### 2.5 风险评估
- **中风险**：注册流程变更涉及多个页面跳转链，需要完整测试注册→配置→孩子登录→家长审核全流程
- **兼容性**：`onboarding_done` 字段语义从"注册完成"变为"配置完成"，旧已注册用户该字段为 `true`，需要在 boot 逻辑中兼容（若 `onboarding_done === true` 但无孩子记录，仍需引导配置）

---

## 功能三：孩子登录流程

### 需求
孩子选择角色→引导孵化第一个宠物→进入主界面。

### 当前状态
- 孩子登录是家长在"我的"页面切换孩子（`switchChild()`，L1794-1807）
- 每次切换都会调用 `renderAll()` 重新加载所有数据
- 宠物孵化已有完整 API（`POST /api/pets/hatch`，L261-275）

### 改造方案

#### 3.1 数据模型变更

**Child 对象**（同功能二）：

```javascript
hatched: false          // 是否已完成首次宠物孵化，默认 false
```

**宠物孵化不再消耗金币**（首次免费孵化）：`POST /api/pets/hatch` 接口新增 `free` 参数。

#### 3.2 后端 API 变更

| 变更 | 端点 | 行号 | 说明 |
|------|------|------|------|
| 修改 | `POST /api/pets/hatch` | L261-275 | 支持 `free: true` 参数，首次孵化免金币；孵化后自动标记 `child.hatched = true` |
| 修改 | `POST /api/children/switch` | L474-517 | 返回 children 的 `hatched` 字段，供前端判断是否需要引导孵化 |

#### 3.3 前端变更

**新增组件：首次孵化引导页**（在 `app.html` 中作为覆盖层 / 独立屏）：

| 实施位置 | 说明 |
|----------|------|
| `app.html` 新增 `<div id="hatch-guide">` | 覆盖层，展示蛋的动画 + 宠物选择引导 + "孵化你的第一个伙伴"按钮 |
| JavaScript 新增函数 `startHatchGuide()` | 检测 `child.hatched === false`，显示孵化引导；完成后调用 `POST /api/pets/hatch`（`free:true`）+ `POST /api/children/:id/mark-hatched` |

**孩子登录入口**：
- 首页新增"我是宝贝"入口按钮，可跳转到孩子选择列表
- 选择孩子后：若未孵化→显示孵化引导；若已孵化→直接进入主界面

**文件改动清单**：

| 文件 | 行号 | 变更类型 | 说明 |
|------|------|----------|------|
| `h5/server.js` | L261-275 | 修改 | `/api/pets/hatch` 支持 `free` 参数 + 更新 child.hatched |
| `h5/server.js` | L474-517 | 修改 | `switch` 返回 children hatched 状态 |
| `h5/public/app.html` | L430-464 之后 | 新增 | `<div id="hatch-guide">` 孵化引导覆盖层，含 CSS 动画（约 80 行 HTML+CSS） |
| `h5/public/app.html` | L1495-1512 | 修改 | boot 逻辑中检测 hatched 并触发引导 |
| `h5/public/app.html` | L1373-1384 | 修改 | `renderPets` / `hatchEgg` 支持首次免费 |

#### 3.4 风险评估
- **低风险**：孵化引导是新增覆盖层，不影响现有宠物系统
- **注意**：需要处理"家长代为创建孩子后，孩子首次打开 app 的场景"——通过 `hatched` 标记确保引导只出现一次

---

## 功能四：宠物喂养限制

### 需求
每天免费喂食 3 次，超过次数需要完成家长发布的任务获得"喂食券"。

### 当前状态
- 喂食接口 `POST /api/pets/:id/feed`（L276-292），消耗 5 金币，无次数限制
- 无喂食券概念

### 改造方案

#### 4.1 数据模型变更

**新增集合 `feedTickets`**（`server.js` L35）：

```javascript
// 喂食券记录
feedTickets: [{
  id: number,         // 自增ID
  userId: number,      // 用户ID
  childId: number,     // 孩子ID（多孩子支持）
  source: 'daily' | 'task',  // 来源：每日赠送 / 任务奖励
  count: number,       // 券数量
  date: string,        // 日期（YYYY-MM-DD）
  taskId: number|null,  // 关联的任务ID（source=task时）
}]
```

**User/Child 对象新增**：

```javascript
feedFreeLeft: 3,       // 今日剩余免费喂食次数（每日重置）
```

**Task 对象新增**：

```javascript
feedTicketReward: 0,   // 完成此任务额外奖励喂食券数量（默认0，家长发布时可选）
```

#### 4.2 后端 API 变更

| 变更 | 端点 | 行号 | 说明 |
|------|------|------|------|
| 修改 | `POST /api/pets/:id/feed` | L276-292 | 优先消耗 `feedFreeLeft`，次数用完检查 feedTickets 余量；若无券返回错误 `msg: '免费喂食次数已用完，完成任务获得喂食券吧！'` |
| 新增 | `GET /api/pets/feed-tickets` | L292 之后 | 查询当前孩子今日剩余喂食券数量 |
| 修改 | `POST /api/tasks/:id/complete` | L162-191 | 完成有 `feedTicketReward > 0` 的任务时，自动发放喂食券 |
| 新增 | `POST /api/feed-tickets/reset` | 无需 | 每日首次登录时自动重置 `feedFreeLeft = 3`（在 `GET /api/user/profile` 中处理） |
| 修改 | `GET /api/user/profile` | L587-599 | 返回 `feedFreeLeft` 和 `feedTicketCount` |

#### 4.3 前端变更

**`h5/public/app.html` 宠物页**（L1373-1384）：

| 行号 | 变更 | 说明 |
|------|------|------|
| L1373-1376 | 修改 | 宠物卡片新增显示"今日免费 ×3"或"喂食券 ×N" |
| L1384 | 修改 | `feedPet()` 函数改为先调用 API 检查剩余次数，禁用时显示提示 |

**`h5/public/app.html` HUD 区域**（L486-494）：

| 行号 | 变更 | 说明 |
|------|------|------|
| L486-494 | 新增 | 在 HUD 或钱包页新增喂食券数量显示 |

**家长发布任务表单**（L604-638）：

| 行号 | 变更 | 说明 |
|------|------|------|
| L620-637 | 新增 | 添加"额外奖励喂食券"输入框（`f-feedtickets`），0-5 张可选 |

**文件改动清单**：

| 文件 | 行号 | 变更类型 | 说明 |
|------|------|----------|------|
| `h5/server.js` | L35 | 修改 | db 初始化新增 `feedTickets` 集合 |
| `h5/server.js` | L276-292 | 修改 | `feed` 接口增加免费次数和喂食券逻辑 |
| `h5/server.js` | L292 之后 | 新增 | `GET /api/pets/feed-tickets` |
| `h5/server.js` | L162-191 | 修改 | `complete` 接口发放喂食券 |
| `h5/server.js` | L587-599 | 修改 | `profile` 返回喂食状态 |
| `h5/public/app.html` | L486-494 | 新增 | HUD 显示喂食券数量 |
| `h5/public/app.html` | L1373-1384 | 修改 | 宠物卡片显示喂食次数，禁用/启用逻辑 |
| `h5/public/app.html` | L604-638 | 修改 | 家长任务表单新增喂食券奖励字段 |

#### 4.4 风险评估
- **中风险**：每日重置逻辑需要与签到逻辑做好时间判断（防止跨天时区问题）
- **数据一致性**：喂食券消耗需要事务性操作（目前为 JSON 文件，需确保 `saveDB` 在操作后立即调用）

---

## 功能五：家长任务自定义图片

### 需求
家长发布任务时可上传自定义配图，限制图片尺寸（800×800 以内）和大小（2MB 以内）。

### 当前状态
- 已有 `POST /api/upload`（L612-649），multipart 上传，限制 5MB，仅 jpg/png/webp
- 任务对象（L148-151）无 `image` 字段
- 任务完成时已有证据图片上传（`photo` review 模式）

### 改造方案

#### 5.1 数据模型变更

**Task 对象**（`server.js` L150）新增字段：

```javascript
image: t.image || null,    // 自定义配图 URL（如 /uploads/task_xxx.jpg）
imageSize: number,          // 图片尺寸字节数（用于前端预检查显示）
```

**上传中间件**（L8）新增配置：

```javascript
// 任务配图专用上传配置
var uploadTaskImage = multer({
  dest: 'public/uploads/task-images/',
  limits: { fileSize: 2 * 1024 * 1024 },  // 2MB
  fileFilter: function(req, file, cb) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      cb(new Error('仅支持 jpg/png/webp'));
    } else {
      cb(null, true);
    }
  }
});
```

#### 5.2 后端 API 变更

| 变更 | 端点 | 行号 | 说明 |
|------|------|------|------|
| 新增 | `POST /api/tasks/:id/upload-image` | L153 之后 | 上传任务配图，自动缩放至 800×800 以内（使用 `sharp` 库或手动限制） |
| 修改 | `POST /api/tasks` | L148-153 | 接收 `image` 字段（已上传的图片 URL） |
| 修改 | `GET /api/tasks` | L143-146 | 返回 `image` 字段 |

**图片缩放方案**：由于项目没有引入 `sharp`，建议采用以下方案之一：

**方案 A（推荐）**：引入 `sharp` 库
```bash
npm install sharp
```
上传时自动 resize：
```javascript
const sharp = require('sharp');
await sharp(filePath)
  .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
  .jpeg({ quality: 85 })
  .toFile(outputPath);
```

**方案 B（轻量）**：纯前端 Canvas 缩放 + 后端仅做大小校验
- 前端用 Canvas drawImage 缩放至 800px 以内
- 后端只校验最终文件大小 ≤ 2MB

**建议采用方案 A**（服务端缩放可靠，且 sharp 是常用库）。

#### 5.3 前端变更

**家长创建任务表单**（`app.html` L604-638）新增：

| 行号 | 变更 | 说明 |
|------|------|------|
| L605 之后 | 新增 | 自定义配图上传区域（拖拽或点击上传），含预览缩略图和删除按钮 |
| L637 之前 | 新增 | 上传进度提示 |

新增 CSS 组件样式：
```css
.task-image-upload {
  border: 2px dashed var(--parent-line);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  position: relative;
}
.task-image-preview {
  width: 100%; max-height: 200px;
  border-radius: 8px;
  object-fit: contain;
}
```

**冒险地图任务卡片**（L1096-1106）显示自定义配图。

**文件改动清单**：

| 文件 | 行号 | 变更类型 | 说明 |
|------|------|----------|------|
| `h5/package.json` | L14 | 修改 | 新增 `"sharp": "^0.33.0"` 依赖 |
| `h5/server.js` | L7-8 | 修改 | 新增 `uploadTaskImage` multer 配置 |
| `h5/server.js` | L148-153 | 修改 | `POST /api/tasks` 接收 image 字段 |
| `h5/server.js` | L143-146 | 修改 | `GET /api/tasks` 返回 image |
| `h5/server.js` | L153 之后 | 新增 | `POST /api/tasks/:id/upload-image` |
| `h5/public/app.html` | L604-638 | 修改 | 家长创建任务表单新增图片上传 UI |
| `h5/public/app.html` | L1090-1106 | 修改 | 任务卡片显示自定义配图（有则显示，无则显示 emoji 动画） |

#### 5.4 风险评估
- **低风险**：图片上传复用现有 multer 模式，新增 `sharp` 依赖（纯 JS，无原生编译依赖问题）
- **存储**：需确认 `public/uploads/task-images/` 目录存在（启动时自动创建）

---

## 功能六：冒险地图改造

### 需求
关卡仅展示标题，点击打开弹窗显示配图+详细说明。

### 当前状态
- 冒险地图（`renderMap()` L1028-1124）直接展示完整关卡卡片，包含 desc、进度、周历
- 关卡切换通过 `switchLevel()`（L1135-1138）改变 `S.viewLevel`
- 任务轮播在卡片下方直接展示

### 改造方案

#### 6.1 数据模型变更

**关卡配置（GAME_CONFIG.levels）**（`server.js` L561-562）新增字段：

```javascript
levels: [{
  id: 1, name: "新手冒险", icon: "🌱", color: "#7FD66E",
  desc: "第一周·养成好习惯",
  detailDesc: "欢迎来到冒险王国！在这一关，宝贝将学会整理床铺、收拾书包等5个好习惯。每完成一个任务，你就能获得金币奖励。收集满35个完成数就能通关啦！",
  coverImage: "/assets/levels/level1_cover.jpg",  // 关卡配图
  themeCharacter: "🦊",  // 关卡主题角色
  target: 35
}, ...]
```

#### 6.2 后端 API 变更

| 变更 | 端点 | 行号 | 说明 |
|------|------|------|------|
| 修改 | `GET /api/config` | L570-572 | 返回 levels 新增的 `detailDesc`、`coverImage`、`themeCharacter` 字段 |
| 新增 | `GET /api/levels/:id/detail` | L572 之后 | 返回单个关卡的详细配置（含配图、说明、完成情况） |

#### 6.3 前端变更

**冒险地图页面**（`renderMap()` L1028-1124）：

| 行号 | 变更 | 说明 |
|------|------|------|
| L1054-1073 | 修改 | 关卡卡片压缩为仅展示：名称 + 进度 + "点击查看"按钮 |
| 新增 | — | 关卡弹窗 `<div id="level-detail-modal">`，显示：配图（全屏大图）、详细说明文字、主题角色故事、当前进度、解锁奖励预览 |

**弹窗组件设计**：

```html
<div id="level-detail-modal" class="modal-overlay">
  <div class="level-detail-card">
    <img class="level-cover" src="" alt="关卡配图">
    <button class="modal-close">✕</button>
    <div class="level-theme">🦊 新手冒险</div>
    <h2>关卡名称</h2>
    <p class="level-story">详细说明文案...</p>
    <div class="level-progress-detail">
      <div class="progress-bar">进度条</div>
      <span>已完成 20/35 个任务</span>
    </div>
    <div class="level-rewards">
      <h4>通关奖励</h4>
      <div>🥚 神秘宠物蛋 ×1</div>
      <div>💎 宝石 ×10</div>
    </div>
    <button class="btn gold">开始冒险 →</button>
  </div>
</div>
```

**文件改动清单**：

| 文件 | 行号 | 变更类型 | 说明 |
|------|------|----------|------|
| `h5/server.js` | L561-562 | 修改 | GAME_CONFIG.levels 新增 detailDesc/coverImage/themeCharacter |
| `h5/server.js` | L572 之后 | 新增 | `GET /api/levels/:id/detail` |
| `h5/public/app.html` | L1028-1124 | 修改 | `renderMap()` 简化关卡卡片，新增弹窗渲染函数 |
| `h5/public/app.html` | 样式区域 | 新增 | 关卡详情弹窗 CSS（约 60 行） |
| `h5/public/app.html` | L731 之后 | 新增 | `<div id="level-detail-modal">` HTML（约 40 行） |
| `h5/public/app.html` | L1135-1138 | 修改 | `switchLevel()` 改为打开弹窗而非直接切换视图 |

#### 6.4 风险评估
- **低风险**：纯前端改造，不改变关卡切换逻辑，只是把原来平铺的信息移到弹窗中
- **注意**：关卡配图需提供默认占位图（如纯色背景+关卡图标），确保未配置图片时不显示破图

---

## 功能七：关卡游戏化设计（30个任务 × 6大主题世界）

### 需求
每个默认任务都有专属的敌人、英雄、剧情故事和完成动画，按类别分为6大主题世界。

### 当前状态
- 任务卡片（L1090-1107）显示 emoji 动画（`anim-bed`、`anim-tooth` 等），无剧情故事
- 无敌人/英雄/世界观概念

### 改造方案

#### 7.1 数据模型变更

**Task 对象**（`server.js` L150）新增字段：

```javascript
enemy: { name: "被子怪兽", emoji: "🛌", image: "" },           // 敌人信息
hero: { name: "叠被小卫士", emoji: "🛏️", image: "" },          // 英雄/胜利形态
storyIntro: "懒惰的被子怪兽把床单揉成了团！",                     // 任务剧情引言
storyVictory: "你叠好了被子，被子怪兽被整齐的床铺吓跑了！🎉",     // 完成剧情
worldTheme: "chores",  // 所属主题世界: chores | learning | habits | sport | preschool | kindness
```

**世界配置**（`server.js` GAME_CONFIG 新增 `worldThemes`）：

```javascript
worldThemes: {
  chores: {
    name: "混乱怪物的巢穴",
    color: "#FFE0B2",
    icon: "🏠",
    introText: "懒惰的混乱怪物把家里搞得一团糟！...",
    victoryText: "太棒了！你把家恢复了整洁，混乱怪物逃走了！✨",
    enemyImage: "/assets/worlds/chores_enemy.png",
    heroImage: "/assets/worlds/chores_hero.png"
  },
  learning: {
    name: "知识迷雾森林",
    color: "#E3F2FD",
    icon: "📚",
    introText: "知识迷雾笼罩了森林...",
    victoryText: "你用知识之灯驱散了迷雾！📖✨",
    enemyImage: "/assets/worlds/learning_enemy.png",
    heroImage: "/assets/worlds/learning_hero.png"
  },
  habits: {
    name: "健康城堡保卫战",
    color: "#E8F5E9",
    icon: "🦷",
    introText: "健康城堡被坏习惯小怪入侵了！...",
    victoryText: "你用健康习惯守住了城堡！🏰✨",
    enemyImage: "/assets/worlds/habits_enemy.png",
    heroImage: "/assets/worlds/habits_hero.png"
  },
  sport: {
    name: "活力竞技场",
    color: "#FFF3E0",
    icon: "🏃",
    introText: "懒洋洋大王想让大家都不爱动！...",
    victoryText: "你成为了真正的活力运动冠军！🏆✨",
    enemyImage: "/assets/worlds/sport_enemy.png",
    heroImage: "/assets/worlds/sport_hero.png"
  },
  preschool: {
    name: "成长小镇",
    color: "#F3E5F5",
    icon: "👶",
    introText: "成长小镇的小动物们需要帮助！...",
    victoryText: "你学会了照顾自己，成长小镇为你欢呼！🎉✨",
    enemyImage: "/assets/worlds/preschool_enemy.png",
    heroImage: "/assets/worlds/preschool_hero.png"
  },
  kindness: {
    name: "感恩花园",
    color: "#FFF8E1",
    icon: "💬",
    introText: "感恩花园的花朵需要爱心来浇灌！...",
    victoryText: "你的感恩让花园开满了最美的花！🌸✨",
    enemyImage: "/assets/worlds/kindness_enemy.png",
    heroImage: "/assets/worlds/kindness_hero.png"
  }
}
```

#### 7.2 30 个任务完整游戏化设计

##### 🏠 家务世界「混乱怪物的巢穴」

| 任务 | 🦹 敌人 | 🦸 英雄 | 故事开场 | 完成台词 |
|:----|:--------|:--------|:---------|:--------|
| 🛏️ 整理床铺 | 🛌 被子怪兽 | 🛏️ 叠被小卫士 | 被子怪兽把床单揉成了大麻花！ | 被子叠得整整齐齐，被子怪兽吓跑了！ |
| 🍳 帮厨 | 🥘 油污精灵 | 🍳 小厨神 | 油污精灵在厨房里滑来滑去捣乱！ | 饭菜做好了，油污精灵被香味赶跑了！ |
| 🦴 倒垃圾 | 💀 垃圾妖怪 | ♻️ 环保小侠 | 垃圾妖怪把臭臭的垃圾堆成了山！ | 垃圾分类打包，垃圾妖怪被丢进了垃圾桶！ |
| 🧹 整理书桌 | 📚 书本小捣蛋 | 📖 整理小能手 | 书本小捣蛋把书扔得到处都是！ | 桌面整整齐齐，书本小捣蛋投降了！ |
| 🧸 玩具归位 | 🎲 贪玩小丑 | 🧸 收纳小管家 | 贪玩小丑把玩具撒了一地！ | 玩具都回了家，贪玩小丑空手溜走了！ |

##### 📚 学习世界「知识迷雾森林」

| 任务 | 🦹 敌人 | 🦸 英雄 | 故事开场 | 完成台词 |
|:----|:--------|:--------|:---------|:--------|
| 📚 阅读30分 | 🌫️ 迷雾怪 | 📖 阅读魔法师 | 迷雾怪把故事书上的字都藏起来了！ | 读完故事，文字化作星光驱散了迷雾！ |
| 📝 完成作业 | ✏️ 橡皮擦怪 | ✏️ 作业小勇士 | 橡皮擦怪把作业答案都擦掉了！ | 认真写完所有作业，橡皮擦怪被你打败了！ |
| ✏️ 认识汉字 | 🐛 错字虫 | 🏛️ 汉字小博士 | 错字虫把汉字咬得缺胳膊少腿！ | 一笔一划写出端正的汉字，错字虫逃跑了！ |
| 📖 听故事 | 😴 瞌睡虫 | 🎧 故事小耳朵 | 瞌睡虫让小朋友眼皮直打架！ | 安静听完故事，瞌睡虫被精彩情节赶跑了！ |

##### 🦷 习惯世界「健康城堡保卫战」

| 任务 | 🦹 敌人 | 🦸 英雄 | 故事开场 | 完成台词 |
|:----|:--------|:--------|:---------|:--------|
| 🦷 认真刷牙洗脸 | 🦠 蛀牙菌大王 | 🦷 刷牙小骑士 | 蛀牙菌在嘴巴里建了细菌城堡！ | 刷够两分钟，泡沫大军冲垮了细菌城堡！ |
| 🥗 收拾书包 | 🎒 乱塞怪 | 🎒 整理小达人 | 乱塞怪把书本和衣服胡乱塞进书包！ | 按课表整理好，乱塞怪被整齐打败了！ |
| 🐶 照顾宠物 | 🥫 饿肚虫 | 🐕 贴心小主人 | 饿肚虫让宠物碗总是空空的！ | 添食添水，宠物开心地摇尾巴！ |
| 🪥 自己刷牙 | 🪱 牙垢虫 | ✨ 亮牙小超人 | 牙垢虫躲在牙齿缝隙里搞破坏！ | 上下左右刷干净，牙垢虫被冲走了！ |
| 🧼 洗手 | 🦠 细菌小兵 | 💧 泡泡卫士 | 细菌小兵藏在手指缝里！ | 肥皂泡泡搓一搓，细菌小兵全冲走！ |
| 🚽 上厕所 | 🚽 马桶小怪 | 🚿 卫生小标兵 | 马桶小怪不冲水就想跑！ | 冲水洗手一条龙，马桶小怪被你的好习惯吓跑了！ |

##### 🏃 运动世界「活力竞技场」

| 任务 | 🦹 敌人 | 🦸 英雄 | 故事开场 | 完成台词 |
|:----|:--------|:--------|:---------|:--------|
| 🏃 跑步10分钟 | 🐢 慢吞吞龟 | 🏃 小飞毛腿 | 慢吞吞龟让腿变得像灌了铅！ | 迈开步子跑起来，把慢吞吞龟甩在身后！ |
| 🪢 跳绳100个 | 🐍 绊脚蛇 | 🤸 跳绳小精灵 | 绊脚蛇总想在你脚下使绊子！ | 轻盈跳过100个，绊脚蛇被打成了蝴蝶结！ |
| 🏀 拍篮球50下 | 🤡 弹跳小丑 | 🏀 篮球小将 | 弹跳小丑把球乱弹不听使唤！ | 小手稳稳拍球，弹跳小丑被节奏征服了！ |
| 🚴 骑自行车15分钟 | ⛰️ 颠簸怪 | 🚴 骑行小勇士 | 颠簸怪把路变得坑坑洼洼！ | 稳稳骑过颠簸路，颠簸怪被车轮压平了！ |
| 🤸 做操跳舞10分钟 | 🥴 僵硬机器人 | 💃 律动小明星 | 僵硬机器人让你的身体变得僵僵的！ | 跟着音乐动起来，僵硬机器人被带活了！ |

##### 👶 学龄前世界「成长小镇」

| 任务 | 🦹 敌人 | 🦸 英雄 | 故事开场 | 完成台词 |
|:----|:--------|:--------|:---------|:--------|
| 👕 自己穿衣服 | 🎭 穿衣小丑 | 👗 穿衣小达人 | 穿衣小丑把衣服裤子搅成一团！ | 分清前后穿好衣服，小丑被整齐打败了！ |
| 👟 穿鞋子 | 🐙 章鱼系带怪 | 👟 系鞋带小能手 | 章鱼怪把鞋带缠成死结！ | 分清左右系好鞋带，章鱼怪松开了触手！ |
| 🍚 自己吃饭 | 🥄 洒饭精 | 🍚 吃饭小英雄 | 洒饭精把饭粒弄得到处都是！ | 稳稳吃饭不洒一粒，洒饭精认输了！ |
| 👋 打招呼 | 🙈 害羞鬼 | 🌞 阳光微笑侠 | 害羞鬼躲起来不让说"你好"！ | 主动打招呼说谢谢，害羞鬼被暖化了！ |
| 🎨 画一幅画 | 🖍️ 涂鸦怪 | 🎨 小画家 | 涂鸦怪把白纸画得乱七八糟！ | 用蜡笔画出美丽的画，涂鸦怪惊呆了！ |
| 🎤 唱一首儿歌 | 🤫 静音虫 | 🎵 小百灵 | 静音虫把声音偷偷关掉了！ | 大声唱完一首歌，静音虫被歌声震飞了！ |
| 😊 不哭闹的一天 | 😤 发脾气小恐龙 | 😇 情绪小魔法师 | 小恐龙一不开心就喷火！ | 好好说出来不哭闹，小恐龙被温柔驯服了！ |
| 🩴 帮妈妈拿东西 | 🦥 懒懒树懒 | 🤝 暖心小帮手 | 懒懒树懒做什么都慢吞吞！ | 主动帮忙拿东西，树懒羞愧地脸红了！ |

##### 💬 品德世界「感恩花园」

| 任务 | 🦹 敌人 | 🦸 英雄 | 故事开场 | 完成台词 |
|:----|:--------|:--------|:---------|:--------|
| 💬 说谢谢 | 🧊 冰心怪 | 🌺 感恩小天使 | 冰心怪把"谢谢"冻成了冰块！ | 大声说出谢谢，冰心怪被温暖融化了！ |
| 🤝 帮家人做一件事 | 🕸️ 无视蛛 | 🤲 贴心小棉袄 | 无视蛛用网蒙住眼睛不看别人的需要！ | 主动帮忙，无视蛛的网全断了！ |

#### 7.3 美术资产清单

按主题世界生成配图（共 12 张）：

| 世界 | 敌人配图 | 英雄配图 |
|:----|:---------|:---------|
| 🏠 家务世界 | 混乱怪物（脏兮兮的毛球状怪物） | 整洁小卫士（穿围裙拿扫帚的可爱角色） |
| 📚 学习世界 | 知识迷雾怪（云雾状、隐约有鬼脸） | 阅读魔法师（戴眼镜拿魔法书的小魔法师） |
| 🦷 习惯世界 | 蛀牙菌大王（紫色细菌状、有皇冠） | 健康小骑士（白色护甲拿牙刷剑盾） |
| 🏃 运动世界 | 懒洋洋大王（沙发形状的慵懒怪物） | 活力小冠军（穿运动服戴金牌） |
| 👶 学龄前世界 | 依赖小怪（奶嘴形、婴儿装的小捣蛋） | 成长小勇士（自信站立的勇敢形象） |
| 💬 品德世界 | 冷漠冰怪（冰蓝色冰晶状怪物） | 感恩小天使（散发温暖光芒的天使形象） |

每张图使用 FLUX 生成：吉卜力水彩风、白色背景、可爱绘本风格、方形。

#### 7.4 后端 API 变更

| 变更 | 端点 | 说明 |
|------|------|------|
| 修改 | `GET /api/config` | GAME_CONFIG 新增 worldThemes 完整配置 |
| 修改 | `GET /api/tasks` | 返回任务新增的 enemy/hero/storyIntro/storyVictory/worldTheme 字段 |

#### 7.5 前端变更

| 变更 | 位置 | 说明 |
|------|------|------|
| 新增 | app.html | 关卡详情弹窗：显示世界背景故事、敌人/英雄图片、任务列表 |
| 修改 | renderMap() | 关卡卡片简化，点击打开弹窗 |
| 修改 | celebrate() | 按 worldTheme 显示对应的敌人动画和台词 |
| 新增 | app.html CSS | 关卡弹窗样式、敌我双方展示面板、渐进解锁进度条 |

## 总结：文件改动总览

### 全部改动文件

| 文件 | 改动类型 | 改动行数（约） | 说明 |
|------|----------|----------------|------|
| `h5/package.json` | 修改 | +1 行 | 新增 sharp 依赖 |
| `h5/server.js` | 修改/新增 | +180 行 | 6 个新增 API，7 个修改 API，数据模型扩展 |
| `h5/public/index.html` | 修改 | ~10 行 | 登录注册跳转逻辑 |
| `h5/public/parent-setup.html` | **新文件** | ~250 行 | 家长首次配置页面 |
| `h5/public/app.html` | 修改/新增 | +350 行 | 孵化引导、关卡弹窗、喂食UI、图片上传、主题故事等 |
| `h5/public/assets/enemies/*` | **新文件** | 3 个 | 敌人图片 |
| `h5/public/assets/heroes/*` | **新文件** | 3 个 | 英雄图片 |
| `h5/public/assets/levels/*` | **新文件** | 3 个 | 关卡封面配图 |

**总计**：约 800 行新增代码，2 个新文件，1 个新依赖。

### 新增 API 端点汇总

| 端点 | 方法 | 说明 | 功能 |
|------|------|------|------|
| `/api/auth/switch-role` | POST | 切换家长/孩子角色 | 一 |
| `/api/children/:id/setup-status` | GET | 查询孩子初始化状态 | 二 |
| `/api/children/:id/mark-hatched` | POST | 标记首次孵化完成 | 二、三 |
| `/api/pets/feed-tickets` | GET | 查询喂食券数量 | 四 |
| `/api/tasks/:id/upload-image` | POST | 上传任务配图 | 五 |
| `/api/levels/:id/detail` | GET | 获取关卡详情 | 六 |

### 修改 API 端点汇总

| 端点 | 修改内容 | 功能 |
|------|----------|------|
| `POST /api/auth/register` | 返回 role，onboarding_done=false | 一 |
| `POST /api/children` | 接收 age/hatched/parentName | 二 |
| `POST /api/children/switch` | 返回 hatched 状态 | 三 |
| `POST /api/pets/hatch` | 支持 free 参数，标记 child.hatched | 三 |
| `POST /api/pets/:id/feed` | 免费次数+喂食券检查 | 四 |
| `POST /api/tasks/:id/complete` | 发放喂食券 | 四 |
| `POST /api/tasks` | 接收 image 字段 | 五 |
| `GET /api/tasks` | 返回 image 字段 | 五 |
| `GET /api/config` | 返回完整关卡配置（主题故事） | 六、七 |
| `GET /api/progress` | 返回 revealItems 解锁状态 | 七 |
| `GET /api/user/profile` | 返回 feedFreeLeft / feedTickets | 三、四 |

---



### 7.6 冒险地图：6大世界主线路径

#### 路径结构

6个世界构成一条主线冒险路径：

```
🚩 起点
  ↓
🌱 第1站：成长小镇（学龄前世界）— 自动跳过（年龄>6岁）
  ↓
🏠 第2站：混乱巢穴（家务世界）
  ↓
📚 第3站：迷雾森林（学习世界）
  ↓
🦷 第4站：健康城堡（习惯世界）
  ↓
🏃 第5站：活力竞技场（运动世界）
  ↓
💬 第6站：感恩花园（品德世界）
  ↓
🏁 恭喜通关！
```

#### 规则

| 规则 | 说明 |
|:-----|:------|
| 顺序推进 | 必须完成前一个世界才能解锁下一个 |
| 学龄前跳过 | 家长创建孩子时设置年龄>6岁，自动跳过学龄前世界 |
| 家长配置 | 家长在「我的」页面可手动开放/关闭任何世界 |
| 任务归属 | 家长发布任务时选择所属世界（worldTheme） |
| 完成条件 | 每个世界需完成一定数量的任务才能通关（如20个） |

#### 数据模型变更

**Child 对象新增：**
```javascript
openWorlds: [0,1],           // 已开放的世界索引（默认开放学龄前和家务）
activeWorld: 0,              // 当前活跃世界索引
worldProgress: {             // 各世界完成数
  "preschool": 0,
  "chores": 0,
  "learning": 0,
  "habits": 0,
  "sport": 0,
  "kindness": 0
},
worldTargets: {              // 各世界通关目标数
  "preschool": 15,
  "chores": 25,
  "learning": 25,
  "habits": 25,
  "sport": 20,
  "kindness": 15
},
```

**Task 对象新增：**
```javascript
worldTheme: "chores",        // 所属世界: preschool | chores | learning | habits | sport | kindness
```

#### 前端改动

**冒险地图 renderMap()：**
- 竖屏展示6个世界节点，每个带SVG进度圈
- 节点显示：世界名称、敌人/英雄小图标、进度
- 状态：已完成✅、当前活跃▶、已开放但未到、未解锁🔒
- 点击节点 → 打开该世界任务弹窗

**世界任务弹窗：**
- 显示世界故事引言 + 敌人/英雄图片
- 任务列表（仅显示该世界的任务）
- 可直接"去完成"任务
- 通关后显示胜利动画

**家长任务发布表单：**
- 新增「所属世界」下拉选择器

**家长配置页：**
- 「关卡管理」列表显示6个世界
- 每个世界有开关切换

## 风险评估

| 风险 | 等级 | 影响范围 | 缓解措施 |
|------|------|----------|----------|
| 注册→配置→登录流程断裂 | **高** | 新用户无法正常使用 | 编写端到端测试用例，覆盖 3 种用户路径（新注册、旧用户登录、多孩子切换） |
| JSON 数据库并发写入冲突 | **中** | 数据丢失/不一致 | 喂食券发放和消耗操作合并为一个原子操作；关键写入加 try-catch + 重试 |
| sharp 库跨平台兼容 | **低** | 部署失败 | sharp 0.33+ 完全预编译，确认 Node.js ≥ 18；备选方案为前端 Canvas 缩放 |
| 浏览器 localStorage 数据迁移 | **低** | 旧用户数据格式不兼容 | 读取 localStorage 时做版本检测和容错处理 |
| 关卡配图和敌人图片缺失 | **低** | 页面显示破图 | 所有图片路径做 fallback 处理（无图时用 emoji 替代） |
| 喂食券每日重置时区问题 | **中** | 跨天边界 bug | 统一使用中国时区（UTC+8）计算日期，与签到系统保持一致 |

---

## 实施顺序建议

按照功能模块间的依赖关系，建议分 **4 个阶段** 实施：

### 第一阶段：基础设施（1-2 天）
**功能一 + 功能二（注册流程 + 家长配置）**
- 修改注册返回值
- 新增 `switch-role` API
- 创建 `parent-setup.html`
- 修改 `index.html` 跳转
- **原因**：这是所有后续功能的入口，必须先打通

### 第二阶段：孩子端核心（2-3 天）
**功能三（孩子登录 + 首次孵化）**
- 新增孵化引导页
- 修改宠物孵化 API（free 模式）
- 修改 children switch 返回 hatched 状态
- **功能六 + 功能七（冒险地图 + 游戏化）**
- 关卡弹窗组件
- 关卡主题故事配置
- 渐进解锁 UI
- **原因**：这三个功能都在孩子端，UI 交互紧密关联，一起构建

### 第三阶段：家长端增强（1-2 天）
**功能四（喂食限制）+ 功能五（任务配图）**
- 新增 feedTickets 数据模型
- 修改 feed/complete API
- 家长任务表单新增图片上传和喂食券设置
- 接口上传 sharp 集成
- **原因**：这两个功能都在家长发布任务→孩子完成任务的闭环中

### 第四阶段：联调与测试（1 天）
- 全流程端到端测试（注册→配置→孩子登录→任务→宠物→关卡）
- 旧用户兼容性测试
- 多孩子切换完整性测试
- 边界场景（喂食券耗尽、每日重置、图片超限）测试
- CSS 样式在各屏幕尺寸下的适配

---

## 附录：关键文件行号索引

| 内容 | 文件 | 行号 |
|------|------|------|
| 数据库初始化 | `h5/server.js` | L33-44 |
| 用户对象创建 | `h5/server.js` | L93-107 |
| 注册 API | `h5/server.js` | L86-126 |
| 登录 API | `h5/server.js` | L128-140 |
| 任务 CRUD | `h5/server.js` | L142-159 |
| 任务完成 + XP/升级 | `h5/server.js` | L161-191 |
| 宠物列表/孵化/喂食 | `h5/server.js` | L258-302 |
| 多孩子管理 | `h5/server.js` | L428-546 |
| 游戏配置 | `h5/server.js` | L558-572 |
| 用户资料 | `h5/server.js` | L587-599 |
| 文件上传 | `h5/server.js` | L612-649 |
| 登录页面 JS | `h5/public/index.html` | L226-322 |
| 应用启动逻辑 | `h5/public/app.html` | L817-820, L1499-1512 |
| 全局状态 S | `h5/public/app.html` | L842-949 |
| 冒险地图渲染 | `h5/public/app.html` | L1028-1151 |
| 任务完成流程 | `h5/public/app.html` | L1153-1258 |
| 宠物渲染+喂食 | `h5/public/app.html` | L1373-1384 |
| 家长任务创建 | `h5/public/app.html` | L604-638, L1447-1459 |
| 多孩子管理 UI | `h5/public/app.html` | L1738-1866 |
| PIN 密码管理 | `h5/public/app.html` | L1514-1735 |
