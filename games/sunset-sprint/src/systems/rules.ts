import type { RunState } from "../state.js";

/**
 * Pure run rules shared by the game scene and the Vitest acceptance tests.
 * Every mutation here lands on the same RunState that toSeam() serializes,
 * so tests assert against exactly what the playtest seam observes.
 */

export const ROAD_HALF = 52;
/** Max sideways offset from the road center before scraping the roadside. */
export const OFFROAD_LIMIT = ROAD_HALF - 7;
/** How far the car is nudged back onto the asphalt after a scrape. */
export const ROADSIDE_NUDGE = 12;
/** Vertical range where the player can drive on the visible road. */
export const PLAYER_MIN_Y = 104;
export const PLAYER_MAX_Y = 150;
export const PLAYER_MOVE_SPEED = 96;
export const STEER_SPEED = 130;
export const BOOST_TIME = 1.1;
export const PASS_POINTS = 100;
export const FUEL_POINTS = 250;
export const FUEL_TIME_REFILL = 3;
export const CHECKPOINT_POINTS = 500;

/** Move the sideways offset for one frame of held steering input. */
export const steerOffset = (
  offset: number,
  steer: number,
  dt: number
): number => offset + steer * STEER_SPEED * dt;

/** Screen x for the player, given the road center at the car's row. */
export const playerScreenX = (center: number, offset: number): number =>
  center + offset;

/** Move the car forward or back on screen while the road scrolls beneath it. */
export const movePlayerY = (
  y: number,
  direction: -1 | 0 | 1,
  dt: number
): number =>
  Math.max(
    PLAYER_MIN_Y,
    Math.min(PLAYER_MAX_Y, y + direction * PLAYER_MOVE_SPEED * dt)
  );

/**
 * Keep the car on the asphalt. A scrape reports one hit and nudges the car
 * back inside the limit so a single drift costs a single life.
 */
export const roadsideCheck = (
  offset: number
): { offset: number; hit: boolean } => {
  if (Math.abs(offset) <= OFFROAD_LIMIT) {
    return { hit: false, offset };
  }
  const sign = offset > 0 ? 1 : -1;
  return { hit: true, offset: sign * (OFFROAD_LIMIT - ROADSIDE_NUDGE) };
};

/**
 * Try to fire the boost. Returns the boost duration in seconds, or null when
 * the meter is still charging or a boost is already running.
 */
export const startBoost = (
  run: RunState,
  boostTimeLeft: number
): number | null => {
  if (run.boostMeter < 1 || boostTimeLeft > 0) {
    return null;
  }
  run.boostActive = true;
  run.boostMeter = 0;
  run.lastEvent = "boost";
  return BOOST_TIME;
};

/** Score a clean pass of one traffic car. */
export const applyPass = (run: RunState): void => {
  run.score += PASS_POINTS;
  run.lastEvent = "pass";
};

/** Collect a fuel can: points plus a small time refill, capped per leg. */
export const applyFuel = (run: RunState, capSeconds: number): void => {
  run.score += FUEL_POINTS;
  run.timer = Math.min(capSeconds, run.timer + FUEL_TIME_REFILL);
  run.lastEvent = "fuel";
};

/** One collision costs one life. Returns true when it was the last life. */
export const applyHit = (run: RunState): boolean => {
  run.lives -= 1;
  run.lastEvent = "hit";
  return run.lives <= 0;
};

/**
 * Clear the current leg. Returns "win" after the final checkpoint, otherwise
 * advances to the next leg and resets the clock to its duration.
 */
export const applyCheckpoint = (
  run: RunState,
  finalCheckpoint: number,
  nextDuration: number
): "win" | "next" => {
  run.score += CHECKPOINT_POINTS;
  run.lastEvent = "checkpoint";
  if (run.level >= finalCheckpoint) {
    return "win";
  }
  run.level += 1;
  run.timer = nextDuration;
  return "next";
};

/** Tick the clock. Returns true the moment time runs out. */
export const tickTimer = (run: RunState, dt: number): boolean => {
  run.timer -= dt;
  if (run.timer <= 0) {
    run.timer = 0;
    return true;
  }
  return false;
};

/** Record the run outcome before leaving the game scene. */
export const markOutcome = (
  run: RunState,
  won: boolean,
  cause: string
): void => {
  run.extra.won = won;
  run.extra.cause = cause;
};

/** Applied on entering the terminal scene: playing -> win | gameover. */
export const enterTerminal = (run: RunState): void => {
  run.state = run.extra.won === true ? "win" : "gameover";
  run.scene = "gameover";
  run.paused = false;
};
