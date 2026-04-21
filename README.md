# Ollama Local Demo

这是一个本地 `Ollama + Node.js + PostgreSQL` 的简单 demo 仓库。

目前仓库里有两块主要能力：

- 文字聊天 demo：基于 Ollama、本地记忆和 PostgreSQL
- 语音识别 demo：基于 `sherpa-onnx`，支持离线 `wav` 和浏览器实时麦克风

## 目录结构

- `commands/`: 启动和辅助命令
- `src/`: 文字聊天主逻辑
- `services/speech-demo/`: 语音识别 demo 服务
- `SOUL.md`: 默认系统提示词
- `.session.json`: 当前会话的持久化状态

## 主要文件

- `commands/start.cmd`: 启动聊天程序
- `commands/start-qwen.cmd`: 直接用 Ollama 启动 `qwen3.5:9b`
- `commands/history.cmd`: 查看最近 20 条聊天记录
- `commands/clear-history.cmd`: 清空聊天记录
- `src/start.js`: 事件驱动的聊天程序入口
- `src/ollamaClient.js`: 对 Ollama 请求的封装
- `src/chatMemory.js`: PostgreSQL 存储封装
- `src/history.js`: 读取并打印聊天记录
- `src/clear-history.js`: 清空聊天记录表
- `src/sessionStore.js`: 保存当前 `session_id`
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

输入 `debug` 可以打开或关闭调试模式。打开后，每次请求都会在控制台打印发给模型的完整 payload。

## 启动 Qwen

如果你想直接通过 Ollama 启动 `qwen3.5:9b`，可以运行：

```powershell
.\commands\start-qwen.cmd
```

它等价于：

```powershell
ollama run qwen3.5:9b
```

## 底层调用

`src/ollamaClient.js` 当前提供三种可复用方法：

- `chatWithOllama(message, options)`: 默认请求
- `chatWithThinking(message, options)`: 显式要求模型启用 thinking
- `chatWithoutThinking(message, options)`: 显式要求模型返回不 think 的回答

## 查看聊天记录

先把 `commands/history.cmd` 里的数据库配置改成你自己的，然后运行：

```powershell
.\commands\history.cmd
```

## 清空聊天记录

先把 `commands/clear-history.cmd` 里的数据库配置改成你自己的，然后运行：

```powershell
.\commands\clear-history.cmd
```

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
