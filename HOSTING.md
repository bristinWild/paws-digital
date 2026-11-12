# Hosting PAWS — Wild Ventures (browser playtest)

This folder is a complete, self-contained package: a built Node server plus the
pre-built game client and art. No build step, no `npm install`, no database.

## Requirements

- Node.js **22 or newer**. Check with `node --version`.
- That's it. There are no runtime dependencies at all (the game has none —
  `package.json` just carries the `start` script and the Node version floor).

## Run it locally

```
node server.mjs
```

or, equivalently:

```
npm start
```

It prints the URL to open, e.g. `PAWS try-first: http://localhost:8990/`.
Open that in a browser. Share your LAN address (also printed) so other
devices on the same network can join without any extra setup.

### Configuration (environment variables)

| Variable        | Default                                  | Purpose                                   |
| --------------- | ----------------------------------------- | ------------------------------------------ |
| `PORT`          | `8990`                                    | TCP port the server listens on             |
| `HOST`          | `0.0.0.0`                                 | Bind address (already listens on all interfaces) |
| `PAWS_DATA_DIR` | the OS temp dir (e.g. `/tmp/paws-try-first-rooms`) | Where room saves are written — see below |

Example:

```
PORT=8080 PAWS_DATA_DIR=/var/lib/paws-rooms node server.mjs
```

## Running on a VPS / Render / Fly / Railway

The server is a single plain Node process with no build step and no database,
so any "run a Node app" host works the same way:

1. Upload/clone this folder onto the host.
2. Set `PORT` (most platform-as-a-service hosts set this for you — the server
   already reads `process.env.PORT`), and set `PAWS_DATA_DIR` to a path on a
   **persistent** disk/volume if the platform offers one (see "Room saves"
   below — this matters more than it sounds like it should).
3. Start command: `node server.mjs` (or `npm start`).
4. Point a domain/HTTPS at it (see reverse proxy notes next) — platforms like
   Render, Fly and Railway terminate HTTPS for you automatically; a plain VPS
   needs a reverse proxy (nginx/Caddy) in front, below.

### Behind an HTTPS reverse proxy

**There is no WebSocket here.** Multiplayer sync uses **Server-Sent Events**
(SSE) on `GET /api/events` — a long-lived, one-directional HTTP response the
browser keeps open. This matters for proxy config because the usual
WebSocket-upgrade instructions don't apply, but SSE has its own gotcha:
**the proxy must not buffer the response**, or players won't see live
updates until the buffer flushes (or never, if it waits for the response to
end — which it won't, until they close the tab).

The server already sends `X-Accel-Buffering: no` on that endpoint (nginx's
own signal to disable buffering for it), but older nginx configs or other
proxies may need it set explicitly. For **nginx**, in the `location /` (or a
`location /api/events`) block:

```nginx
location / {
    proxy_pass http://127.0.0.1:8990;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 1h;
}
```

For **Caddy** (buffering is off by default for streamed responses, so this is
usually just):

```
example.com {
    reverse_proxy 127.0.0.1:8990
}
```

If you're behind Cloudflare or a similar CDN proxy, make sure caching is
disabled for `/api/*` paths (it already sends `Cache-Control: no-store`/
`no-cache` on those, which most CDNs respect, but double check if updates
seem delayed).

### Docker (optional)

A `Dockerfile` is included if you'd rather run it in a container:

```
docker build -t paws-try-first .
docker run -p 8990:8990 -v paws-rooms:/data paws-try-first
```

This bakes in `PAWS_DATA_DIR=/data` and mounts a named volume so room saves
survive container restarts/recreates. Swap in your own reverse proxy /
TLS-terminating load balancer in front of the container the same way as above.

## Room saves, and restart behaviour

Every room (a "Play with friends" table, or a "Play with bots" table) is
saved as a small JSON file in `PAWS_DATA_DIR`, one file per room, rewritten
after every move. **On server startup, any room file updated within the last
7 days is reloaded automatically** — so stopping and restarting the server
(a deploy, a crash recovery, a platform redeploy) does **not** lose
in-progress games; players just reconnect with their existing room code and
pick up where they left off. Rooms older than 7 days are pruned.

The one thing that *can* lose games: if you leave `PAWS_DATA_DIR` unset, it
defaults to the OS temp directory, which some hosts (containers especially)
wipe on every restart or redeploy. **Set `PAWS_DATA_DIR` to a path on
persistent storage** if you want rooms to survive a restart — a mounted
volume on a VPS, a Docker named volume (already wired up above), or a
platform's persistent-disk feature. Learn-to-play and solo games are also
rooms under the hood and follow the same rule.

## Safety note (please read before sharing the link)

**Anyone with the URL or a room's 6-character code can open the game and
join that room.** There is no login, password, or access gate of any kind —
not a missing feature so much as a deliberate simplicity for a private
playtest. If you want to restrict who can reach it, that has to happen
*outside* the game: put it behind your reverse proxy's HTTP basic auth, a VPN,
an allowlisted IP range, or just don't publicize the URL. Treat the link the
way you'd treat an unlisted Google Doc — not secret, but not indexed or
guessable either, since room codes are short.

A couple of smaller things worth knowing before a playtest session:

- This is a playtest build: Naledi's in-game advice is a one-move-ahead
  helper, not a perfect player, and can be wrong — that's expected.
- A guided "Learn to play" game always deals the same fixed hand, by design.
- There's no spectator mode, no accounts, and no matchmaking — everyone
  joins by sharing the room code/link directly.
- If a player's browser disconnects mid-game, their seat can be taken over by
  the host after a 10-second grace period; reconnecting with the same link
  reclaims the seat.
