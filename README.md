# Ollama Local Demo

这是一个本地 `Ollama + Node.js + PostgreSQL` 的简单 demo。

## 目录结构

- `commands/`：命令脚本
- `src/`：Node 源代码
- `SOUL.md`：每次请求都会自动附带的系统提示词
- `.session.json`：当前会话的持久化状态

## 主要文件

- `commands/start.cmd`：启动聊天程序
- `commands/history.cmd`：查看最近 20 条聊天记录
- `commands/clear-history.cmd`：清空聊天记录
- `src/start.js`：常驻运行的事件驱动聊天程序
- `src/ollamaClient.js`：封装对 Ollama 的请求
- `src/chatMemory.js`：封装 PostgreSQL 存储
- `src/history.js`：直接从 PostgreSQL 读取并打印聊天记录
- `src/clear-history.js`：清空聊天记录表
- `src/sessionStore.js`：持久化保存当前 `session_id`

## 启动聊天

先把 `commands/start.cmd` 里的数据库密码改成你自己的，然后运行：

```powershell
.\commands\start.cmd
```

默认会复用上一次的 `session_id`。

如果你想创建一个新的会话，可以在启动时带任意额外参数，例如：

```powershell
.\commands\start.cmd new-session
```

输入 `debug` 可以打开或关闭调试模式。打开后，每次请求都会在控制台打印发送给模型的完整 payload。

## 查看聊天记录

先把 `commands/history.cmd` 里的数据库密码改成你自己的，然后运行：

```powershell
.\commands\history.cmd
```

## 清空聊天记录

先把 `commands/clear-history.cmd` 里的数据库密码改成你自己的，然后运行：

```powershell
.\commands\clear-history.cmd
```
