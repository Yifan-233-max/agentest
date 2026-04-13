function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

type AgentestMatcherKind = 'anything' | 'stringContaining' | 'objectContaining' | 'arrayContaining';

interface AgentestMatcherShape {
  __agentestMatcher: AgentestMatcherKind;
  value?: unknown;
}

function isAgentestMatcher(value: unknown): value is AgentestMatcherShape {
  return (
    isPlainObject(value) &&
    typeof value.__agentestMatcher === 'string'
  );
}

function isSerializedRegExp(value: unknown): value is {
  __agentestType: 'regexp';
  source: string;
  flags: string;
} {
  return (
    isPlainObject(value) &&
    value.__agentestType === 'regexp' &&
    typeof value.source === 'string' &&
    typeof value.flags === 'string'
  );
}

export function serializeMatcher(value: unknown): unknown {
  if (value instanceof RegExp) {
    return {
      __agentestType: 'regexp',
      source: value.source,
      flags: value.flags,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeMatcher(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeMatcher(item)]),
    );
  }

  return value;
}

export function reviveMatcher(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => reviveMatcher(item));
  }

  if (isSerializedRegExp(value)) {
    return new RegExp(value.source, value.flags);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, reviveMatcher(item)]),
    );
  }

  return value;
}

export function matchesValue(actual: unknown, matcher: unknown): boolean {
  if (isAgentestMatcher(matcher)) {
    switch (matcher.__agentestMatcher) {
      case 'anything':
        return actual !== undefined;
      case 'stringContaining':
        return typeof actual === 'string' && typeof matcher.value === 'string' && actual.includes(matcher.value);
      case 'objectContaining':
        return isPlainObject(actual) && matchesValue(actual, matcher.value);
      case 'arrayContaining':
        return (
          Array.isArray(actual) &&
          Array.isArray(matcher.value) &&
          matcher.value.every((expectedItem) => actual.some((actualItem) => matchesValue(actualItem, expectedItem)))
        );
    }
  }

  if (matcher instanceof RegExp) {
    return typeof actual === 'string' && matcher.test(actual);
  }

  if (Array.isArray(matcher)) {
    return (
      Array.isArray(actual) &&
      actual.length === matcher.length &&
      matcher.every((item, index) => matchesValue(actual[index], item))
    );
  }

  if (isPlainObject(matcher)) {
    if (!isPlainObject(actual)) {
      return false;
    }

    return Object.entries(matcher).every(([key, item]) => matchesValue(actual[key], item));
  }

  if (typeof matcher === 'number' && Number.isNaN(matcher)) {
    return typeof actual === 'number' && Number.isNaN(actual);
  }

  return Object.is(actual, matcher);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

export const match = {
  anything(): AgentestMatcherShape {
    return { __agentestMatcher: 'anything' };
  },
  stringContaining(value: string): AgentestMatcherShape {
    return { __agentestMatcher: 'stringContaining', value };
  },
  objectContaining(value: Record<string, unknown>): AgentestMatcherShape {
    return { __agentestMatcher: 'objectContaining', value };
  },
  arrayContaining(value: unknown[]): AgentestMatcherShape {
    return { __agentestMatcher: 'arrayContaining', value };
  },
};