# HALOFLUX · AI LINK

> 基于 **HALOFLUX** 修改（本地 AI 数据联动版），**非商业用途**。
> 原版：HALOFLUX by **Ryder191**（RYDER CODE / Ms MAIKEBAIs CAT）— <https://github.com/Ryder191/haloflux>
> 许可证：**PolyForm Noncommercial License 1.0.0**（仅限非商业用途，禁止任何商业用途/盈利）。
> 本目录完整保留了原版 `LICENSE`、作者署名、来源链接与全部原始素材。

一个 Wallpaper Engine 网页壁纸的本地二创：把 DeepSeek Harness 的会话遥测 + 本机 CPU/GPU/内存/网络数据，
实时叠加到 HALOFLUX 的光环画面上，并用 **tok/s** 驱动圆环、光束、飞出流线，用**缓存命中率**驱动细线亮度。

---

## 1. 目录结构

```
HALOFLUX_AI/
├─ index.html            原版单文件 Canvas 壁纸（仅新增一行 <script src="ai-link.js">）
├─ wp.js                 Wallpaper Engine 桥接（原版，未改动）
├─ ai-link.js            ★ 新增：中文控制台 + HUD + 数据轮询 + 画面联动 + 交互 + 环带卡片
├─ ai-link-server.js     ★ 新增：本地数据服务（Node.js，127.0.0.1:8737 数据 / 8738 静态预览）
├─ start_ai_link.cmd     ★ 新增：后台启动（隐藏窗口）
├─ start_ai_link.vbs     ★ 新增：零闪窗启动器（可选，推荐）
├─ stop_ai_link.cmd      ★ 新增：停止服务
├─ README-AI-LINK.md     ★ 新增：本文件
├─ server.log            运行日志（自动生成，>4MB 自动清空）
├─ ai-link.pid           运行中的 PID（自动生成，停止时删除）
├─ audio/sw421k.mp3      原版音频
├─ preview.jpg           原版预览图
├─ project.json          标题/简介已改，新增 4 个手动控制属性
├─ LICENSE               原版许可证（必须保留）
└─ README_INSTALL.txt    原版安装说明
```

原版目录 `...\steamapps\workshop\content\431960\3833572582` **未被修改**（只读引用）。

---

## 2. 架构

```
┌────────────────────────────┐        HTTP GET /stats（每秒）        ┌──────────────────────────┐
│ Wallpaper Engine (CEF)     │ ───────────────────────────────────▶ │ ai-link-server.js        │
│ index.html + ai-link.js    │ ◀─────────────────────────────────── │ 127.0.0.1:8737           │
│  · HUD / 8 个面板 / 卡片    │   JSON + Access-Control-Allow-Origin:*│  · 1s 缓存 CPU/内存       │
│  · setParam(tempo/ring…)   │                                       │  · 2s 轮询 nvidia-smi     │
└────────────────────────────┘                                       │  · 2s 轮询 netstat -e     │
                                                                     │  · 1s 增量解析会话文件     │
                                                                     └────────────┬─────────────┘
                                                                                  │ 读取
                                                                     ┌────────────▼─────────────┐
                                                                     │ %USERPROFILE%\.dsh\      │
                                                                     │   sessions\**\session.v4. │
                                                                     │   jsonl.zstd (zstd 压缩)  │
                                                                     └──────────────────────────┘
```

* 服务**每 1 秒**刷新一次缓存，请求直接返回缓存字符串（毫秒级，不阻塞渲染）。
* AI 数据取 `.dsh\sessions` 下**最近修改**的会话文件为「当前会话」；文件内容变化才重新解析（结果缓存，靠 size+mtime 判定）。
* 会话是 zstd 压缩的 JSONL，用 Node 内置 `zlib.zstdDecompressSync` 解压（Node ≥ 22.15）。

---

## 3. 快速开始

1. **启动服务**（任选其一，只需启动一次；开机后可放进「启动」文件夹）：
   * 双击 `start_ai_link.cmd` —— 通过隐藏窗口启动 node，不会常驻黑窗；
   * 双击 `start_ai_link.vbs` —— 连 cmd 窗口的一瞬间闪烁都没有（**最安静**）；
   * 手动：`node "E:\...\HALOFLUX_AI\ai-link-server.js"`。
2. 验证：浏览器打开 <http://127.0.0.1:8737/stats>，应看到一段 JSON；`http://127.0.0.1:8737/` 是一个状态页。
3. **浏览器预览壁纸**（服务自带，端口 8738）：<http://127.0.0.1:8738/index.html>
   —— 和 Wallpaper Engine 里跑的是同一份 `index.html`，方便快速看效果、试交互。
4. **停止**：双击 `stop_ai_link.cmd`（会同时释放 8737 与 8738）。
5. 若换了 Node 安装位置，改 `start_ai_link.cmd` 里的 `set "NODE=..."` 和 `start_ai_link.vbs` 里的 `nodeExe`。

> 本机 Node 路径（已写死，不依赖 PATH）：
> `node`（实测 v26.13.0）

