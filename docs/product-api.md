# agentest Product Workflow API

Status: draft

This document defines the optional product surface around agentest.
The current repository already implements the execution engine and the `run` command for JS-based tests.
The commands below should accelerate adoption, but they should not replace the embedded library-first path.

## Product Boundary

agentest should have three layers:

- engine layer: mock MCP server, runner, assertions, presets, traces
- embedded adoption layer: config discovery, prompt source binding, colocated tests, `run`
- helper product layer: `init`, `connect`, `create`, `explain`, `doctor`

The engine remains library-friendly.
The embedded adoption layer is the primary customer entrypoint.
The helper product layer reduces friction, but it must stay optional.

## User Journey

The primary customer journey should be:

1. Install agentest in an existing prompt-as-code project.
2. Add `package.json#agentest` or `agentest.config.*`.
3. Point tests at existing prompt sources instead of copying prompt text.
4. Run `agentest run` locally or in CI.

The helper workflow is secondary:

1. Run `agentest init` so the project is discovered automatically.
2. Run `agentest connect claude` or `agentest connect copilot` to bind a real agent runtime.
3. Run `agentest create` to turn a natural-language testing intent into a prompt contract test.
4. Run `agentest explain` when a test fails or drifts.
5. Run `agentest doctor` if the environment or connector is unhealthy.

The public API should preserve both paths.
The embedded path owns the default mental model.

## Shared Conventions

The helper workflow may standardize on these workspace artifacts:

```text
.agentest/
  config.json
  cache/
    project-map.json
  tests/
    release-note.agentest.yaml
  traces/
    latest/
  skills/
    claude.md
    copilot.md
```

Rules:

- `.agentest/config.json` is helper-generated config, not the only valid config source.
- `.agentest/tests/*.agentest.yaml` are helper-generated prompt contract specs.
- `.agentest/cache/project-map.json` stores scan results so later commands do not need to rediscover the whole repo.
- `.agentest/traces/latest/` stores the latest execution artifacts for `explain`.
- `.agentest/skills/` stores generated prompt/skill content for supported agent CLIs.

The embedded path should also support:

- `package.json#agentest`
- `agentest.config.*`
- test files under standard repo locations such as `tests/**` or colocated prompt directories

`agentest run` should remain backward compatible with the current JS test engine while gaining support for YAML specs.

## Exit Codes

All product commands should follow the same exit contract:

- `0`: success
- `1`: user-visible failure, such as failing tests or a rejected command precondition
- `2`: environment or configuration problem
- `3`: internal agentest error

## Command Contract

### `agentest init`

Purpose:
Bootstrap agentest inside an existing repository without requiring the user to understand MCP injection or the underlying JS DSL.

Positioning:
Optional helper command, not a required first step.

Primary responsibilities:

- detect prompt sources
- detect existing MCP configuration
- detect available agent runtimes
- create `.agentest/` workspace files
- recommend the next command

Inputs:

- optional workspace path
- optional preferred agent preset: `claude`, `copilot`, or `auto`
- non-interactive mode for CI or scripted setup

Suggested flags:

- `--cwd <path>`
- `--agent <claude|copilot|auto>`
- `--yes`
- `--format <human|json>`

Side effects:

- creates `.agentest/config.json`
- creates `.agentest/tests/`
- writes `.agentest/cache/project-map.json`

Success output should answer:

- which prompt sources were found
- which agent runtimes were detected
- which preset was recommended
- what the next command should be

Example:

```bash
npx agentest init
```

Expected summary shape:

```text
Detected 3 prompt sources.
Detected Claude Code.
Recommended preset: claude.
Created .agentest/config.json.
Next step: npx agentest connect claude
```

Non-goals:

- does not authenticate the user into a vendor CLI
- does not create tests yet

### `agentest connect <agent>`

Purpose:
Attach agentest to the real agent runtime the team already uses.

Positioning:
Optional helper command for teams that want project-local runtime setup assistance.

Primary responsibilities:

- verify the CLI exists
- verify the CLI can be invoked
- verify the CLI is authenticated when needed
- write connector metadata into `.agentest/config.json`
- install or generate a local skill/profile entry when supported
- run a minimal handshake check

Inputs:

- target agent: `claude` or `copilot`
- optional command override
- optional check-only mode

Suggested flags:

- `--command <path-or-name>`
- `--force`
- `--check-only`
- `--format <human|json>`

Side effects:

- updates `.agentest/config.json`
- writes `.agentest/skills/<agent>.md`
- stores connector health metadata

Important safety rule:

The first version should not mutate global user configuration without explicit confirmation.
Project-local configuration should be the default.

Example:

```bash
npx agentest connect claude
```

Expected summary shape:

```text
Claude CLI found.
Claude authentication available.
Project connector written to .agentest/config.json.
Skill guidance written to .agentest/skills/claude.md.
Next step: npx agentest create
```

