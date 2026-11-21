/**
 * The resubscribes one reconnect pass owes, per session: owed (queued, next
 * first) → in flight (its subscribe promise) → settled (gone from both).
 *
 * The pass drains the queue one session at a time, a prompt claims an owed
 * session or awaits its in-flight subscribe, and the UI reads every session
 * still here as not yet resynced.
 */
export class SessionResyncQueue {
  private owed: string[] = []
  private readonly inFlight = new Map<string, Promise<void>>()

  constructor(private readonly onChange: () => void) {}

  /** A new pass owes every listed session again, in this order. */
  reset(order: Iterable<string>): void {
    this.owed = [...new Set(order)]
    this.inFlight.clear()
    this.onChange()
  }

  clear(): void {
    if (this.owed.length === 0 && this.inFlight.size === 0) return
    this.owed = []
    this.inFlight.clear()
    this.onChange()
  }

  isOwed(sessionId: string): boolean {
    return this.owed.includes(sessionId)
  }

  /** The session the pass should resubscribe next. */
  peek(): string | undefined {
    return this.owed[0]
  }

  inFlightFor(sessionId: string): Promise<void> | undefined {
    return this.inFlight.get(sessionId)
  }

  /** Move an owed session to the front of the queue. */
  promote(sessionId: string): void {
    const index = this.owed.indexOf(sessionId)
    if (index <= 0) return
    this.owed.splice(index, 1)
    this.owed.unshift(sessionId)
  }

  /**
   * Take an owed session off the queue and track `subscribe()` as its in-flight
   * resubscribe. Returns `undefined` (and does not call `subscribe`) when the
   * session is not owed.
   */
  claim(sessionId: string, subscribe: () => Promise<void>): Promise<void> | undefined {
    if (!this.isOwed(sessionId)) return undefined
    this.owed = this.owed.filter((sid) => sid !== sessionId)
    const run = subscribe().finally(() => {
      if (this.inFlight.get(sessionId) !== run) return
      this.inFlight.delete(sessionId)
      this.onChange()
    })
    this.inFlight.set(sessionId, run)
    this.onChange()
    return run
  }

  /** The session no longer needs this pass (resynced some other way, or gone). */
  settle(sessionId: string): void {
    if (!this.isOwed(sessionId)) return
    this.owed = this.owed.filter((sid) => sid !== sessionId)
    this.onChange()
  }

  sessionIds(): string[] {
    return [...this.owed, ...this.inFlight.keys()]
  }
}
