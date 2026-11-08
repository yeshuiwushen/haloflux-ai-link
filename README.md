# HALOFLUX · AI LINK

> Wallpaper Engine 桌面壁纸 + DeepSeek Harness 实时数据联动（本地、离线、无上报）
> **基于 HALOFLUX 修改（非商业用途）**

HALOFLUX 原版是一个纯 Canvas、零依赖的科幻光环可视化网页（作者 **Ryder191**）。
本仓库是它的本地二创版：在光环画面上叠加一块实时 HUD，并把本机 **DeepSeek Harness**
的会话遥测（tokens / 工具调用 / 消息数）与 CPU、GPU 占用实时喂给壁纸，
圆环转速与节拍会随 AI 的 token 速率变化。

## 特性

- 左下角 HUD：LINK 状态 · 会话标题 · 模型 · 累计 tokens · tokens/s · 工具调用 · 消息数 · CPU/GPU · 运行时长 · 最近事件
- 视觉联动：`tokensPerSecond` 越高，圆环转速 / 节拍越快；服务离线自动回落默认值
- 数据全部来自本机：只读解析 `~/.dsh/sessions` 下的 zstd JSONL 会话文件，**不上传任何数据**
- 纯 Node.js 内置模块，无第三方依赖（需要 Node.js ≥ 22.15，用于内置 zstd 解压）
- 内置 JSONP 兜底，`file://` 加载的壁纸在 Wallpaper Engine 里也能拿到数据

## 快速开始

1. 安装 [Node.js](https://nodejs.org/) 22.15 或更高版本。
2. 双击 `start_ai_link.vbs`（无窗口启动本地数据服务，端口 `127.0.0.1:8737`）。
3. 验证：
   - 数据：<http://127.0.0.1:8737/stats>
   - 网页预览：<http://127.0.0.1:8738/index.html>
4. 设为壁纸：把整个目录放进
   `...\wallpaper_engine\projects\myprojects\`，
   重启 Wallpaper Engine，在「已安装」里选择 **HALOFLUX · AI LINK**。

停止服务：双击 `stop_ai_link.cmd`。

## 文档

- [START-HERE-AI.md](START-HERE-AI.md) — 交给 AI 的一键入口
- [给朋友的安装教程.md](给朋友的安装教程.md) — 人工手动安装步骤
- [README-AI-LINK.md](README-AI-LINK.md) — 架构、接口、HUD 字段、排错
- `AGENT-*.md` — 给 AI Agent 的安装 / 升级 / 壁纸部署说明

## 隐私

- 只读取本机 DeepSeek Harness 的会话文件，不发送到任何远端；
- 不收集账号、不包含任何 API Key；
- 本地服务只监听 `127.0.0.1`。

## 许可

- 原作：**HALOFLUX** © 2026 Ryder191（RYDER CODE / Ms MAIKEBAIs CAT）— <https://github.com/Ryder191/haloflux>
- 许可证：**PolyForm Noncommercial License 1.0.0**（仅限非商业用途，禁止任何商业用途/盈利），全文见 [LICENSE](LICENSE)
- 本仓库为**基于 HALOFLUX 修改**的版本：新增 AI 数据联动层与配套脚本，未修改原版美术与音频；
  转载/再分发必须保留作者署名、来源链接与许可证。

## 声明

非官方项目，与 DeepSeek / 网易 / Valve / Wallpaper Engine 官方无关。
仅用于个人非商业用途。
