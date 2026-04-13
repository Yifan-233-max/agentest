import type {
  AgentCommandConfig,
  ClaudeAgentPresetConfig,
  CopilotAgentPresetConfig,
  CustomAgentCommandConfig,
} from '../types.js';

export interface ResolvedAgentInvocation {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

function resolveCustomAgent(agent: CustomAgentCommandConfig): ResolvedAgentInvocation {
  return {
    command: agent.command,
    args: agent.args,
    env: agent.env,
    cwd: agent.cwd,
  };
}

function resolveClaudePreset(agent: ClaudeAgentPresetConfig): ResolvedAgentInvocation {
  return {
    command: agent.command ?? 'claude',
    args: [
      '--print',
      '--strict-mcp-config',
      '--mcp-config',
      '{mcpConfig}',
      '--tools',
      '',
      ...(agent.extraArgs ?? []),
      '{prompt}',
    ],
    env: agent.env,
    cwd: agent.cwd,
  };
}

function resolveCopilotPreset(agent: CopilotAgentPresetConfig): ResolvedAgentInvocation {
  return {
    command: agent.command ?? 'copilot',
    args: [
      '--prompt',
      '{prompt}',
      '--autopilot',
      '--config-dir',
      '{agentConfigDir}',
      '--disable-builtin-mcps',
      '--allow-all-tools',
      '--allow-all-paths',
      '--allow-all-urls',
      '--no-ask-user',
      '--silent',
      ...(agent.extraArgs ?? []),
    ],
    env: agent.env,
    cwd: agent.cwd,
  };
}

export function resolveAgentInvocation(agent: AgentCommandConfig): ResolvedAgentInvocation {
  if (agent.preset === 'claude') {
    return resolveClaudePreset(agent);
  }

  if (agent.preset === 'copilot') {
    return resolveCopilotPreset(agent);
  }

  return resolveCustomAgent(agent);
}