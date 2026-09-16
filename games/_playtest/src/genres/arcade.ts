import type { GameSeamSnapshot, GenreContext, GenreScript } from "../types.js";

/** Games with short timed runs must reach a terminal screen within this cap. */
const TERMINAL_TIMEOUT_MS = 90_000;
const POLL_MS = 250;
/** Fast poll while forcing a collision so `lastEvent === "hit"` is caught. */
const HIT_POLL_MS = 60;
/** How long one steering scrape may take before the probe gives up. */
const HIT_ATTEMPT_MS = 4000;
/** Cooldown between forced collisions (covers post-hit invulnerability). */
const HIT_COOLDOWN_MS = 1700;
/** Upper bound of forced collisions while draining lives to game over. */
const MAX_FORCED_HITS = 6;

const numExtra = (
  seam: GameSeamSnapshot | null,
  key: string
): number | null => {
  const value = seam?.extra?.[key];
  return typeof value === "number" ? value : null;
};

const strExtra = (
  seam: GameSeamSnapshot | null,
  key: string
): string | null => {
  const value = seam?.extra?.[key];
  return typeof value === "string" ? value : null;
};

/**
 * When the seam exposes `playerX`, hold Left then Right and expect the
 * position to move both ways. Games without the field pass as skipped.
 */
const probeSteering = async (ctx: GenreContext): Promise<void> => {
  const before = await ctx.getSeam();
  const x0 = numExtra(before, "playerX");
  if (x0 === null) {
    ctx.addCheck("steer-seam", true, "playerX not exposed; probe skipped");
    return;
  }
  await ctx.hold(["ArrowLeft"], 220);
  const xLeft = numExtra(await ctx.getSeam(), "playerX");
  await ctx.hold(["ArrowRight"], 440);
  const xRight = numExtra(await ctx.getSeam(), "playerX");
  const moved =
    xLeft !== null && xRight !== null && xLeft < x0 && xRight > xLeft;
  ctx.addCheck(
    "steer-seam",
    moved,
    `playerX ${x0} -> left ${xLeft} -> right ${xRight}`
  );
};

/**
 * When the seam exposes `boostActive` or `boostMeter`, press the primary
 * button and expect the boost to fire or the meter to fall.
 */
const probeBoost = async (ctx: GenreContext): Promise<void> => {
  const before = await ctx.getSeam();
  const meter0 = numExtra(before, "boostMeter");
  const hasFlag = typeof before?.extra?.boostActive === "boolean";
  if (meter0 === null && !hasFlag) {
    ctx.addCheck("boost-seam", true, "boost not exposed; probe skipped");
    return;
  }
  await ctx.press("Space", 80);
  await ctx.sleep(200);
  const after = await ctx.getSeam();
  const active = after?.extra?.boostActive === true;
  const meter1 = numExtra(after, "boostMeter");
  const fell = meter0 !== null && meter1 !== null && meter1 < meter0;
  ctx.addCheck(
    "boost-seam",
    active || fell,
    `boostActive=${String(after?.extra?.boostActive)} meter ${meter0} -> ${meter1}`
  );
};

type TerminalWatch = {
  hitEventSeen: boolean;
  last: GameSeamSnapshot | null;
  livesDropped: boolean;
  scoreEvent: string | null;
};

/**
 * Poll the seam until the game reaches a terminal screen (or the cap),
 * recording score gains, lastEvent values, and life losses along the way.
 */
const watchUntilTerminal = async (
  ctx: GenreContext
): Promise<TerminalWatch> => {
  const startedAt = Date.now();
  let last = await ctx.getSeam();
  const startScore = last?.score ?? 0;
  let lives = last?.lives ?? 0;
  let livesDropped = false;
  let hitEventSeen = false;
  let scoreEvent: string | null = null;
  while (Date.now() - startedAt < TERMINAL_TIMEOUT_MS) {
    const seam = await ctx.getSeam();
    if (seam) {
      const event = strExtra(seam, "lastEvent") ?? "";
      if (seam.lives < lives) {
        livesDropped = true;
      }
      if (event === "hit") {
        hitEventSeen = true;
      }
      if (
        scoreEvent === null &&
        seam.score > startScore &&
        (event === "pass" || event === "fuel")
      ) {
        scoreEvent = event;
      }
      lives = seam.lives;
      last = seam;
      if (seam.state === "gameover" || seam.state === "win") {
        break;
      }
    }
    await ctx.sleep(POLL_MS);
  }
  return { hitEventSeen, last, livesDropped, scoreEvent };
};