---

## 4. 在 Wallpaper Engine 里加载

1. 项目已放在：`<解压目录>`
2. 打开 Wallpaper Engine →「已安装 / Installed」→ 右上角刷新按钮（或直接重启 WE）。
   本地项目（myprojects）通常直接出现在「已安装」列表里，标题为 **HALOFLUX · AI LINK**。
3. 右键 →「在编辑器中打开 / Open in editor」也可预览；确认不是黑屏后「应用壁纸」。
4. 建议先在 Wallpaper Engine 的「设置 → 性能」里给网页壁纸开启硬件加速（默认已开）。

属性面板里还有 4 个手动控制项：**镜头缩放（手动）**、**圆环角度（手动·度）**、
**自动运镜**（默认关）、**圆环自动旋转**（默认关）——见 5.3。

> `project.json` 里保留了原 `workshopid` 以便溯源。如果 WE 因此把它误认成创意工坊项目（显示「已订阅」或尝试更新），
> 删掉 `project.json` 中的 `"workshopid"` 和 `"workshopurl"` 两行即可，其余不用动。

---

## 5. 界面说明（已全中文）

左下角是 **AI 链路** 浮层（`pointer-events:none`，不影响壁纸交互），等宽字体、青白配色、半透明黑底、切角边框，
数值变化时有一次青白色闪光脉冲；右上角小圆点常亮闪烁表示链路心跳。

| 字段 | 含义 |
|---|---|
| `AI 链路` + `在线/离线` | 与服务端的连接状态；失败时变粉色「离线」并每秒自动重连 |
| `会话` | 当前会话标题（来自 `session/title` 事件，超长截断） |
| `模型` | 当前会话使用的模型（来自 `model/selection`） |
| `令牌总量` | **累计 token 总量** = 各步 `usage.totalTokens` 求和（含 cacheRead/cacheWrite） |
| `速率` | 最近 **10 秒**的 token 速率（同一窗口内增量 ÷ 实际跨度） |
| `命中率` | 缓存命中率 = `cacheRead / (cacheRead + input)`，也用来驱动画面里的细线亮度 |
| `工具调用` | 工具调用次数（`tool/call` 事件计数） |
| `消息数` | 消息数（用户消息 + 助手消息） |
| `CPU` / `GPU` | 全机占用率（`os.cpus()` 时间差 / `nvidia-smi`，含进度条） |
| `运行时长` | **服务**运行时长 `h:mm:ss` |
| 底部左 | 最近事件（如 `工具调用 · pwsh · 3秒前`） |
| 底部右 | `代理 1 · 会话 8` |
| 最底行 | 操作提示：`单击放近 · 双击更近 · 拖动平移 · 滚轮转圈` |

**拖动 HUD**：面板**右上角有六个小点**（抓取点），按住它就能把整块 HUD 拖到画面任意位置
（自动限制在窗口内，松手后位置记在 `localStorage` 里，下次打开还在原地）；
**双击抓取点**恢复默认位置，或调用 `__aiLink.resetHud()`。

### 5.1 顶部标题栏（全部换成真实数据）

| 原来（英文假数据） | 现在 |
|---|---|
| `PAPERS / AGENTS / METHODS / REF. SCENES / FURTHER REVIEW` | `令牌总量 / 活跃代理 / 工具调用 / 消息数 / 会话数` |
| `RESEARCH PAPERS → REPRODUCIBLE EXPERIMENTS` | `本地 AI 会话遥测 · 实时数据联动` |
| `7 / 11 METHODS · 4 PENDING` | `工具 563 · 令牌 139.02M · 会话 8`（每 2.6s 被页面改写，已用观察器抢回） |
| 光环上的浮动标注 `STABILITY CHECK / CFL = …` | 已收起（连同引线），改成**跟随鼠标的详细解析**，见 5.4 |

> 左上角 `RYDER CODE / Ms MAIKEBAIs CAT` 是**原作者署名**（许可证要求保留），故意没有翻译；
> 其余所有英文界面文字都换成了中文。

### 5.2 底部 8 个面板（全部换成 AI 数据）

原版是"论文/实验"主题的假仪表盘，现在每个面板都盖了一层实时 AI 视图（原内容仍在下面绘制，但被完全遮住）：

| # | 标题 | 内容 |
|---|---|---|
| 1 | AI 事件流 | 最近 7 条事件（工具调用 +N、新消息、令牌 +X、切换会话），带时间戳 |
| 2 | 令牌吞吐 | 最近 90 秒 tokens/s 面积图 + 当前值 / 峰值 / 命中率 |
| 3 | 运行状态 | 模型、会话、令牌/上下文、轮次/步数、缓存命中率、运行时长、最近事件 |
| 4 | CPU / GPU 负载 | 90 秒双曲线（**红=CPU、蓝=GPU**）+ 曲线末端实时点 + **每个逻辑核心一根红色小柱**（16 核就 16 根，≥80% 变亮红）+ 内存占用 + `N 核 · 每秒采样` |
| 5 | 数据链路 | 服务地址、传输方式（fetch/XHR/JSONP）、刷新间隔、连接状态、会话文件数、服务版本 |
| 6 | 工具 / 消息 | 每秒增量的柱状图 + 累计数 |
| 7 | 代理调度 | 4×8 格调度条，按 `activeAgents` 点亮，右侧显示「运行中/待命/空闲」 |
| 8 | 系统负载索引 | 4 行 × 60 秒热力图，每列 1 秒：**第 1 行 CPU 红 / 第 2 行 GPU 蓝 / 第 3 行 内存 绿 / 第 4 行 网络 黄** |

