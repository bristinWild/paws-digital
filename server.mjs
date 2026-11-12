import http from "node:http";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {
  newGame,
  applyCommand,
  viewFor,
  awaiting,
} from "./public/build/engine.js";
import { recommend } from "./public/build/advisor.js";
import { GUIDED_SEED } from "./public/build/tutorial.js";
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8990),
  host = process.env.HOST || "0.0.0.0";
const dataDir =
  process.env.PAWS_DATA_DIR || path.join(os.tmpdir(), "paws-try-first-rooms");
fs.mkdirSync(dataDir, { recursive: true });
const rooms = new Map(),
  streams = new Map(),
  lastSeen = new Map(),
  lastPresence = new Map(),
  botTimers = new Map(),
  botGuard = new Map();
// Fill-the-empty-seats bots take one turn step at a time, at a human pace,
// instead of resolving a whole table of bots between one tick and the next.
const BOT_STEP_MS = 550,
  BOT_STEP_LIMIT = 3000;
/**
 * Advances a "bots" table one decision at a time on a timer, broadcasting
 * after each so connected clients watch bot turns happen rather than jump.
 * Idempotent and safe to call after anything that may have moved the game
 * on: it no-ops once a human (or no seat at all) is awaited, and it never
 * resets a timer already pending for this room, so a caller that happens to
 * poll faster than the step delay (an SSE reconnect, `/api/resume`, …) can
 * never push the next bot step out of reach by repeatedly restarting its
 * clock.
 */
