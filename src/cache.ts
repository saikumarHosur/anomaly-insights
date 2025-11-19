type Entry<T> = { value: T; exp: number };

export class TTLCache<T> {
  private store = new Map<string, Entry<T>>();
  constructor(private defaultTtlMs: number) {}

  get(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T, ttlMs?: number) {
    const exp = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.store.set(key, { value, exp });
  }
}