### 5.3 交互：点击 / 滚轮 / 双击（改的是页面原生相机，不是 CSS 缩放）

用的是壁纸自己的 `updateCam` —— `ai-link.js` 接管它，直接改 `cam.x/y/z` 并每帧缓动，
所以放大后是**重新渲染的清晰画面**，不是把画布拉伸放大（那种又糊又卡）。

| 操作 | 效果 |
|---|---|
| **单击画面** | 放大一档：`1× → 2×（放大1倍） → 3×（放大2倍） → 回到 1×`，镜头对着点击的位置推近；再点就是“放大后再点一下恢复” |
| **双击画面** | 直接跳到第二档 `3×`；已经在第二档就复位回 `1×` |
| **按住左键/右键拖动** | 平移视角（拖动**不会**触发放大：位移超过 6px 就切到拖动模式，并取消待触发的单击） |
| **滚轮上/下** | 圆环旋转（“转圈”），带缓动 |
| **Ctrl + 双击卡片** | 自动找离指针最近的那张卡片飞过去，放大到能看清卡片内容 |
| **Esc / Z** | 复位到初始视角 / 单击同样走一档 |
| **20 秒不动** | 自动回到初始视角（居中、`1×`），`CONFIG.resetViewMs` 可改 |

* 顶部标题栏、底部面板**不参与**缩放，始终固定在原位（相机只影响画布）。
* 双击会被拦截，不再触发页面的“全屏切换”（全屏仍可按 `F`）。
* **自动运镜、圆环自动旋转默认都是关的**（`CONFIG.autoCamera = false` / `CONFIG.autoSpin = false`），
  画面不会自己推拉、也不会自己转；只有你的操作才会动。
* CEF 控制台里也可以手动调用：`__aiLink.zoom(400,300)`（走一档）、`__aiLink.setZoom(2)`（直接第二档）、
  `__aiLink.pan(120,60)`、`__aiLink.focusCard(400,300)`、`__aiLink.spin(0.5)`、`__aiLink.release()`（回初始视角）。

**桌面壁纸上收不到滚轮/点击怎么办**（Windows 桌面图标层会吃掉这些事件，属于系统限制，不是脚本问题）：
除了鼠标，项目还提供了 4 个 **Wallpaper Engine 属性面板**里的手动控制项，直接改同一套状态：

| 属性面板里的选项 | 作用 |
|---|---|
| **镜头缩放（手动）** `0.8 ~ 3` | 直接推近/拉远相机，`1` = 原始广角 |
| **圆环角度（手动·度）** `0 ~ 360` | 直接把圆环转到指定角度（等价于滚轮转圈） |
| **自动运镜**（默认关） | 打开后恢复页面原版的自动推拉运镜 |
| **圆环自动旋转**（默认关） | 打开后圆环会自己慢慢转 |

> 这三个属性写在 `project.json` 的 `general.properties` 里，`ai-link.js` 通过包装
> `window.wallpaperPropertyListener` 接管（原 `wp.js` 的监听逻辑仍然照常执行，不会被顶掉）。
> 改完 `project.json` 要在 Wallpaper Engine 里重新应用一次壁纸，属性面板才会刷新。

### 5.4 跟随鼠标的详细解析（停 1 秒弹出）

鼠标在画面上移动时不弹；**停住 1 秒**，就在指针旁边弹出一块和原版标注同风格的深色框，
内容是"指针下面那个东西"的详细解析；鼠标一动就自动收起。指针处有一个青色小方块作为锚点。

| 指针在哪里 | 弹出的内容 |
|---|---|
| 圆环数据带（小卡片） | 卡片编号 `#12 · 137°`、卡片宽度、所属环带半径、对应吞吐、命中率、提示"双击可放大" |
| 圈内（数据网） | 当前 tok/s、令牌总量、上下文、命中率、模型 |
| 环外（光束区） | 工具调用次数、最近事件、消息数、代理/会话数、服务运行时长 |
| 底部 8 个面板 | 该面板的指标细项（如吞吐面板给出 90 秒峰值/均值/命中率/累计令牌） |
| 顶部 5 个 KPI | 这个数字的口径说明（如"累计 usage.totalTokens（含缓存读）"） |
| 其它空白处 | 链路状态 + 会话 + 令牌/工具概览 |

* 停住时间的阈值是 `CONFIG.hoverDelayMs`（默认 1000 毫秒）。
* 鼠标按住拖动时不弹（避免拖动视角时弹窗挡视线）。
* 调试时可直接调用 `__aiLink.tip(400, 300)` 在指定坐标弹一次。

