# agentest

Test AI CLI workflows like unit tests.

`agentest` is a library-first test framework for prompt-driven agent workflows.
You run the same prompt against the same CLI, but in `test mode` the real MCP tools are replaced with mocked MCP tools whose responses are injected by the test.

That gives you a stable way to verify:

- which tools the agent chose
- the order of tool calls
- the arguments sent to each tool
- the final process result, output, and timeout behavior

## What It Is

`agentest` is for teams who already use an AI CLI such as Claude Code, Copilot CLI, or a custom MCP-enabled agent, and want to test real workflows without changing the prompt or switching to a fake model.

What stays the same:

- your prompt
- your agent CLI
- your prompt source files

What changes in test mode:

- the real MCP tool layer is replaced by mocked MCP tools
- tool calls are traced
- the run is checked against a test contract

That means you can answer questions like:

- did the agent choose the right tools?
- did it call them in the right order?
- did it stop before an unsafe or wrong final action?
- does the workflow still behave correctly after prompt edits?

## How It Works

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

## Customer Workflow

The intended customer journey is:

1. install `agentest` in an existing prompt-driven repository
2. point it at the agent CLI and tools your workflow already uses
3. generate the first test from natural language, or write the YAML yourself
4. inspect the generated flow so you can confirm what is actually being tested
5. run the test locally or in CI

The current minimal AI-assisted flow is:

```bash
npm i -D agentest
npx agentest create "Test the checkout fix workflow"
npx agentest flow tests/checkout-fix.agentest.yaml
npx agentest run
```

## Quick Start

### 1. Install

```bash
npm i -D agentest
```

### 2. Point agentest at your project

Add this to `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "test:prompts": "agentest run"
  },
  "agentest": "./agentest.config.ts"
}
```

Then add `agentest.config.ts`:

```ts
import { defineConfig } from 'agentest';

export default defineConfig({
  agent: {
    preset: 'claude',
  },
  tools: ['grep_search', 'read_file', 'replace_string_in_file'],
  test: {
    files: ['./tests/**/*.agentest.yaml'],
    failOnUnmockedTool: true,
  },
});
```

Replace the preset or command with whatever your team already uses.
The important part is the `tools` list: it defines the MCP tools your tests are allowed to mock.

### 3. Generate the first test from natural language

```bash
npx agentest create "Test the checkout fix workflow. The agent should search for the bug, read the broken file, apply the null-safe fix, and stop after patching." --source src/prompts/fix-null.ts#buildPrompt --output tests/checkout-fix.agentest.yaml
```

What `create` does today:

- reads your current config
- looks at the prompt or workflow source you point it to, or auto-detects one
- infers a first tool flow from your configured tools and intent
- writes a reviewable YAML spec

If you prefer, you can also write the YAML spec yourself and skip `create`.

### 4. Review what the test is actually checking

```bash
npx agentest flow tests/checkout-fix.agentest.yaml
```

Or render Mermaid output:

```bash
npx agentest flow tests/checkout-fix.agentest.yaml --format mermaid
```

`flow` is the confirmation step.
It lets the user verify the prompt source, mocked tools, expected order, and assertions before relying on the test.

### 5. Run the test

```bash
npx agentest run
```

Or generate and run immediately:

```bash
npx agentest create "Test the checkout fix workflow" --source src/prompts/fix-null.ts#buildPrompt --output tests/checkout-fix.agentest.yaml --run
```

## What You Get Today

Implemented now:

- config discovery from `agentest.config.*` or `package.json#agentest`
- native TypeScript support for `agentest.config.ts`, `*.agent.test.ts`, and `promptSource.kind: module`
- simplified tool declarations such as `tools: ['read_file', 'grep_search']`
- declarative YAML prompt spec execution through `agentest run`
- prompt source resolution from `inline`, `file`, `module`, and `command`
- minimal `agentest flow` for reviewing YAML specs as a summarized flow or Mermaid graph
- minimal `agentest create` for generating a first YAML spec from natural-language intent and detected prompt sources
- mocked MCP server over stdio
- session runner with `agentest run`
- agent presets for `custom`, `claude`, and `copilot`
- assertions for tool calls, tool sequence, counts, stdout, stderr, exit code, timeout, and unmatched calls

Current limits:

- `create` currently emits YAML only
- `flow` currently reads YAML specs only
- `run --chaos` is not implemented yet
- `explain` is not implemented yet

## If You Prefer Manual YAML

You can skip `create` and start with a hand-written spec.

Example:

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

Then run:

```bash
npx agentest run
```

## Where To Go Next

- Step-by-step usage guide: [docs/usage.md](docs/usage.md)
- Smallest copy-paste template: [docs/minimal-template.md](docs/minimal-template.md)
- AI-native product direction: [docs/ai-native-experience.md](docs/ai-native-experience.md)
- Product command draft: [docs/product-api.md](docs/product-api.md)

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

The current product-layer command surface is:

- `agentest create`
- `agentest flow`
- `agentest run`
- future: `agentest explain`
- future: `agentest run --chaos`

The product workflow spec is in [docs/product-api.md](docs/product-api.md), and the first structured prompt test format is in [docs/prompt-test-spec-v0.1.md](docs/prompt-test-spec-v0.1.md).

The next implementation priorities are:

1. support richer YAML filtering and selection in `run`
2. further reduce first-run friction and error handling
3. expand reporters and CI ergonomics
4. add replay and trace inspection
5. harden vendor presets and real-world examples

## License

MIT