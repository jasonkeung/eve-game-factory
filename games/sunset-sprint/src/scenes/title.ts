import type { RetroKaplay } from "@games/kit";
import { hexToRgb, playSfx, SWEETIE16 } from "@games/kit";
import { type RunState, resetRun } from "../state.js";

export const registerTitleScene = (k: RetroKaplay, run: RunState): void => {
  k.scene("title", () => {
    run.state = "title";
    run.scene = "title";
    run.paused = false;

    k.add([
      k.rect(320, 180),
      k.pos(0, 0),
      k.color(...hexToRgb(SWEETIE16[0])),
      k.fixed(),
    ]);

    // Sunset stripes along the horizon.
    k.add([
      k.rect(320, 6),
      k.pos(0, 92),
      k.color(...hexToRgb(SWEETIE16[4])),
      k.fixed(),
    ]);
    k.add([
      k.rect(320, 3),
      k.pos(0, 100),
      k.color(...hexToRgb(SWEETIE16[3])),
      k.fixed(),
    ]);

    k.add([
      k.text("SUNSET SPRINT", { size: 16 }),
      k.pos(160, 40),
      k.anchor("center"),
      k.color(...hexToRgb(SWEETIE16[4])),
      k.fixed(),
    ]);

    k.add([
      k.text("Thread the desert highway traffic", { size: 8 }),
      k.pos(160, 62),
      k.anchor("center"),
      k.color(...hexToRgb(SWEETIE16[13])),
      k.fixed(),
    ]);

    k.add([
      k.text("Clear 3 checkpoints before time runs out", { size: 8 }),
      k.pos(160, 74),
      k.anchor("center"),
      k.color(...hexToRgb(SWEETIE16[12])),
      k.fixed(),
    ]);

    k.add([k.sprite("car"), k.pos(160, 108), k.anchor("center"), k.fixed()]);

    k.add([
      k.text("Arrows/WASD drive  Z/Space boost  X brake", { size: 8 }),
      k.pos(160, 126),
      k.anchor("center"),
      k.color(...hexToRgb(SWEETIE16[14])),
      k.fixed(),
    ]);

    const prompt = k.add([
      k.text("PRESS ENTER", { size: 10 }),
      k.pos(160, 150),
      k.anchor("center"),
      k.color(...hexToRgb(SWEETIE16[4])),
      k.fixed(),
      k.opacity(1),
    ]);

    let blink = 0;
    prompt.onUpdate(() => {
      blink += k.dt();
      prompt.opacity = Math.sin(blink * 6) > 0 ? 1 : 0.25;
    });

    let started = false;
    const start = () => {
      if (started || run.state !== "title") {
        return "already";
      }
      started = true;
      try {
        playSfx("select");
      } catch {
        // ignore audio
      }
      resetRun(run);
      run.state = "playing";
      run.scene = "game";
      try {
        k.go("game");
        return "went";
      } catch (err) {
        console.error("go game failed", err);
        return `err:${err instanceof Error ? err.message : String(err)}`;
      }
    };

    (window as unknown as { __startGame?: () => unknown }).__startGame = start;

    const onDomKey = (ev: KeyboardEvent) => {
      const key = ev.key.toLowerCase();
      if (key === "enter" || key === " " || key === "z") {
        ev.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onDomKey);

    k.onButtonPress("start", () => {
      start();
    });
    k.onKeyPress("enter", () => {
      start();
    });
    k.onKeyPress("space", () => {
      start();
    });
  });
};
