# Parity matrix

The parity matrix drives the same user steps in two clients and compares one frame per step. A reference client (`--against`, default `react`) runs first, and a candidate client (`--client`) runs second. Both start as a fresh device on one seeded `troupe-server`. The matrix scores each surface and writes `report.md`.

```sh
bun run build:web
bun run parity:matrix --client react --against react     # self-check: reads zero difference
bun run parity:matrix --only rail.project-menu --client-dist /tmp/scratch/dist-web
bun run parity rail.project-menu                         # writes pair.png next to each step
```

The server binary comes from `TROUPE_SERVER_BIN`, or from `--server-bin`, or from this checkout's release build. Each run seeds a fresh world under `--state` and writes frames, `results.json` and `report.md` under `--out`. Both default to directories under `/tmp/troupe-parity`.

## Files

- `surfaces/` lists the surfaces, one file per area. Each surface step is a list of actions and checks, written with `surfaces/dsl.ts`.
- `world.ts` seeds the server: four projects, a git repo with staged, unstaged and untracked changes, a chat from the scripted agent in `agent/`, one skill, and a fixed page clock.
- `drivers/` holds the clients. `react` is the web client in Playwright Chromium, and is the reference capture. `tauri` is the desktop app under Xvfb, driven with XTEST at the points the reference recorded, and read only through pixels.
- `diff.ts` counts the pixels that differ (exact and perceptual), in total and in three parts: text, icons and boxes. The reference DOM names the parts.
- `status.ts` decides each surface's status. A surface is `ported` only when no step differs perceptually. Any difference, however small, reads `needs-review`, and only a person's verdict in `reviews.ts` turns it into `ported`, `partial` or `broken`. A review records the largest difference it saw (`acceptsPx`) and stops applying when a later run differs by more.
- `weights.ts` holds the area weights and the two scores. `report.ts` renders the report.

## Add a client

Implement `ClientLauncher` from `drivers/driver.ts` and add the client to `CLIENTS` in `types.ts` and to the `launchers` table in `run.ts`. A client that cannot find targets itself sets `resolvesTargets: false`, and then acts at the points the other client recorded. After a click, a driver moves the pointer to `PARK_POINT`, so that a delayed hover look does not change the frame.
