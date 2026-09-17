import type { RetroKaplay } from "@games/kit";
import { hexToRgb, playSfx, SWEETIE16 } from "@games/kit";
import { PLAYER_Y, spawnCar } from "../entities/car.js";
import { type FuelCan, spawnFuel } from "../entities/fuel.js";
import { spawnTraffic, type TrafficCar } from "../entities/traffic.js";
import {
  CHECKPOINTS,
  type CheckpointConfig,
  FINAL_CHECKPOINT,
} from "../levels/checkpoints.js";
import type { RunState } from "../state.js";
import {
  applyCheckpoint,
  applyFuel,
  applyHit,
  applyPass,
  markOutcome,
  movePlayerY,
  playerScreenX,
  ROAD_HALF,
  roadsideCheck,
  startBoost,
  steerOffset,
  tickTimer,
} from "../systems/rules.js";

const STRIP_H = 4;
const HORIZON_Y = 58;
const ROAD_FAR_HALF = 11;
const ROAD_NEAR_HALF = 104;
const SHOULDER_FAR = 2;
const SHOULDER_NEAR = 11;
const LANE_OFFSETS = [-32, 0, 32] as const;
const CRUISE_MIN = 100;
const CRUISE_MAX = 190;
const BOOST_BONUS = 130;
const BOOST_RECHARGE = 2.8;

const rgb = (idx: number): [number, number, number] =>
  hexToRgb(SWEETIE16[idx] ?? SWEETIE16[0]);

