import { type PaletteMap, spriteFromGrid } from "@games/kit";

/** Player roadster: red fill, white glass, dark outline/tires. */
const playerCarMap: PaletteMap = {
  ".": "transparent",
  K: 15,
  R: 2,
  W: 12,
};

/** Traffic car: hazard orange fill. */
const trafficCarMap: PaletteMap = {
  ".": "transparent",
  K: 15,
  O: 3,
  W: 12,
};

/** Fuel can: yellow with white cap shine. */
const fuelMap: PaletteMap = {
  ".": "transparent",
  K: 15,
  W: 12,
  Y: 4,
};

const CAR_BODY = [
  "................",
  "....KKKKKKKK....",
  "...KFFFFFFFFK...",
  "..KKFFWWWWFFKK..",
  "..KKFFWWWWFFKK..",
  "...KFFFFFFFFK...",
  "...KFFFFFFFFK...",
  "..KKFFFFFFFFKK..",
  "..KKFFFFFFFFKK..",
  "...KFFFFFFFFK...",
  "...KFWWWWWWFK...",
  "..KKFWWWWWWFKK..",
  "..KKFFFFFFFFKK..",
  "...KFFFFFFFFK...",
  "....KKKKKKKK....",
  "................",
];

const carGrid = (fill: string): string[] =>
  CAR_BODY.map((row) => row.replaceAll("F", fill));

const FUEL_GRID = [
  "..KKK...",
  "..KYK...",
  ".KYYYYK.",
  ".KYWYYK.",
  ".KYYYYK.",
  ".KYYYYK.",
  ".KYYYYK.",
  "..KKKK..",
];

export const loadGameSprites = (
  loadSprite: (name: string, src: string) => unknown
): void => {
  loadSprite("car", spriteFromGrid(carGrid("R"), playerCarMap));
  loadSprite("traffic", spriteFromGrid(carGrid("O"), trafficCarMap));
  loadSprite("fuel", spriteFromGrid(FUEL_GRID, fuelMap));
};