### 5.5 环带上的数据卡片（`renderSlot` 被接管）

环带那一圈小屏幕原来是随机假数据（`HEAD` / `KEYS` / `CODE_T` / 随机数字）。
`ai-link.js` 直接**接管了页面的 `renderSlot()`**，每张卡片改成画**本机正在运行的进程**：

* 左边是**进程图标**（服务端从 exe 里用 `Icon::ExtractAssociatedIcon` 抽的 PNG，系统进程没有图标则省略）；
* 中间**竖着排**：图标 → 进程名 → `CPU x%` → `内存 xG`（卡片越高显示的行越多：h≥50 四行、h≥36 三行、更矮两行）；
* **一个进程占一个格子，不循环**：卡片按自己在 `slots` 里的下标固定领一个进程（进程数 > 卡片数时自然铺满），少了就留空格子；**只显示能拿到图标的程序**（= 有 exe 的可见软件），`svchost`/`dwm`/`ApplicationFrameHost`/这类没有图标的系统服务会被直接过滤掉；
* **每张卡片绑定固定进程**：第一次绘制时按角度定下标，之后只更新数值，不会整圈乱跳；进程掉出 top 列表时该卡片会变暗（数值停在最后一次）；
* CPU ≥ 5% 的数字变粉色，方便一眼找出"谁在吃性能"；
* 数据来自服务端 `top` 字段（见 6 节），每 2 秒更新一次。

实现要点：

* **卡片被统一加高**：接管了页面的 `buildCards()`，把原来随机 `16~62px` 的高度改成 `band×0.62`（全屏时约 191px、1600×900 时约 96px），角间距按**内边缘半径**算（否则内圈会重叠），卡片数量从 78 变成 25~34，五行文字才放得下；
* 保留原版的条码底纹和青/粉配色；
* 每秒把 6 张卡片标记为"需要重画"（`s.c = null`），轮着来，不会一次性重画 76 张；
* 想看清卡片内容：**Ctrl + 双击**那张卡片，镜头会飞过去放大。

> 进程列表的采集方式：服务端常驻一个 `powershell` 子进程，每 2 秒输出
> `id|进程名|累计CPU秒|内存字节`，Node 侧做差得到 CPU%（单次启动 powershell 要 300ms+，
> 常驻只付一次启动成本；并在每次输出前设 `[Console]::OutputEncoding = UTF8`，中文进程名才不会乱码）。

### 5.6 画面联动：参数是怎么被驱动的

三路信号：

| 信号 | 来源 | 行为 |
|---|---|---|
| **E 能量（吞吐量）** | `tokensPerSec` → `sqrt(tps / 2500)`，再做 ~0.5s 平滑；另有一条「最近事件」下限：最后一次事件后 20 秒内至少保持 0.35 | AI 持续输出时整体变亮、变快；两次思考之间也不会完全静止 |
| **P 脉冲** | 工具调用 +1、新消息、单次 token 跳变 ≥ 20k、会话切换 | 1.6/s 衰减的尖峰，制造「一次动作 = 一次闪光」 |
| **H 命中率** | `cacheHitRate` 从 90%→100% 映射到 0→1 | 直接抬高圆环内外缘细线、圈内亮线的亮度：命中率越高，线条越"实" |

叠加在**壁纸当前的参数值**上（从页面 `C` 表读取，即用户预设/设置面板的值），全部按参数上限截断：

| 参数 | 画面上的效果 | 逻辑 |
|---|---|---|
| `tempo` | 节拍速度（光带/光束的呼吸频率） | `base + E×1.10 + P×0.22` |
| `ringSpeed` | 圆环转动速度 | `base + E×1.70 + P×0.35` |
| `glow` | 整体柔光/泛光 | `base + E×0.22 + P×0.16` |
| `dataFlicker` | 圆环数据块刷新/闪烁 | `base + E×1.10 + P×1.50` |
| `rimBright` | 内外缘细线亮度（**命中率**） | `base + E×0.15 + P×0.40 + H×0.25` |
| `webSpin` | 圈内底层网线的旋转速度 | `base + E×0.90 + P×0.20` |
| `runnerBright` | 圈内单独亮线亮度（**吞吐量 + 命中率**） | `base + E×0.55 + P×0.25 + H×0.35` |
| `runnerSpeed` | 圈内单独亮线速度（**吞吐量**） | `base + E×1.25 + P×0.20` |

外加一层**屏幕级反馈**（`#aix-fx`，`pointer-events:none`，已去掉 mix-blend-mode 以免拖慢合成）：
全屏青色泛光随 P 变亮（上限约 50% 不透明度的柔和径向渐变），强事件（工具调用/换会话）时有一道
自上而下的扫描线掠过画面。不想要就设 `CONFIG.screenFx = false`。

