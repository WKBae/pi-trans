// A small `expect` over node:assert, enough for these tests.
import assert from 'node:assert/strict'

export { test } from 'node:test'

export function expect(actual: unknown) {
  const contains = (v: unknown) => (typeof actual === 'string' ? actual.includes(v as string) : (actual as unknown[]).includes(v))
  return {
    toBe: (v: unknown) => assert.strictEqual(actual, v),
    toEqual: (v: unknown) => assert.deepStrictEqual(actual, v),
    toContain: (v: unknown) => assert.ok(contains(v), `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(v)}`),
    toHaveLength: (n: number) => assert.strictEqual((actual as { length: number }).length, n),
    toBeUndefined: () => assert.strictEqual(actual, undefined),
    toBeDefined: () => assert.notStrictEqual(actual, undefined),
    toBeGreaterThan: (n: number) => assert.ok((actual as number) > n, `expected ${String(actual)} > ${n}`),
    not: {
      toContain: (v: unknown) => assert.ok(!contains(v), `expected ${JSON.stringify(actual)} not to contain ${JSON.stringify(v)}`),
    },
  }
}
