import { expect } from 'bun:test';

/**
 * Asserts that `elements` has exactly `count` entries and returns it as a
 * non-optional array — so callers can destructure without `!` or re-checking.
 */
export function assertCount<T>(elements: T[] | undefined, count: number): T[] {
  expect(elements?.length).toBe(count);
  return elements!;
}
