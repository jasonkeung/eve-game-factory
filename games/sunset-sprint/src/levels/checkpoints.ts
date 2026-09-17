/**
 * Route configuration: three short checkpoint legs on a desert highway.
 * Distances are logical pixels of forward scroll.
 */
export type CheckpointConfig = {
  /** Max sideways sway of the road center, in pixels. */
  bendAmplitude: number;
  /** Forward scroll required to clear the leg. */
  distanceTarget: number;
  /** Seconds on the clock for this leg. */
  duration: number;
  /** Seconds between fuel can spawns. */
  fuelGap: number;
  label: string;
  /** Chance a traffic spawn is a two-car cluster. */
  pairChance: number;
  /** Flat bonus added to the player's cruise speed. */
  speedBonus: number;
  /** Seconds between traffic spawns. */
  trafficGap: number;
  /** Forward speed of traffic cars. */
  trafficSpeed: number;
};

export const CHECKPOINTS: readonly CheckpointConfig[] = [
  {
    bendAmplitude: 0,
    distanceTarget: 1400,
    duration: 15,
    fuelGap: 5,
    label: "CHECKPOINT 1",
    pairChance: 0,
    speedBonus: 0,
    trafficGap: 1.6,
    trafficSpeed: 70,
  },
  {
    bendAmplitude: 26,
    distanceTarget: 1500,
    duration: 15,
    fuelGap: 6,
    label: "CHECKPOINT 2",
    pairChance: 0.25,
    speedBonus: 10,
    trafficGap: 1.15,
    trafficSpeed: 75,
  },
  {
    bendAmplitude: 18,
    distanceTarget: 1700,
    duration: 15,
    fuelGap: 7,
    label: "CHECKPOINT 3",
    pairChance: 0.5,
    speedBonus: 25,
    trafficGap: 0.85,
    trafficSpeed: 80,
  },
];

export const FINAL_CHECKPOINT = CHECKPOINTS.length;
