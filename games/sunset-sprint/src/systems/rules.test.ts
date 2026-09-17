import { describe, expect, it } from "vitest";
import { CHECKPOINTS, FINAL_CHECKPOINT } from "../levels/checkpoints.js";
import { createRunState, type RunState, toSeam } from "../state.js";
import {
  applyCheckpoint,
  applyFuel,
  applyHit,
  applyPass,
  BOOST_TIME,
  enterTerminal,
  markOutcome,
  OFFROAD_LIMIT,
  playerScreenX,
  roadsideCheck,
  startBoost,
  steerOffset,
  tickTimer,
} from "./rules.js";

const ROAD_CENTER = 160;

/** Start a run the way the game scene does after Enter on the title. */
const startRun = (): RunState => {
  const run = createRunState();
  run.state = "playing";
  run.scene = "game";
  run.timer = CHECKPOINTS[0]?.duration ?? 15;
  return run;
};

describe("steer-in-bounds", () => {
  it("moves playerX left and right with held steering", () => {
    const run = startRun();
    let offset = 0;
    offset = steerOffset(offset, -1, 0.2);
    run.playerX = playerScreenX(ROAD_CENTER, offset);
    const leftX = run.playerX;
    expect(leftX).toBeLessThan(ROAD_CENTER);

    offset = steerOffset(offset, 1, 0.4);
    run.playerX = playerScreenX(ROAD_CENTER, offset);
    expect(run.playerX).toBeGreaterThan(leftX);
    expect(toSeam(run).extra.playerX).toBe(run.playerX);
  });

  it("clamps the car back inside the road bounds after a scrape", () => {
    const run = startRun();
    for (const direction of [-1, 1]) {
      // Hold one direction far past the roadside.
      const wild = steerOffset(0, direction, 3);
      expect(Math.abs(wild)).toBeGreaterThan(OFFROAD_LIMIT);
      const checked = roadsideCheck(wild);
      expect(checked.hit).toBe(true);
      expect(Math.abs(checked.offset)).toBeLessThanOrEqual(OFFROAD_LIMIT);
      run.playerX = playerScreenX(ROAD_CENTER, checked.offset);
      expect(run.playerX).toBeGreaterThanOrEqual(ROAD_CENTER - OFFROAD_LIMIT);
      expect(run.playerX).toBeLessThanOrEqual(ROAD_CENTER + OFFROAD_LIMIT);
    }
    // Inside the road nothing is clamped.
    const inside = roadsideCheck(OFFROAD_LIMIT - 1);
    expect(inside.hit).toBe(false);
    expect(inside.offset).toBe(OFFROAD_LIMIT - 1);
  });
});

describe("boost-activates", () => {
  it("fires the boost and drops the meter from its starting value", () => {
    const run = startRun();
    expect(run.boostMeter).toBe(1);
    const duration = startBoost(run, 0);
    expect(duration).toBe(BOOST_TIME);
    const seam = toSeam(run);
    expect(seam.extra.boostActive).toBe(true);
    expect(seam.extra.boostMeter).toBe(0);
    expect(seam.extra.lastEvent).toBe("boost");
  });

  it("refuses to boost while active or while the meter recharges", () => {
    const run = startRun();
    expect(startBoost(run, 0.5)).toBeNull();
    run.boostMeter = 0.4;
    expect(startBoost(run, 0)).toBeNull();
  });
});

describe("score-on-pass-or-fuel", () => {
  it("scores a clean pass and reports lastEvent=pass", () => {
    const run = startRun();
    applyPass(run);
    const seam = toSeam(run);
    expect(seam.score).toBe(100);
    expect(seam.extra.lastEvent).toBe("pass");
  });

  it("scores a fuel can, refills capped time, and reports lastEvent=fuel", () => {
    const run = startRun();
    run.timer = 5;
    applyFuel(run, 15);
    const seam = toSeam(run);
    expect(seam.score).toBe(250);
    expect(seam.extra.lastEvent).toBe("fuel");
    expect(seam.extra.timer).toBe(8);
    // Refill never exceeds the leg's clock.
    applyFuel(run, 15);
    run.timer = 14;
    applyFuel(run, 15);
    expect(run.timer).toBe(15);
  });
});

describe("life-on-collision", () => {
  it("removes one life and reports lastEvent=hit", () => {
    const run = startRun();
    const dead = applyHit(run);
    expect(dead).toBe(false);
    const seam = toSeam(run);
    expect(seam.lives).toBe(2);
    expect(seam.extra.lastEvent).toBe("hit");
  });
});

describe("win-on-checkpoint-three", () => {
  it("ends in state=win with checkpoint 3 after the final leg", () => {
    const run = startRun();
    // Clear legs 1 and 2.
    for (const leg of [1, 2]) {
      expect(run.level).toBe(leg);
      const next = CHECKPOINTS[run.level]?.duration ?? 15;
      expect(applyCheckpoint(run, FINAL_CHECKPOINT, next)).toBe("next");
    }
    // Clear the final leg with lives remaining.
    expect(run.lives).toBeGreaterThan(0);
    expect(applyCheckpoint(run, FINAL_CHECKPOINT, 15)).toBe("win");
    markOutcome(run, true, "finish");
    enterTerminal(run);
    const seam = toSeam(run);
    expect(seam.state).toBe("win");
    expect(seam.level).toBe(3);
    expect(seam.extra.checkpoint).toBe(3);
    expect(seam.score).toBe(1500);
  });
});

describe("gameover-on-lives-or-time", () => {
  it("ends in state=gameover when the last life is lost", () => {
    const run = startRun();
    run.lives = 1;
    const dead = applyHit(run);
    expect(dead).toBe(true);
    markOutcome(run, false, "traffic");
    enterTerminal(run);
    const seam = toSeam(run);
    expect(seam.state).toBe("gameover");
    expect(seam.lives).toBe(0);
    expect(seam.extra.lastEvent).toBe("hit");
  });

  it("ends in state=gameover when the timer expires", () => {
    const run = startRun();
    run.timer = 0.05;
    expect(tickTimer(run, 0.1)).toBe(true);
    markOutcome(run, false, "time");
    enterTerminal(run);
    const seam = toSeam(run);
    expect(seam.state).toBe("gameover");
    expect(seam.extra.timer).toBe(0);
  });
});