* 以 **~30fps** 写入，只在有活动（E 或 P > 0.004）时运行；安静下来后**把参数精确还原**成用户原来的值并停止写入，
  设置面板随后的修改不会被覆盖（驱动还会检测外部改动并自动把新值当作基线）。

#### 从环里飞出来的东西（乘性）
**从环里飞出来的东西（流线 / 根部闪光 / 成组光束）** 单独一组，按活跃度 `A` **乘性**缩放：

```
值 = 基线 × ( idle + (1 - idle) × A )        A = max(能量E, 脉冲P × 0.9)
```

空闲时压到基线的 0~35%（`flyerCount` 直接归 0），AI 思考时回到基线，一次工具调用还会瞬间拉满：

| 参数 | 空闲系数 | 画面上的东西 |
|---|---|---|
| `flyerCount` | **0.00 → 0 条** | 单独飞出的流线数量 |
| `flyerBright` | 0.03 | 飞出流线亮度 |
| `flyerSpeed` | 0.35 | 飞出速度 |
| `burstRate` / `burstSize` / `burstBright` | 0.04 / 0.30 / 0.03 | 成组飞出流线的频率 / 数量 / 亮度 |
| `hazeCount` / `hazeBright` | **0.10 / 0.04** | **宽光带**（画面右侧那些长条纹）：22 条 → 空闲约 2 条 |
| `beamBright` / `beamLen` / `beamWidth` / `beamGlow` | 0.04 / 0.20 / 0.30 / 0.03 | 环外伸缩光束 |
| `flareRate` / `flareBright` | 0.05 / 0.05 | 环根闪光 |
| `dashBright` | 0.08 | 流动短线 |
| `cometPerBeat` / `cometBurst` / `cometTrickle` | 0.08 / 0.10 / 0.00 | 成组光束 |

> 它们和上面的加法参数不同：允许**低于**用户基线（这是你要求的"休息时不出或很少"），
> 而且 AI 完全静止时不会被还原成基线，会停在"几乎消失"的状态。

* 只驱动**没有 rebuild 标记**的参数（不碰 `ringWidth`/`rimWidth`/`webBright`/`flyerCount` 这些会触发重建的项），
  所以每帧开销可以忽略。
* 想手动试一下画面反馈：CEF 控制台执行 `__aiLink.pulse(1)`，会立刻来一次满强度脉冲。
* 完全关闭画面联动（只留 HUD）：`CONFIG.driveVisuals = false`。

---

## 6. `/stats` 返回结构

```jsonc
{
  "ts": 1794133466427, "tsIso": "2026-11-08T10:24:26.427Z",
  "link": true,
  "cpu": 16.4,                 // 整机百分比，首个采样周期可能为 null
  "cpuCores": [22, 14, 83, 16, 12, 9, 13, 28, 6, 8, 19, 13, 8, 6, 9, 9],  // 每个逻辑核心
  "cpuName": "AMD Ryzen 7 9700X 8-Core Processor",
  "cpuCount": 16,
  "ram": 41.6,                 // 百分比
  "ramDetail": { "usedPct": 41.6, "usedGB": 12.9, "totalGB": 31.16 },
  "net": { "rxPerSec": 14496, "txPerSec": 3191, "totalMB": 4079 },   // 网卡收发速率（netstat -e 差分）
  "top": [ { "name": "DeepSeek Harness", "cpu": 12.4, "memMB": 2228, "icon": "data:image/png;base64,..." } ],  // 进程 CPU% / 内存 / 图标
  "procCount": 319,
  "gpu": {                     // 没有 nvidia-smi 时为 null
    "utilization": 11, "memoryUsedMB": 2597, "memoryTotalMB": 12227,
    "memoryUsedPct": 21.2, "name": "NVIDIA GeForce RTX 5070"
  },
  "uptimeSec": 62,
  "ai": {
    "tokensTotal": 2418430, "tokensPerSec": 25931.2, "toolCalls": 53,
    "messages": 41, "sessions": 8, "activeAgents": 1,
    "model": "deepseek-flash", "lastEvent": "tool/call · pwsh",
    "sessionTitle": "目标：把 Wallpaper Engine 网页壁",
    "outputTokensPerSec": 66.1, "provider": "deepseek-official",
    "sessionId": "session-…", "sessionFile": "C:\\…\\session.v4.jsonl.zstd",
    "sessionUpdatedAt": 1794133465995, "lastEventType": "tool/call",
    "lastEventAgeSec": 2, "inputTokens": 29955, "outputTokens": 50548,
    "cacheReadTokens": 1180416, "contextTokens": 87594,
    "turns": 1, "steps": 25, "jobsRunning": 1, "tokensWindowSec": 10
  },
  "nulls": [],                 // 值为 null 的字段清单，例如 ["gpu"]
  "server": { "version": "1.0.0", "pid": 20096, "port": 8737, "node": "v26.13.0", … }
}
```

* 解析不到的字段一律 `null`，并在 `ai.unavailable`（缺字段时出现）与顶层 `nulls` 中列出，不会静默丢键。
* 备选端点：`/stats?callback=cb` 返回 JSONP（`cb({...});`），`/health` 返回 `{"ok":true}`，`/` 是状态页。
* 所有响应都带 `Access-Control-Allow-Origin: *`（`file://` 页面的 Origin 是 `null`，只能用 `*`）。