/** Press-and-hold via CDP plus synthetic events, mirroring ctx.hold. */
const keyDown = async (ctx: GenreContext, key: string): Promise<void> => {
  await ctx.page.keyboard.down(key);
  await ctx.page.evaluate((k) => {
    const ev = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: k,
    });
    window.dispatchEvent(ev);
    document.querySelector("canvas")?.dispatchEvent(ev);
  }, key);
};

const keyUp = async (ctx: GenreContext, key: string): Promise<void> => {
  await ctx.page.keyboard.up(key);
  await ctx.page.evaluate((k) => {
    const ev = new KeyboardEvent("keyup", {
      bubbles: true,
      cancelable: true,
      key: k,
    });
    window.dispatchEvent(ev);
    document.querySelector("canvas")?.dispatchEvent(ev);
  }, key);
};

type ForcedHit = {
  hitEventSeen: boolean;
  livesAfter: number;
  livesBefore: number;
};

/**
 * Steer hard left until the seam reports a life lost (or the run ends),
 * polling fast enough to observe `lastEvent === "hit"` before another event
 * overwrites it. Ends by nudging back toward the road center.
 */
const forceCollision = async (ctx: GenreContext): Promise<ForcedHit> => {
  const before = await ctx.getSeam();
  const livesBefore = before?.lives ?? 0;
  let livesAfter = livesBefore;
  let hitEventSeen = false;
  await keyDown(ctx, "ArrowLeft");
  const startedAt = Date.now();
  while (Date.now() - startedAt < HIT_ATTEMPT_MS) {
    await ctx.sleep(HIT_POLL_MS);
    const seam = await ctx.getSeam();
    if (!seam) {
      continue;
    }
    if (strExtra(seam, "lastEvent") === "hit") {
      hitEventSeen = true;
    }
    if (seam.lives < livesBefore || seam.state !== "playing") {
      livesAfter = seam.lives;
      break;
    }
  }
  await keyUp(ctx, "ArrowLeft");
  await ctx.hold(["ArrowRight"], 260);
  return { hitEventSeen, livesAfter, livesBefore };
};

/**
 * Second run: restart from the terminal screen and drain the remaining
 * lives with deliberate collisions, proving the hit event, the life
 * decrement, and the game-over route on the live seam.
 */
const probeHitAndGameOver = async (ctx: GenreContext): Promise<void> => {
  const seam = await ctx.getSeam();
  if (strExtra(seam, "lastEvent") === null) {
    ctx.addCheck("life-event-seam", true, "lastEvent not exposed; skipped");
    ctx.addCheck("gameover-route", true, "lastEvent not exposed; skipped");
    return;
  }

  // Terminal screens restart with Enter. Depending on how the game wires
  // its restart, that lands on the title screen or straight back in play.
  await ctx.press("Enter", 100);
  let playing: GameSeamSnapshot | null = null;
  const restartAt = Date.now();
  while (Date.now() - restartAt < 10_000) {
    const s = await ctx.getSeam();
    if (s?.state === "playing") {
      playing = s;
      break;
    }
    if (s?.state === "title") {
      await ctx.page.evaluate(() => {
        const w = window as unknown as { __startGame?: () => void };
        w.__startGame?.();
      });
    }
    await ctx.sleep(150);
  }
  if (playing === null) {
    const last = await ctx.getSeam();
    const where = last ? `state=${last.state}` : "no seam";
    ctx.addCheck(
      "life-event-seam",
      false,
      `restart never re-entered play; ${where}`
    );
    ctx.addCheck(
      "gameover-route",
      false,
      `restart never re-entered play; ${where}`
    );
    return;
  }

  const first = await forceCollision(ctx);
  ctx.addCheck(
    "life-event-seam",
    first.livesAfter < first.livesBefore && first.hitEventSeen,
    `lives ${first.livesBefore} -> ${first.livesAfter} with lastEvent=hit seen=${first.hitEventSeen}`
  );

  let current = await ctx.getSeam();
  let attempts = 0;
  let hitSeen = first.hitEventSeen;
  while (current?.state === "playing" && attempts < MAX_FORCED_HITS) {
    attempts += 1;
    await ctx.sleep(HIT_COOLDOWN_MS);
    const next = await forceCollision(ctx);
    hitSeen = hitSeen || next.hitEventSeen;
    current = await ctx.getSeam();
  }
  let terminal = current;
  if (terminal?.state === "playing") {
    try {
      terminal = await ctx.waitForState("gameover", 10_000);
    } catch {
      terminal = await ctx.getSeam();
    }
  }
  ctx.addCheck(
    "gameover-route",
    terminal?.state === "gameover" && hitSeen,
    terminal
      ? `state=${terminal.state} lives=${terminal.lives} cause=${String(terminal.extra.cause ?? "?")} hit events seen=${hitSeen}`
      : "no seam"
  );
};

