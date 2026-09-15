import { createRetroGame, createSeededRandom, installSeam } from "@games/kit";
import { registerGameScene } from "./scenes/game.js";
import { registerGameOverScene } from "./scenes/gameover.js";
import { registerTitleScene } from "./scenes/title.js";
import { loadGameSprites } from "./sprites.js";
import { createRunState, toSeam } from "./state.js";

const run = createRunState();

// Honor deterministic seed when present.
const rng = createSeededRandom(window.__seed);

const k = createRetroGame({ background: 0 });

const { resolveReady } = installSeam(k, () => toSeam(run));

loadGameSprites((name, src) => {
  k.loadSprite(name, src);
});

registerTitleScene(k, run);
registerGameScene(k, run, rng);
registerGameOverScene(k, run);

k.onLoad(() => {
  k.go("title");
  resolveReady();
});
