# @games/playtest

Headless chromium playtest harness. Invoked from the repo root:

```bash
pnpm playtest <slug> [--genre platformer|shmup|arcade|puzzle]
```

Builds the game into `games/dist/<slug>`, serves it, waits for `window.__ready`,
runs the genre script, writes `games/<slug>/playtest/{title,gameplay,end}.png`
and `report.json`. Exits non-zero on failed checks or console errors.

## Browser setup on a clean station

The harness provisions its own browser. If the first chromium launch fails
(no downloaded browser, or missing OS libraries such as `libglib-2.0.so.0`),
it runs Playwright's supported setup command and retries once:

```bash
pnpm exec playwright install --with-deps chromium
```

The command is idempotent and installs both the chromium build and the apt
system dependencies (using sudo when not root), so `pnpm playtest` works on a
freshly created machine with nothing preinstalled beyond `pnpm install`.
