# GitHub Issue Triage — Real Copilot CLI Example

This example demonstrates the core value of `agentest`: testing a **real AI agent workflow** end-to-end.

Unlike the [consumer example](../consumer/), which uses a deterministic fake agent, this example runs the **actual GitHub Copilot CLI**. The LLM decides which tools to call — `agentest` traces those decisions and verifies them against a contract.

## What This Example Tests

A Copilot CLI agent is asked to triage [GitHub issue #1](https://github.com/Yifan-233-max/agentest/issues/1) in this repository. The issue reports that `agentest create` gives an unclear error when `--source` points to a non-existent file.

The expected agent workflow:

1. **Search the code** — find the relevant implementation (`src/create/run-create.ts`)
2. **Read the file** — understand the error handling logic
3. **Post a comment** — explain the root cause and suggest a fix

The agent must **not** modify any files, close the issue, or call tools outside the declared set.

## Why This Matters

Without `agentest`, you have no way to verify that a prompt change didn't break this workflow. For example:

- Did the agent skip the search step and guess?
- Did the agent try to edit files instead of just commenting?
- Did the agent call an unauthorized tool?

`agentest` catches all of these by replacing the real GitHub MCP Server with a mock that traces every tool call and checks it against the test contract.

## How It Works

```text
Normal:  Prompt → Copilot CLI → GitHub MCP Server → Real GitHub API
Test:    Prompt → Copilot CLI → agentest mock MCP  → Traced responses + assertions
```

The mock MCP server presents the same tools (`search_code`, `get_file_contents`, `create_issue_comment`) but returns pre-defined responses. The LLM doesn't know the difference — it makes the same decisions it would make against the real API.

## Prerequisites

- [GitHub Copilot CLI](https://docs.github.com/en/copilot) installed and authenticated
- Node.js 18+
- `agentest` built from repo root: `npm install && npm run build`

## Files

| File | Purpose |
|------|---------|
| [agentest.config.ts](agentest.config.ts) | Config with `copilot` preset and GitHub MCP tool schemas |
| [prompts/triage-issue.ts](prompts/triage-issue.ts) | Prompt builder module |
| [tests/triage-issue.agentest.yaml](tests/triage-issue.agentest.yaml) | Test spec with mocks and assertions |

## Run It

From the **repository root**, build first:

```bash
npm run build
```

Review the test flow:

```bash
node ./dist/cli.js flow examples/github-issue-triage/tests/triage-issue.agentest.yaml
```

Run the test:

```bash
node ./dist/cli.js run --config examples/github-issue-triage/agentest.config.ts
```

Expected result:

```
PASS triage GitHub issue with code analysis (1/1, need 100%)

1 passed, 0 failed, 1 total
```

## What The Test Asserts

| Assertion | Why |
|-----------|-----|
| `search_code` called | Agent must search before reading |
| `get_file_contents` called | Agent must read the source for context |
| `create_issue_comment` called | Agent must post its analysis |
| Sequence: search → read → comment | Correct workflow order |
| Only declared tools called | Agent must not call unauthorized tools |
| Exit code 0, no timeout | Agent must complete cleanly |
