# AGENT-WALLPAPER.md — 给 AI 助手执行：把桌面壁纸版装上并接通联动

> 适用：已经跑通**网页版**（`http://127.0.0.1:8738/index.html` 能看到画面），现在要把它装成 **Wallpaper Engine 桌面壁纸**，
> 并且保证壁纸上的数据和网页端完全一样（同一个本地服务、同一份实时数据）。
>
> 用法：对 AI 说 **「照着 AGENT-WALLPAPER.md 帮我把壁纸版装上并确认联动正常」**。

---

## 0. 目标

1. 把项目复制进 Wallpaper Engine 的 `projects\myprojects\HALOFLUX_AI`；
2. 确保本地数据服务在跑（壁纸和网页读的是同一个 `127.0.0.1:8737`）；
3. 用自动化的方式**证明**壁纸页面能拿到数据（不是只复制文件就完事）；
4. 最后让用户在 Wallpaper Engine 界面里点一下「应用壁纸」。

---

## 1. 前置条件（先检查，缺哪个先解决哪个）

```powershell
# 1.1 Wallpaper Engine 是否安装（从注册表读 Steam 路径）
$steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -Name SteamPath -ErrorAction SilentlyContinue).SteamPath
$weCandidates = @()
if ($steam) { $weCandidates += (Join-Path $steam 'steamapps\common\wallpaper_engine') }
$weCandidates += 'C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine'
$weCandidates += 'D:\Steam\steamapps\common\wallpaper_engine'
$weCandidates += 'E:\steam\steamapps\common\wallpaper_engine'
$we = $weCandidates | Where-Object { Test-Path (Join-Path $_ 'wallpaper64.exe') } | Select-Object -First 1
if (-not $we) { $we = $weCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1 }
"WE = $we"

# 1.2 本地服务是否在跑（壁纸没有它就只有画面、没有数据）
try { $j = Invoke-RestMethod 'http://127.0.0.1:8737/stats' -TimeoutSec 6; "service OK v$($j.server.version)" }
catch { "service DOWN —— 先跑 keepalive.ps1（见 AGENT-INSTALL.md 第 4 节）" }
```

- `WE` 为空 → 用户没装 Wallpaper Engine（Steam 里约 20 元），**到此为止**，告知用户先安装；
- 服务没起 → 先按 `AGENT-INSTALL.md` 第 4 节无窗口启动，否则装了壁纸也是「离线」。

---

## 2. 复制项目到 WE 目录

```powershell
$src = "<解压目录>"                       # 里面有 index.html / ai-link-server.js / project.json
$dst = Join-Path $we 'projects\myprojects\HALOFLUX_AI'

# 目录名必须是 HALOFLUX_AI（WE 里显示的名字来自 project.json 的 title）
New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }     # 覆盖旧版；若旧目录里有用户改动，先备份
Copy-Item $src $dst -Recurse -Force
Test-Path (Join-Path $dst 'project.json')      # 必须 True
```

**注意**：

- 复制的是**整个文件夹**（含 `audio\`、`wp.js`、`ai-link.js`、`ai-link-server.js`、`LICENSE`）；
- 不要复制 `server.log` / `keepalive.log` / `ai-link.pid`（无害，但没必要）；
- `project.json` 里如果保留了 `workshopid` / `workshopurl`，WE 可能把本地项目误认成创意工坊条目（显示"已订阅"、尝试更新）。
  出现这种情况时，让用户确认后删掉这两个字段，其它不要动。

---

## 3. 检查工程文件是否可被 WE 识别

```powershell
$pj = Get-Content (Join-Path $dst 'project.json') -Raw | ConvertFrom-Json
$pj.type          # 应为 "web"
$pj.file          # 应为 "index.html"
$pj.title         # 应为 "HALOFLUX · AI LINK"
Test-Path (Join-Path $dst $pj.file)
```

`type` 不是 `web`、或 `file` 指向的文件不存在 → 说明复制不完整，重新复制。

---

## 4. 关键：验证壁纸页面真的能拿到数据（自动化）

壁纸在 WE 里是以 `file://` 加载 `index.html` 的，它和网页端读的是同一个 `127.0.0.1:8737`。
用无头浏览器直接打开这个 `file://` 地址，截图看有没有渲染出来：

