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
{
  "skill": "get-current-time",
  "input": {
    "timezone": "Asia/Shanghai"
  }
}
```

## Input

```json
{
  "type": "object",
  "properties": {
    "timezone": {
      "type": "string",
      "description": "IANA timezone name. Defaults to Asia/Shanghai."
    }
  },
  "required": []
}
```

## Output

```json
{
  "type": "object",
  "properties": {
    "timezone": {
      "type": "string"
    },
    "iso": {
      "type": "string"
    },
    "local": {
      "type": "string"
    }
  }
}
```

## Usage

Use this skill when the user asks for the current time, date, or today.
