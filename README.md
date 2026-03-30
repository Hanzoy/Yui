# Ollama Local Demo

这是一个本地 `Ollama + Node.js + PostgreSQL` 的简单 demo。

## 文件说明

- `start.js`：常驻运行的事件驱动聊天程序
- `ollamaClient.js`：封装对 Ollama 的请求
- `chatMemory.js`：封装 PostgreSQL 存储
- `history.js`：直接从 PostgreSQL 读取并打印聊天记录
- `sessionStore.js`：持久化保存当前 `session_id`
- `SOUL.md`：每次请求都会自动附带的系统提示词
- `start.cmd`：启动聊天程序
- `history.cmd`：查看最近 20 条聊天记录

## 当前功能

- 每次请求都会自动读取并携带 `SOUL.md`
- 每次请求都会自动携带当前会话最近 20 条聊天记录
- 控制台输入会触发 `userInput` 事件
- 模型回复会触发 `modelReply` 事件
- 用户消息和模型消息都会写入 PostgreSQL 的 `chat_messages` 表

## 启动聊天

先把 `start.cmd` 里的数据库密码改成你自己的，然后运行：

```powershell
.\start.cmd
```

默认会复用上一次的 `session_id`。

如果你想创建一个新的会话，可以在启动时带任意额外参数，例如：

```powershell
.\start.cmd new-session
```

## 查看聊天记录

先把 `history.cmd` 里的数据库密码改成你自己的，然后运行：

```powershell
.\history.cmd
```

这个脚本会直接通过 Node 连接 PostgreSQL 并输出最近 20 条聊天记录，避免 `psql` 在 Windows 控制台下的中文乱码问题。

## PostgreSQL 默认连接参数

- `PGHOST=127.0.0.1`
- `PGPORT=5432`
- `PGDATABASE=postgres`
- `PGUSER=postgres`

## 表结构

程序启动时会自动创建表：

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