---

## 7. 常见问题

### 7.1 HUD 一直 OFFLINE
1. 看 `server.log` 最后几行；或访问 <http://127.0.0.1:8737/stats>。
2. 端口被占用？`netstat -ano | findstr 8737`，然后 `stop_ai_link.cmd`。
3. 防火墙一般不影响 127.0.0.1；如有第三方安全软件拦截 loopback，放行 node.exe。
4. 服务没起来：手动在项目目录运行
   `node ai-link-server.js`，看控制台报错。

### 7.2 CEF 里请求被拦 / CORS 报错
`ai-link.js` 内置三级降级，全部自动，不需要配置：
1. `fetch()`（首选，带 1.4s 超时）
2. `XMLHttpRequest`（超时/失败后自动切换）
3. **JSONP**：`<script src="http://127.0.0.1:8737/stats?callback=…">` —— `<script>` 加载**不受 CORS 限制**，
   这是 `file://` 页面下最可靠的兜底，服务端已支持。

如果仍然失败，按顺序排查：
* 用浏览器直接开 `file:///E:/.../HALOFLUX_AI/index.html`，看 HUD 是否 ONLINE —— 能通说明是 WE 的 CEF 问题；
* 用 `--allow-file-access-from-files` 启动浏览器/CEF 再试（注意：这会影响该进程内所有页面的安全策略，仅调试用）：
  `msedge.exe --allow-file-access-from-files "file:///E:/.../HALOFLUX_AI/index.html"`；
* 改用本地 HTTP 打开壁纸（**服务已自带**，无需额外命令）：
  <http://127.0.0.1:8738/index.html> —— 同一份 `index.html`，走 http 源，
  可以直接验证是"页面逻辑"还是"CEF 加载方式"的问题。

### 7.3 Wallpaper Engine 能在 project.json 里配置 web 壁纸的 URL 吗？
**没有官方文档化的 URL 字段。** 网页壁纸的 `"file"` 正常应指向项目内的相对 HTML 文件（本项目是 `index.html`）。
（顺带说明：本服务已经在 **8738** 端口托管了整个项目，所以 `http://127.0.0.1:8738/index.html` 随时可用，
但它只用于浏览器预览；Wallpaper Engine 仍然走 `file://`，靠 JSONP 兜底，不依赖这个端口。）
社区里有人把 `"file"` 直接写成 `http://127.0.0.1:端口/index.html` 并声称可用，但**未受官方支持、随版本可能失效**，本项目不依赖它。
排查/试验方法：
1. 复制一份 `project.json` 备份；
2. 把 `"file"` 改成 `"http://127.0.0.1:8738/index.html"`；
3. 重载壁纸 —— 能正常显示即该版本支持；黑屏/回退到默认壁纸即不支持，改回 `"index.html"`。
4. 注意即使能用，服务与静态服务器都必须先启动，否则壁纸黑屏。
**推荐做法**：保持 `file: index.html`（file:// 加载），靠 JSONP 兜底即可，无需本地 HTTP。

### 7.4 GPU 显示 N/A
* `nvidia-smi` 不存在（A 卡/核显）→ 属正常，字段为 `null`；
* 有 N 卡但取不到：在终端跑
  `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits` 验证；
* 某些受限环境禁止子进程管道（`spawn EPERM`），服务会自动改用 `nvidia-smi -f 临时文件` 的方式读取，日志里会记录 `(file transport)`；
* 想彻底关闭 GPU 探测：设环境变量 `AI_LINK_GPU=0` 再启动。

### 7.5 AI 字段是 null
* `sessions` 目录不存在 → 检查 `%USERPROFILE%\.dsh\sessions`，或用环境变量 `DSH_SESSIONS_DIR` 指定；
* 会话格式变了（不是 `session*.jsonl.zstd`）→ 服务只认这个命名，`ai.note` 会写明原因；
* 新会话还没产生 token → `tokensTotal` 为 0 属正常，不是 null。

### 7.6 想换 HUD 位置 / 隐藏 HUD
* 浏览器预览时可用 `?aihud=top-right` 或 `?aihud=off`；
* 在 WE 里（无查询串）：改 `ai-link.js` 顶部 `CONFIG.position` 为 `'top-right'` / `'off'`；
* 临时隐藏：CEF 控制台执行 `__aiLink.hide()` / `__aiLink.show()`。

### 7.7 日志里刷 `uncaughtException`
服务对异常做了兜底（记录后继续运行），正常不会退出。若反复出现，把 `server.log` 最后 30 行发出来排查。

### 7.8 壁纸卡顿怎么办
v1.2 已经砍掉了所有会拖慢合成器的效果，如果你还是觉得卡，按这个顺序看：

1. **先确认加载的是新版本**：页面刷新一次（WE 里重新应用壁纸）。旧版本用过 `backdrop-filter`、
   `mix-blend-mode` 和画布 `transform: scale()`，这三种在动画画布上非常吃 GPU。
