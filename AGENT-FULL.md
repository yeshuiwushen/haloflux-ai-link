# AGENT-FULL.md — 给 AI 助手执行：一次性装齐（网页版 + 桌面壁纸 + 开机自启）

> 用法：对 AI 说
> **「解压目录是 D:\HALOFLUX_AI，照着 AGENT-FULL.md 帮我把网页版和桌面壁纸版全装上，装完告诉我该点哪里。」**
>
> 这份手册是"全都要"版本：网页能看、桌面壁纸能看、开机自动起、两边数据联动。

---

## 0. 最终结果

| 项目 | 结果 |
|---|---|
| 本地服务 | `127.0.0.1:8737`（数据）、`127.0.0.1:8738`（网页预览），只监听本机 |
| 网页版 | 浏览器打开 `http://127.0.0.1:8738/index.html` 有画面有数据 |
| 桌面壁纸 | Wallpaper Engine 里出现 **HALOFLUX · AI LINK**，应用后桌面显示同样的画面 |
| 联动 | 壁纸和网页读同一个服务，数据一致（粒子相位随机，不要求逐帧一样） |
| 开机自启 | `shell:startup` 快捷方式，登录自动起，**无窗口、无警告** |
| 资源 / token | 约 1% CPU、200MB 内存；**不消耗 AI token** |

---

## 1. 硬性约束

1. 只监听 `127.0.0.1`；不改 `0.0.0.0`，不做内网穿透/公网发布。
2. 不改 `ai-link.js` / `ai-link-server.js` / `index.html`。
3. 不删改 `LICENSE`、作者署名、"基于 HALOFLUX 修改"说明；仅限非商业用途。
4. 不读取/上传 `%USERPROFILE%\.dsh\sessions` 内容。
5. 不用 `.vbs`/`.cmd` 做启动项，不建每分钟计划任务（都会弹窗/闪窗）。
6. 不自动化 Wallpaper Engine 界面，最后一步交给用户点。

---

## 2. 前置检查

```powershell
$src = "<解压目录>"
[System.Environment]::OSVersion.VersionString
Test-Path (Join-Path $src 'ai-link-server.js')     # 必须 True
node -v                                            # 需 >= 18，建议 >= 22.15
```

Node 缺失/过低：

```powershell
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
# 或
$msi = "$env:TEMP\node-lts.msi"
Invoke-WebRequest "https://nodejs.org/dist/v22.15.0/node-v22.15.0-x64.msi" -OutFile $msi
Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
```
装完新开终端验证 `node -v`。

---

## 3. 找 Wallpaper Engine（找不到就只装网页版）

```powershell
$steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -Name SteamPath -ErrorAction SilentlyContinue).SteamPath
$cands = @()
if ($steam) { $cands += (Join-Path $steam 'steamapps\common\wallpaper_engine') }
$cands += 'C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine'
$cands += 'D:\Steam\steamapps\common\wallpaper_engine'
$cands += 'E:\steam\steamapps\common\wallpaper_engine'
$we = $cands | Where-Object { Test-Path (Join-Path $_ 'wallpaper64.exe') } | Select-Object -First 1
"WE = $we"
```

- `$we` 为空 → **跳过第 4 步和壁纸部分**，末尾告诉用户"没检测到 Wallpaper Engine，网页版已可用；装了 WE 后再补装壁纸"；
- 有值 → 继续第 4 步。

---

## 4. 把壁纸项目复制进 WE

```powershell
$dst = Join-Path $we 'projects\myprojects\HALOFLUX_AI'
New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
Copy-Item $src $dst -Recurse -Force
# 清掉运行时垃圾（如果被一起复制）
Remove-Item (Join-Path $dst 'server.log'),(Join-Path $dst 'keepalive.log'),(Join-Path $dst 'ai-link.pid') -Force -ErrorAction SilentlyContinue

# 校验工程
$pj = Get-Content (Join-Path $dst 'project.json') -Raw | ConvertFrom-Json
"$($pj.type) / $($pj.file) / $($pj.title)"
Test-Path (Join-Path $dst $pj.file)
```

要求：`type=web`、`file=index.html`、`title=HALOFLUX · AI LINK`、对应文件存在。

> 若 WE 里把它显示成"已订阅/需要更新"，说明 `project.json` 里有 `workshopid`/`workshopurl`，问过用户后可删掉这两个字段。

---

## 5. 启动服务（无窗口）

```powershell
& (Join-Path $src 'stop_ai_link.cmd')      # 先停掉可能存在的旧实例
Start-Sleep -Seconds 2

Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList '-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',"`"$src\keepalive.ps1`"" `
  -WindowStyle Hidden
