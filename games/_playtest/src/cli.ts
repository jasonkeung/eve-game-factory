#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { arcadeScript } from "./genres/arcade.js";
import { platformerScript } from "./genres/platformer.js";
import { puzzleScript } from "./genres/puzzle.js";
import { shmupScript } from "./genres/shmup.js";
import type {
  CheckResult,
  GameSeamSnapshot,
  Genre,
  GenreContext,
  PlaytestReport,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

const GENRES: Record<Genre, typeof platformerScript> = {
  arcade: arcadeScript,
  platformer: platformerScript,
  puzzle: puzzleScript,
  shmup: shmupScript,
};

const parseArgs = (argv: string[]) => {
  const args = argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--"));
  let genre: Genre = "platformer";
  const gi = args.indexOf("--genre");
  if (gi >= 0 && args[gi + 1]) {
    genre = args[gi + 1] as Genre;
  }
  if (!slug) {
    console.error(
      "Usage: pnpm playtest <slug> [--genre platformer|shmup|arcade|puzzle]"
    );
    process.exit(2);
  }
  if (!(genre in GENRES)) {
    console.error(`Unknown genre: ${genre}`);
    process.exit(2);
  }
  return { genre, slug };
};

const mime = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".map": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
  };
  return map[ext] ?? "application/octet-stream";
};

