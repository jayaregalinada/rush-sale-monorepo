/** Clock seam so tests can advance time without real waits. */
type NowFn = () => number;

/**
 * A fixed-capacity set of string keys, each expiring after a TTL. Used for negative caching
 * - remembering "this id is unknown" - without unbounded growth: once at capacity the oldest
 * key is evicted, so a flood of distinct keys can never exhaust memory. The TTL bounds
 * staleness, so a key that becomes valid later is re-checked once its entry expires.
 */
export class BoundedTtlSet {
  /** key → expiry epoch ms. Map iteration is insertion-ordered, so the first key is oldest. */
  private readonly _entries = new Map<string, number>();

  constructor(
    private readonly _capacity: number,
    private readonly _ttlMs: number,
    private readonly _now: NowFn = Date.now,
  ) {}

  /** Remember a key for the TTL, evicting the oldest entry if at capacity. */
  add(key: string): void {
    this._entries.delete(key); // re-insert so this key counts as the newest

    if (this._entries.size >= this._capacity) {
      this._evictOldest();
    }

    this._entries.set(key, this._now() + this._ttlMs);
  }

  /** True only while the key is present and unexpired; expired keys are dropped on read. */
  has(key: string): boolean {
    const expiry = this._entries.get(key);

    if (expiry === undefined) {
      return false;
    }

    if (expiry <= this._now()) {
      this._entries.delete(key);

      return false;
    }

    return true;
  }

  private _evictOldest(): void {
    const oldest = this._entries.keys().next().value;

    if (oldest !== undefined) {
      this._entries.delete(oldest);
    }
  }
}
