# AGENT-UPGRADE.md — 给 AI 助手执行的操作手册（已经装过旧版）

> 适用：对方**之前已经装过** HALOFLUX · AI LINK（哪怕是更早的版本），现在要更新到当前版本。
> 用法：把新压缩包解压，然后对自己的 AI 说：
> **「照着 AGENT-UPGRADE.md 帮我把旧版更新到新版」**。

---

## 0. 目标

更新到当前版本，做到：

- 文件替换成新版，但**保留** `LICENSE`、`project.json`、`audio/`、以及用户自己的标题/设置；
- 服务能启动、能开机自启，**不弹控制台、不弹安全警告**；
- 原来的旧启动方式（`.vbs`/`.cmd` 启动项、每分钟计划任务）全部清理掉；
- 壁纸端重新加载最新的 `ai-link.js`。

当前版本号以 `http://127.0.0.1:8737/stats` 里的 `server.version` 为准（本版为 **1.5.0**）。

---

## 1. 硬性约束

1. 只监听 `127.0.0.1`，不要改成 `0.0.0.0`，不要做穿透。
2. 不要用 `.vbs` / `.cmd` 做开机启动项（会弹"未知发布者"）。
3. 不要创建每分钟运行的计划任务（会周期闪控制台）。
4. 不要改动 `LICENSE`、作者署名、"基于 HALOFLUX 修改"说明。
5. 仅限非商业用途（PolyForm Noncommercial 1.0.0）。
6. 不要读取/上传会话文件内容。

---

## 2. 找到旧版目录

向用户确认，或按顺序探测（找到 `ai-link-server.js` 即认定）：

```powershell
$candidates = @(
  "$env:USERPROFILE\Desktop\HALOFLUX_AI",
  "D:\HALOFLUX_AI",
  "E:\HALOFLUX_AI",
  (Join-Path $env:PROGRAMFILES 'HALOFLUX_AI')
)
# Wallpaper Engine 目录（从 Steam 路径推断）
$steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -Name SteamPath -ErrorAction SilentlyContinue).SteamPath
if ($steam) {
  $candidates += (Join-Path $steam 'steamapps\common\wallpaper_engine\projects\myprojects\HALOFLUX_AI')
  # 其它 Steam 库：<库盘>\steamapps\common\wallpaper_engine\projects\myprojects\HALOFLUX_AI
}
$old = $candidates | Where-Object { Test-Path (Join-Path $_ 'ai-link-server.js') } | Select-Object -First 1
if (-not $old) { $old = "<让用户告诉你的旧版目录>" }
$old
```

---

## 3. 停服务

```powershell
& (Join-Path $old 'stop_ai_link.cmd')
Start-Sleep -Seconds 2
# 兜底：直接按端口杀
$pid8737 = (Get-NetTCPConnection -LocalPort 8737 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($pid8737) { Stop-Process -Id $pid8737 -Force }
```

---

## 4. 清理旧的自启/定时任务（关键）

```powershell
# 4.1 旧看门狗任务（会每分钟闪控制台）
schtasks /Delete /TN "HALOFLUX AI LINK Watchdog" /F 2>$null
schtasks /Delete /TN "HALOFLUX AI LINK"         /F 2>$null

# 4.2 旧的启动项（指向 .vbs / .cmd 的那个）
$startup = [Environment]::GetFolderPath('Startup')
Get-ChildItem $startup -Filter 'HALOFLUX*' | ForEach-Object {
  $t = (New-Object -ComObject WScript.Shell).CreateShortcut($_.FullName).TargetPath
  if ($t -match '\.(vbs|cmd)$') { Remove-Item $_.FullName -Force; "已删除旧启动项: $($_.Name)" }
}
```

---

## 5. 替换文件

把新版压缩包解压到临时目录 `<新包目录>`，然后**只覆盖代码与文档**，保留用户数据：

