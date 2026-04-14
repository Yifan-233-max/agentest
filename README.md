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
- native TypeScript support for `agentest.config.ts`, `*.agent.test.ts`, and `promptSource.kind: module`
- simplified tool declarations such as `tools: ['read_file', 'grep_search']`
- declarative YAML prompt spec execution through `agentest run`
- prompt source resolution from `inline`, `file`, `module`, and `command`
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

## Use In Your Project

The primary adoption path is library-first.
You add `agentest` to an existing prompt-driven repository, point it at your current prompt sources, add a small number of tests, and run them in the same repo.

The intended happy path is:

```bash
npm i -D agentest
npx agentest run
```

To make that work, your repository needs three small pieces:

1. `package.json#agentest`
2. `agentest.config.ts`
3. one or more `*.agentest.yaml` files

Minimal `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "test:prompts": "agentest run"
  },
  "agentest": "./agentest.config.ts"
}
```

Minimal `agentest.config.ts`:

```ts
import { defineConfig } from 'agentest';

export default defineConfig({
  agent: {
    preset: 'claude',
  },
  tools: ['read_file'],
  test: {
    files: ['./tests/**/*.agentest.yaml'],
    failOnUnmockedTool: true,
  },
});
```

Minimal `tests/reads-file.agentest.yaml`:

```yaml
version: 0.1
name: reads a mocked file

promptSource:
  kind: inline
  text: Read the file and explain the bug

mocks:
  - tool: read_file
    when:
      filePath: src/user-service.ts
    returns: return user.name.trim();

assert:
  tools:
    required:
      - read_file
    noUnmatchedCalls: true

  process:
    exitCode: 0
    timeout: false
```

Run it with:

```bash
npx agentest run
```

The full step-by-step guide is in [docs/usage.md](docs/usage.md), and the smallest copy-paste template is in [docs/minimal-template.md](docs/minimal-template.md).

The helper commands such as `init`, `connect`, `create`, `explain`, and `doctor` are optional accelerators.
They should not be the only way to onboard.

## Maintainer Validation

If you are working on this repository itself rather than consuming the package, use these commands:

```bash
npm install
npm run check
npm run run:embedded
```

The consumer-style demo lives in [examples/consumer/package.json](examples/consumer/package.json), [examples/consumer/agentest.config.ts](examples/consumer/agentest.config.ts), and [examples/consumer/tests/fix-null.agentest.yaml](examples/consumer/tests/fix-null.agentest.yaml).
It validates the path where a nested project uses `package.json#agentest`, a TypeScript config, string-based tools, and a TypeScript prompt module without extra bootstrap commands.

Run it with:

```bash
npm run run:consumer
```

The most realistic maintainer smoke test is the packed-install path:

```bash
npm run smoke:pack-install
```

That command runs `npm pack`, installs the tarball into a fresh temporary project, and verifies that `agentest run` works there.

## Config Sources

`agentest run` currently resolves config in this order:

1. `--config <path>`
2. `agentest.config.ts`, `agentest.config.mjs`, or `agentest.config.js`
3. `package.json#agentest`

`package.json#agentest` can be:

- a string path to a config file
- an inline JSON config object for simpler cases

Tool declarations can be either:

- strings, for the minimal path
- full objects with `name`, `description`, and `inputSchema`

Example:

```ts
tools: ['read_file', 'grep_search']
```

`agentest run` currently executes both:

- JS tests using `agentTest(...)`
- YAML specs such as `*.agentest.yaml`

TypeScript is supported in:

- `agentest.config.ts`
- `*.agent.test.ts`
- `promptSource.kind: module` refs that point at `.ts` files

Default test discovery is now intentionally repo-friendly:

- `tests/**/*.agent.test.{js,mjs,ts}`
- `**/*.agent.test.{js,mjs,ts}`
- `tests/**/*.agentest.{yaml,yml}`
- `**/*.agentest.{yaml,yml}`

That lets teams colocate tests with prompt modules instead of forcing a separate test workspace.

## First-Run Errors

The common first-run failures are:

- no config found
- no tests found
- mock references an unknown tool
- `promptSource` path or export cannot be resolved
- target CLI is missing or not authenticated

The detailed troubleshooting guide is in [docs/usage.md](docs/usage.md).

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

## Advanced JS DSL

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
agentest run --config ./agentest.config.ts
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

1. support richer YAML filtering and selection in `run`
2. further reduce first-run friction and error handling
3. expand reporters and CI ergonomics
4. add replay and trace inspection
5. harden vendor presets and real-world examples

## License

MIT