function scheduleBotStep(r) {
  if (!r.game || r.game.phase === "over") {
    botGuard.delete(r.code);
    return;
  }
  const dm = awaiting(r.game);
  if (dm === null || !r.game.players[dm].auto) {
    botGuard.delete(r.code);
    return;
  }
  if (botTimers.has(r.code)) return;
  const guard = (botGuard.get(r.code) ?? 0) + 1;
  if (guard > BOT_STEP_LIMIT) {
    console.error(
      `Room ${r.code}: bot autoplay exceeded ${BOT_STEP_LIMIT} steps; stopping.`,
    );
    return;
  }
  botGuard.set(r.code, guard);
  botTimers.set(
    r.code,
    setTimeout(() => {
      botTimers.delete(r.code);
      const room = rooms.get(r.code);
      if (!room || !room.game || room.game.phase === "over") return;
      const d = awaiting(room.game);
      if (d === null || !room.game.players[d].auto) return;
      try {
        // Decide from the seat's own masked view, never the authoritative
        // state: a bot must not see another player's hidden information.
        const seatId = room.game.players[d].id;
        room.game = applyCommand(
          room.game,
          seatId,
          recommend(viewFor(room.game, seatId), d),
        );
      } catch (err) {
        console.error(`Room ${room.code}: bot step failed.`, err);
        return;
      }
      persist(room);
      broadcast(room);
      scheduleBotStep(room);
    }, BOT_STEP_MS),
  );
}
for (const file of fs
  .readdirSync(dataDir)
  .filter((f) => /^[A-Z0-9]{6}\.json$/.test(f))) {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
    if (Date.now() - r.updated < 7 * 86400000) {
      rooms.set(r.code, r);
      for (const p of r.seats) lastSeen.set(`${r.code}:${p.id}`, Date.now());
    }
  } catch {}
}
const secret = () => randomBytes(24).toString("hex");
function persist(r) {
  r.updated = Date.now();
  const f = path.join(dataDir, `${r.code}.json`);
  fs.writeFileSync(`${f}.tmp`, JSON.stringify(r), { mode: 0o600 });
  fs.renameSync(`${f}.tmp`, f);
}
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
function room(code) {
  const r = rooms.get(String(code ?? "").toUpperCase());
  if (!r)
    fail("Room not found. Check the code and use the same host address.", 404);
  return r;
}
function seat(r, token) {
  const p = r.seats.find((p) => p.token === token);
  if (!p)
    fail("Your seat could not be restored. Join with the room code.", 401);
  return p;
}
function online(r, id) {
  return (streams.get(`${r.code}:${id}`)?.size ?? 0) > 0;
}
function snapshot(r, token) {
  const p = seat(r, token);
  return {
    code: r.code,
    you: p.id,
    host: r.host,
    mode: r.mode,
    started: !!r.game,
    players: r.seats.map((x) => ({
      id: x.id,
      name: x.name,
      online: online(r, x.id),
      canTakeover:
        !x.auto &&
        !online(r, x.id) &&
        Date.now() - (lastSeen.get(`${r.code}:${x.id}`) ?? 0) > 10000,
    })),
    game: r.game ? viewFor(r.game, p.id) : null,
  };
}
function presence(r) {
  return r.seats
    .map(
      (p) =>
        `${p.id}:${online(r, p.id)}:${!online(r, p.id) && Date.now() - (lastSeen.get(`${r.code}:${p.id}`) ?? 0) > 10000}`,
    )
    .join("|");
}
function broadcast(r) {
  lastPresence.set(r.code, presence(r));
  for (const p of r.seats)
    for (const res of streams.get(`${r.code}:${p.id}`) ?? []) {
      res.write(`data: ${JSON.stringify(snapshot(r, p.token))}\n\n`);
    }
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
function name(value) {
  const n = String(value ?? "").trim();
  if (!n || n.length > 24) fail("Use a name between 1 and 24 characters.");
  return n;
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16000) fail("Request too large.", 413);
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    fail("Invalid JSON.");
  }
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/events") {
      const r = room(url.searchParams.get("code")),
        p = seat(r, url.searchParams.get("token")),
        key = `${r.code}:${p.id}`;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");
      if (!streams.has(key)) streams.set(key, new Set());
      streams.get(key).add(res);
      lastSeen.set(key, Date.now());
      broadcast(r);
      scheduleBotStep(r);
      req.on("close", () => {
        streams.get(key)?.delete(res);
        lastSeen.set(key, Date.now());
        broadcast(r);
      });
      return;
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      // Same-origin requests only; room secrets are never embedded in share links.
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        fail("Use the game’s own page for this request.", 403);
      const b = await body(req);
      if (url.pathname === "/api/create") {
        let code;
        do {
          code = Array.from(
            randomBytes(6),
            (v) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[v % 32],
          ).join("");
        } while (rooms.has(code));
        const p = {
          id: secret().slice(0, 12),
          name: name(b.name),
          token: secret(),
        };
        const r = {
          code,
          host: p.id,
          seats: [p],
          mode:
            b.mode === "solo" ? "solo" : b.mode === "bots" ? "bots" : "friends",
          game: null,
          updated: Date.now(),
        };
        if (r.mode === "solo")
          r.game = newGame(
            [
              { id: p.id, name: p.name },
              { id: "naledi", name: "Naledi", bot: true },
            ],
            {
              length: Number(b.length) || 4,
              tutorial: !!b.tutorial,
              seed: b.tutorial ? GUIDED_SEED : undefined,
            },
          );
        lastSeen.set(`${code}:${p.id}`, Date.now());
        rooms.set(code, r);
        persist(r);
        json(res, 200, { token: p.token, ...snapshot(r, p.token) });
        return;
      }
      const r = room(b.code);
      if (url.pathname === "/api/join") {
        if (r.game)
          fail(
            "This game has started. Reconnect using the browser that holds your seat.",
          );
        if (r.seats.length >= 5) fail("This room already has 5 players.");
        const p = {
          id: secret().slice(0, 12),
          name: name(b.name),
          token: secret(),
        };
        r.seats.push(p);
        lastSeen.set(`${r.code}:${p.id}`, Date.now());
        persist(r);
        broadcast(r);
        json(res, 200, { token: p.token, ...snapshot(r, p.token) });
        return;
      }
      const p = seat(r, b.token);
      if (url.pathname === "/api/resume") {
        json(res, 200, snapshot(r, p.token));
        scheduleBotStep(r);
        return;
      }
      if (url.pathname === "/api/start") {
        if (p.id !== r.host) fail("The host starts the game.", 403);
        if (r.game) fail("The game has already started.");
        if (r.mode === "bots") {
          const target = Math.min(5, Math.max(2, Number(b.seats) || 4));
          let n = 1;
          while (r.seats.length < target) {
            r.seats.push({
              id: `bot:${n}`,
              name: `Bot ${n}`,
              token: null,
              auto: true,
            });
            n++;
          }
        } else if (r.seats.length < 2) fail("Invite at least one friend.");
        r.game = newGame(r.seats, { length: Number(b.length) || 4 });
        persist(r);
        broadcast(r);
        json(res, 200, snapshot(r, p.token));
        scheduleBotStep(r);
        return;
      }
      if (url.pathname === "/api/command") {
        if (!r.game) fail("Start the game first.");
        if (b.revision !== r.game.revision)
          fail(
            "The table changed. Your view has been refreshed; choose again.",
            409,
          );
        let actor = p.id;
        if (b.actingAs && b.actingAs !== actor) {
          const target = r.seats.find((x) => x.id === b.actingAs);
          if (
            p.id !== r.host ||
            !target ||
            target.auto ||
            online(r, target.id) ||
            Date.now() - (lastSeen.get(`${r.code}:${target.id}`) ?? 0) < 10000
          )
            fail(
              "Only the host may cover a seat disconnected for 10 seconds.",
              403,
            );
          actor = target.id;
        }
        r.game = applyCommand(r.game, actor, b.command);
        persist(r);
        broadcast(r);
        json(res, 200, snapshot(r, p.token));
        scheduleBotStep(r);
        return;
      }
      fail("Unknown operation.", 404);
    }
    if (req.method !== "GET" && req.method !== "HEAD")
      fail("Method not allowed.", 405);
    if (url.pathname === "/health") {
      json(res, 200, { ok: true, rooms: rooms.size });
      return;
    }
    const relative = decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    );
    const file = path.resolve(root, "public", `.${relative}`);
    if (!file.startsWith(path.join(root, "public") + path.sep))
      fail("Not found.", 404);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile())
      fail("Not found.", 404);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": file.includes("/assets/")
        ? "public, max-age=86400"
        : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
  } catch (error) {
    json(res, error.status || 400, {
      error: error.message || "Request failed.",
    });
  }
});
let heartbeatTicks = 0;
const heartbeat = setInterval(() => {
  heartbeatTicks++;
  for (const r of rooms.values())
    if (lastPresence.get(r.code) !== presence(r)) broadcast(r);
  if (heartbeatTicks % 5 === 0)
    for (const values of streams.values())
      for (const res of values) res.write(": heartbeat\n\n");
}, 1000);
heartbeat.unref();
server.listen(port, host, () => {
  console.log(`PAWS try-first: http://localhost:${server.address().port}/`);
  for (const iface of Object.values(os.networkInterfaces()).flat())
    if (iface?.family === "IPv4" && !iface.internal)
      console.log(`LAN: http://${iface.address}:${port}/`);
  console.log(`Room saves: ${dataDir}`);
});
