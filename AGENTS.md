# agentest — Guidance For AI Agents

This file is for AI coding agents. It tells you how to set up and operate `agentest` in a user's repository.

**Your role:** You do all the work. The user only reviews your proposals and receives results. The user should never need to type a command or learn the config schema.

## Bootstrap From An Installed Package

Start from the user's repository, not from memory.

1. First check whether `agentest` is already available in the repo.
2. If it is installed, resolve `agentest/agent-kit/manifest.json`.
3. If it is not installed, stop and tell the user: "Please run `npm i -D agentest` first."
4. Once `agentest` is available, use the manifest as the stable local entrypoint for the packaged overview docs, agent guidance, usage docs, minimal template, and examples.

Do not guess another package manager or install path in this journey.

## What agentest Does

`agentest` tests AI CLI workflows by replacing the MCP tool layer with mocks.

```text
Normal:  prompt → AI CLI → real MCP tools → real side effects
Test:    prompt → AI CLI → agentest mock MCP → traced responses + assertions
```

The prompt, the AI CLI, and the prompt source files stay the same. Only the tool layer changes in test mode.

## Interaction Protocol

Follow these four phases in order. Each phase has a clear boundary — you either work autonomously or pause for user review.

Manifest discovery happens before or at the start of investigation. If `agentest` is available, resolve `agentest/agent-kit/manifest.json` first so you can inspect the packaged local guidance before designing the test flow.

---

### Phase 1: Investigate (you work alone)

Do not ask the user questions yet. Inspect the repository silently and gather everything you need.

**1.0 Bootstrap local guidance**

- Check whether `agentest` is already present in the repo.
- If it is missing, reply with: "Please run `npm i -D agentest` first."
- Resolve `agentest/agent-kit/manifest.json` only after the package is present.
- Use the manifest to find the local packaged overview, this protocol, usage docs, minimal template, and examples.

Do this before you decide how to wire config, specs, mocks, or assertions.

**1.1 Detect the agent runtime**

Figure out which AI CLI the repo uses:

- Claude Code
- Copilot CLI
- a custom command

Check `package.json` scripts, README, docs, shell scripts, and prompt orchestration code.
Prefer the existing runtime. Do not switch providers.

**1.2 Find the real prompt source**

Look for the prompt that drives the workflow:

- `.ts` or `.js` prompt builders (preferred — use `module` source kind)
- `.md` or `.txt` prompt files (use `file` source kind)
- commands that generate prompt text (use `command` source kind)

Prefer binding to the real source. Do not copy prompt text into the YAML spec unless nothing else exists.

**1.3 Identify the MCP tools the workflow uses**

Build the smallest correct tool list by inspecting:

- config files
- prompt code and comments
- tool wrappers or adapters
- existing tests or mocks

Do not invent tool names. Do not add tools the workflow does not actually use.

**1.4 Design the test case**

Decide what to test and how. Consider:

- What tools should the agent call?
- In what order?
- What arguments matter?
- What tools should the agent NOT call? (safety boundary)
- What mock responses should each tool return?

Prepare: config shape, YAML spec content, mock definitions, and assertions.

**If anything is genuinely unclear** (which CLI, which workflow, which tools), ask the user — but only the specific missing piece. Do not ask broad architecture questions.

---

### Phase 2: Present for Review (you pause, user reviews)

**Stop and show the user your proposed test design before writing any files.**

Present clearly:

1. **What you found** — the detected CLI, prompt source, and tool surface
2. **The test flow** — which tools will be called in which order
3. **The mocks** — what each tool will return
4. **The assertions** — what conditions must hold for the test to pass
5. **The safety boundary** — what tools the agent must NOT call

Use a simple summary format:

```text
Detected CLI: copilot
Prompt source: src/prompts/triage.ts#buildPrompt
Test flow: search_code → get_file_contents → create_issue_comment
Assertions: all three tools called in sequence, no other tools called, exit code 0
```

**Wait for the user to approve, adjust, or reject before proceeding.**

If the user requests changes, revise the design and present again.

