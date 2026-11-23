/**
 * The parity matrix's data: surfaces (what a user can reach), the steps that
 * drive each one in a reference client and a candidate client, and what a run
 * records about them.
 */

import type { DiffResult, Rect } from './diff'

/**
 * A client the matrix can drive. `react` is today's web client in Playwright
 * Chromium. `tauri` is the shipped desktop app, driven with XTEST and read
 * only through its pixels. The Rune clients join this list in R3c.
 */
export type Client = 'react' | 'tauri'
export const CLIENTS: readonly Client[] = ['react', 'tauri']

/**
 * How an action finds its element. `testId` and `text` name an element any
 * client can resolve. `label` (an accessible name) and `css` exist only in
 * the DOM, so a client without one replays the point where the reference
 * acted: the element's centre, `at` (an offset from its top-left corner, for
 * a spot inside a canvas), or `frac` (a fraction of its size, for a drop
 * zone such as a pane's edge).
 */
export type Target =
  | { testId: string }
  | { text: string; exact?: boolean }
  | {
      label: string
      role?: 'button' | 'tab' | 'menuitem' | 'option' | 'switch' | 'combobox' | 'checkbox' | 'link'
    }
  | { css: string; at?: { x: number; y: number }; frac?: { x: number; y: number } }
  /** A point in the window, for a client with no DOM to name targets in. */
  | { point: { x: number; y: number } }

/** Keys are written as `ctrl-k`, `alt-,`, `escape`; strokes are separated by spaces. */
export type Action =
  | { do: 'click'; target: Target; button?: 'right'; modifiers?: 'ctrl' }
  | { do: 'dblclick'; target: Target }
  | { do: 'hover'; target: Target }
  | { do: 'press'; keys: string }
  | { do: 'type'; text: string }
  | { do: 'wheel'; target: Target; deltaY: number }
  | { do: 'drag'; from: Target; to: Target }
  | { do: 'wait'; ms: number }
  /**
   * Click `target`, which opens the OS file chooser, and pick `file` (a path
   * inside the world's root). Playwright answers the web client's chooser;
   * `x11/x11-file-chooser.py` answers a desktop app's GTK portal dialog.
   */
  | { do: 'choose'; target: Target; file: string }

/**
 * A text the client must paint (or have stopped painting) once the step
 * settles. `within` scopes the search to the subtree of a test id, so a match
 * elsewhere on screen cannot pass the check.
 */
export type Check =
  | {
      text: string
      gone?: true
      within?: string
      order?: never
      /** How long the check waits, for a surface that is slow to settle. */
      timeoutMs?: number
    }
  | OrderCheck

/** Texts that must appear in this order inside the `within` subtree (a list after a reorder). */
export type OrderCheck = { order: string[]; within: string; text?: never; gone?: never }

export interface Step {
  name: string
  actions: Action[]
  expect: Check[]
}

/** The area a surface belongs to. Area weights live in `weights.ts`. */
export type AreaId =
  | 'rail'
  | 'side-panel'
  | 'explorer'
  | 'editor'
  | 'git'
  | 'chat'
  | 'composer'
  | 'terminal'
  | 'statusbar'
  | 'settings'
  | 'theme'
  | 'palette'
  | 'shortcuts'
  | 'browser'
  | 'canvas'
  | 'ssh'
  | 'notifications'
  | 'remote'
  | 'snapshots'
  | 'dialogs'

export interface Surface {
  id: string
  area: AreaId
  title: string
  steps: Step[]
  /**
   * The client this surface is compared against when it is not the run's
   * `--against`: `tauri` for a surface the web client cannot render.
   */
  reference?: Client
  /** Start on this hash route (`#/snapshots`) and wait for `ready` instead of the dashboard text. */
  start?: { hash: string; ready: string }
  /** DOM selector of the surface's region, measured in the reference after each step. */
  roi?: string
  /** The region as a fixed window rectangle, for a reference with no DOM to measure it in. */
  roiRect?: Rect
  /** Not driven: the surface waits on another unit. */
  pending?: { unit: string; reason: string }
  /** Not driven: no reference to compare against, for the reason given. */
  blocked?: string
  /** Server-side setup run before each client's run (re-seeds what an earlier run changed). */
  prepare?(world: import('./world').World): Promise<void>
}

export interface ActionLog {
  step: string
  action: string
  /**
   * How the element was found: in the DOM, natively by test id or text, at
   * the point another client acted, at a fixed point, by key, or not at all.
   */
  via: 'dom' | 'testid' | 'text' | 'recorded-point' | 'point' | 'key' | 'none'
  ok: boolean
  error?: string
}

export interface CheckLog {
  step: string
  text: string
  expect: 'present' | 'gone'
  pass: boolean
  /** How long the check waited for its text, so a late paint reads apart from a missing one. */
  ms?: number
}

export interface ClientRun {
  client: Client
  ok: boolean
  error?: string
  ms: number
  actions: ActionLog[]
  checks: CheckLog[]
  /** One frame per step, in step order. */
  frames: string[]
}

export interface StepDiff {
  step: string
  full: DiffResult
  roi?: { rect: Rect; diff: DiffResult }
  diffPng: string
}

/**
 * `ported` is earned two ways: every step's frames match with no perceptual
 * difference outside the surface's masks, or a person reviewed the frames
 * (`reviews.ts`). Any other difference reads `needs-review` until then.
 */
export type Status =
  | 'ported'
  | 'needs-review'
  | 'partial'
  | 'broken'
  | 'blocked'
  | 'unverified'
  | 'pending-unit'

/** A failed attempt the matrix reran, and why it failed. */
export interface Rerun {
  attempt: number
  cause: string
}

/** `results.json`: one comparison and the surfaces it ran, by id. */
export interface SavedResults {
  /** The clients compared, as `<candidate> against <reference>`. */
  comparison: string
  surfaces: Record<string, SurfaceResult>
}

export interface SurfaceResult {
  id: string
  ranAt: string
  auto: Status
  reference?: ClientRun
  candidate?: ClientRun
  diffs: StepDiff[]
  /** Earlier attempts of this surface that failed and were rerun. */
  reruns: Rerun[]
  pending?: Surface['pending']
  blocked?: string
}
