import { describe, expect, it } from 'vitest';
import { BoundedTtlSet } from './bounded-ttl-set';

const CAPACITY = 3;
const TTL_MS = 1000;

/** A controllable clock so expiry is asserted without real waits. */
function fakeClock(start = 0) {
  let current = start;

  return {
    now: () => current,
    advance: (deltaMs: number) => {
      current += deltaMs;
    },
  };
}

describe('BoundedTtlSet', () => {
  it('remembers a key until its TTL elapses', () => {
    const clock = fakeClock();
    const set = new BoundedTtlSet(CAPACITY, TTL_MS, clock.now);

    set.add('a');
    expect(set.has('a')).toBe(true);

    clock.advance(TTL_MS); // expiry is inclusive: expiry <= now
    expect(set.has('a')).toBe(false);
  });

  it('reports unknown keys as absent', () => {
    const set = new BoundedTtlSet(CAPACITY, TTL_MS);

    expect(set.has('missing')).toBe(false);
  });

  it('evicts the oldest key once capacity is exceeded', () => {
    const set = new BoundedTtlSet(CAPACITY, TTL_MS);

    set.add('a');
    set.add('b');
    set.add('c');
    set.add('d'); // over capacity → 'a' (oldest) is evicted

    expect(set.has('a')).toBe(false);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(true);
    expect(set.has('d')).toBe(true);
  });

  it('treats re-adding a key as the newest, sparing it from eviction', () => {
    const set = new BoundedTtlSet(CAPACITY, TTL_MS);

    set.add('a');
    set.add('b');
    set.add('a'); // 'a' moves to newest; 'b' is now oldest
    set.add('c');
    set.add('d'); // evicts 'b'

    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(false);
  });

  it('does not double-count a refreshed key toward capacity', () => {
    const set = new BoundedTtlSet(CAPACITY, TTL_MS);

    set.add('a');
    set.add('a');
    set.add('b');
    set.add('c');

    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(true);
  });
});