export const arcadeScript: GenreScript = {
  genre: "arcade",
  run: async (ctx) => {
    const title = await ctx.waitForState("title", 15_000);
    ctx.addCheck(
      "title-state",
      title.state === "title",
      `state=${title.state}`
    );
    await ctx.screenshot("title");

    await ctx.page.evaluate(() => {
      const w = window as unknown as { __startGame?: () => void };
      w.__startGame?.();
    });
    await ctx.sleep(300);
    let playing = await ctx.getSeam();
    if (playing?.state !== "playing") {
      await ctx.press("Enter", 100);
      playing = await ctx.waitForState("playing", 8000);
    }
    ctx.addCheck(
      "start-playing",
      playing?.state === "playing",
      `state=${playing?.state}`
    );
    await ctx.screenshot("gameplay");

    await probeSteering(ctx);
    await probeBoost(ctx);

    const dirs = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"] as const;
    for (let i = 0; i < 8; i++) {
      await ctx.hold([dirs[i % 4] ?? "ArrowUp"], 300);
      if (i % 3 === 0) {
        await ctx.press("Space", 60);
      }
      if (i % 5 === 0) {
        await ctx.press("x", 60);
      }
    }

    await ctx.sleep(500);
    const held = await ctx.getSeam();
    ctx.addCheck(
      "session-held",
      held !== null && held.state !== "title",
      held ? `state=${held.state} score=${held.score}` : "no seam"
    );

    // Let the run play out to a real terminal screen, watching seam events.
    const watch = await watchUntilTerminal(ctx);
    const seam = watch.last;

    if (strExtra(seam, "lastEvent") === null && watch.scoreEvent === null) {
      ctx.addCheck("score-event-seam", true, "lastEvent not exposed; skipped");
    } else {
      ctx.addCheck(
        "score-event-seam",
        watch.scoreEvent !== null,
        watch.scoreEvent
          ? `score rose with lastEvent=${watch.scoreEvent}`
          : "no pass/fuel score event observed"
      );
    }

    const terminal =
      seam !== null && (seam.state === "gameover" || seam.state === "win");
    ctx.addCheck(
      "terminal-state",
      terminal,
      seam
        ? `state=${seam.state} score=${seam.score} lives=${seam.lives} checkpoint=${String(seam.extra.checkpoint ?? seam.level)}`
        : "no seam"
    );
    await ctx.screenshot("end");

    // Second run: prove hit -> life loss and the game-over route.
    if (terminal) {
      await probeHitAndGameOver(ctx);
    } else {
      ctx.addCheck(
        "life-event-seam",
        false,
        "first run never reached a terminal screen; hit probe not attempted"
      );
      ctx.addCheck(
        "gameover-route",
        false,
        "first run never reached a terminal screen; game-over probe not attempted"
      );
    }
  },
};