### `agentest create`

Purpose:
Turn a natural-language test intent into a structured prompt contract spec.

This is the primary command for mainstream users.
It should minimize or remove the need to hand-author JS tests.

Positioning:
Optional spec-generation helper layered on top of `run`, not a prerequisite for adoption.

Supported creation modes:

- interactive mode
- source-targeted mode
- prompt-from-session mode in a later phase

Inputs:

- natural-language description of the workflow to validate
- optional prompt source reference
- optional output file path
- optional run-after-create flag

Suggested flags:

- `--source <ref>`
- `--name <slug>`
- `--output <path>`
- `--run`
- `--format <human|json>`

Interactive flow should ask only for the missing pieces:

1. Which prompt should be tested?
2. Which tools should be mocked?
3. Which tool calls are required?
4. Does order matter?
5. Is this a one-shot test or a stability test?

Side effects:

- writes `.agentest/tests/<name>.agentest.yaml`
- optionally executes a first run

Expected result:

- the customer sees a readable spec, not generated JS boilerplate
- the spec points to the real prompt source, not a duplicated prompt string when possible

Example:

```bash
npx agentest create --source src/prompts/release-note.ts#buildPrompt --run
```

Expected summary shape:

```text
Created .agentest/tests/release-note.agentest.yaml.
Bound prompt source: src/prompts/release-note.ts#buildPrompt.
Mocked 3 tools.
Executed initial validation run: PASS.
```

### `agentest run`

Purpose:
Execute prompt contract tests locally or in CI.

Positioning:
Primary entrypoint for embedded adoption.

The next version of `run` should support both:

- current JS-based engine tests
- generated YAML prompt contract specs

`run` should work without requiring `init` or `connect` first.

Inputs:

- optional test file filter
- optional tag filter
- optional prompt-source filter
- execution mode such as quick or stress

Suggested flags:

- `--config <path>`
- `--file <path>`
- `--grep <pattern>`
- `--tag <name>`
- `--quick`
- `--stress`
- `--format <human|json>`

Success output should include:

- total tests
- pass or fail summary
- stability pass rate when relevant
- location of traces for failed runs

Example:

```bash
npx agentest run --grep release-note
```

### `agentest explain`

Purpose:
Explain why a prompt contract failed instead of only repeating an assertion message.

Primary responsibilities:

- inspect the latest trace or a named trace
- compare expected tools versus actual tools
- compare expected call order versus actual order
- identify unmatched mocks
- identify missing connector or MCP injection issues
- produce repair guidance

Suggested flags:

- `--latest`
- `--trace <path>`
- `--file <test-spec>`
- `--format <human|json>`

Expected summary categories:

- tool discovery failure
- connector failure
- behavior drift
- prompt ambiguity
- environment mismatch

Example:

```bash
npx agentest explain --latest
```

Expected summary shape:

```text
Failure type: behavior drift
Expected sequence: get_feature_spec -> get_bug_report -> submit_release_note
Actual sequence: get_feature_spec -> get_bug_report
Likely cause: prompt did not strongly constrain the terminal tool action
Suggested fix: add an explicit completion step requiring submit_release_note
```

### `agentest doctor`

Purpose:
Diagnose environment and integration issues before users need to understand implementation details.

Checks should include:

- Node version
- agentest config presence
- presence of tests
- presence of Claude or Copilot CLI
- ability to invoke the selected CLI
- ability to create a temporary MCP config
- ability to boot the mock MCP server
- ability to resolve configured prompt sources

Suggested flags:

- `--agent <claude|copilot|auto>`
- `--fix` in a later phase
- `--format <human|json>`

Example:

```bash
npx agentest doctor
```

Expected summary shape:

```text
PASS Node.js detected
PASS agentest config loaded
PASS Claude CLI detected
PASS mock MCP server booted
WARN prompt source src/prompts/release-note.ts#buildPrompt could not be resolved
FAIL no tests found under .agentest/tests
```

## Implementation Order

Recommended delivery order:

1. embedded config discovery from `package.json#agentest` and `agentest.config.*`
2. YAML spec adapter inside `run`
3. prompt source resolution from module, file, and command references
4. `doctor`
5. `connect`
6. `create`
7. `explain`
8. continued `init` refinement

Reasoning:

- the embedded path must work before helper commands matter
- YAML support in `run` makes the new product contract executable
- prompt source resolution is the bridge between existing repos and generated specs
- `doctor` and `connect` reduce integration friction once the core path exists
- `create` becomes useful only after the spec format is runnable
- `explain` depends on stable trace and failure metadata

## Non-Goals For The First Product Layer

- browser UI
- replay or record mode
- auto-rewriting prompts
- multi-agent orchestration
- remote hosted storage

The first goal is a clean embedded test capability that fits naturally inside an existing repository.
The helper CLI workflow should accelerate that path, not replace it.