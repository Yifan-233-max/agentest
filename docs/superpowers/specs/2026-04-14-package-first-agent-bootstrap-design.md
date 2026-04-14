# Package-First Agent Bootstrap Design

Status: approved

## Problem

`agentest` is a library-first product, but the current experience still makes the human think about package installation, CLI commands, config shape, and test authoring steps.

That is the wrong mental model for the product direction.

The real goal is:

> the user says what workflow they want to test, and the AI agent takes over the installation, setup, test design, flow review, execution, and result reporting.

In this model, package distribution is important, but only as an enabler. It should reduce human input, not become the center of the user experience.

## Scope

This spec covers the first sub-project only:

- consume `agentest` through the npm package path
- let an AI agent take over the rest of the workflow

This spec does **not** cover:

- a hosted service
- a remote content feed
- marketplace or plugin distribution as the primary path
- advanced version compatibility work between separately released guidance and runtime

Marketplace integration is explicitly out of scope for this spec.

## Desired Product Story

The primary product story should be:

1. the user describes the workflow or scenario they want to test
2. the AI agent checks whether `agentest` is available in the repository
3. if needed, the AI agent installs it automatically
4. the AI agent discovers the repo context and designs the first test
5. the AI agent shows the test flow to the user for review
6. after approval, the AI agent executes the test
7. the AI agent reports the result in user language

The secondary path still exists:

- the user may install `agentest` manually first

But the primary README and product narrative should emphasize the natural-language path, not the command-by-command path.

## Core Design

### 1. Package-first, but agent-driven

`agentest` remains a local npm package installed into the target repository.

The user does not need to clone the `agentest` source repository to use it.
Instead, the installed package must provide enough local material for an AI agent to:

- understand how `agentest` should be applied
- discover the right runtime and prompt source
- generate or write the first test artifact
- present a flow for review before execution

The package is therefore both:

- the runtime dependency
- the local capability bundle the AI agent consults

### 2. AI agent owns the workflow

The AI agent is responsible for six jobs:

1. **Bootstrap**
   - detect whether `agentest` is installed
   - install it when missing and when the user allows automatic setup

2. **Discover**
   - inspect the repository for the existing AI CLI
   - locate the real prompt source
   - identify the MCP tools used by the workflow

3. **Design**
   - turn the user’s requested scenario into a test case
   - decide mocks, assertions, and safety boundaries

4. **Present**
   - generate a reviewable flow artifact
   - pause for user approval before writing files or running tests

5. **Execute**
   - write config and spec artifacts
   - run `agentest flow`
   - run `agentest run`

6. **Report**
   - summarize pass/fail in user language
   - explain what the agent did and what happened

### 3. The user reviews flow, not YAML

The primary review artifact is the test flow.

Preferred form:

- Mermaid flow, when available

Fallback form:

- ordered Markdown summary with explicit sequence and assertions

The persisted repo artifact remains the generated YAML spec or test file, but that is not the default thing the user needs to inspect.

The division is:

- **user-facing artifact:** flow review
- **repo-facing artifact:** config and spec files
- **agent-facing artifact:** local package guidance and templates

## Package Contents

The installed npm package should contain two kinds of content.

### Runtime layer

This is the executable library surface:

- CLI runtime in `dist/`
- JS exports in `dist/`

### Agent kit layer

This is the local knowledge bundle the AI agent uses after installation.

Recommended minimum structure:

```text
node_modules/agentest/
  dist/
  AGENTS.md
  agent-kit/
    manifest.json
    guidance/
      workflow.md
      flow-review.md
    templates/
      agentest.config.ts.template
      spec.minimal.agentest.yaml
      spec.rich.agentest.yaml
    examples/
      consumer/
      github-issue-triage/
```

#### Agent kit responsibilities

- `AGENTS.md` defines the operating protocol for AI agents
- `manifest.json` provides a stable entry point to local guidance, templates, and examples
- `guidance/` explains how the agent should discover context, design tests, and stop for review
- `templates/` lowers generation errors for config and spec artifacts
- `examples/` provides few-shot reference material for the AI agent

The package should be locally sufficient. The AI agent should not need to fetch guidance from a remote repository in the mainline path.

## User Journeys

### Primary journey: natural-language first

1. user says: “Help me test this workflow”
2. AI agent checks whether `agentest` exists in the repo
3. if not present, AI agent installs the package
4. AI agent reads the local agent kit from the installed package
5. AI agent scans the repo and designs the first test
6. AI agent shows the flow to the user
7. user approves or adjusts
8. AI agent writes files and runs the test
9. AI agent returns the result

### Secondary journey: package already installed

1. user installs `agentest`
2. user asks the AI agent to test a workflow
3. AI agent skips bootstrap and continues with discovery, design, review, execution, and reporting

The two journeys converge immediately after package availability.

## Review Artifact Design

The user should always be able to understand the intended test scenario without reading raw spec files.

### Preferred flow output

```text
Scenario: triage issue #1
Prompt source: src/prompts/triage.ts#buildPrompt
Flow:
1. search_code
2. get_file_contents
3. create_issue_comment
Assertions:
- all three tools must be called
- no other tools may be called
- exit code must be 0
```

### Requirements for the review artifact

- the scenario is explicit
- the prompt source is explicit
- the tool order is explicit
- required assertions are explicit
- safety boundaries are explicit

Mermaid is preferred because it is faster to scan, but ordered Markdown is acceptable when Mermaid is unavailable or unnecessary.

## Error Handling

The first design should optimize for low-friction, local, user-actionable failures.

### Missing package

- if automatic install is allowed, the AI agent installs `agentest`
- otherwise, the AI agent stops and clearly explains that installation is required

### Missing package manager or install failure

- the AI agent reports the blocked step plainly
- the agent does not continue with fake success

### Ambiguous workflow target

- the AI agent asks the user which workflow or prompt should be tested first
- it asks only for the missing information

### No Mermaid support or poor visual output

- the AI agent falls back to ordered Markdown flow review
- review is still mandatory before execution

## Validation Strategy

This design is successful when the package-based path proves that humans do less work while the reviewability of the test stays intact.

Recommended validation for the first implementation:

1. **Packed-install smoke test**
   - verify that the published tarball contains both runtime files and agent-kit files

2. **Bootstrap-from-package smoke test**
   - verify that a temporary consumer repo can install the package and reach the local guidance bundle

3. **Agent-driven setup validation**
   - verify that the AI agent can generate a test case, show a flow, wait for approval, and run the test without requiring the human to shape config or spec files manually

4. **Flow fallback validation**
   - verify that ordered Markdown flow output remains clear when Mermaid is unavailable

## Non-Goals

- replacing the reviewable YAML or test artifact with opaque agent state
- making package engineering the primary user story
- requiring users to learn `create`, `flow`, and `run` as the first mental model
- making marketplace distribution the first implementation target

## Summary

The right first move is not “how do we make users read less source code.”

The right first move is:

> make `agentest` installable as a normal package, then make the AI agent do nearly all of the operational work.

In this design:

- npm is the delivery path
- the AI agent is the operator
- flow review is the user checkpoint
- the generated spec remains the persisted contract

That keeps the product library-first, makes it far easier to adopt from a package feed, and better matches the real user need: fewer manual steps between “I want to test this workflow” and “here is the result.”
