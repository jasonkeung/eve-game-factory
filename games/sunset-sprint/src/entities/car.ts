import type { RetroKaplay } from "@games/kit";

/** Fixed screen row where the player's roadster sits. */
export const PLAYER_Y = 142;

export const spawnCar = (k: RetroKaplay, x: number) =>
  k.add([
    k.sprite("car"),
    k.pos(x, PLAYER_Y),
    k.area({ scale: k.vec2(0.7, 0.8) }),
    k.anchor("center"),
    k.opacity(1),
    k.z(20),
    "player",
  ]);

export type PlayerCar = ReturnType<typeof spawnCar>;
