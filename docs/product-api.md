# agentest Product Workflow API

Status: draft

This document defines the intended optional product surface around agentest.

The execution engine is already capable of running prompt contract tests.
The next product layer should optimize for an AI-native customer experience:

1. generate tests from natural language and packaged skills
2. visualize the generated flow before execution
3. run baseline and chaos evaluation
4. explain drift in model + agent behavior

The engine remains library-friendly and reviewable.
The product layer exists to reduce authoring friction and make test behavior legible.

## Product Boundary

agentest should have three layers:

- engine layer: mock MCP server, runner, assertions, presets, traces
- embedded layer: config discovery, prompt binding, colocated specs, `run`
- product layer: `create`, `flow`, `run --chaos`, `explain`, `doctor`, optional `init`

The embedded layer makes the system executable inside a normal repository.
The product layer makes it usable in an AI-first workflow.

## Experience Principles

- natural language first, schema second
- generated artifacts must remain reviewable in git
- users should understand the flow before they execute it
- chaos and stability must be first-class outcomes
- hand-written YAML or JS remains an escape hatch, not the primary product story

## Primary User Journey

The desired mainstream journey is:

1. Install `agentest` in an existing prompt-driven repository.
2. Use `agentest create` with natural language to generate a test spec from project context and packaged skills.
3. Use `agentest flow` to review the generated test as a graph.
4. Use `agentest run --chaos <profile>` to evaluate baseline and perturbed execution.
5. Use `agentest explain` to understand drift and decide whether to update the prompt or the contract.

The lower-level manual path still exists:

1. write or edit YAML or JS specs directly
2. run `agentest run`

That path should continue to work, but it should no longer define the product narrative.

## Shared Workspace Artifacts

The helper workflow may standardize on these artifacts:

```text
.agentest/
  cache/
    project-map.json
  skills/
    default/
      authoring.md
      flow-review.md
      chaos-review.md
  flows/
    checkout-fix.mmd
  reports/
    latest/
      summary.json
      chaos.json
      trace.json
tests/
  checkout-fix.agentest.yaml
```

Rules:

- `tests/*.agentest.yaml` or `*.agent.test.ts` remain the primary reviewable assets
- `.agentest/skills/` stores packaged or generated authoring skills
- `.agentest/cache/project-map.json` stores scan results and inferred prompt/tool metadata
- `.agentest/flows/*.mmd` stores flow diagrams when the user wants an artifact on disk
- `.agentest/reports/latest/` stores baseline and chaos summaries used by `explain`

## Exit Codes

All product commands should follow the same exit contract:

- `0`: success
- `1`: user-visible failure, such as failing tests or rejected intent
- `2`: environment or configuration problem
- `3`: internal agentest error

## Command Contract

### `agentest create`

Purpose:
Turn a natural-language workflow description into a runnable prompt contract test.

This is the primary authoring command.
It should minimize the need to learn the schema before the user gets value.

Primary responsibilities:

- scan the project for prompt sources and likely MCP tool usage
- use packaged skills and templates to infer test structure
- generate YAML or JS test code
- bind the generated test to a real prompt source when possible
- produce a short explanation of what was generated and why

Inputs:

- natural-language intent
- optional prompt source reference
- optional output file path
- optional output style such as YAML or JS
- optional run-after-create flag

Suggested flags:

- `--source <ref>`
- `--name <slug>`
- `--output <path>`
- `--as <yaml|ts>`
- `--run`
- `--format <human|json>`

Example:

```bash
npx agentest create "Test the checkout fix workflow. The agent should search for the bug, read the broken file, apply the null-safe fix, and stop after patching." --source src/prompts/fix-null.ts#buildPrompt --run
```

Expected summary shape:

```text
Generated tests/checkout-fix.agentest.yaml
Prompt source: src/prompts/fix-null.ts#buildPrompt
Inferred flow: grep_search -> read_file -> replace_string_in_file
Confidence: medium
Initial validation run: PASS
Next step: npx agentest flow tests/checkout-fix.agentest.yaml
```

Important rule:

The output must stay reviewable.
The user should receive a concrete artifact, not only an ephemeral agent session result.

### `agentest flow`

