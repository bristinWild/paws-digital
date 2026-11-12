/**
 * Maps a game snapshot plus the viewer's pending choices onto table pieces.
 * Rules never live here: legal targets arrive precomputed in the View, and the
 * result is plain data for the stage (pieces, hotspots, labels, highlights).
 */
import { ACTION_NAMES, CARD, FOODS, GRID_BONUS, HABITAT_NAMES, SLOT_HABITATS, SOLO_DECKS, TILE, cardArt, cardName, } from "./data.js";
import { feedingForCard, feedingStatus } from "./feeding.js";
import * as L from "./layout.js";
/**
 * The hand fan is held up at the bottom of the screen: how high its cards
 * reach at rest (NDC), for a window shape and hand mode.
 */
export function handTop(aspect, hand) {
    const f = fan(aspect, hand);
    return f.ny + f.hf;
}
/** Height (half, NDC) and centre line of the hand fan's cards. */
function fan(aspect, hand) {
    const wide = aspect > 1.25;
    return {
        wide,
        hf: wide ? 0.3 : 0.15,
        // While a home is being chosen the fan sinks to a strip of names.
        ny: wide ? (hand === "peek" ? -1.04 : -0.86) : -0.42,
    };
}
/** How far a piece rises under the pointer when nothing is in its way. */
const HOVER_LIFT = 0.9;
/**
 * Pieces that carry other pieces: player mats, the Land Board, Region cards
 * (claimed Raindrops) and the Rain Dance tile (the die that paid for it). They
 * never move under the pointer.
 */
const SURFACE = /^(mat:|region:|rain$|board$)/;
/** A piece's footprint on the table: a rectangle, turned by its heading. */
function footprint({ spec, pose }) {
    // A hexagon fills less than its bounding box; neighbours must not count.
    const k = (pose.scale ?? 1) * (spec.shape.startsWith("hex") ? 0.7 : 1), a = pose.ry ?? 0;
    return {
        x: pose.x,
        z: pose.z,
        ux: Math.cos(a),
        uz: -Math.sin(a),
        hw: (spec.w * k) / 2,
        hh: (spec.h * k) / 2,
    };
}
/** Whether two footprints overlap (separating axes of two turned rectangles). */
function overlaps(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, reach = (q, ax, az) => q.hw * Math.abs(q.ux * ax + q.uz * az) +
        q.hh * Math.abs(-q.uz * ax + q.ux * az);
    for (const r of [a, b])
        for (const [ax, az] of [
            [r.ux, r.uz],
            [-r.uz, r.ux],
        ])
            if (Math.abs(dx * ax + dz * az) >= reach(a, ax, az) + reach(b, ax, az))
                return false;
    return true;
}
const topOf = ({ spec, pose }) => pose.y + spec.thick * (pose.scale ?? 1);
/**
 * How far the piece under the pointer may rise, and what rises with it. It goes
 * straight up and gets no wider, so the only things it can meet are those above
 * it: food tokens lying on it ride along, and anything else over it (the animal
 * on a tucked card, the next card in a crowded row, a tile of the next layer)
 * stops it. A piece with no room stays where it is.
 */
