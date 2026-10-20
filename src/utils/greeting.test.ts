import { describe, expect, it } from 'vitest';
import { greetingKey } from './greeting';

const at = (hour: number, minute = 0) => new Date(2026, 9, 20, hour, minute);

describe('greetingKey', () => {
  it.each([
    [5, 0, 'morning'],
    [11, 59, 'morning'],
    [12, 0, 'day'],
    [17, 59, 'day'],
    [18, 0, 'evening'],
    [22, 59, 'evening'],
    [23, 0, 'night'],
    [0, 30, 'night'],
    [4, 59, 'night'],
  ] as const)('%i:%i — %s', (hour, minute, key) => {
    expect(greetingKey(at(hour, minute))).toBe(key);
  });
});
