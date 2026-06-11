# Yui Chat Demo

这是一个本地/云端模型 + Node.js + PostgreSQL 的简单 demo 仓库。

目前仓库里有两块主要能力：

- 文字聊天 demo：支持 Ollama 或 DeepSeek API、本地记忆、PostgreSQL 和 Qdrant 长期记忆
- 语音识别 demo：基于 `sherpa-onnx`，支持离线 `wav` 和浏览器实时麦克风

## 目录结构

- `commands/`: 启动和辅助命令
- `src/`: 文字聊天主逻辑
- `services/speech-demo/`: 语音识别 demo 服务
- `SOUL.md`: 默认系统提示词
- `.session.json`: 当前会话的持久化状态

## 主要文件

- `commands/start.cmd`: 启动 Web 管理页和 HTTP API
- `commands/start-web.cmd`: `start.cmd` 的兼容别名
- `commands/stop.cmd`: 停止 Docker 里的 Yui 服务和依赖服务
- `commands/db-up.cmd`: 启动 Docker 里的 PostgreSQL、Qdrant 和 Ollama embedding 服务
- `commands/yui-env.cmd`: 本地开发环境变量
- `commands/history.cmd`: 查看最近 20 条聊天记录
- `commands/clear-history.cmd`: 清空聊天记录
- `commands/skill.cmd`: 手动调用单个 skill
- `Dockerfile`: Yui Web/API 应用镜像
- `.dockerignore`: Docker 构建上下文排除规则
- `docker-compose.yml`: 本地 Docker 服务，包含 Yui、PostgreSQL、Qdrant 和 Ollama
- `skills/`: 每个 skill 一个独立文件夹，包含 `SKILL.md` 和 `scripts/run.js`
- `src/server.js`: Web 管理页和 HTTP API 服务入口
- `src/chatService.js`: 可复用聊天服务，供 Web 和 HTTP API 共用
- `src/modelClient.js`: 根据模型配置创建聊天客户端
- `src/embeddingClient.js`: 通过 Ollama 生成文本向量
- `src/qdrantMemory.js`: Qdrant 长期记忆存储和相似度检索
- `src/ollamaClient.js`: 对 Ollama 请求的封装
- `src/deepseekClient.js`: 对 DeepSeek Chat Completions 请求的封装
- `src/chatMemory.js`: PostgreSQL 存储封装
- `src/history.js`: 读取并打印聊天记录
- `src/clear-history.js`: 清空聊天记录表
- `src/skillCommand.js`: 独立 skill 命令入口
- `src/skillChatRunner.js`: skill 调用循环
- `src/securityGuard.js`: 独立安全审查模块
- `src/sessionStore.js`: 保存当前 `session_id`
- `SECURITY.md`: 安全模块独立提示词
- `public/`: Web 管理页静态资源
- `services/speech-demo/src/server.js`: 语音 demo 的 HTTP + WebSocket 入口

## 启动 Web 管理页

项目默认使用 Docker 部署 Yui Web/API、PostgreSQL、Qdrant 和 Ollama。其他同学只需要安装并启动 Docker Desktop，然后运行：

```powershell
.\commands\start.cmd
```

这个命令等价于在仓库根目录运行：

```powershell
docker compose up --build yui
```

Compose 会按依赖顺序启动：

1. `postgres`: PostgreSQL 18
2. `qdrant`: 向量数据库
3. `ollama`: embedding / 本地聊天模型服务
4. `ollama-init`: 一次性拉取 `bge-m3`
5. `yui`: Yui Web/API 应用镜像

命令行会打印两个地址：

- Web 页面：`http://127.0.0.1:3000`
- 其他应用调用的 API Base URL：`http://127.0.0.1:3000/api`

前端页面和聊天服务是分离的：页面通过 HTTP API 调用后端，其他应用也可以直接调用同一组接口。

停止整套服务：

```powershell
.\commands\stop.cmd
```

模型接入方式在 Web 管理页的 `Models` 页面配置。当前支持：

- `Local Ollama`: Docker Compose 内的 Ollama 服务
- `DeepSeek`: DeepSeek API Key、Base URL 和模型名

当前暴露的接口：

