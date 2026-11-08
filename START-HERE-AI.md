# START-HERE-AI.md —— 给 AI 助手的入口（先读这个）

> 你是被人类用户要求"帮我装这个东西"的 AI 助手。**不要凭猜测操作**，先按下面的路由找到对应手册，照着执行。

---

## 第一步：判断属于哪种情况

| 用户的情况 | 你要读的手册 |
|---|---|
| **第一次装，想网页版 + 桌面壁纸全都要（推荐）** | **`AGENT-FULL.md`** |
| 第一次装，只要网页版能看 | `AGENT-INSTALL.md` |
| 以前装过旧版（目录里已有 `ai-link-server.js`），要更新 | `AGENT-UPGRADE.md` |
| 已经有网页版，只补装 **Wallpaper Engine 桌面壁纸** | `AGENT-WALLPAPER.md` |

不确定是"第一次"还是"升级"时，先用这条命令判断（有输出且能连上 = 已装过）：

```powershell
Test-Path "<用户给的目录>\ai-link-server.js"
```

---

## 第二步：读手册并执行

1. 完整读完对应手册，按顺序执行里面的命令，**不要跳步**；
2. 每一步用手册里给的"验证"命令确认结果，失败就看手册里的故障对照表；
3. 需要用户确认的地方（装 Node、复制进 Wallpaper Engine 目录、应用壁纸）先问一句再动；
4. 全部完成后按手册最后一节的**汇报格式**回给用户。

---

## 第三步：这几条绝对不能做

1. ❌ 不要把监听地址改成 `0.0.0.0`，不要做内网穿透 / 端口映射 / 公网发布；
2. ❌ 不要修改 `ai-link.js` / `ai-link-server.js` / `index.html` 的内容；
3. ❌ 不要删除或改写 `LICENSE`、作者署名、"基于 HALOFLUX 修改"的说明（PolyForm Noncommercial 1.0.0，仅限非商业）；
4. ❌ 不要读取、打印或上传 `%USERPROFILE%\.dsh\sessions` 下的会话内容（服务只取统计字段）；
5. ❌ 不要用 `.vbs` / `.cmd` 做开机启动项（会弹"未知发布者"）；
6. ❌ 不要创建每分钟运行的计划任务（会周期闪控制台窗口）；
7. ❌ 不要用脚本去点 Wallpaper Engine 的界面（让用户自己点"应用壁纸"）。

---

## 第四步：最短成功路径

```powershell
# 1) Node 检查
node -v                                   # 需 >= 18，建议 >= 22.15

# 2) 无窗口启动服务
Start-Process -FilePath "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList '-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',"`"<目录>\keepalive.ps1`"" `
  -WindowStyle Hidden
Start-Sleep -Seconds 8

# 3) 验证
Invoke-RestMethod 'http://127.0.0.1:8737/stats' | Select-Object -ExpandProperty server
(Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8738/index.html').StatusCode   # 期望 200

# 4) 打开
Start-Process 'http://127.0.0.1:8738/index.html'
```

---

## 常见误解（别踩）

- **不消耗 AI token**：服务只是读本机会话文件里的 usage 统计，不调用任何模型。
- **网页端和壁纸端是两个渲染实例**：数据同源（都是 `127.0.0.1:8737`），但粒子相位各自随机，不会逐帧一致，趋势一致就是对的。
- **关掉 AI / 壁纸不会杀掉服务**：服务是独立进程，由 `shell:startup` 快捷方式启动。
- **看到「离线」不是 bug**：多半是服务没起，或 DeepSeek Harness 没装（CPU/GPU/进程仍正常）。