const serveStatic = async (
  dir: string
): Promise<{ port: number; close: () => Promise<void> }> => {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    try {
      const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
      const rel = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = path.normalize(path.join(dir, rel));
      if (!filePath.startsWith(dir)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": mime(filePath) });
      createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("failed to bind playtest server");
  }
  return {
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
    port: addr.port,
  };
};

const buildGame = async (slug: string): Promise<string> => {
  const gameDir = path.join(ROOT, "games", slug);
  if (!existsSync(gameDir)) {
    throw new Error(`Game not found: games/${slug}`);
  }
  const { build } = await import("vite");
  const outDir = path.join(ROOT, "games", "dist", slug);
  await build({
    base: "./",
    build: {
      emptyOutDir: true,
      outDir,
    },
    configFile: path.join(gameDir, "vite.config.ts"),
    logLevel: "error",
    root: gameDir,
  });
  return outDir;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Launch headless chromium, self-provisioning on a clean station. When the
 * first launch fails (missing browser download or missing OS libraries such
 * as libglib-2.0.so.0), run Playwright's supported setup command
 * `playwright install --with-deps chromium` and retry once. The command is
 * idempotent, uses sudo automatically for the apt step when not root, and is
 * the same route Playwright documents for CI machines.
 */
const launchChromium = async () => {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    console.error(
      `chromium launch failed (${err instanceof Error ? err.message.split("\n")[0] : String(err)}); ` +
        "running `playwright install --with-deps chromium` and retrying"
    );
    const install = spawnSync(
      "pnpm",
      ["exec", "playwright", "install", "--with-deps", "chromium"],
      { cwd: ROOT, stdio: "inherit" }
    );
    if (install.status !== 0) {
      throw new Error(
        `playwright install --with-deps chromium exited with ${String(install.status)}`,
        { cause: err }
      );
    }
    return await chromium.launch({ headless: true });
  }
};

const main = async () => {
  const { slug, genre } = parseArgs(process.argv);
  const outDir = await buildGame(slug);
  const server = await serveStatic(outDir);
  const playtestDir = path.join(ROOT, "games", slug, "playtest");
  await mkdir(playtestDir, { recursive: true });

  const checks: CheckResult[] = [];
  const consoleErrors: string[] = [];
  const screenshots: string[] = [];

  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { height: 540, width: 960 } });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  // Seed for determinism
  await page.addInitScript(() => {
    (window as unknown as { __seed: number }).__seed = 42;
  });

  const url = `http://127.0.0.1:${server.port}/`;
  await page.goto(url, { timeout: 30_000, waitUntil: "domcontentloaded" });

  // Wait for __ready
  try {
    await page.waitForFunction(
      () => {
        const w = window as unknown as {
          __ready?: Promise<void>;
          __game?: unknown;
        };
        return Boolean(w.__ready) && Boolean(w.__game);
      },
      { timeout: 20_000 }
    );
    await page.evaluate(async () => {
      const w = window as unknown as { __ready?: Promise<void> };
      if (w.__ready) {
        await w.__ready;
      }
    });
    checks.push({
      evidence: "window.__ready resolved",
      id: "ready",
      passed: true,
    });
    // Ensure the game canvas has keyboard focus for scripted input.
    await page.locator("canvas").first().click({ force: true });
    await page.evaluate(() => {
      const c = document.querySelector("canvas");
      c?.focus();
      c?.setAttribute("tabindex", "0");
    });
  } catch (err) {
    checks.push({
      evidence: `ready timeout: ${err instanceof Error ? err.message : String(err)}`,
      id: "ready",
      passed: false,
    });
  }

  const getSeam = async (): Promise<GameSeamSnapshot | null> =>
    page.evaluate(() => {
      const g = (window as unknown as { __game?: GameSeamSnapshot }).__game;
      return g ? structuredClone(g) : null;
    });

  const waitForState = async (
    state: GameSeamSnapshot["state"],
    timeoutMs = 10_000
  ): Promise<GameSeamSnapshot> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const s = await getSeam();
      if (s?.state === state) {
        return s;
      }
      await sleep(100);
    }
    const last = await getSeam();
    throw new Error(
      `timeout waiting for state=${state}; last=${last ? JSON.stringify(last) : "null"}`
    );
  };

  const press = async (key: string, ms = 50) => {
    await page.evaluate(
      ({ key, ms }) =>
        new Promise<void>((resolve) => {
          const down = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            code:
              key === " "
                ? "Space"
                : key === "Enter"
                  ? "Enter"
                  : `Key${key.toUpperCase()}`,
            key,
            keyCode:
              key === "Enter"
                ? 13
                : key === " "
                  ? 32
                  : key.toUpperCase().charCodeAt(0),
            which:
              key === "Enter"
                ? 13
                : key === " "
                  ? 32
                  : key.toUpperCase().charCodeAt(0),
          });
          window.dispatchEvent(down);
          document.dispatchEvent(down);
          const canvas = document.querySelector("canvas");
          canvas?.dispatchEvent(down);
          setTimeout(() => {
            const up = new KeyboardEvent("keyup", {
              bubbles: true,
              cancelable: true,
              code:
                key === " "
                  ? "Space"
                  : key === "Enter"
                    ? "Enter"
                    : `Key${key.toUpperCase()}`,
              key,
              keyCode:
                key === "Enter"
                  ? 13
                  : key === " "
                    ? 32
                    : key.toUpperCase().charCodeAt(0),
              which:
                key === "Enter"
                  ? 13
                  : key === " "
                    ? 32
                    : key.toUpperCase().charCodeAt(0),
            });
            window.dispatchEvent(up);
            document.dispatchEvent(up);
            canvas?.dispatchEvent(up);
            resolve();
          }, ms);
        }),
      {
        key:
          key === "Space"
            ? " "
            : key === "ArrowRight"
              ? "ArrowRight"
              : key === "ArrowLeft"
                ? "ArrowLeft"
                : key === "ArrowUp"
                  ? "ArrowUp"
                  : key === "ArrowDown"
                    ? "ArrowDown"
                    : key === "Enter"
                      ? "Enter"
                      : key.length === 1
                        ? key
                        : key,
        ms,
      }
    );
    // Also send via Playwright CDP keyboard for engines that ignore synthetic events
    try {
      await page.keyboard.press(key === " " ? "Space" : key);
    } catch {
      // ignore unknown keys
    }
  };

  const hold = async (keys: string[], ms: number) => {
    for (const key of keys) {
      await page.keyboard.down(key);
      await page.evaluate((key) => {
        const mapKey = key === "Space" ? " " : key;
        const ev = new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: mapKey,
        });
        window.dispatchEvent(ev);
        document.querySelector("canvas")?.dispatchEvent(ev);
      }, key);
    }
    await sleep(ms);
    for (const key of keys) {
      await page.keyboard.up(key);
      await page.evaluate((key) => {
        const mapKey = key === "Space" ? " " : key;
        const ev = new KeyboardEvent("keyup", {
          bubbles: true,
          cancelable: true,
          key: mapKey,
        });
        window.dispatchEvent(ev);
      }, key);
    }
  };

  const screenshot = async (
    name: "title" | "gameplay" | "end"
  ): Promise<string> => {
    const file = path.join(playtestDir, `${name}.png`);
    await page.screenshot({ path: file, type: "png" });
    const rel = path.relative(ROOT, file);
    screenshots.push(rel);
    return rel;
  };

  const addCheck = (id: string, ok: boolean, evidence: string) => {
    checks.push({ evidence, id, passed: ok });
  };

  const ctx: GenreContext = {
    addCheck,
    getSeam,
    hold,
    page: page as Page,
    press,
    screenshot,
    sleep,
    slug,
    waitForState,
  };

  try {
    if (checks.every((c) => c.id !== "ready" || c.passed)) {
      await GENRES[genre].run(ctx);
    }
  } catch (err) {
    addCheck(
      "genre-script",
      false,
      err instanceof Error ? err.message : String(err)
    );
  }

  const noConsoleErrors = consoleErrors.length === 0;
  addCheck(
    "no-console-errors",
    noConsoleErrors,
    noConsoleErrors ? "clean" : consoleErrors.join(" | ")
  );

  const passed = checks.every((c) => c.passed) && noConsoleErrors;
  const report: PlaytestReport = {
    checks,
    consoleErrors,
    passed,
    screenshots,
    slug,
  };

  const reportPath = path.join(playtestDir, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  await browser.close();
  await server.close();

  console.log(JSON.stringify(report, null, 2));
  console.log(`report: ${path.relative(ROOT, reportPath)}`);
  process.exit(passed ? 0 : 1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