2. **现在的实现**：交互缩放改成接管页面相机（重新渲染，不拉伸位图）；屏内泛光不再用混合模式，
   静止时直接 `display:none`；底部 4 个小画布和 72 个代理格子已经停止原有的每帧绘制（反正被我们的面板盖住了）。
3. **Wallpaper Engine 侧**：设置 → 性能 → 视频/网页壁纸的「质量」调低一档；确认没开「抗锯齿」高倍率。
4. **4K 分辨率**最吃性能，可把 Windows 缩放设为 100% 或让 WE 以较低分辨率渲染。
5. 打开任务管理器看 `wallpaperui`/`wallpaper32` 的 GPU 占用：如果 GPU 90%+，就是分辨率/质量的问题，
   不是数据服务（服务本身每秒只读一次会话文件，CPU 占用 <1%）。
6. 检查 `server.log` 有没有每 60 秒一条 heartbeat：有就说明服务正常，卡顿与数据链路无关。

### 7.9 网页里鼠标指针不见了
原版给桌面场景写了 `html,body,.stage,.p{cursor:none}`（壁纸上不显示鼠标）。现在 `ai-link.js` 会自己判断环境：

* 检测到 **Wallpaper Engine**（UA 含 `WallpaperEngine`，或存在 `wallpaperRegisterAudioListener`）→ 保持隐藏，和原版一致；
* 普通浏览器 / 8738 预览 → 注入 `html,body,.stage,.p{ cursor:default !important }`，指针正常显示；
* 想强制覆盖：地址后加 `?cursor=on`（显示）或 `?cursor=off`（隐藏）；
* 运行时也可以调：`__aiLink.cursor(true)` / `__aiLink.cursor(false)`。

---

## 8. 自测记录（本机）

| 项目 | 结果 |
|---|---|
| `node --check ai-link-server.js` / `ai-link.js` | 均通过（exit 0） |
| `curl http://127.0.0.1:8737/stats` | HTTP 200，`Access-Control-Allow-Origin: *`，字段齐全 |
| `link` / `cpu` / `ram` / `gpu` / `uptimeSec` / `ai.*` | 实测均有值：CPU 16.4%、RAM 41.6%、GPU 11%（RTX 5070）、11 个 ai 必备键齐全 |
| `ai.tokensTotal` / `tokensPerSec` / `toolCalls` / `messages` | 实测 2,418,430 / 25,931.2 / 53 / 41 |
| 无头浏览器验证 | **跳过**：本机沙箱禁止 Chromium 的 mojo 命名管道（`platform_channel.cc: Check failed`），改用 Node + 最小 DOM 桩运行 `ai-link.js`，验证 HUD 构建、ONLINE/OFFLINE 切换、字段渲染与 `setParam` 调用均正确 |
| 三级传输链路 | fetch ✓ / XHR 失败自动切换 ✓ / **仅 JSONP 可用时**仍能 ONLINE（`preferred: jsonp`）✓ |
| 离线回落 | 服务全不可达时 HUD 显示「离线」，13 个画面参数逐项还原为壁纸自身的值后停止写入 ✓ |
| 中文控制台 | 假页面桩实测：8 个面板全部生成、5 个 KPI 换成真实值（令牌 15.79M / 代理 1 / 工具 155 / 消息 124 / 会话 8）、8 个面板标题与画面标注全部中文 ✓ |
| 点击放大 | 改成接管相机：单击 `1×→2×→3×→1×` 循环；双击直达 `3×`；右键拖动 `cam.x 400→280`；20 秒不动自动回 `level 0 / z 1 / 居中` ✓ |
| 画面联动 | 合成遥测实测：tempo 0.6→1.88、ringSpeed 0.6→2.59、glow 1.1→1.45、beamGlow 2.6→4.22、dataFlicker 1→3.34、cometTrickle 0→1.93、flareRate/burstRate→5.0、runnerSpeed 0.6→2.2、webSpin 1→2.06、cometBurst 9→12；数据停止后全部精确复原 ✓ |
| 鼠标指针 | 浏览器里注入 `cursor:default !important`（桩测试确认样式存在且规则正确）；WE 里保持原版隐藏 ✓ |
| 跟随解析 | 桩测试：移动时 `#aix-tip` 不显示 → 静止 1.25s 后 `on` 出现并填入内容 → 再移动即收起 ✓ |
| 真机数据 | `/stats` 连续采样：CPU `21.6% → 21.4% → 26.7%`，16 个逻辑核心各自 `0 ~ 83%` 跳动；型号 `AMD Ryzen 7 9700X`，与 Windows 计数器同量级 ✓ |
| 飞出物流线联动 | 页面内实测：空闲 30 秒后 `E=0` → `hazeCount 22→2`、`hazeBright 1.5→0.06`、`beamBright 1.8→0.07`、`flyerCount 3→0` ✓ |
| 网络采集 | `netstat -e` 差分（中文版 GBK 输出也能解析）：实测 `rx 14.5 KB/s · tx 3.2 KB/s · 累计 4079 MB` ✓ |
| HUD 拖动 | 桩测试：按住右上角抓取点拖动 → `left/top` 变为 `220px/140px`；双击/`resetHud()` 清空恢复默认 ✓ |
| 关闭自动运镜 | 静置连跑 30 帧 `updateCam`，`cam` 完全不变（不再自动缩放/移动）✓ |
| WE 属性面板 | 模拟 `applyUserProperties`：`ringangle=90` → `ringRot=1.57`；`aizoom=2.5` 生效；`aicamera/aispin` 可切回自动 ✓ |
| `index.html` 内联脚本语法 | 1 段内联脚本，`new vm.Script()` 解析 0 错误；`<script src="ai-link.js">` 已就位 |
| 停止服务 | `stop_ai_link.cmd` 后端口 8737 释放，无残留 node 进程 |

