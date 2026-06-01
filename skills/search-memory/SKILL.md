---
name: search-memory
description: Search Yui's Qdrant long-term semantic memory. Use when Yui needs to recall previous user preferences, facts, context, agreements, or older chat history relevant to the current request.
---

# Search Memory

## Capability

Search Qdrant long-term memory for semantically related chat messages in the current session.

## Invocation

Yui calls this skill with:

```json
{
  "skill": "search-memory",
  "input": {
    "query": "user preference or old fact to recall",
    "limit": 5
  }
}
```

## Input

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Semantic query to search for."
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of memories to return. Defaults to 5."
    }
  },
  "required": ["query"]
}
```

## Output

```json
{
  "type": "object",
  "properties": {
    "enabled": {
      "type": "boolean"
    },
    "query": {
      "type": "string"
    },
    "memories": {
      "type": "array",
      "items": {
        "type": "object"
      }
    }
  }
}
```

## Usage

Use this skill when the current request depends on facts, preferences, or context that may have appeared earlier but is not present in the recent conversation window.
