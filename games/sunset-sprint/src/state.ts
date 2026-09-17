import type { GameSeam, GameStateName } from "@games/kit";

export const SLUG = "sunset-sprint";

export type LastEvent = "" | "pass" | "fuel" | "hit" | "boost" | "checkpoint";

export type RunState = {
  state: GameStateName;
  scene: string;
  score: number;
  lives: number;
  /** Current checkpoint being attempted, 1..3. */
  level: number;
  timer: number;
  boostMeter: number;
  boostActive: boolean;
  playerX: number;
  lastEvent: LastEvent;
  paused: boolean;
  extra: Record<string, unknown>;
};

export const START_LIVES = 3;

export const createRunState = (): RunState => ({
  boostActive: false,
  boostMeter: 1,
  extra: {},
  lastEvent: "",
  level: 1,
  lives: START_LIVES,
  paused: false,
  playerX: 160,
  scene: "title",
  score: 0,
  state: "title",
  timer: 15,
});

/** Reset every mutable field for a fresh run. */
export const resetRun = (run: RunState): void => {
  run.boostActive = false;
  run.boostMeter = 1;
  run.extra = {};
  run.lastEvent = "";
  run.level = 1;
  run.lives = START_LIVES;
  run.paused = false;
  run.playerX = 160;
  run.score = 0;
  run.timer = 15;
};

export const toSeam = (run: RunState): GameSeam => ({
  extra: {
    boostActive: run.boostActive,
    boostMeter: run.boostMeter,
    checkpoint: run.level,
    lastEvent: run.lastEvent,
    paused: run.paused,
    playerX: run.playerX,
    timer: run.timer,
    ...run.extra,
  },
  level: run.level,
  lives: run.lives,
  scene: run.scene,
  score: run.score,
  slug: SLUG,
  state: run.state,
});