```powershell
$edge = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Google\Chrome\Application\chrome.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$uri  = 'file:///' + ((Join-Path $dst 'index.html') -replace '\\','/')
$shot = Join-Path $env:TEMP 'haloflux_wallpaper_check.png'
if (Test-Path $shot) { Remove-Item $shot -Force }

$prof = Join-Path $env:TEMP ('aixshot-' + [guid]::NewGuid().ToString('N').Substring(0,5))
& $edge --headless=new --disable-gpu --no-first-run --hide-scrollbars --window-size=1280,720 `
        "--user-data-dir=$prof" "--screenshot=$shot" $uri | Out-Null
Start-Sleep -Seconds 6
if (Test-Path $shot) { "screenshot OK, $([math]::Round((Get-Item $shot).Length/1KB)) KB" } else { "screenshot FAILED" }
```

**判定**：

- 截图 > 100 KB → 页面渲染正常（实测本机约 740 KB；黑屏通常只有几 KB）；
- 截图很小或不存在 → 见第 6 节。

> 想更严格地确认"数据接通了"，可以在这台机器上临时打开一次网页版
> `http://127.0.0.1:8738/index.html`，看到左下角 HUD 显示「在线」即说明服务没问题；
> 壁纸端与它同源，只要服务在跑就一定通（`file://` 走 JSONP 兜底，已验证可用）。

---

## 5. 让用户在 WE 里应用（这一步不要用命令行代劳）

告诉用户：

1. 打开 Wallpaper Engine（Steam 里启动）；
2. 左侧「已安装 / Installed」→ 右上角**刷新**按钮；
3. 找到标题 **HALOFLUX · AI LINK** → 右键 →「**应用壁纸 / Apply wallpaper**」；
4. 如果当前已经是它，先切到别的壁纸再切回来（强制重新加载 `ai-link.js`）。

> WE 的界面不要尝试用脚本自动化（点击坐标不可靠），交给用户点一下最快。

---

## 6. 故障对照表

| 现象 | 处理 |
|---|---|
| WE「已安装」里找不到项目 | 确认目录是 `...\projects\myprojects\HALOFLUX_AI`、里面有 `project.json`；重启 WE 再看 |
| 项目出现但显示"已订阅/需要更新" | `project.json` 里的 `workshopid`/`workshopurl` 导致，确认后删除这两行 |
| 选了壁纸但桌面是黑的 | 用第 4 节截图确认页面本身能渲染；黑屏多半是 `index.html` 复制不全或 WE 硬件加速关闭 |
| 桌面有画面但数据全是「离线」 | 服务没跑：`AGENT-INSTALL.md` 第 4 节；确认 `127.0.0.1:8737/stats` 可访问 |
| 桌面数据和网页端不一致 | 两端是独立渲染实例，粒子相位随机，趋势一致即可；若差异很大，重新应用一次壁纸让其加载最新脚本 |
| 壁纸里卡片不显示进程 | 服务里进程采集需要 PowerShell，检查 `server.log` 是否有 `process poller started` |
| WE 开机后壁纸不显示数据 | 服务开机自启没生效：检查 `shell:startup` 下的 `HALOFLUX AI LINK.lnk` |

---

## 7. 汇报格式

```
✅ 已复制到 WE 目录：<dst>
✅ 工程检查：type=web · file=index.html · title=HALOFLUX · AI LINK
✅ 服务在线：http://127.0.0.1:8737/stats（v x.y.z）
✅ 壁纸页面渲染检查：截图 NN KB（>100KB 视为正常）
👉 请在 Wallpaper Engine → 已安装 → 刷新 → 右键「HALOFLUX · AI LINK」→ 应用壁纸
说明：壁纸与网页端共用同一个本地服务，数据一致；不消耗 AI token，不上传任何数据。
```