---

### Phase 3: Execute (you work alone, after user approval)

Once the user approves, do everything:

**3.1 Ensure `agentest` is available**

If `agentest` is already installed, continue.
If it is missing, stop and tell the user: "Please run `npm i -D agentest` first."

Do not write project-specific config/spec files or run validation commands until the user has reviewed and approved the proposed flow from Phase 2.

**3.2 Add config**

Create `agentest.config.ts` at the repo root. Add `"agentest": "./agentest.config.ts"` to `package.json`.

Config shape:

```ts
import { defineConfig } from 'agentest';

export default defineConfig({
  agent: {
    preset: 'claude',       // or 'copilot' or { command, args }
  },
  tools: ['tool_a', 'tool_b'],  // string declarations for the minimal path
  test: {
    files: ['./tests/**/*.agentest.yaml'],
    timeoutMs: 60_000,
    failOnUnmockedTool: true,
  },
});
```

Use full tool objects (with `inputSchema`) only when the LLM needs rich tool descriptions.

**3.3 Write the YAML test spec**

Create the spec in a location that fits the repo (default: `tests/*.agentest.yaml`).

YAML spec structure:

```yaml
version: 0.1
name: descriptive test name

promptSource:
  kind: module                    # or file, inline, command
  ref: ./path/to/prompt.ts#buildPrompt
  args:
    key: value

mocks:
  - tool: tool_name
    when:
      arg_name: expected_value    # matcher: exact, { regex: "..." }, { contains: "..." }
    returns: mock_response

assert:
  tools:
    required: [tool_a, tool_b]
    sequence: [tool_a, tool_b]    # ordered subsequence
    only: [tool_a, tool_b]        # no other tools allowed
    noUnmatchedCalls: true
  process:
    exitCode: 0
    timeout: false
```

**3.4 Validate the flow**

Run `npx agentest flow <spec-path>` and verify the output matches the approved design.

**3.5 Run the test**

Run `npx agentest run --config <config-path>`.

---

### Phase 4: Deliver Results (you present, user receives)

Present the results clearly:

**On success:**

```text
✅ Test passed: "descriptive test name" (1/1, 100%)

The agent correctly:
- searched for relevant code
- read the source file
- posted an analysis comment
- did not call any unauthorized tools
```

**On failure:**

```text
❌ Test failed: "descriptive test name" (0/1)

What went wrong:
- Expected tool sequence: search_code → get_file_contents → create_issue_comment
- Actual: search_code → create_issue_comment (skipped get_file_contents)

Likely cause: the prompt does not strongly instruct the agent to read the file before commenting.

Suggested fix: strengthen the prompt instruction for step 2, or relax the sequence assertion.
```

Always explain failures in terms the user can act on — prompt changes, mock adjustments, or assertion updates.

---

## What To Preserve

Do not rewrite the user's prompt architecture unless they ask.

Preserve:

- prompt files and modules
- agent CLI choice
- repo structure
- existing scripts and test layout

`agentest` is library-first. Embed it into the current repo instead of creating a separate project.

## Decision Rules

- prefer one config file over multiple helper layers
- prefer YAML specs for the first test
- prefer real prompt binding over inline prompt text
- prefer string tool declarations over verbose schemas
- prefer one passing test over a broad speculative suite
- prefer embedded adoption over a separate project

## Current Product Reality

Available now:

- `agentest create` — generates YAML specs from natural-language intent
- `agentest flow` — shows a human-readable or Mermaid flow summary
- `agentest run` — executes prompt tests

Not implemented yet:

- `agentest run --chaos`
- `agentest explain`

Do not present unimplemented commands as available.

## Reference

- Product framing: [README.md](README.md)
- Detailed setup and execution: [docs/usage.md](docs/usage.md)
- Real Copilot CLI example: [examples/github-issue-triage/README.md](examples/github-issue-triage/README.md)
- Deterministic local example files: `examples/consumer/package.json`, `examples/consumer/agentest.config.ts`, and `examples/consumer/tests/fix-null.agentest.yaml`