- `GET /api/health`: 服务状态
- `GET /api/session`: 当前单 session 状态
- `GET /api/models`: 当前模型配置，API Key 会脱敏
- `PUT /api/models`: 保存模型配置并切换激活模型
- `POST /api/session/new`: 新建 session
- `GET /api/messages?limit=80`: 当前 session 最近消息
- `POST /api/chat`: 发送消息，JSON body 为 `{ "message": "你好" }`

PostgreSQL 容器配置：

- 容器名：`yui-postgres`
- 宿主机地址：`127.0.0.1:5433`
- 容器内地址：`postgres:5432`
- 数据库：`yui`
- 用户：`yui`
- 密码：`yui_dev_password`

这里故意使用宿主机端口 `5433`，避免误连或占用本机直接安装的 PostgreSQL `5432`。

Ollama 也默认运行在 Docker 容器里，并映射到宿主机 `127.0.0.1:11434`。`ollama-init` 会自动检查并下载 embedding 模型 `bge-m3`。

新建会话在 Web 页面点击 `New session`，或调用 `POST /api/session/new`。

## 启用 Qdrant 长期记忆

Qdrant 用来保存聊天消息的向量，启动聊天时会先用当前输入检索语义相关的历史记忆，再把这些记忆和“最近 20 条用户输入以及这些输入期间产生的所有消息”一起传给模型。

### 安装和启动 Qdrant

Qdrant 已经写进 `docker-compose.yml`，会随 `commands/db-up.cmd` 一起启动：

```powershell
.\commands\db-up.cmd
```

默认 HTTP 地址为：

`http://127.0.0.1:6333`

### embedding 模型

Qdrant 只存向量，不负责把文字变成向量。当前项目默认用 Docker 里的 Ollama `bge-m3` 生成 embedding。一般不需要手动安装宿主机 Ollama，也不需要手动执行 `ollama pull`。

如果你想手动在容器里拉取模型，可以运行：

```powershell
docker compose exec ollama ollama pull bge-m3
```

### 启动时打开 Qdrant 记忆

```powershell
$env:YUI_VECTOR_PROVIDER = "qdrant"
$env:QDRANT_URL = "http://127.0.0.1:6333"
$env:QDRANT_COLLECTION = "yui_chat_memory"
$env:OLLAMA_EMBEDDING_URL = "http://127.0.0.1:11434/api/embed"
$env:OLLAMA_EMBEDDING_MODEL = "bge-m3"
npm start
```

可选参数：

- `QDRANT_MEMORY_LIMIT`: 每次检索多少条相关长期记忆，默认 `5`
- `QDRANT_API_KEY`: 如果连接云端或带鉴权的 Qdrant，可以设置 API Key
- `OLLAMA_EMBEDDING_URL`: Ollama embedding 接口地址，默认 `http://127.0.0.1:11434/api/embed`

如果不设置 `YUI_VECTOR_PROVIDER=qdrant`、`QDRANT_ENABLED=true` 或 `QDRANT_URL`，长期记忆会保持关闭，聊天仍然只使用 PostgreSQL 最近记录。

`commands/start.cmd` 和 `commands/clear-history.cmd` 已经默认写入本地 Qdrant 配置：

```cmd
set "YUI_VECTOR_PROVIDER=qdrant"
set "QDRANT_URL=http://127.0.0.1:6333"
set "QDRANT_COLLECTION=yui_chat_memory"
set "OLLAMA_EMBEDDING_URL=http://127.0.0.1:11434/api/embed"
set "OLLAMA_EMBEDDING_MODEL=bge-m3"
```

## 配置 AI 模型

打开 Web 管理页后进入 `Models` 页面配置模型。当前支持两类模型：

- `Local Ollama`: 默认连接 Docker Compose 内部 Ollama，地址为 `http://ollama:11434/api/chat`
- `DeepSeek`: 填写 DeepSeek API Key、Base URL 和模型名

如果使用本地 Ollama 聊天模型，需要先把聊天模型拉进 Docker 容器，例如：

```powershell
docker compose exec ollama ollama pull qwen3.5:9b
```

DeepSeek 的 token 不再通过启动命令或环境变量设置，而是在 `Models` 页面保存到本地 `config/ai-models.local.json`。这个文件已加入 `.gitignore`，不会提交到仓库。

## 底层调用

`src/ollamaClient.js` 当前提供三种 Ollama 可复用方法：