function hoverLift(items, key) {
    const piece = items.get(key);
    if (!piece || piece.pose.cam || SURFACE.test(key))
        return null;
    const lying = [...items].filter(([k, it]) => k !== key && !it.pose.cam), foot = footprint(piece), top = topOf(piece), riders = lying.filter(([, it]) => it.spec.shape === "token" &&
        it.pose.y >= top - 0.01 &&
        it.pose.y <= top + 0.15 &&
        overlaps(foot, footprint(it))), group = [piece, ...riders.map(([, it]) => it)], riding = new Set(riders.map(([k]) => k));
    let room = HOVER_LIFT;
    for (const member of group) {
        const f = footprint(member), t = topOf(member);
        for (const [k, it] of lying)
            if (!riding.has(k) && topOf(it) > t + 0.01 && overlaps(f, footprint(it)))
                room = Math.min(room, it.pose.y - t - 0.05);
    }
    return room < 0.25 ? null : { by: room, keys: [key, ...riding] };
}
/** How far a habitat pulls a carried card, and a Land Grid place its tile. */
const CARD_REACH = 13, TILE_REACH = 6.5;
const CARD_BACK = "Poker Cards/Animal Cards/Animal Card_Back.webp";
const FOOD_ART = {
    meat: 1,
    leaves: 2,
    bones: 4,
    bananas: 3,
};
export const foodArt = (f) => `Tokens/Food/Token Food ${FOOD_ART[f]}.webp`;
export const dropArt = (player) => `Tokens/Raindrop/Token Raindrop ${(player % 5) + 1}.webp`;
export const regionArt = (id) => `Tarot Cards/Region Cards/Region Card ${id}_Front.webp`;
export const soloArt = (id) => `Solo Mode Cards/Solo Card ${id}_Front.webp`;
export const RAIN_ART = "Tarot Cards/Rain Dance Tile/Rain Dance Tile_Front.webp";
const cardSpec = (id) => ({
    shape: "card",
    face: id ? cardArt(id) : CARD_BACK,
    back: id ? CARD_BACK : undefined,
    ...L.CARD,
});
const tileSpec = (id) => {
    const t = TILE[id];
    return {
        shape: `hex${t.size}`,
        face: t.art,
        back: t.art.replace("_Front", "_Back"),
        w: L.TILE.r * 2,
        h: [355, 709, 1063][t.size - 1] * L.PX,
        thick: L.TILE.thick,
    };
};
const token = (face, w, h) => ({
    shape: "token",
    face,
    w,
    h,
    thick: 0.32,
});
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** Where a card goes when it joins the viewer's hand, just below the screen. */
const HAND = { x: 0, y: 0, z: 0, cam: { nx: -0.05, ny: -1.55, hf: 0.3 } };
/** The lifted, face-on card of the concept's peak-action still. */
const HERO = { x: 0, y: 0, z: 0, cam: { nx: 0.3, ny: 0.06, hf: 0.38 } };
/** While a home is being chosen the card waits above the sanctuary, clear of every habitat. */
const HERO_PLACE = {
    x: 0,
    y: 0,
    z: 0,
    cam: { nx: 0.33, ny: 0.44, hf: 0.33 },
};
/** Naledi's ranger station faces the solo player so her cards stay readable. */
export const BOT_SEAT = { x: 0, z: -112, rot: 0 };
const soloDeck = (id) => Object.entries(SOLO_DECKS).find(([, ids]) => ids.includes(id))?.[0];
function soloSquare(deck) {
    const active = deck.startsWith("active"), action = deck.slice(active ? 6 : 7).toLowerCase();
    return [
        L.BOT_DECK_X[action] ?? 0,
        active ? L.BOT_DECK_Z.active : L.BOT_DECK_Z.passive,
    ];
}
export class Table {
    pool = [];
    poolValues = [];
    used = new Map();
    round = -1;
    uid = 0;
    wasInHand = new Set();
    lastKeys = new Set();
    state = null;
    /** Call once per new snapshot: keeps dice identities and the previous hand. */
    update(s, me) {
        const prev = this.state;
        this.wasInHand = new Set(prev?.players[me]?.hand.map((c) => c.id) ?? []);
        const next = () => "die:" + ++this.uid;
        if (!prev ||
            s.round !== this.round ||
            s.dice.length > this.poolValues.length) {
            this.pool = s.dice.map(next);
            this.used.clear();
            s.players.forEach((p, pi) => {
                for (const [a, value] of Object.entries(p.used))
                    this.used.set(`${pi}:${a}`, { uid: next(), value: value, spot: 0 });
            });
        }
        else if (s.dice.length === this.poolValues.length - 1) {
            let i = 0;
            while (i < s.dice.length && s.dice[i] === this.poolValues[i])
                i++;
            const [uid] = this.pool.splice(i, 1), value = this.poolValues[i];
            let key = "";
            s.players.forEach((p, pi) => {
                for (const [a, v] of Object.entries(p.used))
                    if (!key && v === value && !this.used.has(`${pi}:${a}`))
                        key = `${pi}:${a}`;
            });
            // Collect Reserve can be used again: when its space already holds a die,
            // the new die takes that die's place.
            if (!key &&
                s.action === "collect" &&
                s.players[prev.active]?.used.collect === value &&
                !prev.players[prev.active].bot)
                key = `${prev.active}:collect`;
            // A die taken without an action is Naledi resting.
            if (!key && prev.players[prev.active].bot)
                key = `${prev.active}:rest`;
            if (key)
                this.used.set(key, { uid, value, spot: 0 });
        }
        else if (s.dice.length !== this.poolValues.length)
            this.pool = s.dice.map(next);
        for (const key of [...this.used.keys()]) {
            const [pi, a] = key.split(":");
            if (a !== "rest" && s.players[+pi]?.used[a] === undefined)
                this.used.delete(key);
        }
        const feed = this.used.get(`${s.active}:feed`);
        if (feed && s.action === "feed" && s.row !== null)
            feed.spot = s.row;
        this.round = s.round;
        this.poolValues = [...s.dice];
        this.state = s;
    }
    reset() {
        this.state = null;
        this.round = -1;
        this.pool = [];
        this.poolValues = [];
        this.used.clear();
        this.lastKeys.clear();
    }
    /** Seat of a player as seen by the viewer, who always sits nearest. */
    seat(s, me, player) {
        const n = s.players.length;
        return s.players[player].bot ? BOT_SEAT : L.seats(n)[(player - me + n) % n];
    }
    compose(s, v) {
        const items = new Map(), exits = new Map(), hots = [], labels = [], marks = [];
        let carry;
        const n = s.players.length, me = v.me, task = s.tasks[0], mine = v.playing && s.phase === "resolve" && task?.player === me, choosing = v.playing && s.phase === "choose", over = s.phase === "over", close = v.close;
        const seat = (i) => this.seat(s, me, i);
        const at = (i, lx, lz, y, extra = {}) => {
            const [x, z] = L.world(seat(i), lx, lz);
            return { x, y, z, ry: seat(i).rot, ...extra };
        };
        const put = (key, spec, pose, from, delay) => {
            items.set(key, { spec, pose, from, delay });
        };
        const deckY = Math.max(0.3, s.deckCount * 0.05), deckPose = { ...L.DECK, y: deckY, ry: -0.06, flip: true }, cardFrom = (id) => (this.wasInHand.has(id) ? HAND : deckPose);
        const inspect = (key, id, prio = 2) => {
            if (id) {
                const f = feedingForCard(s, id);
                hots.push({
                    id: key,
                    ui: "inspect-card",
                    data: { card: id },
                    label: "Inspect " +
                        cardName(id) +
                        (f ? `. ${f.title}. ${f.timing} ${f.consequence}` : ""),
                    piece: key,
                    prio,
                });
            }
        };
        // ---- shared centre ----
        put("board", {
            shape: "slab",
            face: "Land Board/Land Board_Front.webp",
            turn: "cw",
            ...L.BOARD,
            edge: "#efe4c8",
        }, { x: L.BOARD.x, y: 0, z: L.BOARD.z });
        put("rain", {
            shape: "slab",
            face: RAIN_ART,
            back: "Tarot Cards/Rain Dance Tile/Rain Dance Tile_Back.webp",
            ...L.RAIN,
        }, { x: L.RAIN.x, y: 0, z: L.RAIN.z, flip: over });
        hots.push({
            id: "rain",
            ui: choosing && v.actions.rain?.ok ? "action" : "inspect-rain",
            data: { action: "rain" },
            label: choosing && v.actions.rain?.ok
                ? "Rain Dance"
                : "Inspect the Rain Dance tile",
            piece: "rain",
            prio: 1,
        });
        if (choosing && v.actions.rain?.ok) {
            marks.push({
                id: "ring:rain",
                kind: "ring",
                x: L.RAIN.x,
                y: 0.6,
                z: L.RAIN.z,
                r: 16,
                pulse: true,
                color: "#a8ded9",
            });
            labels.push({
                id: "act:rain",
                x: L.RAIN.x,
                y: 1,
                z: L.RAIN.z + 9,
                cls: "spot",
                html: `<b>Rain Dance</b>${v.actions.rain.cost ? `<small>${esc(v.actions.rain.cost)}</small>` : ""}`,
            });
        }
        put("deck", { ...cardSpec(0), thick: deckY, edge: "#eadcb9" }, { ...L.DECK, y: 0, ry: -0.06 });
        hots.push({
            id: "deck",
            ui: "inspect-deck",
            label: `Draw pile · ${s.deckCount} cards`,
            piece: "deck",
            prio: 1,
        });
        const top = s.discard.at(-1);
        if (top)
            put("discard", { ...cardSpec(top.id), thick: Math.max(0.14, s.discard.length * 0.05) }, { ...L.DISCARD, y: 0, ry: 0.04 }, { ...L.DISCARD, y: 0, ry: 0.04, scale: 0.9, opacity: 0 });
        s.regions.forEach((r, i) => {
            const p = L.regionPose(i, s.regions.length), key = "region:" + r.id;
            put(key, { shape: "slab", face: regionArt(r.id), turn: "ccw", ...L.REGION }, { ...p, y: 0 });
            hots.push({
                id: key,
                ui: "inspect-region",
                data: { region: r.id },
                label: `${r.name} · Region Goals`,
                piece: key,
                prio: 1,
            });
            r.goals.forEach((g, j) => {
                const goal = `${r.id}:${j}`, band = L.goalBand(j);
                if (!v.claimable.includes(goal))
                    return;
                hots.push({
                    id: "claim:" + goal,
                    ui: "claim",
                    data: { goal },
                    label: `Claim ${g.label}`,
                    rect: {
                        x: p.x + band.x,
                        y: 0.4,
                        z: p.z + band.z,
                        w: band.w,
                        h: band.h,
                    },
                    prio: 3,
                });
                marks.push({
                    id: "ring:goal:" + goal,
                    kind: "ring",
                    x: p.x + L.claimLocal(j, s.claims[goal].length)[0],
                    y: 0.5,
                    z: p.z + L.claimLocal(j, s.claims[goal].length)[1],
                    r: 3,
                    pulse: true,
                });
                labels.push({
                    id: "claim:" + goal,
                    x: p.x,
                    y: 0.5,
                    z: p.z + band.z,
                    cls: "spot claim",
                    html: `<b>Claim · ${g.tiers[s.claims[goal].length] ?? 0} CP</b><small>${esc(g.label)}</small>`,
                });
            });
        });
        // Land Board stacks: reward side up until a tile is drafted.
        s.stacks.forEach((stack, i) => {
            stack.forEach((id, depth) => {
                const isTop = depth === stack.length - 1, picked = isTop && v.draft === i, p = L.stackPose(i, TILE[id].size), key = "tile:" + id;
                put(key, tileSpec(id), {
                    x: p.x,
                    y: p.y + (picked ? 5 : 0),
                    z: p.z,
                    flip: true,
                    scale: picked ? 1.12 : 1,
                });
                if (!isTop)
                    return;
                const drafting = mine && task.kind === "draft";
                hots.push({
                    id: key,
                    ui: drafting ? "draft" : "inspect-tile",
                    data: { stack: i, tile: id, hidden: 1 },
                    label: `${TILE[id].cp} CP Land Tile · ${TILE[id].size} hex${drafting && !v.fits[i] ? " · does not fit" : ""}`,
                    piece: key,
                    disabled: drafting && !v.fits[i],
                    prio: 3,
                });
                if (drafting && v.fits[i] && !picked)
                    marks.push({
                        id: "ring:stack:" + i,
                        kind: "ring",
                        x: p.x,
                        y: p.y + L.TILE.thick + 0.2,
                        z: p.z,
                        r: 4.4,
                        pulse: true,
                    });
            });
        });
        // Shared dice pool and dice resting on action spaces.
        this.pool.forEach((uid, i) => {
            const [x, z] = L.poolPose(i), picked = choosing && v.die === i;
            put(uid, {
                shape: "die",
                face: String(s.dice[i]),
                w: L.DIE,
                h: L.DIE,
                thick: L.DIE,
            }, { x, y: picked ? 3.2 : 0, z, ry: ((i * 37) % 11) * 0.07 - 0.35 }, { x, y: 22, z, ry: 0, opacity: 0 }, i * 0.07);
            if (choosing && v.dice)
                hots.push({
                    id: uid,
                    ui: "die",
                    data: { die: i },
                    label: `Die ${s.dice[i]}`,
                    piece: uid,
                    prio: 3,
                });
            if (picked)
                marks.push({ id: "ring:die", kind: "ring", x, y: 0.3, z, r: 4.2 });
            // The move is chosen: the dice that can pay for it call for attention.
            else if (choosing && v.dice)
                marks.push({
                    id: "ring:pool:" + i,
                    kind: "ring",
                    x,
                    y: 0.3,
                    z,
                    r: 4.2,
                    pulse: true,
                });
        });
        for (const [key, die] of this.used) {
            const [pi, a] = key.split(":"), player = +pi, bot = s.players[player]?.bot;
            if (!s.players[player])
                continue;
            const spot = bot
                ? a === "rest"
                    ? L.BOT_REST
                    : (L.BOT_SPOT[a] ?? L.BOT_REST)
                : a === "rain"
                    ? null
                    : L.ACTION_SPOT[a]?.[die.spot];
            put(die.uid, {
                shape: "die",
                face: String(die.value),
                w: L.DIE,
                h: L.DIE,
                thick: L.DIE,
            }, spot
                ? at(player, spot[0], spot[1], L.MAT.thick + 0.02)
                : { x: L.RAIN.x, y: L.RAIN.thick, z: L.RAIN.z - 5.4 });
        }
        // ---- sanctuaries ----
        s.players.forEach((p, i) => {
            const st = seat(i), matKey = "mat:" + i;
            put(matKey, {
                shape: "slab",
                face: p.bot
                    ? "Player Mat/Player Mat 1_Back.webp"
                    : `Player Mat/Player Mat ${(i % 2) + 1}_Front.webp`,
                ...L.MAT,
                edge: "#e6d3a0",
            }, { x: st.x, y: 0, z: st.z, ry: st.rot });
            // A click visits this sanctuary; on the one being visited, or on the
            // viewer's own from elsewhere, it leads home.
            const visit = i === me || i === v.focus
                ? "Back to your sanctuary"
                : `Visit ${p.name}’s sanctuary`;
            if (i !== v.focus || i !== me)
                hots.push({
                    id: matKey,
                    ui: "view-player",
                    data: { player: i },
                    label: visit,
                    piece: matKey,
                    prio: 0,
                });
            // A mat carries dice, food, tiles and Raindrops, so it never moves under
            // the pointer: a small sign at its near edge says what a click does.
            if (v.hover === matKey)
                labels.push({
                    id: "visit",
                    ...at(i, 0, L.MAT.h / 2 + 1.5, 1),
                    cls: "spot",
                    html: `<b>${esc(visit)}</b>`,
                });
            if (i !== me)
                labels.push({
                    id: "name:" + i,
                    ...(p.bot
                        ? at(i, L.BOT_NAME[0], L.BOT_NAME[1], 1)
                        : at(i, 0, 20.5, 1)),
                    cls: "nameplate" + (s.active === i && !over ? " active" : ""),
                    html: esc(p.name),
                });
            if (s.active === i && !over)
                put("active", token("Tokens/Active Player/Token Active Player.webp", 9.72, 12.69), p.bot
                    ? at(i, L.BOT_TOKEN[0], L.BOT_TOKEN[1], 0)
                    : at(i, L.ACTIVE_TOKEN[0], L.ACTIVE_TOKEN[1], 0));
            // Raindrops: unclaimed on the mat, claimed on the goal's next circle.
            const drops = p.bot ? 4 : 5;
            for (let k = 0; k < drops; k++) {
                const goal = p.goals[k], spec = token(dropArt(i), 2.9, 3.83);
                if (goal) {
                    const [rid, j] = goal.split(":").map(Number), ri = s.regions.findIndex((r) => r.id === rid), rp = L.regionPose(ri, s.regions.length), [lx, lz] = L.claimLocal(j, s.claims[goal].indexOf(i));
                    put(`drop:${i}:${k}`, spec, {
                        x: rp.x + lx,
                        y: L.REGION.thick + 0.04,
                        z: rp.z + lz,
                    });
                }
                else {
                    const [lx, lz] = p.bot ? L.BOT_DROPS[k] : L.DROP_SPOTS[k];
                    put(`drop:${i}:${k}`, spec, at(i, lx, lz, p.bot ? 0.03 : L.MAT.thick + 0.04));
                }
            }
            if (p.bot) {
                this.station(s, i, put, at, hots, inspect, labels);
                return;
            }
            // Habitats, with tucked cards sliding out so each When Fed strip shows.
            p.slots.forEach((slot, si) => {
                if (!slot)
                    return;
                const [lx, lz] = L.slotLocal(si), row = Math.floor(si / 5), count = slot.tucked.length, topZ = lz - (row === 0 ? count * L.TUCK_STEP : 0), key = "card:" + slot.card.id, hero = close &&
                    mine &&
                    task.kind === "effect" &&
                    task.source === slot.card.id;
                const pose = at(i, lx, topZ, 0.56 + count * 0.16);
                put(key, cardSpec(slot.card.id), hero ? HERO : pose, cardFrom(slot.card.id));
                inspect(key, slot.card.id);
                slot.tucked.forEach((c, k) => {
                    const tk = "card:" + c.id, lifted = close && mine && task.kind === "effect" && task.source === c.id;
                    put(tk, cardSpec(c.id), lifted
                        ? HERO
                        : at(i, lx, topZ + (k + 1) * L.TUCK_STEP, 0.56 + (count - 1 - k) * 0.16), cardFrom(c.id));
                    inspect(tk, c.id, 1);
                });
                const f = feedingStatus(s, i, slot.card.id);
                if (f?.hungry && !hero && !over) {
                    const near = v.focus === i;
                    labels.push({
                        id: `hunger:${slot.card.id}`,
                        piece: key,
                        anchor: [0, -0.35],
                        cls: `hunger${near ? "" : " distant"}${f.canFeedNow ? " available" : ""}`,
                        html: `<span class="hunger-meal"><img src="assets/${foodArt(f.food)}" alt=""><b>${near ? esc(f.food) + " " : ""}×${f.missing}</b></span>${near ? `<small>${f.canFeedNow ? "Feed now · " : ""}${f.cp} CP waiting</small>` : ""}`,
                    });
                }
                const a = CARD[slot.card.id];
                if (a)
                    for (let k = 0; k < Math.min(slot.card.fed, 4); k++)
                        put(`fed:${slot.card.id}:${k}`, token(foodArt(a.food), 2.6, 3.55), at(i, lx - 4.3 + k * 2.9, topZ + 3.4, pose.y + L.CARD.thick + 0.05), at(i, L.FOOD_BANK.x, L.FOOD_BANK.z, 1.2));
            });
            // Protected land on the printed seven-hex grid; completed tiles show their reward.
            p.land.forEach((land) => {
                const t = L.tileLocal(land.cells), key = "tile:" + land.id;
                put(key, tileSpec(land.id), {
                    ...at(i, t.x, t.z, L.MAT.thick + 0.06, { flip: land.completed }),
                    ry: st.rot + t.rot,
                });
                hots.push({
                    id: key,
                    ui: v.landPick && i === me ? "ability-land" : "inspect-tile",
                    data: { tile: land.id, land: p.land.indexOf(land), player: i },
                    label: `${TILE[land.id].cp} CP Land Tile · ${land.completed ? "completed" : "in progress"}`,
                    piece: key,
                    prio: 3,
                });
                if (v.landPick && i === me) {
                    const [x, z] = L.world(st, t.x, t.z);
                    marks.push({
                        id: "ring:land:" + land.id,
                        kind: "ring",
                        x,
                        y: 1.4,
                        z,
                        r: 4.6,
                        pulse: true,
                    });
                }
            });
            // Food Bank and Personal Reserve piles.
            ["bank", "reserve"].forEach((pile) => {
                const box = pile === "bank" ? L.FOOD_BANK : L.RESERVE, size = pile === "bank" ? 1 : 0.78;
                FOODS.forEach((food, fi) => {
                    const count = p[pile][food], lx = box.x + (fi - 1.5) * box.step;
                    for (let k = 0; k < Math.min(count, 5); k++)
                        put(`food:${i}:${pile}:${food}:${k}`, token(foodArt(food), 2.79 * size, 3.8 * size), at(i, lx + (((k * 7) % 5) - 2) * 0.16, box.z + (((k * 3) % 5) - 2) * 0.22, L.MAT.thick + 0.03 + k * 0.3, { ry: st.rot + (((k * 5 + fi) % 7) - 3) * 0.09 }), at(i, lx, box.z, 16, { opacity: 0 }), k * 0.05);
                    if (count > 1 && (i === me || i === v.focus))
                        labels.push({
                            id: `count:${i}:${pile}:${food}`,
                            ...at(i, lx + 1.2 * size, box.z + 1.5 * size, 2),
                            cls: "count",
                            html: String(count),
                        });
                });
            });
            // Public hands of the other seats: a face-up fan left of their mat.
            if (i !== me)
                p.hand.forEach((c, k) => {
                    const key = "card:" + c.id;
                    put(key, cardSpec(c.id), at(i, L.OPP_HAND[0], L.OPP_HAND[1] + (k - (p.hand.length - 1) / 2) * 2.7, 0.05 + k * 0.16), deckPose);
                    inspect(key, c.id);
                });
        });
        // ---- the viewer's pending choice ----
        const you = s.players[me];
        if (you && !you.bot) {
            const st = seat(me), lifted = v.card > 0
                ? v.card
                : mine && task.kind === "trap"
                    ? task.card.id
                    : 0;
            // The hand is a fan of real cards held up at the bottom of the screen.
            if (v.hand !== "hide") {
                const { wide, hf, ny } = fan(v.aspect, v.hand), cw = (2 * hf * L.CARD.w) / L.CARD.h / v.aspect, [x0, x1] = wide ? [-0.58, 0.24] : [-0.94, 0.94], cards = you.hand.filter((c) => c.id !== lifted), count = cards.length, step = count > 1 ? Math.min(cw * 0.8, (x1 - x0 - cw) / (count - 1)) : 0, left = (x0 + x1) / 2 - (step * (count - 1)) / 2;
                cards.forEach((c, k) => {
                    const key = "card:" + c.id, nx = left + k * step, off = k - (count - 1) / 2, up = v.hover === key;
                    put(key, cardSpec(c.id), {
                        x: 0,
                        y: 0,
                        z: 0,
                        tilt: up ? 0 : off * 0.035,
                        cam: {
                            nx,
                            ny: up ? ny + 0.42 : ny - Math.abs(off) * 0.012,
                            hf: up ? hf * 1.3 : hf,
                            layer: up ? 40 : k + 1,
                        },
                    }, cardFrom(c.id));
                    hots.push({
                        id: key,
                        ui: v.hand === "show" ? "inspect-card" : "select-card",
                        // Press and pull a card out of the hand to carry it to a habitat.
                        grab: v.hand === "select",
                        data: { card: c.id },
                        label: cardName(c.id) +
                            (v.hand === "show" ? " · in your hand" : " · select"),
                        screen: {
                            x0: nx - cw / 2,
                            x1: k === count - 1 ? nx + cw / 2 : nx + step - cw / 2,
                            y0: Math.max(-1, ny - hf),
                            y1: ny + hf,
                        },
                        prio: 7,
                    });
                });
            }
            if (choosing)
                for (const [a, info] of Object.entries(v.actions)) {
                    if (a === "rain")
                        continue;
                    L.ACTION_SPOT[a].forEach(([lx, lz], k) => {
                        const [x, z] = L.world(st, lx, lz);
                        hots.push({
                            id: `spot:${a}:${k}`,
                            ui: "action",
                            data: { action: a },
                            label: ACTION_NAMES[a],
                            rect: { x, y: L.MAT.thick + 0.1, z, w: 6.2, h: 6.2 },
                            disabled: !info.ok,
                            prio: 3,
                        });
                        if (!info.ok)
                            return;
                        marks.push({
                            id: `ring:spot:${a}:${k}`,
                            kind: "ring",
                            x,
                            y: L.MAT.thick + 0.25,
                            z,
                            r: 3.5,
                            pulse: true,
                        });
                        if (k === 0 && info.cost)
                            labels.push({
                                id: "act:" + a,
                                x,
                                y: 1,
                                z: z + 3.4,
                                cls: "spot",
                                html: `<small>${esc(info.cost)}</small>`,
                            });
                    });
                }
            // A card preview mutes impossible habitats without changing their geometry.
            if (v.hints)
                for (let slot = 0; slot < 10; slot++) {
                    const [lx, lz] = L.slotLocal(slot), [x, z] = L.world(st, lx, lz), fits = v.hints.includes(slot);
                    if (!fits)
                        marks.push({
                            id: `shade:slot:${slot}`,
                            kind: "shade",
                            x,
                            y: 2.2,
                            z,
                            w: L.CARD.w,
                            h: L.CARD.h,
                            ry: st.rot,
                        });
                    else {
                        if (!v.legal.includes(slot))
                            marks.push({
                                id: `ring:hint:${slot}`,
                                kind: "ring",
                                x,
                                y: 1.5,
                                z,
                                r: 8.3,
                                color: "#bce9ab",
                                pulse: true,
                            });
                        labels.push({
                            id: `hint:${slot}`,
                            x,
                            y: 1.6,
                            z,
                            cls: "habitat-hint",
                            html: v.tucking ? "✓ Tuck here" : "✓ Fits here",
                        });
                    }
                }
            // Habitat targets: place, tuck, feed, trap and swap all pick a slot.
            for (const slot of v.legal) {
                const [lx, lz] = L.slotLocal(slot), occupant = you.slots[slot], shift = occupant && slot < 5 ? -occupant.tucked.length * L.TUCK_STEP : 0, [x, z] = L.world(st, lx, lz + shift), chosen = v.slot === slot;
                hots.push({
                    id: "slot:" + slot,
                    ui: "habitat",
                    data: { slot, ...(occupant ? { card: occupant.card.id } : {}) },
                    label: `${HABITAT_NAMES[SLOT_HABITATS[slot]]} ${(slot % 5) + 1}${occupant ? " · " + cardName(occupant.card.id) : ""}${occupant
                        ? (() => {
                            const f = feedingStatus(s, me, occupant.card.id);
                            return f ? `. ${f.title}. ${f.timing} ${f.consequence}` : "";
                        })()
                        : ""}`,
                    rect: { x, y: 1.4, z, w: L.CARD.w, h: L.CARD.h },
                    prio: 4,
                });
                marks.push({
                    id: "ring:slot:" + slot,
                    kind: "ring",
                    x,
                    y: occupant ? 1.6 : 0.8,
                    z,
                    r: 8.3,
                    pulse: !chosen,
                    color: chosen ? "#ffe9a8" : "#f4d27a",
                });
            }
            if (lifted && close) {
                const key = "card:" + lifted, verb = v.tucking ? "Tuck" : lifted > 101 ? "Set" : "Place", spot = (slot) => {
                    const [lx, lz] = L.slotLocal(slot), occupant = you.slots[slot], shift = occupant && slot < 5
                        ? -occupant.tucked.length * L.TUCK_STEP
                        : 0, [x, z] = L.world(st, lx, lz + shift);
                    return { lx, lz, x, z, occupant, y: occupant ? 1.7 : 0.9 };
                };
                if (v.slot >= 0) {
                    // Dropped, not yet confirmed: the card lies on its place, a little proud.
                    // A card to tuck lies over the foot of the stack, where its strip will
                    // show, and leaves the animal's name in view.
                    const t = spot(v.slot), under = t.occupant?.tucked.length ?? 0, top = t.lz - (v.slot < 5 ? under * L.TUCK_STEP : 0);
                    put(key, cardSpec(lifted), t.occupant
                        ? at(me, t.lx, top + (under + 1) * L.TUCK_STEP + 1, 1.5 + (under + 1) * 0.16, { snap: true })
                        : at(me, t.lx, t.lz, 1.1, { snap: true }), cardFrom(lifted));
                    labels.push({
                        id: "target",
                        x: t.x,
                        y: t.y,
                        z: t.z + 4,
                        cls: "target",
                        html: `<b>${verb} ${esc(cardName(lifted))} here</b><small>Selected destination</small>`,
                    });
                }
                else {
                    // In the air: it waits above the sanctuary and follows the pointer
                    // to any habitat that will take it.
                    put(key, cardSpec(lifted), v.held ? { ...HERO_PLACE, cam: v.held } : HERO_PLACE, cardFrom(lifted));
                    carry = {
                        piece: key,
                        magnets: v.legal.map((slot) => {
                            const t = spot(slot);
                            return { id: "slot:" + slot, x: t.x, z: t.z, y: t.y, ry: st.rot };
                        }),
                        reach: CARD_REACH,
                        aspect: L.CARD.w / L.CARD.h,
                        lift: 7.5,
                        ry: st.rot,
                        across: ["slot:"],
                    };
                    const held = v.pull?.startsWith("slot:")
                        ? Number(v.pull.slice(5))
                        : -1;
                    if (v.legal.includes(held)) {
                        const t = spot(held);
                        labels.push({
                            id: "target",
                            x: t.x,
                            y: t.y,
                            z: t.z + 4,
                            cls: "target",
                            html: `<b>${verb} here</b><small>${esc(HABITAT_NAMES[SLOT_HABITATS[held]])}</small>`,
                        });
                    }
                }
            }
            // A drafted tile hovers over its chosen place on the Land Grid and
            // follows the pointer to any other place it fits.
            if (mine && task.kind === "tile" && v.cells) {
                const key = "tile:" + task.tile, place = (cells) => {
                    const t = L.tileLocal(cells), [x, z] = L.world(st, t.x, t.z);
                    return { x, z, ry: st.rot + t.rot };
                }, chosen = place(v.cells), held = v.pull?.startsWith("place:") ? Number(v.pull.slice(6)) : -1, shown = v.spots[held] ?? v.cells, mark = place(shown);
                put(key, tileSpec(task.tile), 
                // Set down on its place, a little proud of the mat until it is confirmed.
                { x: chosen.x, y: 1.6, z: chosen.z, ry: chosen.ry, snap: true }, { x: L.BOARD.x, y: 8, z: L.BOARD.z, flip: true });
                if (close)
                    carry = {
                        piece: key,
                        magnets: v.spots.map((cells, i) => ({
                            id: "place:" + i,
                            y: 0.5,
                            ...place(cells),
                        })),
                        reach: TILE_REACH,
                        lift: 8,
                        hover: 2.8,
                        ry: chosen.ry,
                        across: ["cell:"],
                    };
                marks.push({
                    id: "ring:place:" + (v.spots[held] ? held : v.spot),
                    kind: "ring",
                    x: mark.x,
                    y: 0.9,
                    z: mark.z,
                    r: 8,
                });
                labels.push({
                    id: "target",
                    x: mark.x,
                    y: 0.8,
                    z: mark.z + 5,
                    cls: "target",
                    html: `<b>${v.spots[held] ? "Drop here" : "Placement preview"}</b><small>Covers ${shown.map((c) => (GRID_BONUS[c] === "draw" ? "1 card" : "1 " + GRID_BONUS[c])).join(" + ")}</small>`,
                });
                const taken = new Set(you.land.flatMap((l) => l.cells));
                for (let cell = 0; cell < 7; cell++) {
                    if (taken.has(cell))
                        continue;
                    const [cx, cz] = L.world(st, ...L.cellLocal(cell));
                    hots.push({
                        id: "cell:" + cell,
                        ui: "tile-cell",
                        data: { cell },
                        label: `Land Grid hex ${cell + 1} · ${GRID_BONUS[cell]}`,
                        rect: { x: cx, y: 0.8, z: cz, w: 6.6, h: 6.6 },
                        prio: 4,
                    });
                }
            }
            for (const d of v.disarm) {
                const key = "card:" + d.card;
                hots.push({
                    id: "disarm:" + d.card,
                    ui: "ability-disarm",
                    data: d,
                    label: `Disarm ${s.players[d.target].name}’s ${cardName(d.card)}`,
                    piece: key,
                    prio: 5,
                });
                marks.push({
                    id: "ring:disarm:" + d.card,
                    kind: "ring",
                    piece: key,
                    r: 9,
                    pulse: true,
                    color: "#ff9d8a",
                });
            }
        }
        // Pending tiles and traps of other seats float over their mats.
        if (s.phase === "resolve" && task && task.player !== me) {
            if (task.kind === "tile")
                put("tile:" + task.tile, tileSpec(task.tile), at(task.player, -5.5, 0, 6), { x: L.BOARD.x, y: 8, z: L.BOARD.z, flip: true });
            if (task.kind === "trap")
                put("card:" + task.card.id, cardSpec(task.card.id), at(task.player, 0, 0, 7), deckPose);
        }
        // ---- adoption market: offers laid out beside the Land Board ----
        if (s.action === "adopt" && s.phase === "resolve" && s.offers.length) {
            const arranging = mine && task.kind === "offer", adopting = mine && task.kind === "adopt", groups = s.offers.filter((o) => arranging
                ? o.player === me
                : adopting
                    ? task.bonus || o.player !== me
                    : true), m = L.market(groups.length, n);
            groups.forEach((o, gi) => {
                const order = arranging ? v.offerOrder : [0, 1, 2];
                order.forEach((original, pos) => {
                    const c = o.cards[original];
                    if (!c)
                        return;
                    const key = c.id ? "card:" + c.id : `hidden:${o.player}:${original}`, picked = (arranging && v.offerPick === pos) ||
                        (adopting &&
                            v.adopt?.owner === o.player &&
                            v.adopt.slot === original), can = adopting && v.affordable(o.player, original), [x, z] = m.slot(gi, pos), fee = arranging ? pos : original;
                    put(key, cardSpec(c.id), {
                        x,
                        y: picked ? 6.5 : 0.05,
                        z,
                        tilt: picked ? 0.42 : 0,
                        scale: m.scale * (picked ? 1.12 : 1),
                        opacity: adopting && !can ? 0.5 : 1,
                    }, deckPose, (gi * 3 + pos) * 0.06);
                    // The fee tag rides on the card, so it lifts with a picked one.
                    labels.push({
                        id: "fee:" + key,
                        piece: key,
                        anchor: [0, -0.5],
                        cls: "fee" + (picked ? " picked" : ""),
                        html: (fee === 0 ? "<b>FREE</b>" : `<b>${fee} food</b>`) +
                            (arranging
                                ? `<small>${fee === 0 ? "face-down to others" : "face-up"}</small>`
                                : ""),
                    });
                    if (arranging)
                        hots.push({
                            id: key,
                            ui: "offer-pick",
                            data: { index: pos, card: c.id },
                            label: `${cardName(c.id)} · ${fee === 0 ? "free" : fee + " food"}`,
                            piece: key,
                            prio: 6,
                        });
                    else if (adopting)
                        hots.push({
                            id: key,
                            ui: "adopt-card",
                            data: { owner: o.player, cost: original, card: c.id },
                            label: `Adopt ${c.id ? cardName(c.id) : "the face-down card"} for ${original} food`,
                            piece: key,
                            disabled: !can,
                            prio: 6,
                        });
                    else
                        inspect(key, c.id, 6);
                });
                const [x, z] = m.slot(gi, 0);
                labels.push({
                    id: "owner:" + o.player,
                    x: x - m.w / 2 - 1.2,
                    y: 0.3,
                    z,
                    cls: "owner",
                    html: esc(arranging
                        ? "For others to adopt"
                        : o.player === me
                            ? "From you"
                            : "From " + s.players[o.player].name),
                });
            });
        }
        for (const key of this.lastKeys)
            if (!items.has(key) && key.startsWith("card:"))
                exits.set(key, you?.hand.some((c) => "card:" + c.id === key)
                    ? HAND
                    : { ...L.DISCARD, y: 1, ry: 0.04, scale: 0.9, opacity: 0.2 });
        // The piece under the pointer rises a little, where it has the room.
        const lift = v.hover ? hoverLift(items, v.hover) : null;
        if (lift)
            for (const key of lift.keys) {
                const item = items.get(key);
                items.set(key, {
                    ...item,
                    pose: { ...item.pose, y: item.pose.y + lift.by },
                });
            }
        for (const key of v.fade ?? []) {
            const item = items.get(key);
            if (item)
                items.set(key, {
                    ...item,
                    pose: {
                        ...item.pose,
                        opacity: Math.min(item.pose.opacity ?? 1, 0.2),
                    },
                });
        }
        this.lastKeys = new Set(items.keys());
        return { items, exits, hots, labels, marks, carry };
    }
    /** Naledi's ranger station: solo decks on their squares, her piles beside the mat. */
    station(s, i, put, at, hots, inspect, labels) {
        const p = s.players[i], solo = { shape: "slab", ...L.SOLO };
        for (const [deck, ids] of Object.entries(SOLO_DECKS)) {
            const [lx, lz] = soloSquare(deck), rest = ids.length - (s.soloCard && ids.includes(s.soloCard) ? 1 : 0);
            put("solo:" + deck, {
                ...solo,
                face: `Solo Mode Cards/Solo Card ${ids[0]}_Back.webp`,
                thick: Math.max(0.14, rest * 0.16),
                edge: "#ead9ae",
            }, at(i, lx, lz, L.MAT.thick + 0.02));
        }
        if (s.soloCard) {
            const deck = soloDeck(s.soloCard), [lx, lz] = soloSquare(deck), key = "solocard:" + s.soloCard, y = L.MAT.thick + 0.2 + SOLO_DECKS[deck].length * 0.16;
            put(key, {
                ...solo,
                face: soloArt(s.soloCard),
                back: `Solo Mode Cards/Solo Card ${s.soloCard}_Back.webp`,
            }, at(i, lx + 0.8, lz + 0.8, y, { ry: 0.05 }), at(i, lx, lz, y, { flip: true }));
            hots.push({
                id: key,
                ui: "inspect-solo",
                data: { solo: s.soloCard },
                label: "Read Naledi’s latest action card",
                piece: key,
                prio: 3,
            });
        }
        // Two rows beside the board, never on it: adopted beyond the ADOPTED
        // tab, placed in front of the PLACED tab. Later cards overlap earlier ones.
        const row = (cards, lz) => cards.forEach((c, k) => {
            const key = "card:" + c.id;
            put(key, cardSpec(c.id), at(i, L.botRowX(k, cards.length), lz, 0.03 + k * 0.16), { ...L.DECK, y: 3, flip: true });
            inspect(key, c.id);
        });
        row(p.hand, L.BOT_ROW.adopted);
        row(p.placed, L.BOT_ROW.placed);
        // What each pile is worth to her right now (rulebook p. 30).
        const traps = (cards) => cards.filter((c) => c.id > 101).length, worth = (n) => (n > 0 ? "+" + n : String(n)), pile = (id, lx, lz, name, pts) => labels.push({
            id: `pile:${i}:${id}`,
            ...at(i, lx, lz, 1),
            cls: "pile",
            html: `${name} <b>${worth(pts)}</b>`,
        });
        if (p.hand.length)
            pile("adopted", L.BOT_ROW.x, L.BOT_ROW.adopted - L.CARD.h / 2 - 1.6, `Adopted · ${p.hand.length}`, p.hand.length - 5 * traps(p.hand));
        if (p.placed.length)
            pile("placed", L.BOT_ROW.x, L.BOT_ROW.placed + L.CARD.h / 2 + 1.6, `Placed · ${p.placed.length} · no food needed`, p.placed.reduce((n, c) => n + (CARD[c.id] ? CARD[c.id].cp + CARD[c.id].bonus : -4), 0));
        if (p.land.length)
            pile("land", L.BOT_LAND.x + 4, L.BOT_LAND.z - 13, `Land · ${p.land.length}`, p.land.reduce((n, t) => n + TILE[t.id].cp, 0));
        p.land.forEach((land, k) => {
            const key = "tile:" + land.id;
            put(key, tileSpec(land.id), at(i, L.BOT_LAND.x + (k % L.BOT_LAND.perRow) * L.BOT_LAND.step, L.BOT_LAND.z, Math.floor(k / L.BOT_LAND.perRow) * 0.7, { flip: true }));
            hots.push({
                id: key,
                ui: "inspect-tile",
                data: { tile: land.id, player: i },
                label: `Naledi’s ${TILE[land.id].cp} CP Land Tile`,
                piece: key,
                prio: 3,
            });
        });
    }
}
