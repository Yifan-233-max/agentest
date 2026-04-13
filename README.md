# agentest

Test AI CLI workflows like unit tests.

`agentest` is a library-first test framework for prompt-driven agent workflows.
You run the same prompt against the same CLI, but in `test mode` the real MCP tools are replaced with mocked MCP tools whose responses are injected by the test.

That gives you a stable way to verify:

- which tools the agent chose
- the order of tool calls
- the arguments sent to each tool
- the final process result, output, and timeout behavior

## The Model

Normal development flow:

```text
prompt -> AI CLI -> real MCP -> real side effects
```

Test flow:

```text
prompt -> AI CLI -> agentest mock MCP -> injected responses + trace + assertions
```

The prompt stays the same.
The CLI stays the same.
Only the tool layer changes.

## Why This Exists

Prompt-driven workflows are hard to regression test because tool selection and execution paths can drift over time.

`agentest` treats MCP tools as the external dependency boundary, similar to mocking HTTP or database layers in traditional unit tests.

That makes it possible to test agent behavior without depending on a live filesystem, shell, database, or remote service.

## Current MVP

Implemented now:

- `defineConfig(...)` for project-level test configuration
- `agentTest(...)` for writing test cases
- mocked MCP server over stdio
- early project bootstrap with `agentest init`
- session runner with `agentest run`
- early health checks with `agentest doctor`
- agent presets for `custom`, `claude`, and `copilot`
- assertions for tool calls, tool sequence, counts, stdout, stderr, exit code, timeout, and unmatched calls
- a minimal runnable example
- real preset-based E2E examples for Claude Code and Copilot CLI

Not implemented yet:

- sandbox mode with real file and shell tools
- replay/record mode
- rich reporters
- vendor-specific deep integrations

## Quick Start

Clone the repo, install dependencies, and run the included example:

```bash
npm install
npm run check
npm run run:example
```

Expected result:

```text
PASS uses mocked MCP tools to validate a null-safe fix workflow (1/1, need 100%)

1 passed, 0 failed, 1 total
```

The runnable example lives in [examples/simple/agentest.config.mjs](examples/simple/agentest.config.mjs), [examples/simple/tests/fix-null.agent.test.mjs](examples/simple/tests/fix-null.agent.test.mjs), and [examples/simple/fake-agent.mjs](examples/simple/fake-agent.mjs).

## Real CLI E2E Examples

The repo now also includes real agent examples that invoke actual Claude Code and Copilot CLI sessions while still mocking MCP tools.

Claude Code example:

- config: [examples/presets/claude.config.mjs](examples/presets/claude.config.mjs)
- test: [examples/presets/claude.agent.test.mjs](examples/presets/claude.agent.test.mjs)
- run: `npm run run:claude:e2e`

GitHub Copilot CLI example:

- config: [examples/presets/copilot.config.mjs](examples/presets/copilot.config.mjs)
- test: [examples/presets/copilot.agent.test.mjs](examples/presets/copilot.agent.test.mjs)
- run: `npm run run:copilot:e2e`

Prerequisites:

- the target CLI must be installed and authenticated
- `claude` can be overridden with `CLAUDE_BIN`
- `copilot` can be overridden with `COPILOT_BIN`

These examples are true end-to-end agent invocations, not the fake demo agent. The MCP side effects are still mocked, which keeps the test deterministic and safe.

## Example

Config:

```js
import { defineConfig, tool } from 'agentest';

export default defineConfig({
  agent: {
    preset: 'claude',
    cwd: '.',
  },
  tools: [
    tool({
      name: 'read_file',
      description: 'Read file contents',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
        },
        required: ['filePath'],
      },
    }),
  ],
  test: {
    files: ['./tests/**/*.agent.test.mjs'],
    failOnUnmockedTool: true,
  },
});
```

Test:

```js
import { agentTest, expect, match } from 'agentest';

export default agentTest('reads a mocked file', async (t) => {
  t.prompt('Read the file and explain the bug');

  t.mock('read_file')
    .when({ filePath: 'src/user-service.ts' })
    .returns('return user.name.trim();');

  const result = await t.run();

  expect(result).toHaveCalledTool('read_file');
  expect(result).toHaveCalledToolTimes('read_file', 1);
  expect(result).toContainStdout(match.stringContaining('user-service'));
  expect(result).not.toHaveTimedOut();
});
```

Run it with:

```bash
agentest run --config ./agentest.config.mjs
```

## Agent Presets

### `custom`

Use any command template you want:

```js
agent: {
  command: 'my-agent',
  args: ['--prompt', '{prompt}', '--mcp-config', '{mcpConfig}'],
}
```

### `claude`

Uses Claude Code print mode with a strict MCP config for the test session.

```js
agent: {
  preset: 'claude',
}
```

### `copilot`

Uses GitHub Copilot CLI prompt mode with a session-only additional MCP config.

```js
agent: {
  preset: 'copilot',
}
```

Preset examples are in [examples/presets/claude.config.mjs](examples/presets/claude.config.mjs) and [examples/presets/copilot.config.mjs](examples/presets/copilot.config.mjs).

## Assertions Available In The MVP

- `toHaveCalledTool(name)`
- `toHaveCalledToolTimes(name, count)`
- `toHaveCalledToolWith(name, matcher)`
- `toHaveToolSubsequence(names)`
- `toOnlyCallTools(names)`
- `toExitSuccessfully()`
- `toExitWithCode(code)`
- `toHaveTimedOut()`
- `toFinishWithin(ms)`
- `toContainStdout(matcher)`
- `toContainStderr(matcher)`
- `toHaveNoUnmatchedToolCalls()`

Negated matchers currently available:

- `not.toHaveCalledTool(name)`
- `not.toHaveTimedOut()`
- `not.toContainStdout(matcher)`
- `not.toContainStderr(matcher)`

Matcher helpers currently available:

- `match.anything()`
- `match.stringContaining(value)`
- `match.objectContaining(value)`
- `match.arrayContaining(value)`

Regular expressions also work directly in matchers.

## Project Direction

The goal of this repository is not to ship a perfect framework on day one.
The goal is to make the concept concrete, usable, and easy for the community to extend.

The next public product surface is planned around six customer-facing commands:

- `agentest init`
- `agentest connect <agent>`
- `agentest create`
- `agentest run`
- `agentest explain`
- `agentest doctor`

These commands are the next design target, not the current fully-implemented CLI surface.
`agentest init` and `agentest doctor` are the first commands from that product layer to be implemented in preview form.
The product workflow spec is in [docs/product-api.md](docs/product-api.md), and the first structured prompt test format is in [docs/prompt-test-spec-v0.1.md](docs/prompt-test-spec-v0.1.md).

The next steps are straightforward:

1. add sandbox mode for controlled real-tool execution
2. expand reporters and CI ergonomics
3. add replay and trace inspection
4. harden vendor presets and real-world examples

## License

MIT