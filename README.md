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
- config discovery from `agentest.config.*` or `package.json#agentest`
- mocked MCP server over stdio
- session runner with `agentest run`
- optional helper commands: early `agentest init` and `agentest doctor`
- agent presets for `custom`, `claude`, and `copilot`
- assertions for tool calls, tool sequence, counts, stdout, stderr, exit code, timeout, and unmatched calls
- a minimal runnable example
- real preset-based E2E examples for Claude Code and Copilot CLI

Not implemented yet:

- sandbox mode with real file and shell tools
- replay/record mode
- rich reporters
- vendor-specific deep integrations

## Embedded Adoption

The primary adoption path is library-first.
You add `agentest` to an existing prompt-driven repository, point it at your current prompt sources, add a small number of tests, and run them in the same repo.

The intended minimal user flow is:

1. install `agentest`
2. add `package.json#agentest` or `agentest.config.mjs`
3. write tests near the existing project
4. run `agentest run`

The helper commands such as `init`, `connect`, `create`, `explain`, and `doctor` are optional accelerators.
They should not be the only way to onboard.

## Quick Start

In this repository, the thinnest entrypoint is now `package.json#agentest`, so you can run the example without passing `--config`:

```bash
npm install
npm run check
npm run run:embedded
```

Expected result:

```text
PASS uses mocked MCP tools to validate a null-safe fix workflow (1/1, need 100%)

1 passed, 0 failed, 1 total
```

The runnable example is resolved from `package.json#agentest` and points at [examples/simple/agentest.config.mjs](examples/simple/agentest.config.mjs), [examples/simple/tests/fix-null.agent.test.mjs](examples/simple/tests/fix-null.agent.test.mjs), and [examples/simple/fake-agent.mjs](examples/simple/fake-agent.mjs).

In a real prompt-driven project, the equivalent setup is:

```bash
npm i -D agentest
```

```json
{
  "scripts": {
    "test:prompts": "agentest run"
  },
  "agentest": "./agentest.config.mjs"
}
```

Then add `agentest.config.mjs` and a small number of prompt tests in your existing repo.

## Config Sources

`agentest run` currently resolves config in this order:

1. `--config <path>`
2. `agentest.config.mjs`, `agentest.config.js`, or `agentest.config.ts`
3. `package.json#agentest`

`package.json#agentest` can be:

- a string path to a config file
- an inline JSON config object for simpler cases

Default JS test discovery is now intentionally repo-friendly:

- `tests/**/*.agent.test.{js,mjs,ts}`
- `**/*.agent.test.{js,mjs,ts}`

That lets teams colocate tests with prompt modules instead of forcing a separate test workspace.

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

Or, if you point `package.json#agentest` at that file:

```bash
agentest run
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

The primary roadmap is now embedded adoption, not a mandatory new workflow.

That means the highest-priority path is:

1. install `agentest` inside an existing prompt-driven repo
2. point `agentest run` at the repo through `package.json#agentest` or `agentest.config.*`
3. bind tests to real prompt sources instead of duplicating prompt text
4. keep helper commands optional

The product-layer commands still matter, but they are now secondary to the embedded path:

- `agentest init`
- `agentest connect <agent>`
- `agentest create`
- `agentest run`
- `agentest explain`
- `agentest doctor`

The product workflow spec is in [docs/product-api.md](docs/product-api.md), and the first structured prompt test format is in [docs/prompt-test-spec-v0.1.md](docs/prompt-test-spec-v0.1.md).

The next implementation priorities are:

1. support YAML prompt contract specs directly in `run`
2. keep config and test assets thin enough for existing repos
3. expand reporters and CI ergonomics
4. add replay and trace inspection
5. harden vendor presets and real-world examples

## License

MIT