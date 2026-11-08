# AGENT-INSTALL.md — 给 AI 助手执行的操作手册（全新安装）

> 这份文件写给**对方的 AI 助手**（DeepSeek Harness / Claude / Copilot 等能执行命令的智能体）。
> 人类用户只需把整个文件夹交给自己的 AI，说一句：
> **「照着 AGENT-INSTALL.md 帮我装好并打开」**。

---

## 0. 目标

在 **Windows 10/11** 上把 `HALOFLUX · AI LINK` 跑起来：

- 本地服务监听 `127.0.0.1:8737`（数据）与 `127.0.0.1:8738`（网页预览）
- 浏览器打开 `http://127.0.0.1:8738/index.html` 能看到光环画面
- 画面显示**这台机器自己**的 CPU / GPU / 内存 / 网络 / 进程，以及本机 DeepSeek Harness 会话
- 开机自动启动，**不弹任何窗口、不弹任何警告**

不是远程网站，不需要账号，不上传任何数据，**不消耗 AI token**（只读本机会话文件里的统计字段）。

---

## 1. 硬性约束

1. 只监听 `127.0.0.1`；**不要**改成 `0.0.0.0`，**不要**做内网穿透/端口映射/公网发布。
2. 不要修改 `ai-link.js` / `ai-link-server.js` / `index.html` 的内容。
3. 不要删除或改写 `LICENSE`、作者署名、"基于 HALOFLUX 修改"的说明。
4. 仅限**非商业**用途（PolyForm Noncommercial 1.0.0）。
5. **不要**读取、打印或上传 `%USERPROFILE%\.dsh\sessions` 下的会话内容，服务只取统计字段。
6. **不要**用 `.vbs` / `.cmd` 去做开机启动项——Windows 会对脚本弹"未知发布者"安全警告。
7. **不要**创建每分钟运行的计划任务——会周期性闪出控制台窗口。

---

## 2. 文件清单（解压后应存在）

```
<解压目录>\
├─ index.html              原版壁纸（只加了一行 script）
├─ wp.js                   壁纸桥接
├─ ai-link.js              联动脚本（HUD / 面板 / 卡片 / 交互）
├─ ai-link-server.js       本地数据服务
├─ keepalive.ps1           无窗口启动器（检查端口 → 起服务）
├─ holoflux.ico            快捷方式图标
├─ project.json            Wallpaper Engine 工程
├─ LICENSE                 许可证（必须保留）
├─ 给朋友的安装教程.md
├─ AGENT-INSTALL.md        本文件
├─ AGENT-UPGRADE.md        已装过的人看的那份
├─ start_ai_link.cmd       带控制台的启动（调试用）
├─ start_ai_link.vbs       无窗口启动（手动用）
├─ stop_ai_link.cmd        停止服务
├─ preview.jpg
└─ audio\sw421k.mp3
```

---

## 3. 前置检查

```powershell
[System.Environment]::OSVersion.VersionString          # 需要 Windows 10/11
Test-Path "<解压目录>\ai-link-server.js"                # 必须是 True
node -v                                                 # 需要 >= 18，建议 >= 22.15
```

`node -v` 失败或版本过低时：

```powershell
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
```

winget 不可用时用官方 MSI：

```powershell
$msi = "$env:TEMP\node-lts.msi"
Invoke-WebRequest "https://nodejs.org/dist/v22.15.0/node-v22.15.0-x64.msi" -OutFile $msi
Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
```

装完**新开终端**再验证 `node -v`。两次都失败就停下来告诉用户手动装。

---

## 4. 启动服务（无窗口）

```powershell
# 4.1 如果已经有实例，先停（避免端口占用）
& "<解压目录>\stop_ai_link.cmd"
Start-Sleep -Seconds 2

# 4.2 用无窗口方式启动（keepalive.ps1 内部用 CreateNoWindow 起 node）
Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', '"<解压目录>\keepalive.ps1"' `
  -WindowStyle Hidden
Start-Sleep -Seconds 8
```

**不要**用 `start_ai_link.cmd` 做这一步（会弹控制台窗口），它只用于调试。

---

## 5. 验证（全部通过才算成功）

```powershell
# 5.1 数据接口
try { $j = Invoke-RestMethod 'http://127.0.0.1:8737/stats' -TimeoutSec 6; "OK version=$($j.server.version) cpu=$($j.cpu) 进程=$(@($j.top).Count)" } catch { "FAIL: $($_.Exception.Message)" }

