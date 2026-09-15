import type { GameSeamSnapshot, GenreContext, GenreScript } from "../types.js";

/** Games with short timed runs must reach a terminal screen within this cap. */
const TERMINAL_TIMEOUT_MS = 90_000;
const POLL_MS = 250;

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

    ctx.addCheck(
      "life-event-seam",
      !watch.livesDropped || watch.hitEventSeen,
      watch.livesDropped
        ? `lives dropped with hit event seen=${watch.hitEventSeen}`
        : "no life lost during the run"
    );

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
  },
};
