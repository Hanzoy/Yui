---
name: run-shell-command
description: Execute a Windows PowerShell command and return stdout, stderr, and exit code. Use when Yui needs to inspect the local environment, run project scripts, list files, check git status, or perform user-requested shell tasks. Security review is handled before and after execution.
---

# Run Shell Command

## Capability

Execute a Windows PowerShell command in a controlled child process and return its output.

## Invocation

Yui calls this skill with:

```json
{
  "skill": "run-shell-command",
  "input": {
    "command": "Get-ChildItem",
    "cwd": "D:\\code\\Yui",
    "timeoutMs": 30000,
    "maxOutputChars": 12000
  }
}
```

## Input

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "PowerShell command to execute."
    },
    "cwd": {
      "type": "string",
      "description": "Working directory. Defaults to the current Yui process directory."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. Defaults to 30000."
    },
    "maxOutputChars": {
      "type": "number",
      "description": "Maximum stdout/stderr characters to return. Defaults to 12000."
    }
  },
  "required": ["command"]
}
```

## Output

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string"
    },
    "cwd": {
      "type": "string"
    },
    "exitCode": {
      "type": "number"
    },
    "timedOut": {
      "type": "boolean"
    },
    "stdout": {
      "type": "string"
    },
    "stderr": {
      "type": "string"
    },
    "stdoutTruncated": {
      "type": "boolean"
    },
    "stderrTruncated": {
      "type": "boolean"
    }
  }
}
```

## Usage

Use this skill only when the user asks Yui to run or inspect something via shell, or when a local command is necessary to complete the task.

Security: this skill can execute arbitrary PowerShell. Yui's independent security module checks the command before execution and checks stdout/stderr before returning output.
