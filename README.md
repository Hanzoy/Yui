# Ollama Local Demo

这是一个最小可运行的本地 Ollama demo，默认调用 `qwen3.5:9b`，并把模型返回内容打印到终端。

## JavaScript 版本

运行：

```powershell
node .\demo.js
```

传入自定义提示词：

```powershell
node .\demo.js 你好，请介绍一下北京
```

## Python 版本

运行：

```powershell
py .\demo.py
```

## 默认配置

- API 地址：`http://127.0.0.1:11434/api/chat`
- 模型名：`qwen3.5:9b`

如果你的模型标签不同，直接修改脚本里的 `MODEL_NAME` 即可。