Start-Sleep -Seconds 8
```

---

## 6. 开机自启（快捷方式指向 powershell.exe，不碰脚本）

```powershell
$ps  = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$arg = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$src\keepalive.ps1`""
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'HALOFLUX AI LINK.lnk'
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = $ps; $s.Arguments = $arg; $s.WorkingDirectory = $src
$s.IconLocation = "$src\haloflux.ico"; $s.WindowStyle = 7
$s.Save()
```

顺手在桌面放一个"启动服务"快捷方式（可选）：

```powershell
$dlnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'HALOFLUX AI LINK（启动服务）.lnk'
$d = $ws.CreateShortcut($dlnk); $d.TargetPath = $ps; $d.Arguments = $arg; $d.WorkingDirectory = $src
$d.IconLocation = "$src\haloflux.ico"; $d.WindowStyle = 7; $d.Save()
```

---

## 7. 验证（四条全过才算成功）

```powershell
# 7.1 数据接口
try { $j = Invoke-RestMethod 'http://127.0.0.1:8737/stats' -TimeoutSec 6; "OK v$($j.server.version) cpu=$($j.cpu) 进程=$(@($j.top).Count)" } catch { "FAIL $($_.Exception.Message)" }

# 7.2 网页
try { $h = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8738/index.html' -TimeoutSec 6; "OK status=$($h.StatusCode)" } catch { "FAIL" }

# 7.3 只有一个 node，且没有可见窗口
Get-Process node | Select-Object Id, MainWindowHandle

# 7.4 壁纸页面能渲染（file:// 截图 > 100KB）
$edge = @('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe','C:\Program Files\Google\Chrome\Application\chrome.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1
$targetDir = if (Test-Path $dst) { $dst } else { $src }
$uri  = 'file:///' + ((Join-Path $targetDir 'index.html') -replace '\\','/')
$shot = Join-Path $env:TEMP 'haloflux_wallpaper_check.png'
if (Test-Path $shot) { Remove-Item $shot -Force }
$prof = Join-Path $env:TEMP ('aixshot-' + [guid]::NewGuid().ToString('N').Substring(0,5))
& $edge --headless=new --disable-gpu --no-first-run --hide-scrollbars --window-size=1280,720 "--user-data-dir=$prof" "--screenshot=$shot" $uri | Out-Null
Start-Sleep -Seconds 6
if (Test-Path $shot) { "截图 $([math]::Round((Get-Item $shot).Length/1KB)) KB（>100KB 正常）" } else { "截图失败" }
```

---

## 8. 交给用户点击（不要用脚本点 WE）

告诉用户：

1. 打开 **Wallpaper Engine**（Steam 里启动）；
2. 左侧「已安装」→ 右上角**刷新** → 找到 **HALOFLUX · AI LINK** → 右键 →「应用壁纸」；
3. 浏览器打开 `http://127.0.0.1:8738/index.html` 对照一眼，两边应该有同样的画面和数据；
4. 如果壁纸是空的：先切到别的壁纸再切回来（强制重新加载脚本）。

---

## 9. 故障对照表

| 现象 | 处理 |
|---|---|
| WE 已安装列表里没有项目 | 确认路径 `...\projects\myprojects\HALOFLUX_AI`、里面有 `project.json`；重启 WE |
| 显示"已订阅/需要更新" | `project.json` 的 `workshopid`/`workshopurl`，确认后删除 |
| 桌面黑屏 | 第 7.4 节截图若正常 → 是 WE/显卡问题；截图也黑 → `index.html` 复制不全 |
| 壁纸有画面没数据 | 服务没起；`Invoke-RestMethod http://127.0.0.1:8737/stats` 不通就重跑第 5 步 |
| 网页和壁纸数据看起来不同步 | 正常：两个独立渲染实例，粒子相位随机；趋势一致即可 |
| 弹"未知发布者" | 启动项指向了 `.vbs`/`.cmd`，按第 6 节改 |
| 每分钟左右闪黑框 | 有旧的每分钟计划任务，`schtasks /Delete /TN "HALOFLUX AI LINK Watchdog" /F` |
| 担心耗 token | 不会：只读本机会话文件里的统计字段 |

---

## 10. 汇报格式

```
✅ 服务：http://127.0.0.1:8737/stats（v x.y.z）· 网页 200 · node 1 个且无窗口
✅ 网页版：http://127.0.0.1:8738/index.html
✅ 壁纸版：已复制到 <WE>\projects\myprojects\HALOFLUX_AI（type=web）
✅ 壁纸页面渲染检查：截图 NN KB
✅ 开机自启：shell:startup → powershell.exe → keepalive.ps1（无窗口、无警告）
👉 请打开 Wallpaper Engine → 已安装 → 刷新 → 右键「HALOFLUX · AI LINK」→ 应用壁纸
说明：不上传数据、不消耗 AI token；停止用 stop_ai_link.cmd
```