- `chatWithOllama(message, options)`: 默认请求
- `chatWithThinking(message, options)`: 显式要求模型启用 thinking
- `chatWithoutThinking(message, options)`: 显式要求模型返回不 think 的回答

`src/deepseekClient.js` 提供 DeepSeek API 调用：

- `chatWithDeepSeek(message, options)`: 默认请求
- `chatWithThinking(message, options)`: 启用 DeepSeek thinking
- `chatWithoutThinking(message, options)`: 关闭 DeepSeek thinking

## Skill 调用

聊天入口已经接入主流 Skill 包形式。每个 skill 是一个独立目录，包含 `SKILL.md` 和自己的执行脚本。Yui 主程序启动时只把 `SKILL.md` frontmatter 里的 `name` 和 `description` 写进常驻 system prompt；模型需要某个 skill 时，先用 `action:"load"` 加载该 skill 的正文说明，再按说明执行 skill。执行结果会回填给模型。如果模型继续请求 skill，会继续循环，直到模型给出最终文本回答。

Skill 调用不再使用固定最大轮数。每累计 `10` 次 skill 请求，会把当前整体流程上下文交给安全模块检查是否陷入死循环；如果安全模块判断仍在推进任务，就继续执行，否则中断。

```powershell
$env:YUI_SKILL_LOOP_REVIEW_INTERVAL = "10"
```

聊天上下文默认保留最近 `20` 条用户输入，并包含这些用户输入期间所有 assistant、system、skill 结果等消息。可以通过环境变量调整用户输入数量：

```powershell
$env:YUI_RECENT_USER_INPUT_LIMIT = "20"
```

Skill 中间流程会写入 PostgreSQL，但使用专门 role 区分：

- `skill_request`: 模型发出的 `yui-skill` 请求
- `skill_response`: Yui 回填的 skill 文档或执行结果

这些中间消息只进入 PostgreSQL，不会写入 Qdrant 向量数据库。只有正常 `user` 消息和最终 `assistant` 回复会写入长期向量记忆。

当前 skills：

- `get-current-time`: 获取当前时间，默认时区 `Asia/Shanghai`
- `search-memory`: 从 Qdrant 长期记忆里按语义搜索相关聊天记录
- `read-file`: 读取 Windows 本地文本文件内容，由安全模块审查输入和输出
- `run-shell-command`: 执行 Windows PowerShell 命令，由安全模块审查输入和输出

模型加载 skill 说明的匹配格式：

````markdown
```yui-skill
{"skill":"get-current-time","action":"load"}
```
````

模型执行 skill 的匹配格式：

````markdown
```yui-skill
{"skill":"get-current-time","input":{"timezone":"Asia/Shanghai"}}
```
````

一次请求多个 skill 时输出 JSON 数组：

````markdown
```yui-skill
[{"skill":"get-current-time","action":"load"},{"skill":"search-memory","input":{"query":"用户偏好","limit":5}}]
```
````

Skill 相关文件：

- `src/skillChatRunner.js`: 模型 skill 调用循环
- `src/skillCommand.js`: 独立 skill 命令入口
- `src/skills/registry.js`: 扫描 `skills/*/SKILL.md`，常驻提示词只包含 `name` 和 `description`，按需加载正文
- `src/skills/executor.js`: 把 skill 请求交给 `src/skillCommand.js`
- `skills/<skill-name>/SKILL.md`: skill 名称、触发描述、功能说明、输入输出结构和用法
- `skills/<skill-name>/scripts/run.js`: 单个 skill 自己的执行逻辑

默认读取 `skills/` 目录。若要换 skill 目录，可以设置：

```powershell
$env:YUI_SKILLS_ROOT = "D:\path\to\skills"
```

`SKILL.md` 示例：

````markdown
---
name: get-current-time
description: Get the current date and time for an IANA timezone. Use when Yui needs to answer questions about now, today, dates, time, or timezone-aware current time.
---

# Get Current Time

## Capability

Get the current date and time for a requested IANA timezone.

## Invocation

Yui calls this skill with:

```json
{"skill":"get-current-time","input":{"timezone":"Asia/Shanghai"}}
```
````

Skill 可以手动调试：

```powershell
'{"input":{"timezone":"Asia/Shanghai"},"context":{"sessionId":"test"}}' | node src/skillCommand.js get-current-time
```