# 5.2 网页
try { $h = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8738/index.html' -TimeoutSec 6; "OK status=$($h.StatusCode) canvas=$($h.Content -match '<canvas')" } catch { "FAIL: $($_.Exception.Message)" }

# 5.3 只有一个 node 实例，且没有可见窗口
Get-Process node | Select-Object Id, MainWindowHandle
```

通过标准：5.1 输出 `OK version=1.5.0`（或更高），5.2 输出 `OK status=200 canvas=True`，5.3 每行 `MainWindowHandle = 0`。

然后打开浏览器：

```powershell
Start-Process 'http://127.0.0.1:8738/index.html'
```

---

## 6. 设置开机自启（快捷方式，不用脚本）

```powershell
$dir = "<解压目录>"
$ps  = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$arg = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dir\keepalive.ps1`""
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'HALOFLUX AI LINK.lnk'

$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath       = $ps          # 指向微软签名的 powershell.exe，不会触发"未知发布者"
$s.Arguments        = $arg
$s.WorkingDirectory = $dir
$s.IconLocation     = "$dir\haloflux.ico"
$s.WindowStyle      = 7            # 最小化
$s.Save()
```

要点：

- 快捷方式目标必须是 **exe（powershell.exe）**，参数里再传 `keepalive.ps1`；
- **不要**让快捷方式直接指向 `.vbs` / `.cmd`（会触发安全警告）；
- **不要**建每分钟的计划任务。

---

## 7.（可选）装成桌面壁纸`n`n> 详细步骤（含自动化验证）见 **AGENT-WALLPAPER.md**，这里只给最小流程。

1. 找到 Wallpaper Engine 的 projects 目录（通常在 `<Steam 库>\steamapps\common\wallpaper_engine\projects\myprojects\`，可从注册表 `HKCU\Software\Valve\Steam\SteamPath` 推断，找不到就问用户）；
2. 把整个 `<解压目录>` 复制进去，文件夹名保持 `HALOFLUX_AI`；
3. 告诉用户手动操作：**Wallpaper Engine → 已安装 → 右上角刷新 → 选「HALOFLUX · AI LINK」→ 应用壁纸**。
   不要尝试用命令行操作 WE 界面。

---

## 8. 故障对照表

| 现象 | 处理 |
|---|---|
| `/stats` 连不上 | 看 `<解压目录>\server.log` 最后 20 行；多为端口被占（先 `stop_ai_link.cmd`）或 Node 版本低 |
| 弹「打开文件 - 安全警告 / 未知发布者」 | 说明用了 `.vbs`/`.cmd` 做启动项 → 按第 6 节改回 `powershell.exe`；或对文件执行 `Unblock-File` |
| 每次闪一下黑色控制台 | 说明有每分钟的计划任务在用 `powershell -WindowStyle Hidden` 跑脚本 → 删掉该任务，改用第 6 节的一次性启动项；启动 node 时必须 `CreateNoWindow=$true` |
| 网页 200 但画面全黑 | F12 看控制台报错；确认 `index.html` 未被改动 |
| HUD 显示「离线」 | 服务没起或端口不是 8737，回到第 5 节 |
| AI 字段为 null / 显示「离线」 | 用户没装 DeepSeek Harness，属正常；CPU/GPU/进程不受影响，不要伪造数据 |
| GPU 显示 — | 没有 NVIDIA 显卡或驱动不带 `nvidia-smi`，属正常 |
| 防火墙弹窗 | 允许或取消都行（只监听 127.0.0.1） |
| 担心耗 token | 不会。服务只读本机会话文件里的 usage 字段，不调用任何模型 |

---

## 9. 完成后汇报格式

```
✅ 服务已启动：http://127.0.0.1:8737/stats（版本 x.y.z）
✅ 网页就绪：http://127.0.0.1:8738/index.html
✅ 开机自启：已创建 shell:startup 快捷方式（无窗口、无警告）
程序：N 个应用卡片 · CPU xx% · GPU xx% · 内存 xx%
说明：数据全部在本机，不上传、不消耗 token；停止用 stop_ai_link.cmd
```
