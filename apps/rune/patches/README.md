# Troupe's patches to Rune

Troupe builds Rune at one pinned rev (`apps/rune/rune.pin`). When Troupe needs
a change in Rune before upstream has it, the change lives here as a numbered
patch series on top of that rev. The folder holds no patches yet.

## Rules

- One change per patch, made with `git format-patch` against the pinned rev
  and named `NNNN-short-name.patch` (`0001-...`, `0002-...`). The number sets
  the apply order.
- Upstream takes issues, not pull requests. File an issue on
  `anomalyco/rune` for every patch and put its URL in the patch's commit
  message, so the patch can be dropped when upstream fixes it.
- Bumping the pin means checking the series again: drop patches upstream
  absorbed, then rebase the rest.

## Check and build the series

```sh
node scripts/rune/apply-patches.mjs
```

The script fetches the pinned rev, applies the patches in order with
`git am`, and exits 1 at the first patch that does not apply. Pass
`--out DIR` to keep the result: a clone with the branch `troupe/<rev>`, ready
to push to a fork that `apps/rune/Cargo.toml` can point at. With no patches it
does nothing and passes.