```powershell
$files = @(
  'index.html','wp.js','ai-link.js','ai-link-server.js',
  'keepalive.ps1','haloflux.ico',
  'AGENT-INSTALL.md','AGENT-UPGRADE.md','给朋友的安装教程.md',
  'README-AI-LINK.md','README_INSTALL.txt',
  'start_ai_link.cmd','start_ai_link.vbs','stop_ai_link.cmd'
)
foreach ($f in $files) {
  $src = Join-Path '<新包目录>' $f
  if (Test-Path $src) { Copy-Item $src (Join-Path $old $f) -Force; "更新 $f" }
}

# audio：新包里有、旧目录没有才复制
if (-not (Test-Path (Join-Path $old 'audio\sw421k.mp3'))) {
  Copy-Item (Join-Path '<新包目录>' 'audio') (Join-Path $old 'audio') -Recurse -Force
}

# 不要覆盖：LICENSE、project.json、preview.jpg（除非用户想换预览图）
```

> 如果旧版目录名不是 `HALOFLUX_AI`（比如 `HALOFLUX_AI_share`），**保持原目录名不变**即可；
> 只有放进 Wallpaper Engine 的那个目录需要叫 `HALOFLUX_AI`。

---

## 6. 重新建立开机自启（新方式）

```powershell
$ps  = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$arg = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$old\keepalive.ps1`""
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'HALOFLUX AI LINK.lnk'

$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath       = $ps
$s.Arguments        = $arg
$s.WorkingDirectory = $old
$s.IconLocation     = "$old\haloflux.ico"
$s.WindowStyle      = 7
$s.Save()
```

---

## 7. 启动并验证

```powershell
Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList '-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',"`"$old\keepalive.ps1`"" `
  -WindowStyle Hidden
Start-Sleep -Seconds 8

# 7.1 版本与数据
try { $j = Invoke-RestMethod 'http://127.0.0.1:8737/stats' -TimeoutSec 6; "OK version=$($j.server.version) cpu=$($j.cpu)" } catch { "FAIL: $($_.Exception.Message)" }

# 7.2 网页
try { $h = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8738/index.html' -TimeoutSec 6; "OK status=$($h.StatusCode)" } catch { "FAIL" }

# 7.3 只有一个 node、且没有窗口
Get-Process node | Select-Object Id, MainWindowHandle
```

通过：版本号 ≥ 1.5.0、网页 200、`MainWindowHandle` 全为 0、只应有一个 node。

---

## 8. 让壁纸重新加载新脚本

Wallpaper Engine 会缓存已加载的页面，**必须重新应用一次**：

1. 打开 Wallpaper Engine →「已安装」→ 找到 `HALOFLUX · AI LINK`；
2. 右键 →「应用壁纸」（如果当前就是它，先切到别的壁纸再切回来）；
3. 或者关闭 WE 再打开。

---

## 9. 常见问题

| 现象 | 处理 |
|---|---|
| 启动后端口没起来 | 看 `server.log`；确认没有第二个实例（只允许一个监听 8737） |
| 又弹出"未知发布者" | 说明还在用 `.vbs`/`.cmd` 启动项，按第 6 节改 |
| 每分钟闪一次黑框 | 旧看门狗任务没删干净，回到第 4 节 |
| 壁纸画面没变、还是旧行为 | 第 8 节没做，重新应用壁纸 |
| 网页显示「离线」 | 服务未启动或端口不对，回到第 7 节 |
| 旧版有自定义标题 | `project.json` 没被覆盖，用户设置在 WE 属性面板里仍生效 |

---

## 10. 汇报格式

```
✅ 已从旧版更新到 x.y.z（旧目录：<路径>）
✅ 已清理旧启动项/计划任务：N 项
✅ 新启动项：shell:startup → powershell.exe → keepalive.ps1（无窗口、无警告）
✅ 服务验证：/stats OK · 网页 200 · node 1 个且无窗口
⚠️ 请手动重新应用一次壁纸，让界面加载新脚本
```
