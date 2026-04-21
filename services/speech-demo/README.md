# Speech Demo

这是一个独立的 `sherpa-onnx` 语音识别 demo 服务。

当前已经同时支持两种模式：

- 离线模式：上传 `wav` 文件后做 VAD + ASR
- 实时模式：浏览器麦克风 -> WebSocket -> 20ms PCM 分帧 -> Node 侧 VAD + ASR

当前仍然只到“终端打印识别结果”为止，还没有接 LLM 和 TTS。

## 目录

- `src/server.js`: HTTP + WebSocket 服务入口
- `src/speechRecognizer.js`: `sherpa-onnx` VAD + ASR 封装
- `src/realtimeServer.js`: 实时 WebSocket 入口
- `public/index.html`: 浏览器实时演示页
- `public/app.js`: 浏览器麦克风采集与 WebSocket 客户端
- `public/pcm-processor.js`: AudioWorklet PCM 分帧
- `scripts/download-models.ps1`: 下载官方模型

## 1. 下载模型

在仓库根目录执行：

```powershell
npm run speech-demo:models
```

或直接执行：

```powershell
.\services\speech-demo\scripts\download-models.ps1
```

当前使用的是：

- `silero_vad.onnx`
- `sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17`

## 2. 启动服务

在仓库根目录执行：

```powershell
npm run speech-demo
```

如果你在 Windows 终端里看到中文乱码，先执行：

```powershell
chcp 65001
```

默认监听：

`http://127.0.0.1:3301`

## 3. 浏览器实时模式

启动服务后，直接打开：

`http://127.0.0.1:3301`

页面会请求麦克风权限，然后把音频按下面格式实时发给 Node：

- `16kHz`
- `mono`
- `int16 PCM`
- `20ms` 一帧
- WebSocket 二进制帧发送到 `/ws`

Node 端会：

- 接收 PCM 帧
- 聚合为 VAD 需要的窗口
- 用 `silero_vad` 做语音活动检测
- 用 `SenseVoice` 做非流式 ASR
- 把分段识别文本打印到终端
- 同时把分段结果回推给浏览器页面

## 4. 离线样例模式

模型包里自带了测试音频，可以直接跑：

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3301/recognize/sample
```

识别文本会打印在服务终端里，同时接口也会返回 JSON 结果。

## 5. 上传你自己的 wav

目前离线接口要求：

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

## 输出示例

服务终端会输出类似内容：

```text
[speech-demo] source: realtime:speech-ab12cd34 (realtime-segment)
[speech-demo] 0.54-2.31 你好，今天天气怎么样
[speech-demo] fullText: 你好，今天天气怎么样
```

## 已验证内容

我已经在当前仓库里验证过两部分：

- HTTP 离线识别样例可正常输出
- 把内置 `zh.wav` 按 `20ms PCM` 逐帧送入实时会话后，输出结果仍然是 `派饭时间早上9点至下午5点。`

## 下一步

这版已经把“浏览器麦克风 -> WebSocket -> PCM 分帧 -> VAD/ASR”链路搭好了。后续如果要迁移到 Arduino，只需要让 Arduino 通过 Wi-Fi 发送同样格式的 PCM 帧，Node 端的实时识别入口可以继续复用。
