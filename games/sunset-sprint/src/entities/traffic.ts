import type { RetroKaplay } from "@games/kit";

/** Spawn a traffic car ahead of the player, glued to a lane offset. */
export const spawnTraffic = (k: RetroKaplay, laneOffset: number) =>
  k.add([
    k.sprite("traffic"),
    k.pos(160 + laneOffset, -24),
    k.area({ scale: k.vec2(0.7, 0.8) }),
    k.anchor("center"),
    k.z(15),
    "traffic",
    { laneOffset },
  ]);

export type TrafficCar = ReturnType<typeof spawnTraffic>;