读取文件 skill 由安全模块审查输入和输出：

```powershell
'{"input":{"path":"D:\code\Yui\README.md"}}' | node src/skillCommand.js read-file
```

执行 shell 命令 skill 由安全模块审查输入和输出：

```powershell
'{"input":{"command":"Get-ChildItem","cwd":"D:\code\Yui"}}' | node src/skillCommand.js run-shell-command
```

输入 `/debug` 后，可以看到每轮发给模型的 payload，包括常驻 skill 列表、按需加载的 skill 文档和 skill 结果回填后的 messages。

## 安全模块

每次执行 `src/skillCommand.js` 时，都会经过独立安全模块审查：

1. 执行前检查 skill 输入。
2. 执行后检查 skill 输出。
3. 每 10 次 skill 请求检查整体流程是否陷入死循环。
4. 如果存在危险操作、越权访问、敏感信息泄露风险或死循环，命令/流程会被终止，并返回安全系统驳回原因。

安全模块使用独立提示词：

`SECURITY.md`

它不使用 `SOUL.md`，也不继承 Yui 的人格提示词。

默认安全审查继承当前 Web `Models` 页面激活的聊天模型，并强制非思考模式以减少延迟。

也就是说，如果当前激活模型是本地 Qwen，安全模块也用本地 Qwen；如果当前激活模型是 DeepSeek，安全模块也用 DeepSeek 非思考模式。

可选环境变量：

```powershell
$env:YUI_SECURITY_ENABLED = "true"
$env:YUI_SECURITY_MODEL_PROVIDER = "deepseek"
$env:YUI_SECURITY_MODEL = "deepseek-v4-pro"
$env:YUI_SECURITY_OLLAMA_URL = "http://127.0.0.1:11434/api/chat"
$env:YUI_SECURITY_MAX_REVIEW_CHARS = "12000"
```

如果要临时关闭安全审查：

```powershell
$env:YUI_SECURITY_ENABLED = "false"
```

安全审查失败时默认 fail closed，也就是拒绝执行或拒绝返回结果。

## 查看聊天记录

先把 `commands/history.cmd` 里的数据库配置改成你自己的，然后运行：

```powershell
.\commands\history.cmd
```

## 清空聊天记录

先把 `commands/clear-history.cmd` 里的数据库和 Qdrant 配置改成你自己的，然后运行：

```powershell
.\commands\clear-history.cmd
```

它会清空 PostgreSQL 的 `chat_messages` 表，并删除当前 `QDRANT_COLLECTION` 对应的 Qdrant collection。下一次聊天写入长期记忆时，collection 会自动重建。

## 语音识别 Demo

仓库里新增了一个独立的 `sherpa-onnx` 语音识别服务，位于：

`services/speech-demo/`

它目前支持两种模式：

- 离线模式：上传 `wav` 文件后做 VAD + ASR
- 实时模式：浏览器麦克风 -> WebSocket -> `20ms PCM` 分帧 -> Node 侧 `VAD + ASR`

当前只做到“终端打印识别结果”，还没有接 LLM 和 TTS。

### 下载语音模型

在仓库根目录执行：

```powershell
npm run speech-demo:models
```

### 启动语音服务

```powershell
chcp 65001
npm run speech-demo
```

默认地址：

`http://127.0.0.1:3301`

### 浏览器实时模式

启动服务后，直接打开：

`http://127.0.0.1:3301`

页面会请求麦克风权限，然后把音频按下面格式实时发送给 Node：

- `16kHz`
- `mono`
- `int16 PCM`
- `20ms` 一帧
- WebSocket 路径为 `/ws`

Node 端会持续接收音频帧，并用 `silero_vad + SenseVoice` 做分段识别，结果会打印到终端，同时显示在网页上。

### 离线样例模式

可以直接调用内置样例：

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3301/recognize/sample
```

### 上传你自己的 wav

当前离线接口要求：

- `wav`
- `单声道`
- `16kHz`

示例：

```powershell
$form = @{
  audio = Get-Item "D:\path\to\your.wav"
}

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3301/recognize `
  -Form $form
```

更完整的语音 demo 说明见：
[services/speech-demo/README.md](/D:/code/Yui/services/speech-demo/README.md)
