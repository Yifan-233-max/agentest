# agentest

Test AI CLI workflows like unit tests.

`agentest` lets teams test real prompt-driven agent workflows without changing the prompt or switching to a fake model.
You run the same prompt against the same CLI, but in test mode the MCP tool layer is replaced with mocked MCP tools that are traced and checked.

You do not need to clone the `agentest` source repo to adopt it.
The intended path is package-first: your AI agent can install `agentest`, discover the bundled local guidance at `agentest/agent-kit/manifest.json`, and bootstrap the first test flow from there.

## Why It Matters

If your team already ships workflows through Claude Code, Copilot CLI, or a custom MCP-enabled agent, you usually have two bad options today:

- trust prompt edits without a repeatable test
- replace the real workflow with a fake harness that no longer matches production behavior

`agentest` takes the middle path.

It keeps the real workflow and changes only the tool layer in test mode.
That lets you verify:

- which tools the agent chose
- the order of tool calls
- the arguments sent to each tool
- whether the run stopped before a wrong or unsafe action
- whether a prompt edit changed behavior in a way you did not intend

## What Stays The Same

What stays the same:

- your prompt
- your agent CLI
- your prompt source files

What changes in test mode:

- real MCP tools are replaced by mocked MCP tools
- tool calls are traced
- the run is checked against a reviewable contract

Normal development flow:

```text
prompt -> AI CLI -> real MCP -> real side effects
```

Test flow:

```text
prompt -> AI CLI -> agentest mock MCP -> injected responses + trace + assertions
```

## The Experience

The intended user experience is simple:

1. describe the workflow or scenario to test in natural language
2. let the AI agent check whether `agentest` is already installed
3. if it is missing, let the AI agent install it
4. let the AI agent use the installed guidance bundle to discover the repo context and design the first test flow
5. review the proposed flow
6. approve the run and receive the result

The customer should not need to learn the config shape, clone this repo, or memorize CLI commands before getting value.
Setup, test design, config generation, flow review, execution, and result reporting should all be handled by an AI coding agent.

For adopters, the bootstrap guidance travels with the installed package.
This repo's [AGENTS.md](AGENTS.md) remains the contributor-facing entry point for working on `agentest` itself.

## AI-Driven Workflow

The main story is not "install a tool, read docs, then figure out the commands."
The main story is "tell your AI agent what workflow to test."

The AI agent should:

- check whether `agentest` is already installed in the repo environment
- install `agentest` if it is missing
- discover the installed local guidance bundle at `agentest/agent-kit/manifest.json`
- find the existing AI CLI
- find the real prompt source
- identify the MCP tools the workflow actually uses
- design the first test case
- show the proposed test flow before execution
- wait for user approval
- write the config and spec
- run the validation
- report the outcome in user language

The user should only need to review the proposed flow and approve the run.

If someone wants to install it manually first, that is still available:

```bash
npm i -D agentest
```

## What The Agent Can Use Today

Available now:

- an installed local guidance bundle discoverable at `agentest/agent-kit/manifest.json`
- package-first bootstrap in an existing repo without cloning the `agentest` source repo
- guidance that helps the AI agent bootstrap without extra human instructions
- generate a first YAML spec from natural-language intent and detected prompt sources
- show a reviewable summary or Mermaid graph of a YAML test spec
- execute prompt tests locally or in CI
- mocked MCP tools over stdio
- prompt source binding from `inline`, `file`, `module`, and `command`
- native TypeScript support for config files, prompt modules, and TypeScript test files
- string-based tool declarations for the minimal path
- presets for `custom`, `claude`, and `copilot`

Not implemented yet:

- `agentest run --chaos`
- `agentest explain`

## Who It Is For

`agentest` is for teams who:

- already use an AI CLI in a real repository
- want tests embedded in that repository instead of a separate harness
- want reviewable prompt contracts in git
- want AI to help with setup and authoring instead of hand-configuring everything first

## For Contributors

If you are contributing to `agentest` itself, or you want the detailed integration and developer-facing material, use these entry points:

- AI setup guidance: [AGENTS.md](AGENTS.md)
- developer and AI operator guide: [docs/usage.md](docs/usage.md)
- smallest copy-paste template: [docs/minimal-template.md](docs/minimal-template.md)
- AI-native product direction: [docs/ai-native-experience.md](docs/ai-native-experience.md)
- product command draft: [docs/product-api.md](docs/product-api.md)
- prompt test spec draft: [docs/prompt-test-spec-v0.1.md](docs/prompt-test-spec-v0.1.md)
- real Copilot CLI walkthrough: [examples/github-issue-triage/README.md](examples/github-issue-triage/README.md)
- deterministic local example files: `examples/consumer/package.json`, `examples/consumer/agentest.config.ts`, and `examples/consumer/tests/fix-null.agentest.yaml`

Maintainer validation commands:

```bash
npm install
npm run check
npm run run:example
```

## License

MIT
