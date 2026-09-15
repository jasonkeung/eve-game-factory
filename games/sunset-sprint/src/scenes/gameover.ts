import type { RetroKaplay } from "@games/kit";
import { hexToRgb, playSfx, SWEETIE16 } from "@games/kit";
import { type RunState, resetRun } from "../state.js";
import { enterTerminal } from "../systems/rules.js";

const causeLine = (cause: unknown): string => {
  if (cause === "time") {
    return "OUT OF TIME";
  }
  if (cause === "traffic") {
    return "WRECKED IN TRAFFIC";
  }
  if (cause === "roadside") {
    return "RAN OFF THE ROAD";
  }
  return "ROUTE COMPLETE";
};

export const registerGameOverScene = (k: RetroKaplay, run: RunState): void => {
  k.scene("gameover", () => {
    const won = run.extra.won === true;
    enterTerminal(run);

    const title = won ? "YOU WIN" : "GAME OVER";
    const titleColor = won ? SWEETIE16[5] : SWEETIE16[2];

    k.add([
      k.rect(320, 180),
      k.pos(0, 0),
      k.color(...hexToRgb(SWEETIE16[0])),
      k.fixed(),
    ]);

    k.add([
      k.text(title, { size: 16 }),
      k.pos(160, 48),
      k.anchor("center"),
      k.color(...hexToRgb(titleColor)),
      k.fixed(),
    ]);

    k.add([
      k.text(causeLine(run.extra.cause), { size: 8 }),
      k.pos(160, 72),
      k.anchor("center"),
      k.color(...hexToRgb(SWEETIE16[13])),
      k.fixed(),
    ]);

    k.add([
      k.text(`SCORE ${run.score}`, { size: 10 }),
      k.pos(160, 94),
      k.anchor("center"),
      k.color(...hexToRgb(SWEETIE16[12])),
      k.fixed(),
    ]);

    k.add([
      k.text(`CHECKPOINT ${run.level}/3`, { size: 8 }),
      k.pos(160, 110),
      k.anchor("center"),
      k.color(...hexToRgb(SWEETIE16[4])),
      k.fixed(),
    ]);

    k.add([
      k.text("ENTER restart  Z retry now", { size: 8 }),
      k.pos(160, 138),
      k.anchor("center"),
      k.color(...hexToRgb(SWEETIE16[14])),
      k.fixed(),
    ]);

    k.onButtonPress("start", () => {
      playSfx("select");
      resetRun(run);
      k.go("title");
    });

    k.onButtonPress("jump", () => {
      playSfx("select");
      resetRun(run);
      run.state = "playing";
      run.scene = "game";
      k.go("game");
    });
  });
};
