import { matchesValue } from './matchers.js';
import type { AgentRunSnapshot, TraceEntry } from './types.js';

function formatTrace(trace: TraceEntry[]): string {
  if (trace.length === 0) {
    return 'No MCP tool calls were recorded.';
  }

  return trace
    .map((entry, index) => {
      const suffix = entry.matched ? '' : ' (unmatched)';
      return `${index + 1}. ${entry.tool}${suffix} ${JSON.stringify(entry.args)}`;
    })
    .join('\n');
}

function formatOutput(kind: 'stdout' | 'stderr', value: string): string {
  if (value.length === 0) {
    return `${kind.toUpperCase()} is empty.`;
  }

  return `${kind.toUpperCase()}:\n${value}`;
}

function containsText(actual: string, matcher: unknown): boolean {
  if (typeof matcher === 'string') {
    return actual.includes(matcher);
  }

  return matchesValue(actual, matcher);
}

export class RunResult {
  constructor(private readonly snapshot: AgentRunSnapshot) {}

  get stdout(): string {
    return this.snapshot.stdout;
  }

  get stderr(): string {
    return this.snapshot.stderr;
  }

  get exitCode(): number | null {
    return this.snapshot.exitCode;
  }

  get timedOut(): boolean {
    return this.snapshot.timedOut;
  }

  get durationMs(): number {
    return this.snapshot.durationMs;
  }

  get trace(): TraceEntry[] {
    return this.snapshot.trace;
  }

  toolCalls(name?: string): TraceEntry[] {
    if (!name) {
      return [...this.trace];
    }

    return this.trace.filter((entry) => entry.tool === name);
  }

  assertToolCalled(name: string): void {
    if (this.toolCalls(name).length > 0) {
      return;
    }

    throw new Error(`Expected tool "${name}" to be called.\n${formatTrace(this.trace)}`);
  }

  assertToolCalledWith(name: string, matcher: unknown): void {
    const matchedCall = this.toolCalls(name).find((entry) => matchesValue(entry.args, matcher));
    if (matchedCall) {
      return;
    }

    throw new Error(
      `Expected tool "${name}" to be called with matching args ${JSON.stringify(matcher)}.\n${formatTrace(this.trace)}`,
    );
  }

  assertToolCalledTimes(name: string, count: number): void {
    const actualCount = this.toolCalls(name).length;
    if (actualCount === count) {
      return;
    }

    throw new Error(
      `Expected tool "${name}" to be called ${count} time(s), but received ${actualCount}.\n${formatTrace(this.trace)}`,
    );
  }

  assertToolSubsequence(names: string[]): void {
    let cursor = 0;

    for (const entry of this.trace) {
      if (entry.tool === names[cursor]) {
        cursor += 1;
      }

      if (cursor === names.length) {
        return;
      }
    }

    throw new Error(
      `Expected tool subsequence ${names.join(' -> ')}.\n${formatTrace(this.trace)}`,
    );
  }

  assertOnlyCalledTools(names: string[]): void {
    const allowed = new Set(names);
    const disallowed = this.trace.filter((entry) => !allowed.has(entry.tool));
    if (disallowed.length === 0) {
      return;
    }

    throw new Error(
      `Expected only tools ${names.join(', ')} to be called.\n${formatTrace(disallowed)}`,
    );
  }

  assertExitSuccessfully(): void {
    if (!this.timedOut && this.exitCode === 0) {
      return;
    }

    throw new Error(
      `Expected agent process to exit successfully, received exitCode=${this.exitCode}, timedOut=${this.timedOut}.\nSTDERR:\n${this.stderr}`,
    );
  }

  assertExitCode(code: number): void {
    if (this.exitCode === code) {
      return;
    }

    throw new Error(`Expected exit code ${code}, but received ${this.exitCode}.`);
  }

  assertTimedOut(): void {
    if (this.timedOut) {
      return;
    }

    throw new Error('Expected agent process to time out, but it completed in time.');
  }

  assertFinishedWithin(maxDurationMs: number): void {
    if (this.durationMs <= maxDurationMs) {
      return;
    }

    throw new Error(
      `Expected agent process to finish within ${maxDurationMs}ms, but received ${this.durationMs}ms.`,
    );
  }

  assertStdoutContains(matcher: unknown): void {
    if (containsText(this.stdout, matcher)) {
      return;
    }

    throw new Error(
      `Expected stdout to contain ${JSON.stringify(matcher)}.\n${formatOutput('stdout', this.stdout)}`,
    );
  }

  assertStderrContains(matcher: unknown): void {
    if (containsText(this.stderr, matcher)) {
      return;
    }

    throw new Error(
      `Expected stderr to contain ${JSON.stringify(matcher)}.\n${formatOutput('stderr', this.stderr)}`,
    );
  }

  assertNoUnmatchedToolCalls(): void {
    const unmatched = this.trace.filter((entry) => !entry.matched);
    if (unmatched.length === 0) {
      return;
    }

    throw new Error(`Expected all MCP tool calls to match a stub.\n${formatTrace(unmatched)}`);
  }
}

export function expect(result: RunResult) {
  return {
    toHaveCalledTool(name: string) {
      result.assertToolCalled(name);
    },
    toHaveCalledToolTimes(name: string, count: number) {
      result.assertToolCalledTimes(name, count);
    },
    toHaveCalledToolWith(name: string, matcher: unknown) {
      result.assertToolCalledWith(name, matcher);
    },
    toHaveToolSubsequence(names: string[]) {
      result.assertToolSubsequence(names);
    },
    toOnlyCallTools(names: string[]) {
      result.assertOnlyCalledTools(names);
    },
    toExitSuccessfully() {
      result.assertExitSuccessfully();
    },
    toExitWithCode(code: number) {
      result.assertExitCode(code);
    },
    toHaveTimedOut() {
      result.assertTimedOut();
    },
    toFinishWithin(maxDurationMs: number) {
      result.assertFinishedWithin(maxDurationMs);
    },
    toContainStdout(matcher: unknown) {
      result.assertStdoutContains(matcher);
    },
    toContainStderr(matcher: unknown) {
      result.assertStderrContains(matcher);
    },
    toHaveNoUnmatchedToolCalls() {
      result.assertNoUnmatchedToolCalls();
    },
    not: {
      toHaveCalledTool(name: string) {
        if (result.toolCalls(name).length === 0) {
          return;
        }

        throw new Error(`Expected tool "${name}" not to be called.`);
      },
      toHaveTimedOut() {
        if (!result.timedOut) {
          return;
        }

        throw new Error('Expected agent process not to time out.');
      },
      toContainStdout(matcher: unknown) {
        if (!containsText(result.stdout, matcher)) {
          return;
        }

        throw new Error(`Expected stdout not to contain ${JSON.stringify(matcher)}.`);
      },
      toContainStderr(matcher: unknown) {
        if (!containsText(result.stderr, matcher)) {
          return;
        }

        throw new Error(`Expected stderr not to contain ${JSON.stringify(matcher)}.`);
      },
    },
  };
}