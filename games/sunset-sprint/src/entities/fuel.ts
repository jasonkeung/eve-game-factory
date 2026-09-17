import type { RetroKaplay } from "@games/kit";

/** Spawn a fuel can resting on the road in the given lane. */
export const spawnFuel = (k: RetroKaplay, laneOffset: number) =>
  k.add([
    k.sprite("fuel"),
    k.pos(160 + laneOffset, -12),
    k.area(),
    k.anchor("center"),
    k.z(12),
    "fuel",
    { laneOffset },
  ]);

export type FuelCan = ReturnType<typeof spawnFuel>;
