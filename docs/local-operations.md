# 本机运行与路径

核验日期：2026-11-14。本文是本项目当前本机路径与运行职责的唯一维护入口。

## 当前职责

- 本地开发目录：`C:\Users\11818\Desktop\视频剪辑工作台\douyintest`。
- 核验时 Git HEAD：`d510e873b2cd18673c00258ad032d8d3d092998d`；搬迁保留了全部原有未提交改动。
- 本次仅迁移本机开发目录；远程测试/构建、生产、灾备环境未操作，也未核验。

## 前端

在项目的 `web` 目录执行：

```powershell
node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 3000
```

访问 `http://localhost:3000/`。已从新目录恢复运行并验证 HTTP 200。
本次启动日志位于项目的 `.codex-temp/vite-after-move.stdout.log` 和 `.codex-temp/vite-after-move.stderr.log`。
浏览器本地数据按访问源保存，继续使用原来的域名和端口。

## Codex MCP

- 配置：`C:\Users\11818\.codex\config.toml` 中的 `mcp_servers.douyintest`。
- MCP loader 和入口路径已指向新项目目录，工作树偏好中的仓库路径也已更新。
- 按更新后的配置启动独立 MCP 客户端，握手成功并列出 38 个工具。
- 已暂停搬迁前的 MCP 进程；已有 Codex 会话需重新加载 MCP 或重启客户端，不能将独立握手验证视为已有会话全部恢复。
- MCP 转发目标为 `http://127.0.0.1:17371`；核验时没有监听该端口，未验证网页到 Agent 的完整调用链。
- Agent 配置：`C:\Users\11818\.infinite-canvas\canvas-agent.json`；其站点工作空间仍为 `C:\Users\11818\.infinite-canvas\codex-workspaces\site`，不属于本次搬迁范围。

## 搬迁保留项

- 搬迁前 Codex 配置备份：`C:\Users\11818\.codex\config.toml.before-douyintest-move-20261114`。
- 上一次移动留下的部分副本已归档到 `C:\Users\11818\Desktop\视频剪辑工作台\archive\migrations\previous-20261114\douyintest-上次部分副本-20261114`，不是当前工作目录。
- 已检查项目规则、开发文档、脚本与配置示例，未发现需要替换的旧绝对路径；历史记录保留原事实。
- 本次不改变产品功能或功能待办，`todo.mdx` 与 `pending-test.mdx` 无需新增功能记录。

## 主应用根目录整理

工作台主应用已上移到父目录根部，详见 [工作台运维入口](../../docs/operations.md)。本画布项目、MCP loader 和前端目录未移动；启动器从父目录 scripts/start-canvas.cjs 解析当前 web 目录。历史部分副本归档位置已同步。此次只有父项目目录整理，不改变画布功能或功能待办，已检查 todo.mdx 与 pending-test.mdx，无需新增功能记录。

## 分支整合与工作树

2026-11-14 已使用 `git worktree repair` 修复性能工作树指向迁移前 Git 目录的问题；工作树路径仍为 `C:/Users/11818/.codex/worktrees/canvas-performance-upstream/douyintest`，共享 Git 根为当前画布目录。性能提交历史、基准文档、视频接入和提示词功能合入本地 main，发布目标为个人 fork `yichen11818/infinite-canvas`，不写上游 `basketikun/infinite-canvas`。

整合前功能组合的 93 项 Bun 测试通过，合并只补入基准与双语说明，前端源码与已测组合一致；未重新执行生产构建或付费生成。真实供应商能力及人工验证范围继续以 pending-test.mdx 为准。本地 output 和 .codex-temp 作为实验材料保留并排除 Git，不上传环境密钥。