export const registerGameScene = (
  k: RetroKaplay,
  run: RunState,
  rng: () => number
): void => {
  const roadColor = k.rgb(...rgb(13));
  const dashColor = k.rgb(...rgb(12));
  const trimColor = k.rgb(...rgb(4));
  const postColor = k.rgb(...rgb(3));
  const skyColor = k.rgb(...rgb(8));
  const skyBandColor = k.rgb(...rgb(9));
  const groundColor = k.rgb(...rgb(1));
  const sunColor = k.rgb(...rgb(4));

  k.scene("game", () => {
    run.state = "playing";
    run.scene = "game";
    run.paused = false;
    run.boostActive = false;
    run.boostMeter = 1;
    run.lastEvent = "";
    run.playerY = PLAYER_Y;

    const cfgFor = (): CheckpointConfig =>
      CHECKPOINTS[run.level - 1] ?? CHECKPOINTS[0];

    let cfg = cfgFor();
    run.timer = cfg.duration;

    let ended = false;
    let distance = 0;
    let scroll = 0;
    let bend = 0;
    let cruise = 140;
    let boostTime = 0;
    let slowTimer = 0;
    let invuln = 0;
    let playerOffset = 0;
    let playerY = PLAYER_Y;
    let trafficTimer = 1;
    let fuelTimer = 3;
    let dustTimer = 0;
    let streakTimer = 0;
    let bannerTime = 0;
    const traffic: TrafficCar[] = [];
    const cans: FuelCan[] = [];

    const centerX = (y: number): number =>
      160 + bend * Math.sin((scroll + (180 - y)) * 0.01);

    const perspectiveAt = (y: number): number =>
      Math.max(0, Math.min(1, (y - HORIZON_Y) / (180 - HORIZON_Y)));

    const roadHalfAt = (y: number): number =>
      ROAD_FAR_HALF + (ROAD_NEAR_HALF - ROAD_FAR_HALF) * perspectiveAt(y);

    const shoulderWidthAt = (y: number): number =>
      SHOULDER_FAR + (SHOULDER_NEAR - SHOULDER_FAR) * perspectiveAt(y);

    const laneScreenX = (y: number, laneOffset: number): number =>
      centerX(y) + laneOffset * (roadHalfAt(y) / ROAD_HALF);

    // Perspective highway drawn under everything else.
    const road = k.add([k.pos(0, 0), k.z(0)]);
    road.onDraw(() => {
      k.drawRect({
        color: skyColor,
        height: HORIZON_Y,
        pos: k.vec2(0, 0),
        width: 320,
      });
      k.drawCircle({
        color: sunColor,
        pos: k.vec2(250, 38),
        radius: 10,
      });
      k.drawRect({
        color: skyBandColor,
        height: 5,
        pos: k.vec2(0, 40),
        width: 320,
      });
      k.drawRect({
        color: trimColor,
        height: 5,
        pos: k.vec2(0, 49),
        width: 320,
      });
      k.drawRect({
        color: groundColor,
        height: 180 - HORIZON_Y,
        pos: k.vec2(0, HORIZON_Y),
        width: 320,
      });

      for (let y = HORIZON_Y; y < 180; y += STRIP_H) {
        const nextY = Math.min(180, y + STRIP_H);
        const c = centerX(y);
        const nextC = centerX(nextY);
        const half = roadHalfAt(y);
        const nextHalf = roadHalfAt(nextY);
        const shoulder = half + shoulderWidthAt(y);
        const nextShoulder = nextHalf + shoulderWidthAt(nextY);

        k.drawPolygon({
          color: trimColor,
          pts: [
            k.vec2(c - shoulder, y),
            k.vec2(nextC - nextShoulder, nextY),
            k.vec2(nextC + nextShoulder, nextY),
            k.vec2(c + shoulder, y),
          ],
        });
        k.drawPolygon({
          color: roadColor,
          pts: [
            k.vec2(c - half, y),
            k.vec2(nextC - nextHalf, nextY),
            k.vec2(nextC + nextHalf, nextY),
            k.vec2(c + half, y),
          ],
        });

        const worldY = y + scroll;
        if (((worldY % 36) + 36) % 36 < 18) {
          const laneHalf = half * 0.34;
          const nextLaneHalf = nextHalf * 0.34;
          const markerWidth = Math.max(1, Math.round(perspectiveAt(y) * 3));
          k.drawLine({
            color: dashColor,
            p1: k.vec2(c - laneHalf, y),
            p2: k.vec2(nextC - nextLaneHalf, nextY),
            width: markerWidth,
          });
          k.drawLine({
            color: dashColor,
            p1: k.vec2(c + laneHalf, y),
            p2: k.vec2(nextC + nextLaneHalf, nextY),
            width: markerWidth,
          });
        }

        if (((worldY % 48) + 48) % 48 < STRIP_H) {
          const depth = perspectiveAt(y);
          const postWidth = Math.max(1, Math.round(1 + depth * 3));
          const postHeight = Math.max(2, Math.round(3 + depth * 10));
          const postGap = 8 + depth * 12;
          k.drawRect({
            color: postColor,
            height: postHeight,
            pos: k.vec2(c - shoulder - postGap, y - postHeight),
            width: postWidth,
          });
          k.drawRect({
            color: postColor,
            height: postHeight,
            pos: k.vec2(c + shoulder + postGap, y - postHeight),
            width: postWidth,
          });
        }
      }
    });

    // Brief road flash confirming the start.
    const flash = k.add([
      k.rect(320, 180),
      k.pos(0, 0),
      k.color(...rgb(12)),
      k.opacity(0.55),
      k.fixed(),
      k.z(90),
    ]);
    flash.onUpdate(() => {
      flash.opacity -= k.dt() * 2.2;
      if (flash.opacity <= 0) {
        flash.destroy();
      }
    });

    const player = spawnCar(k, 160);

    const puff = (
      x: number,
      y: number,
      colorIdx: number,
      count: number,
      spread: number
    ): void => {
      for (let i = 0; i < count; i++) {
        const dir = k.vec2(rng() * 2 - 1, rng() * 1.4 - 0.2).unit();
        k.add([
          k.rect(2, 2),
          k.pos(x + (rng() - 0.5) * spread, y + (rng() - 0.5) * spread),
          k.color(...rgb(colorIdx)),
          k.move(dir, 30 + rng() * 50),
          k.opacity(1),
          k.lifespan(0.35, { fade: 0.25 }),
          k.z(50),
        ]);
      }
    };

    const endRun = (won: boolean, cause: string): void => {
      if (ended) {
        return;
      }
      ended = true;
      markOutcome(run, won, cause);
      playSfx(won ? "win" : "lose");
      k.wait(0.7, () => {
        k.go("gameover");
      });
    };

    const hitPlayer = (cause: "traffic" | "roadside"): void => {
      if (ended || invuln > 0) {
        return;
      }
      invuln = 1.5;
      slowTimer = 1.1;
      const dead = applyHit(run);
      playSfx("hit");
      k.shake(6);
      puff(player.pos.x, player.pos.y, 3, 8, 14);
      puff(player.pos.x, player.pos.y, 13, 6, 14);
      if (dead) {
        endRun(false, cause);
      }
    };

    const completeCheckpoint = (): void => {
      if (ended) {
        return;
      }
      playSfx("pickup");
      bannerTime = 1.2;
      banner.text = `${cfg.label} CLEAR`;
      const nextDuration = CHECKPOINTS[run.level]?.duration ?? cfg.duration;
      const outcome = applyCheckpoint(run, FINAL_CHECKPOINT, nextDuration);
      if (outcome === "win") {
        endRun(true, "finish");
        return;
      }
      cfg = cfgFor();
      distance = 0;
    };

    player.onCollide("traffic", (car) => {
      if (ended || invuln > 0) {
        return;
      }
      puff(car.pos.x, car.pos.y, 3, 8, 14);
      car.destroy();
      hitPlayer("traffic");
    });

    player.onCollide("fuel", (can) => {
      if (ended) {
        return;
      }
      puff(can.pos.x, can.pos.y, 4, 6, 10);
      can.destroy();
      applyFuel(run, cfg.duration);
      playSfx("pickup");
    });

    // HUD
    const hudTopLeft = k.add([
      k.text("", { size: 8 }),
      k.pos(4, 4),
      k.color(...rgb(12)),
      k.fixed(),
      k.z(100),
    ]);
    const hudTopRight = k.add([
      k.text("", { size: 8 }),
      k.pos(316, 4),
      k.anchor("topright"),
      k.color(...rgb(12)),
      k.fixed(),
      k.z(100),
    ]);
    const boostLabel = k.add([
      k.text("BOOST", { size: 8 }),
      k.pos(4, 168),
      k.color(...rgb(13)),
      k.fixed(),
      k.z(100),
    ]);
    void boostLabel;
    k.add([
      k.rect(42, 6),
      k.pos(46, 168),
      k.color(...rgb(15)),
      k.fixed(),
      k.z(100),
    ]);
    const boostFill = k.add([
      k.rect(40, 4),
      k.pos(47, 169),
      k.color(...rgb(11)),
      k.fixed(),
      k.z(101),
    ]);
    k.add([
      k.rect(62, 5),
      k.pos(129, 14),
      k.color(...rgb(15)),
      k.fixed(),
      k.z(100),
    ]);
    const progressFill = k.add([
      k.rect(1, 3),
      k.pos(130, 15),
      k.color(...rgb(4)),
      k.fixed(),
      k.z(101),
    ]);
    const banner = k.add([
      k.text("", { size: 10 }),
      k.pos(160, 60),
      k.anchor("center"),
      k.color(...rgb(4)),
      k.opacity(0),
      k.fixed(),
      k.z(102),
    ]);
    const pauseLabel = k.add([
      k.text("PAUSED - ESC RESUMES", { size: 10 }),
      k.pos(160, 90),
      k.anchor("center"),
      k.color(...rgb(12)),
      k.opacity(0),
      k.fixed(),
      k.z(102),
    ]);

    k.onButtonPress("pause", () => {
      if (ended || run.state !== "playing") {
        return;
      }
      run.paused = !run.paused;
      playSfx("select");
    });

    k.onButtonPress("jump", () => {
      if (ended || run.paused || run.state !== "playing") {
        return;
      }
      const started = startBoost(run, boostTime);
      if (started !== null) {
        boostTime = started;
        playSfx("shoot");
      }
    });

    const pickLane = (): number =>
      LANE_OFFSETS[Math.floor(rng() * LANE_OFFSETS.length)] ?? 0;

    const spawnTrafficWave = (): void => {
      const lane = pickLane();
      const car = spawnTraffic(k, lane);
      car.pos.x = laneScreenX(car.pos.y, lane);
      traffic.push(car);
      if (rng() < cfg.pairChance) {
        const others = LANE_OFFSETS.filter((o) => o !== lane);
        const second = others[Math.floor(rng() * others.length)] ?? -lane;
        const extra = spawnTraffic(k, second);
        extra.pos.y = -48;
        extra.pos.x = laneScreenX(extra.pos.y, second);
        traffic.push(extra);
      }
    };

    k.onUpdate(() => {
      pauseLabel.opacity = run.paused ? 1 : 0;
      if (ended || run.paused || run.state !== "playing") {
        return;
      }
      const dt = k.dt();

      // Clock.
      if (tickTimer(run, dt)) {
        endRun(false, "time");
        return;
      }

      // Throttle.
      let driveDirection: -1 | 0 | 1 = 0;
      if (k.isButtonDown("up")) {
        driveDirection = -1;
        cruise = Math.min(CRUISE_MAX, cruise + 90 * dt);
      }
      if (k.isButtonDown("down")) {
        driveDirection = 1;
        cruise = Math.max(CRUISE_MIN, cruise - 120 * dt);
      }
      playerY = movePlayerY(playerY, driveDirection, dt);
      player.pos.y = playerY;
      let speed = cruise + cfg.speedBonus;
      if (k.isButtonDown("action")) {
        speed = Math.max(70, speed - 80);
      }
      if (boostTime > 0) {
        boostTime -= dt;
        speed += BOOST_BONUS;
        streakTimer -= dt;
        if (streakTimer <= 0) {
          streakTimer = 0.04;
          k.add([
            k.rect(2, 8),
            k.pos(player.pos.x + (rng() - 0.5) * 10, player.pos.y + 8),
            k.color(...rgb(12)),
            k.move(k.vec2(0, 1), 120),
            k.opacity(0.9),
            k.lifespan(0.25, { fade: 0.2 }),
            k.z(18),
          ]);
        }
      } else if (run.boostMeter < 1) {
        run.boostMeter = Math.min(1, run.boostMeter + dt / BOOST_RECHARGE);
      }
      run.boostActive = boostTime > 0;
      if (slowTimer > 0) {
        slowTimer -= dt;
        speed *= 0.55;
      }

      distance += speed * dt;
      scroll += speed * dt;
      bend = cfg.bendAmplitude * Math.min(1, distance / 300);

      // Steering.
      let steer = 0;
      if (k.isButtonDown("left")) {
        steer -= 1;
      }
      if (k.isButtonDown("right")) {
        steer += 1;
      }
      playerOffset = steerOffset(playerOffset, steer, dt);
      if (steer !== 0) {
        dustTimer -= dt;
        if (dustTimer <= 0) {
          dustTimer = 0.09;
          puff(player.pos.x - steer * 7, player.pos.y + 6, 4, 1, 4);
        }
      }

      // Roadside check: one scrape is one hit, then back onto the asphalt.
      const roadside = roadsideCheck(playerOffset);
      playerOffset = roadside.offset;
      if (roadside.hit) {
        hitPlayer("roadside");
      }

      player.pos.x = playerScreenX(
        centerX(playerY),
        playerOffset * (roadHalfAt(playerY) / ROAD_HALF)
      );
      run.playerX = player.pos.x;
      run.playerY = playerY;

      // Invulnerability flicker.
      if (invuln > 0) {
        invuln -= dt;
        player.opacity = Math.floor(invuln * 12) % 2 === 0 ? 1 : 0.35;
      } else {
        player.opacity = 1;
      }

      // Spawns.
      trafficTimer -= dt;
      if (trafficTimer <= 0) {
        trafficTimer = cfg.trafficGap;
        spawnTrafficWave();
      }
      fuelTimer -= dt;
      if (fuelTimer <= 0) {
        fuelTimer = cfg.fuelGap;
        const lane = pickLane();
        const can = spawnFuel(k, lane);
        can.pos.x = laneScreenX(can.pos.y, lane);
        cans.push(can);
      }

      // Traffic flows toward the player.
      for (let i = traffic.length - 1; i >= 0; i--) {
        const car = traffic[i];
        if (!car?.exists()) {
          traffic.splice(i, 1);
          continue;
        }
        car.pos.y += (speed - cfg.trafficSpeed) * dt;
        car.pos.x = laneScreenX(car.pos.y, car.laneOffset);
        if (car.pos.y > 200) {
          traffic.splice(i, 1);
          car.destroy();
          applyPass(run);
          playSfx("pickup");
          puff(player.pos.x, player.pos.y - 10, 12, 4, 10);
        }
      }

      // Fuel cans sit on the asphalt.
      for (let i = cans.length - 1; i >= 0; i--) {
        const can = cans[i];
        if (!can?.exists()) {
          cans.splice(i, 1);
          continue;
        }
        can.pos.y += speed * dt;
        can.pos.x = laneScreenX(can.pos.y, can.laneOffset);
        if (can.pos.y > 200) {
          cans.splice(i, 1);
          can.destroy();
        }
      }

      // Checkpoint progress.
      if (distance >= cfg.distanceTarget) {
        completeCheckpoint();
      }

      // Banner flash.
      if (bannerTime > 0) {
        bannerTime -= dt;
        banner.opacity = Math.floor(bannerTime * 10) % 2 === 0 ? 1 : 0.3;
        if (bannerTime <= 0) {
          banner.opacity = 0;
        }
      }

      // HUD refresh.
      hudTopLeft.text = `SCORE ${run.score}\nLIVES ${run.lives}`;
      hudTopRight.text = `TIME ${Math.ceil(run.timer)}\nCP ${run.level}/3`;
      boostFill.width = Math.max(1, Math.floor(40 * run.boostMeter));
      progressFill.width = Math.max(
        1,
        Math.floor(60 * Math.min(1, distance / cfg.distanceTarget))
      );
    });
  });
};
