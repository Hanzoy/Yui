---
name: read-file
description: Read text content from a Windows file path. Use when Yui needs to inspect a user-specified local text/code/config/document file. Security review is handled by Yui's independent security module before and after execution.
---

# Read File

## Capability

Read a local Windows file as text and return its content with metadata.

## Invocation

Yui calls this skill with:

```json
{
  "skill": "read-file",
  "input": {
    "path": "D:\\code\\Yui\\README.md",
    "encoding": "utf8",
    "maxBytes": 65536
  }
}
```

## Input

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "Absolute or relative file path to read."
    },
    "encoding": {
      "type": "string",
      "description": "Text encoding. Defaults to utf8."
    },
    "maxBytes": {
      "type": "number",
      "description": "Maximum bytes to read. Defaults to 65536."
    }
  },
  "required": ["path"]
}
```

## Output

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string"
    },
    "encoding": {
      "type": "string"
    },
    "bytes": {
      "type": "number"
    },
    "truncated": {
      "type": "boolean"
    },
    "content": {
      "type": "string"
    }
  }
}
```

## Usage

Use this skill only when the user asks Yui to read or inspect a local file. Prefer exact paths from the user.

Security: this skill itself does not maintain a path whitelist. Yui's independent security module checks the input before execution and checks the output before returning file content.