---

## 9. 许可与致谢

* 原作：**HALOFLUX** © Ryder191（RYDER CODE / Ms MAIKEBAIs CAT）— <https://github.com/Ryder191/haloflux>
* 许可证：**PolyForm Noncommercial License 1.0.0**，全文见本目录 `LICENSE`。
* 本二创：**基于 HALOFLUX 修改（本地 AI 数据联动版），非商业用途**。
  仅新增 `ai-link.js` / `ai-link-server.js` / 启动脚本 / 本文档，并在 `index.html` 末尾加了一行 `<script>`；
  未修改任何原有美术、音频与 `wp.js`。
* 不得用于任何商业用途或盈利；转发/再分发时必须保留作者署名、来源链接与本段说明。



---

## 10. 分享给别人（每人跑自己的一份）

给别人的是**整个文件夹**（或本目录上一层的 `HALOFLUX_AI_share.zip`），不是网址。
对方解压后在自己电脑上跑，看到的就是**他自己电脑**的数据。

对方需要：

1. **Node.js**（≥ 22.15，带 zstd 解压能力）—— <https://nodejs.org/> 装 LTS 即可；
2. 可选：Wallpaper Engine（想在桌面当壁纸用就需要，只想开网页看则不需要）；
3. 可选：DeepSeek Harness（想联动 AI 才需要，没有的话 AI 那部分显示「离线」，CPU/GPU/进程照常显示）。

对方的操作步骤：

1. 解压到任意目录（路径别带特殊符号即可）；
2. 双击 `start_ai_link.cmd`（或 `start_ai_link.vbs`，无黑窗）；
3. 浏览器打开 <http://127.0.0.1:8738/index.html> —— 看的是他本机的实时数据；
4. 想当壁纸：Wallpaper Engine → 已安装 → 打开 `project.json` 所在目录 → 应用 `HALOFLUX · AI LINK`；
5. 停止：双击 `stop_ai_link.cmd`。

数据来源（全部在本机）：
* CPU/GPU/内存/网络/进程：本机系统接口 + `nvidia-smi`；
* AI 数据：本机 `%USERPROFILE%\.dsh\sessions` 下最近修改的会话文件（自动按用户名定位，不写死路径）。

每个字都是**本地回环**（`127.0.0.1`），不会把数据发到任何服务器，别人也访问不到你机器上的这份。

许可：PolyForm Noncommercial 1.0.0 —— **仅限非商业用途**，必须保留 `LICENSE`、原作者署名（Ryder191 / RYDER CODE / Ms MAIKEBAIs CAT）和「基于 HALOFLUX 修改」的说明。

---

## 11. 服务自愈（关掉壁纸/AI 后自动拉起）

后台服务是独立进程，但**如果它被关掉（比如从 AI 的终端里启动、AI 退出时被一起带走）**，
网页和壁纸就会变成「离线」。为此加了两道保险：

1. **开机自启**：`shell:startup` 里有 `HALOFLUX AI LINK.lnk`，登录后静默启动一次；
2. **手动恢复**：桌面「HALOFLUX AI LINK（启动服务）」快捷方式（等价于运行 `keepalive.ps1`），双击后检查 `127.0.0.1:8737`，
   发现没在监听就自动拉起 `ai-link-server.js`（用 WMI 创建进程，**不会挂在**任何 AI/编辑器/壁纸进程下面，
   所以关掉它们也不会连带杀死服务）。

查看 / 管理：

```powershell
# 看任务状态
schtasks /Query /TN "HALOFLUX AI LINK Watchdog" /FO LIST
# 立刻手动触发一次（不用等一分钟）
schtasks /Run /TN "HALOFLUX AI LINK Watchdog"
# 关掉自愈
schtasks /Delete /TN "HALOFLUX AI LINK Watchdog" /F
# 看自愈日志
notepad "keepalive.log"
```

> 关掉壁纸不会影响服务；关掉 DeepSeek Harness 也不会（AI 数据会变成离线，但 CPU/GPU/进程照常）。
> 如果真的把服务杀了，最多 1 分钟内它会自己回来，刷新一下网页即可。
