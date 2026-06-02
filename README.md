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

- `commands/start.cmd`: 启动聊天程序
- `commands/start-deepseek.cmd`: 通过 DeepSeek API 启动聊天程序
- `commands/start-qwen.cmd`: 直接用 Ollama 启动 `qwen3.5:9b`
- `commands/history.cmd`: 查看最近 20 条聊天记录
- `commands/clear-history.cmd`: 清空聊天记录
- `commands/skill.cmd`: 手动调用单个 skill
- `skills/`: 每个 skill 一个独立文件夹，包含 `SKILL.md` 和 `scripts/run.js`
- `src/start.js`: 事件驱动的聊天程序入口
- `src/modelClient.js`: 根据环境变量选择模型提供商
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
- `services/speech-demo/src/server.js`: 语音 demo 的 HTTP + WebSocket 入口

## 启动聊天

先把 `commands/start.cmd` 里的数据库配置改成你自己的，然后运行：

```powershell
.\commands\start.cmd
```

默认会复用上一次的 `session_id`。

如果你想创建一个新的会话，可以这样启动：

```powershell
.\commands\start.cmd new-session
```

输入 `/debug` 可以打开或关闭调试模式。打开后，每次请求都会在控制台打印发给模型的完整 payload。

退出聊天时输入 `/exit` 或 `/quit`。

## 启用 Qdrant 长期记忆

Qdrant 用来保存聊天消息的向量，启动聊天时会先用当前输入检索语义相关的历史记忆，再把这些记忆和“最近 20 条用户输入以及这些输入期间产生的所有消息”一起传给模型。

### 安装和启动 Qdrant

推荐用 Docker 启动本地 Qdrant：

```powershell
docker pull qdrant/qdrant
docker run -p 6333:6333 -p 6334:6334 -v ${PWD}\qdrant_storage:/qdrant/storage qdrant/qdrant
```

默认 HTTP 地址为：

`http://127.0.0.1:6333`

### 安装 embedding 模型

Qdrant 只存向量，不负责把文字变成向量。当前项目默认用 Ollama 的 `bge-m3` 生成 embedding：

```powershell
ollama pull bge-m3
```

### 启动时打开 Qdrant 记忆

```powershell
$env:YUI_VECTOR_PROVIDER = "qdrant"
$env:QDRANT_URL = "http://127.0.0.1:6333"
$env:QDRANT_COLLECTION = "yui_chat_memory"
$env:OLLAMA_EMBEDDING_MODEL = "bge-m3"
npm start
```

可选参数：

- `QDRANT_MEMORY_LIMIT`: 每次检索多少条相关长期记忆，默认 `5`
- `QDRANT_API_KEY`: 如果连接云端或带鉴权的 Qdrant，可以设置 API Key
- `OLLAMA_EMBEDDING_URL`: Ollama embedding 接口地址，默认 `http://127.0.0.1:11434/api/embed`

如果不设置 `YUI_VECTOR_PROVIDER=qdrant`、`QDRANT_ENABLED=true` 或 `QDRANT_URL`，长期记忆会保持关闭，聊天仍然只使用 PostgreSQL 最近记录。

`commands/start.cmd`、`commands/start-deepseek.cmd` 和 `commands/clear-history.cmd` 已经默认写入本地 Qdrant 配置：

```cmd
set "YUI_VECTOR_PROVIDER=qdrant"
set "QDRANT_URL=http://127.0.0.1:6333"
set "QDRANT_COLLECTION=yui_chat_memory"
set "OLLAMA_EMBEDDING_MODEL=bge-m3"
```

## 启动 Qwen

如果你想直接通过 Ollama 启动 `qwen3.5:9b`，可以运行：

```powershell
.\commands\start-qwen.cmd
```

它等价于：

```powershell
ollama run qwen3.5:9b
```

## 启动 DeepSeek

DeepSeek API 使用 OpenAI 兼容的 Chat Completions 格式。先设置 API Key：

```powershell
$env:DEEPSEEK_API_KEY = "sk-..."
```

然后运行：

```powershell
.\commands\start-deepseek.cmd
```

这个脚本同样会启用 Qdrant 长期记忆；DeepSeek 负责聊天回复，Ollama 的 `bge-m3` 负责生成 embedding。

默认模型为 `deepseek-v4-pro`。如果要切换模型，可以设置：

```powershell
$env:DEEPSEEK_MODEL = "deepseek-v4-flash"
```

也可以不使用专门脚本，直接在启动前指定 provider：

```powershell
$env:YUI_MODEL_PROVIDER = "deepseek"
npm start
```

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

默认安全审查继承当前聊天模型提供商，并强制非思考模式以减少延迟：

```text
start.cmd: 使用本地 Ollama / Qwen
start-deepseek.cmd: 使用 DeepSeek
think: false
```

也就是说，如果当前聊天是本地 Qwen，安全模块也用本地 Qwen；如果当前聊天是 DeepSeek，安全模块也用 DeepSeek 非思考模式。

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