Purpose:
Show the test as a flow the user can inspect before or after running it.

Primary responsibilities:

- read a generated or hand-written test spec
- visualize prompt source, mocked tools, expected order, assertions, and chaos profile
- output a human summary and optionally a Mermaid diagram

Inputs:

- test spec path
- optional output format
- optional output file path for diagram artifacts

Suggested flags:

- `--file <path>`
- `--format <human|json|mermaid>`
- `--write <path>`

Example:

```bash
npx agentest flow tests/checkout-fix.agentest.yaml --format mermaid
```

Expected summary shape:

```text
Prompt source: src/prompts/fix-null.ts#buildPrompt
Flow: grep_search -> read_file -> replace_string_in_file
Assertions: exitCode=0, no timeout, stdout contains success text
Chaos profile: light
```

### `agentest run`

Purpose:
Execute prompt contract tests locally or in CI.

Positioning:
Primary execution entrypoint for both embedded usage and helper-generated specs.

The product layer should extend `run` to support both:

- baseline validation
- chaos validation

Suggested flags:

- `--config <path>`
- `--file <path>`
- `--grep <pattern>`
- `--tag <name>`
- `--quick`
- `--chaos <off|light|medium|heavy>`
- `--format <human|json>`

Chaos mode should report:

- total runs
- pass rate
- dominant drift patterns
- risk level
- trace/report location

Example:

```bash
npx agentest run --grep checkout-fix --chaos light
```

Expected summary shape:

```text
Baseline: PASS
Chaos profile: light
Runs: 20
Pass rate: 85%
Main drift:
- 2 runs skipped replace_string_in_file
- 1 run repeated read_file before patching
Risk level: medium
Reports: .agentest/reports/latest
```

### `agentest explain`

Purpose:
Explain why a baseline or chaos run drifted instead of only repeating an assertion failure.

Primary responsibilities:

- inspect the latest trace or report bundle
- compare intended flow versus actual flow
- identify whether the problem is prompt drift, tool drift, chaos sensitivity, or environment failure
- recommend the next action

Suggested flags:

- `--latest`
- `--trace <path>`
- `--report <path>`
- `--file <test-spec>`
- `--format <human|json>`

Example:

```bash
npx agentest explain --latest
```

Expected summary shape:

```text
Failure type: chaos-sensitive behavior drift
Expected flow: grep_search -> read_file -> replace_string_in_file
Observed drift: replace_string_in_file skipped in 3 of 20 runs
Likely cause: the prompt does not strongly constrain the terminal write action
Suggested fix: add an explicit completion rule and require replace_string_in_file in the contract
```

### `agentest doctor`

Purpose:
Diagnose environment and integration issues.

Checks should include:

- Node version
- agentest config presence
- presence of tests
- presence of target agent CLI
- ability to invoke the selected CLI
- ability to boot the mock MCP server
- ability to resolve configured prompt sources

Suggested flags:

- `--agent <claude|copilot|auto>`
- `--format <human|json>`

Example:

```bash
npx agentest doctor
```

### `agentest init`

Purpose:
Optional bootstrap command for projects that want workspace scanning and helper artifact setup.

Important constraint:
`init` should not become the main story.
It supports the AI-native flow, but the key value should still come from `create`, `flow`, and `run --chaos`.

Primary responsibilities:

- detect prompt sources
- detect likely tools and agent runtimes
- create `.agentest/cache/` and optional skill placeholders
- recommend the next `create` command

## Recommended Delivery Order

1. keep embedded config discovery and YAML execution stable
2. add natural-language spec generation through `create`
3. add `flow` visualization output
4. add `run --chaos` profiles and reporting
5. improve `explain` around chaos drift
6. continue refining `doctor` and optional `init`

Reasoning:

- authoring friction is now the main product gap
- visualization is the approval layer for generated specs
- chaos is the differentiator for model + agent stability testing
- `explain` becomes much more valuable once chaos reports exist

## Non-Goals For This Product Layer

- browser UI in the first pass
- fully automatic prompt rewriting
- remote hosted control plane
- opaque agent-managed state with no reviewable artifacts

The first goal is an AI-native local product surface that still produces clear files, clear flow graphs, and clear chaos reports.