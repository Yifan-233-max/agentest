# Minimal Template

This is the smallest intended embedded adoption path for agentest.

The goal is to keep the initial setup to:

1. one `package.json` entry
2. one `agentest.config.ts`
3. one `*.agentest.yaml` spec
4. one `npx agentest run`

If you want the longer walkthrough with troubleshooting notes, use [usage.md](usage.md).

## package.json

```json
{
  "type": "module",
  "scripts": {
    "test:prompts": "agentest run"
  },
  "agentest": "./agentest.config.ts"
}
```

## agentest.config.ts

```ts
import { defineConfig } from 'agentest';

export default defineConfig({
  agent: {
    preset: 'claude',
  },
  tools: ['get_feature_spec', 'get_bug_report', 'submit_release_note'],
  test: {
    files: ['./tests/**/*.agentest.yaml'],
    timeoutMs: 60_000,
    failOnUnmockedTool: true,
  },
});
```

Notes:

- `tools` can be declared as strings for the minimal path.
- You only need full tool objects with `inputSchema` if you want to describe MCP metadata more precisely.
- `agentest.config.ts`, `agentest.config.mjs`, and `package.json#agentest` are all supported.
- `promptSource.kind: module` supports both JavaScript and TypeScript module refs.

## tests/release-note.agentest.yaml

```yaml
version: 0.1
name: release-note reads required sources and submits output

promptSource:
  kind: module
  ref: ./src/prompts/release-note.ts#buildPrompt
  args:
    featureName: checkout-v2

mocks:
  - tool: get_feature_spec
    when:
      name: checkout-v2
    returns: |
      Feature: checkout-v2
      Behavior: display names should be trimmed before rendering.

  - tool: get_bug_report
    returns: |
      Bug ID: checkout-null-name
      Suggested fix: null-safe trim and fallback string.

  - tool: submit_release_note
    returns:
      accepted: true

assert:
  tools:
    required:
      - get_feature_spec
      - get_bug_report
      - submit_release_note
    noUnmatchedCalls: true

  process:
    exitCode: 0
    timeout: false
```

## Run

```bash
npm i -D agentest
npx agentest run
```

If you want a working repository example, see [examples/consumer/package.json](../examples/consumer/package.json), [examples/consumer/agentest.config.ts](../examples/consumer/agentest.config.ts), and [examples/consumer/tests/fix-null.agentest.yaml](../examples/consumer/tests/fix-null.agentest.yaml).