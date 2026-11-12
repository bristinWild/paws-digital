/**
 * Browser client: a living 3D table (stage + table) under a simple game HUD.
 * The server stays authoritative; this file turns a snapshot into one clear
 * instruction at a time and sends typed commands back. Every choice is laid
 * out as options with Naledi's pick and her reason (advisor.ts), every
 * accepted move is answered with what it brought (story.ts), and Naledi
 * explains her own turns the same way. In the guided game the HUD appears
 * piece by piece as she introduces it, a ranger trail across the top shows how
 * far the field school has come, and every finished part gets a scene of its
 * own.
 */
import * as A from "./advisor.js";
import { watchPlan, holdUpcoming } from "./watch.js";
import { feedingForCard } from "./feeding.js";
import * as S from "./story.js";
import { ASSET_DIMENSIONS } from "./asset-dimensions.js";
import { ACTIONS, ACTION_MIN, ACTION_NAMES, ABILITY_NAMES, CARD, FOODS, GRID_BONUS, HABITAT_NAMES, SLOT_HABITATS, TILE, cardArt, cardName, } from "./data.js";
import { claimable, goalDefinition, goalProgress, landPlacements, legalActions, newGame, score, tileComplete, total, winners, } from "./engine.js";
import { BADGES, PROMPT, WAYS, intros, lessons, naledi, demonstrated, lessonAction, lessonProgress, lessonSteps, hasLessonChoice, goalFocus, } from "./tutorial.js";
import * as sfx from "./sfx.js";
import * as L from "./layout.js";
import { Stage } from "./stage.js";
import { Spotlight } from "./spotlight.js";
import { RAIN_ART, Table, dropArt, foodArt, regionArt, soloArt, handTop, } from "./table.js";
const app = document.querySelector("#app"), modal = document.querySelector("#modal"), inspectEl = document.querySelector("#inspect"), banner = document.querySelector("#banner"), weatherEl = document.querySelector("#weather"), fx = document.querySelector("#fx"), trailEl = document.querySelector("#trail"), sceneEl = document.querySelector("#scene"), pointer = document.querySelector("#pointer");
const stage = new Stage(document.querySelector("#stage")), table = new Table(), spotlight = new Spotlight(document.querySelector("#spot"), document.querySelector("#spot-rings"));
let room = null, session = null, stream = null, actingAs = "", viewPlayer = 0, selectedDie = -1, 
/** The move chosen this turn, waiting for the die that pays for it. */
selectedAction = "", selectedCard = -1, targetSlot = -1, tucking = false, pending = false, connected = false, renderedRevision = -1, offerOrder = [0, 1, 2], offerPick = -1, adoptPick = null, draftPick = -1, placement = 0, hover = null, 
/** The place that holds the carried card or tile right now. */
pulled = null, hoverInspect = null, tableView = false, 
/** The Region Goal whose details are unfolded in the goals panel. */
goalOpen = "", weatherUntil = 0, freshTable = true, 
/** Naledi telling her own turn, one line at a time. */
narration = null, narrationTimer = 0, 
/** Where the guide's pointer rests (CSS selector), "" for nowhere. */
pointerSel = "", 
/** Naledi's last line, so her bubble only pops in for new words. */
spoken = "", 
/** The player's last tap, so an accepted choice can be ticked where it was made. */
lastTap = null, 
/** Naledi's pick and reason on every choice; the player can switch it off. */
tips = localStorage.getItem("paws.tips") !== "off", 
/** Naledi has just played: her next advice is the answer to that. */
replying = false, 
/** The rules of her own play she has already explained in this game. */
heard = new Set(), 
/**
 * The table revision at which the first When Fed ability was introduced:
 * that one gets the explanation, even though the meal before it already
 * passed the feeding lesson.
 */
firstAbility = -1, 
/** The pointer is marking her pick among several options. */
pointerPick = false, 
/** What the field school is spotlighting right now (see teach()). */
teaching = null, 
/**
 * The close-up the camera holds for it, what it was framed for, and where
 * a card waiting for its home is held up beside it.
 */
closeUp = null;
const panels = {
    race: false,
    ways: false,
    goals: false,
    log: false,
};
try {
    const saved = JSON.parse(localStorage.getItem("paws.panels") || "{}");
    for (const k of Object.keys(panels))
        if (typeof saved[k] === "boolean")
            panels[k] = saved[k];
}
catch {
    // A damaged setting simply means every panel starts folded.
}
/** When each line of the moves box first appeared, so only new ones slide in. */
const logBorn = new Map();
/** HUD parts revealed during this visit: they arrive with a small flourish. */
const arrived = new Set();
let guide = {
    intro: 0,
    lesson: 0,
    enabled: true,
    goalsRead: false,
    rainRead: false,
};
/** The scene on screen, and those waiting their turn behind it. */
let scene = null, 
/** The furthest step reached in the lesson being taught this turn. */
reached = { lesson: -1, turn: -1, step: 0 }, trailView = { lesson: 0, fill: 0, done: [] }, 
/** The closing scene of the field school has been called up. */
graduating = false;
const scenes = [], 
/** Badges earned whose medal has not yet flown to its stop on the trail. */
landing = new Set();
let foodPicker = null;
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const art = (path) => "/assets/" + path.split("/").map(encodeURIComponent).join("/");
const img = (path, alt, cls = "") => `<img class="${cls}" src="${art(path)}" alt="${esc(alt)}" draggable="false" decoding="async" width="${ASSET_DIMENSIONS[path]?.[0] ?? 100}" height="${ASSET_DIMENSIONS[path]?.[1] ?? 100}">`;
/** Art stored sideways (regions, player aid), shown upright in a fixed-ratio box. */
const turned = (path, alt, dir = "ccw") => `<span class="turned ${dir}">${img(path, alt)}</span>`;
const button = (label, action, attrs = "", cls = "") => `<button class="${cls}" data-ui="${action}" ${attrs}>${label}</button>`;
const amount = (n) => (n === 1 ? "1 food" : `${n} food`);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
};
const die = (value) => `<span class="die-face" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[value]?.includes(i) ? "on" : ""}"></i>`).join("")}</span>`;
const foodIcon = (f, cls = "") => img(foodArt(f), f, "food-icon " + cls);
const ACTION_NOTE = {
    collect: "Reclaim all your locked food",
    adopt: "Draw 3 · adopt first + bonus",
    place: "Place or tuck up to 2 animals",
    feed: "Feed animals in one row",
    protect: "Draft first + bonus tile",
    rain: "Trigger the final turns",
};
/** Naledi advises in her guided game, and in any other game while tips are on. */
const advising = (s) => !!s && (s.tutorial ? guide.enabled : tips);
let cacheKey = "";
const cache = new Map();
/** Advice is worked out once per position, however often the HUD redraws. */
function cached(name, make) {
    const key = `${room?.code}|${room?.game?.revision}|${actingAs}`;
    if (key !== cacheKey) {
        cacheKey = key;
        cache.clear();
    }
    if (!cache.has(name))
        cache.set(name, make());
    return cache.get(name);
}
/** Her pick is the first open option of a list. */
function flagged(options, on = true) {
    const i = on ? options.findIndex((o) => !o.blocked) : -1;
    return options.map((o, k) => ({ ...o, best: k === i }));
}
/** Numbers on the score sheet remember when they changed, so the change can be shown. */
const marks = new Map();
function moved(key, value) {
    let m = marks.get(key);
    if (!m)
        marks.set(key, (m = { from: value, to: value, at: -1e9 }));
    if (m.to !== value) {
        m.from = m.to;
        m.to = value;
        m.at = performance.now();
    }
    return { from: m.from, age: Math.round(performance.now() - m.at) };
}
function toast(message, quiet = false) {
    if (!quiet)
        sfx.play("buzz");
    const el = document.querySelector("#toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 4500);
}
async function api(path, body) {
    const res = await fetch("/api/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok)
        throw new Error(data.error || "Could not reach the table.");
    return data;
}
function saveGuide() {
    if (session)
        localStorage.setItem("paws.guide." + session.code, JSON.stringify(guide));
}
function credentials() {
    return { ...session };
}
function myself() {
    return room.game.players.findIndex((p) => p.id === (actingAs || room.you));
}
function canPlay() {
    const s = room?.game;
    return (!!s &&
        (s.phase === "choose" || s.phase === "end"
            ? s.active === myself()
            : s.phase === "resolve" && s.tasks[0]?.player === myself()));
}
const inIntro = (s) => s.tutorial && guide.enabled && guide.intro < intros.length;
/** Which of the welcome's Region Goal beats is on (0, 1, 2), or -1. */
const regionBeat = (s) => inIntro(s) && intros[guide.intro].focus === "region"
    ? guide.intro - intros.findIndex((x) => x.focus === "region")
    : -1;
/**
 * The goal whose claim is being taught right now: the first one, as its own
 * lesson, and any later one Naledi points at while the lessons last.
 */
function taughtClaim(s) {
    const me = myself(), point = currentGuide() ? (play(s).advice?.point ?? "") : "", key = goalGate(s)
        ? goalFocus(s, me)?.key
        : point.startsWith(".claim-button")
            ? /data-goal="([^"]+)"/.exec(point)?.[1]
            : undefined;
    return key && claimable(s, me, key) ? key : undefined;
}
function currentGuide() {
    return room?.game?.tutorial && guide.enabled && guide.intro >= intros.length
        ? lessons[guide.lesson]
        : undefined;
}
function goalGate(s) {
    return (s.tutorial &&
        guide.enabled &&
        !guide.goalsRead &&
        s.phase !== "over" &&
        s.active === myself() &&
        Object.keys(s.claims).some((k) => claimable(s, myself(), k)));
}
function rainGate(s) {
    return (s.tutorial &&
        guide.enabled &&
        !guide.rainRead &&
        guide.lesson >= lessons.length &&
        s.phase !== "over" &&
        s.active === myself() &&
        s.players[myself()].goals.length >= s.length &&
        s.rain === null &&
        // Ending the game while behind is the player's call, not a lesson step.
        S.standing(s, myself()).lead >= 0);
}
/** After the last lesson Naledi sends the player off; heard once. */
function gradGate(s) {
    return (s.tutorial &&
        guide.enabled &&
        !guide.graduated &&
        guide.intro >= intros.length &&
        guide.lesson >= lessons.length &&
        s.phase === "choose" &&
        s.active === myself());
}
/**
 * If no ordinary move except Collect Reserve can be paid for, no lesson
 * holds it back. Its space remains open after use, as the engine decides.
 */
const onlyCollect = (s, a) => {
    const legal = legalActions(s, myself());
    return (a === "collect" &&
        legal.some((x) => x.action === "collect") &&
        legal.every((x) => x.action === "collect" || x.action === "rain"));
};
function tutorialAllows(a) {
    const s = room.game, l = currentGuide();
    if (inIntro(s) || goalGate(s) || gradGate(s))
        return false;
    if (onlyCollect(s, a))
        return true;
    if (rainGate(s))
        return a === "rain";
    if (!l)
        return true;
    const action = lessonAction(s, myself(), guide.lesson);
    return !action || a === action;
}
const guided = (s) => !!s?.tutorial && guide.enabled;
/** In the guided game the HUD arrives piece by piece, as Naledi needs it. */
const shown = (part) => !guided(room?.game) || !!guide.shown?.includes(part);
function reveal(part) {
    if (!guided(room?.game) || guide.shown?.includes(part))
        return;
    guide.shown = [...(guide.shown ?? []), part];
    arrived.add(part);
    later(2600, () => arrived.delete(part));
    saveGuide();
}
/** A badge for a finished part of the field school. It gets a scene of its own. */
function award(id) {
    if (!guided(room?.game) || guide.badges?.includes(id))
        return;
    guide.badges = [...(guide.badges ?? []), id];
    saveGuide();
    landing.add(id);
    // The move lands on the table first; the Rain Dance gets its thunder first.
    queueScene({ kind: "badge", badge: id }, id === "rain" ? 2600 : 950);
}
const LESSON_OF = {
    place: 0,
    feed: 1,
    protect: 2,
    adopt: 3,
    collect: 5,
};
/** Has Naledi already taught this action? */
const learned = (a) => guide.lesson > (LESSON_OF[a] ?? -1);
/** The action Naledi is steering towards on the player's own turn, if any. */
function wantedAction(s) {
    if (!guided(s) || s.active !== myself())
        return;
    if (rainGate(s))
        return "rain";
    return currentGuide() ? lessonAction(s, myself(), guide.lesson) : undefined;
}
// ---------- network ----------
function receive(data) {
    const before = room?.code === data.code ? room.game : null;
    room = data;
    connected = true;
    if (room.game) {
        const s = room.game;
        if (s.revision !== renderedRevision) {
            selectedDie = -1;
            selectedAction = "";
            selectedCard = -1;
            targetSlot = -1;
            offerOrder = [0, 1, 2];
            offerPick = -1;
            adoptPick = null;
            draftPick = -1;
            placement = 0;
            foodPicker = null;
            hoverInspect = null;
            if (modal.open && modal.dataset.kind === "food")
                modal.close();
            renderedRevision = s.revision;
            if (!before || before.turn !== s.turn || canPlay())
                viewPlayer = myself();
            if (canPlay())
                tableView = false;
            table.update(s, myself());
            preset(s);
            if (before)
                effects(before, s);
            else
                freshTable = true;
        }
        if (actingAs && data.players.find((p) => p.id === actingAs)?.online) {
            actingAs = "";
            toast("Your friend is back in their seat.", true);
        }
    }
    render();
}
/** Where a choice starts with an arrangement, Naledi lays out her suggestion. */
function preset(s) {
    const t = s.tasks[0], me = myself();
    if (!advising(s) || !canPlay() || s.phase !== "resolve" || !t)
        return;
    if (t.kind === "offer")
        offerOrder = A.offerOrder(s, me).order.slice();
    if (t.kind === "tile") {
        const best = A.cellOptions(s, me, t.tile)[0]?.cells?.join(), i = landPlacements(s.players[me], t.tile).findIndex((cells) => cells.join() === best);
        if (i >= 0)
            placement = i;
    }
}
function attach() {
    stream?.close();
    stream = new EventSource(`/api/events?code=${encodeURIComponent(session.code)}&token=${encodeURIComponent(session.token)}`);
    stream.onmessage = (e) => receive(JSON.parse(e.data));
    stream.onerror = () => {
        connected = false;
        renderConnection();
    };
    stream.onopen = () => {
        connected = true;
        renderConnection();
    };
}
function renderConnection() {
    const el = document.querySelector("#connection");
    if (el) {
        el.textContent = connected || !room ? "" : "Reconnecting…";
        el.classList.toggle("offline", !connected);
    }
}
function enter(data, token) {
    renderedRevision = -1;
    table.reset();
    freshTable = true;
    session = { code: data.code, token: data.token || token };
    sessionStorage.setItem("paws.seat", JSON.stringify(session));
    localStorage.setItem("paws.resume", JSON.stringify(session));
    try {
        guide = JSON.parse(localStorage.getItem("paws.guide." + data.code) || "null") || {
            intro: 0,
            lesson: 0,
            enabled: !!data.game?.tutorial,
            goalsRead: false,
            rainRead: false,
        };
    }
    catch { }
    room = null;
    marks.clear();
    replying = false;
    heard = new Set();
    firstAbility = -1;
    dropScenes();
    receive(data);
    // Only ways of scoring earned from here on are announced as new.
    if (room.game && !guide.ways) {
        const sc = score(room.game, myself());
        guide.ways = WAYS.filter((w) => sc[w.key] > 0).map((w) => w.key);
        saveGuide();
    }
    attach();
}
async function command(c) {
    if (pending || !room?.game || !connected)
        return;
    pending = true;
    endNarration();
    const lesson = currentGuide(), old = room.game, waiting = scenes.length;
    try {
        const data = await api("command", {
            ...credentials(),
            actingAs,
            revision: old.revision,
            command: c,
        });
        if (c.type === "claim") {
            guide.goalsRead = true;
            reveal("goals");
            saveGuide();
            award("goal");
            // The first claim of the guided game has a scene of its own; every other
            // one gets the band across the table: what it paid and how far the race
            // has come.
            if (scenes.length === waiting) {
                const me = myself(), have = old.players[me].goals.length + 1, g = goalDefinition(data.game, c.goal), worth = g?.tiers[data.game.claims[c.goal]?.indexOf(me) ?? -1] ?? 0;
                showGoal(g?.label ?? "Region Goal", worth, have, old.length, data.game.phase !== "choose");
            }
        }
        if (c.type === "act") {
            reveal("wallet");
            sfx.play("drop");
            replying = false;
        }
        if (c.type === "act" && c.action === "rain") {
            guide.rainRead = true;
            saveGuide();
            award("rain");
        }
        if (lesson && demonstrated(guide.lesson, c) && !guide.demonstrated) {
            guide.demonstrated = true;
            saveGuide();
            award(lesson.badge);
        }
        if (c.type === "end")
            reveal("rail");
        if (c.type === "end" && lesson && guide.demonstrated) {
            guide.lesson++;
            guide.demonstrated = false;
            tucking = !!lessons[guide.lesson]?.tuck;
            saveGuide();
        }
        receive(data);
        tick();
        // A move that earned a badge tells what it brought inside the badge's scene.
        if (data.game)
            reward(old, data.game, c, scenes.length > waiting ? scenes.at(-1) : undefined);
        if (guided(data.game) && (c.type === "claim" || c.type === "act")) {
            const line = c.type === "claim"
                ? naledi.goalDone
                : c.action === "rain"
                    ? naledi.rainDone
                    : "";
            if (line)
                narrate([line.replace("{goals}", String(data.game.length))], undefined, false);
            render();
        }
    }
    catch (e) {
        toast(e.message);
        try {
            receive(await api("resume", credentials()));
        }
        catch { }
    }
    finally {
        pending = false;
        render();
    }
}
// ---------- Naledi's ordered table replay ----------
let lastTable = null;
let watch = null;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function stopWatch(resume = false) {
    if (!watch)
        return;
    clearTimeout(watch.timer);
    watch = null;
    document.body.classList.remove("watching");
    if (resume) {
        if (narration) {
            narration.visit = false;
            narrationTimer = setTimeout(nextNarration, readingTime(narration.lines[narration.i]));
        }
        render();
    }
}
function advanceWatch() {
    if (!watch)
        return;
    if (!stage.settled()) {
        watch.timer = setTimeout(advanceWatch, 180);
        return;
    }
    if (++watch.i >= watch.steps.length)
        return stopWatch(true);
    watch.started = false;
    render();
}
/** Hold later pieces at their old locations until their own beat. */
function watchTable(c, s) {
    const w = watch;
    if (!w)
        return null;
    const step = w.steps[w.i], seat = table.seat(s, myself(), w.bi);
    c.items = holdUpcoming(c.items, w.from, w.steps, w.i, sceneBusy());
    if (step.piece) {
        const item = c.items.get(step.piece);
        if (item)
            c.items.set(step.piece, { ...item, delay: reducedMotion() ? 0 : 0.65 });
    }
    // The temporary die also covers a bot move that immediately empties and rerolls the pool.
    const pick = w.steps.find((x) => x.kind === "die");
    let aim;
    if (pick) {
        const local = pick.action === "rest"
            ? L.BOT_REST
            : (L.BOT_SPOT[pick.action] ?? L.BOT_REST), dest = L.world(seat, ...local), old = [...w.from].find(([, it]) => it.spec.shape === "die" &&
            it.spec.face === String(pick.die) &&
            Math.abs(it.pose.x - L.poolPose(0)[0]) < 30 &&
            Math.abs(it.pose.z - L.poolPose(0)[1]) < 15), start = old?.[1].pose ?? {
            x: L.poolPose(0)[0],
            y: 0,
            z: L.poolPose(0)[1],
        };
        const placedDie = [...c.items].find(([, item]) => item.spec.shape === "die" &&
            item.spec.face === String(pick.die) &&
            Math.abs(item.pose.x - dest[0]) < 1 &&
            Math.abs(item.pose.z - dest[1]) < 1);
        for (const [key, item] of c.items)
            if (item.spec.shape === "die" &&
                (key === old?.[0] ||
                    (Math.abs(item.pose.x - dest[0]) < 1 &&
                        Math.abs(item.pose.z - dest[1]) < 1)))
                c.items.delete(key);
        const selecting = step.kind === "die" || sceneBusy();
        const dieKey = placedDie?.[0] ?? "watch:die";
        c.items.set(dieKey, {
            spec: {
                shape: "die",
                face: String(pick.die),
                w: L.DIE,
                h: L.DIE,
                thick: L.DIE,
            },
            pose: selecting
                ? { ...start, y: 4 }
                : { x: dest[0], y: L.MAT.thick, z: dest[1], ry: seat.rot },
            from: start,
            delay: selecting || reducedMotion() ? 0 : 0.65,
        });
        if (step.kind === "die" || step.kind === "action")
            c.marks.push({
                id: "ring:watch",
                kind: "ring",
                piece: dieKey,
                r: 4.4,
                pulse: !reducedMotion(),
            });
        if (step.kind === "action")
            aim = dest;
    }
    const piece = step.piece && c.items.get(step.piece);
    if (piece) {
        aim = [piece.pose.x, piece.pose.z];
        c.marks.push({
            id: "ring:watch",
            kind: "ring",
            piece: step.piece,
            r: step.kind === "card" ? 9 : 6,
            pulse: !reducedMotion(),
        });
    }
    c.hots = [];
    c.carry = undefined;
    c.labels = c.labels.filter((l) => l.cls?.startsWith("nameplate"));
    c.marks = c.marks.filter((m) => m.id === "ring:watch");
    if (!sceneBusy() && !w.started) {
        w.started = true;
        clearTimeout(narrationTimer);
        w.timer = setTimeout(advanceWatch, step.kind === "die" ? 1900 : 2800);
    }
    if (step.kind === "die")
        return L.SHOTS.dice;
    if (!aim)
        return L.stationShot(seat);
    const [cx, cz] = L.world(seat, 18, 48), [ox, oz] = L.world(seat, -8, 0);
    return {
        cam: [aim[0] + cx - seat.x, 70, aim[1] + cz - seat.z],
        look: [aim[0] + ox - seat.x, 0, aim[1] + oz - seat.z],
        fov: 44,
    };
}
// ---------- table effects ----------
const later = (ms, run) => setTimeout(run, ms);
function effects(a, b) {
    const me = myself();
    if (a.rain === null && b.rain !== null)
        rainEffect();
    b.players.forEach((p, i) => {
        const q = a.players[i], st = table.seat(b, me, i);
        if (!q)
            return;
        p.slots.forEach((slot, k) => {
            const old = q.slots[k], [x, z] = L.world(st, ...L.slotLocal(k));
            if (slot && old?.card.id !== slot.card.id)
                later(560, () => {
                    const trap = slot.card.id > 101;
                    stage.burst(x, 0.9, z, trap ? "#ff8a73" : "#f4d27a", 7);
                    if (i === me || trap)
                        sfx.play(trap ? "buzz" : "place");
                });
            const animal = slot && CARD[slot.card.id];
            if (slot &&
                animal &&
                old?.card.id === slot.card.id &&
                slot.card.fed > old.card.fed)
                later(480, () => {
                    stage.burst(x, 1.2, z, "#bfe6a8", 5);
                    const full = slot.card.fed === animal.need;
                    stage.float(x, 2, z, full ? `+${animal.cp} CP` : `Fed ${slot.card.fed} / ${animal.need}`, full ? "gold" : "");
                    if (i === me)
                        sfx.play("munch");
                });
            if (!slot && old && old.card.id > 101) {
                stage.burst(x, 0.9, z, "#bfe6a8", 9);
                stage.float(x, 2, z, "Trap disarmed", "gold");
            }
            if (slot && old && slot.tucked.length > old.tucked.length && i === me)
                later(520, () => sfx.play("whoosh"));
        });
        if (!p.bot)
            for (const tile of p.land) {
                const old = q.land.find((t) => t.id === tile.id), t = L.tileLocal(tile.cells), [x, z] = L.world(st, t.x, t.z);
                if (!old)
                    later(520, () => {
                        stage.burst(x, 1.3, z, "#f4d27a", 8);
                        if (i === me)
                            sfx.play("tile");
                    });
                if (tile.completed && !old?.completed)
                    later(old ? 200 : 900, () => stage.float(x, 2.5, z, `+${TILE[tile.id].cp} CP`, "gold"));
            }
        if (i === me && p.hand.length > q.hand.length)
            later(300, () => sfx.play("pick"));
        for (const goal of p.goals.slice(q.goals.length)) {
            const [rid, j] = goal.split(":").map(Number), ri = b.regions.findIndex((r) => r.id === rid), rp = L.regionPose(ri, b.regions.length), tier = b.claims[goal].indexOf(i), [lx, lz] = L.claimLocal(j, tier), cp = b.regions[ri].goals[j].tiers[tier] ?? 0;
            later(650, () => {
                stage.burst(rp.x + lx, 0.5, rp.z + lz, "#a8ded9", 4);
                stage.float(rp.x + lx, 2, rp.z + lz, `${esc(p.name)} +${cp} CP`, "gold");
            });
        }
        // Points earned pop out of that player's token in the rail.
        const gain = score(b, i).total - score(a, i).total;
        if (gain)
            later(950, () => scorePop(i, gain, i === me));
    });
    if (b.phase === "over" && a.phase !== "over")
        later(700, () => gameOver(b));
    if (b.round !== a.round && b.phase !== "over")
        later(250, () => sfx.play("dice"));
    const myTurn = b.phase === "choose" &&
        b.active === me &&
        (a.active !== me || a.turn !== b.turn) &&
        !b.players[me].bot, lesson = guided(b) && guide.intro >= intros.length && lessons[guide.lesson], turnBanner = () => {
        if (!myTurn || room?.game !== b)
            return;
        sfx.play("bell");
        if (lesson)
            showChapter(guide.lesson);
        else
            showBanner("Your turn", b.finalLeft !== null ? "Final turn" : `Round ${b.round}`);
    };
    const bi = b.players.findIndex((p) => p.bot);
    if (bi >= 0) {
        // Against Naledi she explains her own move: the rule behind it, what it
        // gave her and where that leaves the race.
        const tale = S.tale(a, b, bi, me, heard);
        if (tale) {
            reveal("rail");
            if (!tale.passive)
                replying = true;
            const steps = watchPlan(a, b, bi);
            if (steps.length && lastTable) {
                stopWatch();
                watch = {
                    steps,
                    i: 0,
                    bi,
                    from: new Map(lastTable.items),
                    started: false,
                    timer: 0,
                };
            }
            // During the lessons she speaks line by line; after them her turn is one bubble.
            narrate(currentGuide() ? tale.lines : gather(tale.lines), turnBanner, !tale.passive);
        }
        else
            turnBanner();
        return;
    }
    // Friends' moves are followed in the moves box, bottom left.
    turnBanner();
}
/** Her lines as one bubble, or two when one would not hold them. */
function gather(lines) {
    const all = lines.join(" ");
    if (lines.length < 2 || all.length <= 150)
        return [all];
    const cut = Math.ceil(lines.length / 2);
    return [lines.slice(0, cut).join(" "), lines.slice(cut).join(" ")];
}
function showBanner(title, sub, cls = "") {
    banner.innerHTML = `<span>${esc(sub)}</span><b>${esc(title)}</b>`;
    banner.className = cls;
    void banner.offsetWidth;
    banner.classList.add("show");
}
/** A Region Goal claimed: the band across the table, with confetti and a fanfare. */
function showGoal(label, worth, have, of, nextTurn = false) {
    banner.innerHTML = `<span>Region Goal ${have} of ${of}</span><b>${esc(label)}${worth ? ` <i>+${worth}</i>` : ""}</b><em>${badgeIcon("goal")}${have >= of ? (nextTurn ? "Next turn: the Rain Dance is yours to call" : "The Rain Dance is yours to call") : `${of - have} more for the Rain Dance`}</em>`;
    banner.className = "chapter goal-band";
    void banner.offsetWidth;
    banner.classList.add("show");
    celebrate();
}
/** A new lesson opens with a title card: a band across the whole table. */
function showChapter(i) {
    const l = lessons[i], badge = BADGES.find((b) => b.id === l.badge);
    banner.innerHTML = `<span>Lesson ${i + 1} of ${lessons.length}</span><b>${esc(l.title)}</b><em>${badgeIcon(l.badge)}Earn the ${esc(badge.name)} badge</em>`;
    banner.className = "chapter";
    void banner.offsetWidth;
    banner.classList.add("show");
    sfx.play("whoosh");
    // The marker on the trail steps up to its new stop.
    trailEl.classList.remove("step-up");
    void trailEl.offsetWidth;
    trailEl.classList.add("step-up");
}
function rainEffect() {
    weatherUntil = Date.now() + 7000;
    showBanner("Rain Dance", "One final turn for everyone", "rain");
    sfx.play("thunder");
    later(4600, drawTable);
    later(7100, drawTable);
}
/** Naledi speaks her turn one bubble at a time; anything the player does cuts in. */
function narrate(lines, done, visit = true) {
    clearTimeout(narrationTimer);
    narration = { lines: lines.slice(0, 5), i: 0, visit, done };
    sfx.play("voice");
    // A scene in front of her holds her first line until it is closed.
    if (!sceneBusy() && !watch)
        narrationTimer = setTimeout(nextNarration, readingTime(lines[0]));
}
/** Long enough to read the bubble; "Continue" skips ahead. */
const readingTime = (line) => 2200 + line.length * 48;
function nextNarration() {
    if (!narration)
        return;
    clearTimeout(narrationTimer);
    if (++narration.i >= narration.lines.length)
        return endNarration(true);
    sfx.play("voice");
    narrationTimer = setTimeout(nextNarration, readingTime(narration.lines[narration.i]));
    render();
}
function endNarration(redraw = false) {
    if (!narration)
        return;
    clearTimeout(narrationTimer);
    const done = narration.done;
    narration = null;
    if (redraw)
        render();
    done?.();
}
// ---------- celebrations ----------
const BADGE_ART = {
    home: '<path d="M3 11.5 12 4l9 7.5V20h-6v-5.5H9V20H3z"/>',
    feed: '<path d="M3 12h18c0 4.6-4 8-9 8s-9-3.4-9-8Z"/><path d="M9 9c0-1.6 1.4-1.6 1.4-3.4M13.4 9c0-1.6 1.4-1.6 1.4-3.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    protect: '<path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4z"/>',
    adopt: '<path d="M12 20.5S4 15.6 4 9.9A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 8 2.5c0 5.7-8 10.6-8 10.6Z"/>',
    tuck: '<path d="M4.5 19.5C4.5 10 10 4.5 19.5 4.5c0 9.5-5.5 15-15 15Z"/><path d="m4.5 19.5 8.5-8.5" fill="none" stroke="#173c31" stroke-width="1.6" stroke-linecap="round"/>',
    collect: '<path d="M4 8.2 12 4l8 4.2v8L12 20.5 4 16.2z"/><path d="M4 8.2 12 12.4l8-4.2M12 12.4v8" fill="none" stroke="#173c31" stroke-width="1.5"/>',
    goal: '<path d="m12 2.8 2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.1l-5.7 3 1.2-6.3L2.9 9.4l6.3-.8z"/>',
    rain: '<path d="M12 2.8s6.8 7.4 6.8 11.9a6.8 6.8 0 0 1-13.6 0C5.2 10.2 12 2.8 12 2.8Z"/>',
};
const badgeIcon = (id) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${BADGE_ART[id] ?? ""}</svg>`;
/** Paper confetti from the top of the screen. */
function confetti(count = 44) {
    const colors = ["#f3bf58", "#2aa8d8", "#8cc152", "#e58fc0", "#fff9e9"];
    const box = document.createElement("div");
    box.className = "confetti";
    box.innerHTML = Array.from({ length: count }, (_, i) => {
        const x = 8 + Math.random() * 84, drift = (Math.random() - 0.5) * 30, spin = (Math.random() - 0.5) * 1400, delay = Math.random() * 0.35, fall = 1.5 + Math.random() * 1.1;
        return `<i style="left:${x}%;background:${colors[i % colors.length]};--drift:${drift}vw;--spin:${spin}deg;animation-delay:${delay}s;animation-duration:${fall}s"></i>`;
    }).join("");
    fx.append(box);
    later(3200, () => box.remove());
}
function celebrate() {
    confetti();
    sfx.play("fanfare");
}
// ---------- the ranger trail: how far the field school has come ----------
/** The trail's fixed parts: a leg into each lesson's stop, then the two milestones. */
function buildTrail(el) {
    el.innerHTML = `${lessons
        .map((l, i) => `<span class="leg"><i></i><b class="paw"></b></span><span class="stop" data-badge="${l.badge}" title="Lesson ${i + 1} · ${esc(l.title)}">${badgeIcon(l.badge)}</span>`)
        .join("")}<span class="gap"></span>${BADGES.slice(lessons.length)
        .map((b) => `<span class="stop prize" data-badge="${b.id}" title="${esc(b.name)}">${badgeIcon(b.id)}</span>`)
        .join("")}`;
    delete el.dataset.drawn;
}
/** Brings a built trail up to date; what changed since it was last drawn is animated. */
function applyTrail(el, t) {
    const drawn = !!el.dataset.drawn;
    el.querySelectorAll(".leg").forEach((leg, i) => {
        leg.style.setProperty("--fill", String(i < t.lesson ? 1 : i === t.lesson ? t.fill : 0));
        leg.classList.toggle("now", i === t.lesson);
        // The leg in hand is marked off in the steps of its lesson.
        leg.style.setProperty("--steps", String(i === t.lesson ? lessonSteps(i).length || 1 : 1));
    });
    el.querySelectorAll(".stop").forEach((stop, i) => {
        const done = t.done.includes(stop.dataset.badge);
        if (done && drawn && !stop.classList.contains("done")) {
            stop.classList.add("fresh");
            later(1300, () => stop.classList.remove("fresh"));
        }
        stop.classList.toggle("done", done);
        stop.classList.toggle("now", !done && i === t.lesson);
    });
    el.dataset.drawn = "1";
}
/** Where the player stands on the trail at this moment of the game. */
function trailState(s, p) {
    const l = currentGuide(), done = (guide.badges ?? []).filter((b) => !landing.has(b));
    if (!l)
        return { lesson: guide.lesson, fill: 0, done };
    if (reached.lesson !== guide.lesson || reached.turn !== s.turn)
        reached = { lesson: guide.lesson, turn: s.turn, step: 0 };
    const mine = s.active === myself() && s.phase !== "over", { step, of } = lessonProgress(guide.lesson, mine ? p.moment : "wait", !!guide.demonstrated, reached.step);
    // Every step forward is heard, and the marker gives a little hop.
    if (mine && step > reached.step && !guide.demonstrated) {
        sfx.play("step");
        trailEl.classList.remove("stepped");
        void trailEl.offsetWidth;
        trailEl.classList.add("stepped");
    }
    reached.step = step;
    return { lesson: guide.lesson, fill: of ? step / of : 0, done };
}
/** The trail joins the HUD with Naledi's promise to show every way to score. */
function renderTrail() {
    const s = room?.game, on = !!s && guided(s) && guide.intro >= intros.length - 1;
    document.body.classList.toggle("trail", on);
    // Once the lessons are behind the player it steps back to a narrow strip.
    document.body.classList.toggle("trail-small", on && (!currentGuide() || s.phase === "over"));
    if (!on)
        return;
    if (!trailEl.firstChild)
        buildTrail(trailEl);
    applyTrail(trailEl, trailView);
    const n = Math.min(guide.lesson, lessons.length);
    trailEl.setAttribute("aria-label", `Ranger trail: ${n} of ${lessons.length} lessons done, ${guide.badges?.length ?? 0} of ${BADGES.length} badges`);
}
// ---------- scenes: a finished part of the field school takes the screen ----------
const sceneBusy = () => !!scene || scenes.length > 0;
function queueScene(sc, delay) {
    // SSE can start a replay just before the command response awards its badge.
    // Stop its clock as well as holding its pieces; it must not finish offscreen.
    if (watch) {
        clearTimeout(watch.timer);
        watch.started = false;
    }
    scenes.push(sc);
    // Nothing else can be pressed until the scene has been seen.
    document.body.classList.add("scene-wait");
    later(delay, showScene);
}
function dropScenes() {
    stopWatch();
    lastTable = null;
    scene = null;
    scenes.length = 0;
    landing.clear();
    graduating = false;
    reached = { lesson: -1, turn: -1, step: 0 };
    sceneEl.className = "";
    sceneEl.innerHTML = "";
    trailEl.innerHTML = "";
    document.body.classList.remove("scene-wait", "scene-open");
}
function sceneHtml(sc, s) {
    const go = (label) => button(`${label} &nbsp;→`, "scene-next", "", "btn go");
    if (sc.kind === "graduate")
        return `<div class="scene-card"><span class="tag">Field school complete</span><div class="seal">${badgeIcon("goal")}</div><h2>You are a ranger now!</h2><p class="scene-message">All six lessons complete. Race to ${s.length} Region Goals, then call the Rain Dance.</p>${go("Let’s race!")}</div>`;
    const badge = BADGES.find((b) => b.id === sc.badge), i = lessons.findIndex((l) => l.badge === badge.id), message = sc.gain
        ? `${sc.gain.title}${sc.gain.points ? ` · ${sc.gain.points > 0 ? "+" : ""}${sc.gain.points} CP` : ""}`
        : badge.learned;
    return `<div class="scene-card"><span class="tag">${i >= 0 ? `Lesson ${i + 1} of ${lessons.length} complete` : "Milestone reached"}</span><div class="seal" data-badge="${badge.id}">${badgeIcon(badge.id)}</div><h2>${esc(badge.name)}</h2><p class="scene-message">${esc(message)}</p>${go("Continue")}</div>`;
}
function showScene() {
    const s = room?.game;
    if (scene || !scenes.length)
        return;
    if (!s)
        return dropScenes();
    scene = scenes.shift();
    // Naledi waits with her next line until the scene is closed.
    clearTimeout(narrationTimer);
    document.body.classList.add("scene-open");
    sceneEl.innerHTML = sceneHtml(scene, s);
    sceneEl.className = "show " + scene.kind;
    later(160, () => sfx.play("stamp"));
    if (scene.kind === "graduate")
        later(420, () => {
            confetti(70);
            sfx.play("win");
        });
    else
        later(380, celebrate);
    later(750, () => sceneEl.querySelector("button")?.focus());
    render();
}
function closeScene() {
    if (!scene)
        return;
    const was = scene;
    scene = null;
    if (was.badge)
        land(was.badge, sceneEl.querySelector(".seal"));
    if (was.kind === "graduate") {
        graduate();
        showBanner("The race is on", "Field school complete", "lesson");
    }
    sceneEl.classList.add("leaving");
    later(300, () => {
        if (scene)
            return;
        sceneEl.className = "";
        sceneEl.innerHTML = "";
    });
    if (scenes.length)
        later(400, showScene);
    else {
        document.body.classList.remove("scene-wait", "scene-open");
        if (narration && !watch)
            narrationTimer = setTimeout(nextNarration, readingTime(narration.lines[narration.i]));
    }
    render();
}
/** The medal leaves the scene and lands on its stop of the trail. */
function land(id, seal) {
    const stop = trailEl.querySelector(`.stop[data-badge="${id}"]`), arrive = () => {
        landing.delete(id);
        sfx.play("coin");
        render();
    };
    if (!seal || !stop || !stop.offsetWidth)
        return arrive();
    const from = seal.getBoundingClientRect(), to = stop.getBoundingClientRect(), el = seal.cloneNode(true);
    el.className = "seal flying";
    el.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`;
    fx.append(el);
    seal.style.visibility = "hidden";
    void el.offsetWidth;
    el.style.transform = `translate(${to.left + to.width / 2 - from.left - from.width / 2}px, ${to.top + to.height / 2 - from.top - from.height / 2}px) scale(${to.width / from.width})`;
    later(660, () => {
        el.remove();
        arrive();
    });
}
/** The lessons are behind the player: the whole HUD is theirs from here. */
function graduate() {
    guide.graduated = true;
    saveGuide();
    reveal("goals");
    reveal("rail");
}
/** A green tick where the player tapped: the table accepted that choice. */
function tick() {
    if (!lastTap || performance.now() - lastTap.at > 4000)
        return;
    const el = document.createElement("i");
    el.className = "tick";
    el.innerHTML = ICON.check;
    el.style.left = lastTap.x + "px";
    el.style.top = lastTap.y + "px";
    lastTap = null;
    fx.append(el);
    later(750, () => el.remove());
}
/**
 * After every accepted move: a reward card with what it brought, in green and
 * red, and a line for any way of scoring that paid for the first time.
 */
function reward(a, b, c, into) {
    const me = myself(), pay = S.payoff(a, b, me, c), sc = score(b, me), seen = guide.ways ?? [], 
    // Land and traps can cost points before they pay, and that is when their
    // rule is worth hearing.
    fresh = WAYS.filter((w) => sc[w.key] !== 0 && !seen.includes(w.key));
    if (fresh.length) {
        guide.ways = [...seen, ...fresh.map((w) => w.key)];
        saveGuide();
    }
    if (!pay && !fresh.length)
        return;
    const p = pay ?? {
        title: "A new way to score",
        chips: [],
        points: 0,
        mood: "good",
    };
    fx.querySelector(".payoff")?.remove();
    const el = document.createElement("div");
    el.className = `payoff ${p.mood}${fresh.length ? " long" : ""}`;
    el.innerHTML = `${p.points ? `<b class="pts">${p.points > 0 ? "+" : "−"}${Math.abs(p.points)}</b>` : ""}<div><strong>${esc(p.title)}</strong><div class="chips">${p.chips.map((x) => `<span class="chip ${x.tone}">${x.food ? foodIcon(x.food) : ""}${esc(x.text)}</span>`).join("")}</div>${fresh.map((w) => `<p class="new-way">${ICON.star}<span><b>${sc[w.key] > 0 ? "New way to score" : "Good to know"}: ${esc(w.name)}</b>${esc(w.how)}</span></p>`).join("")}</div>`;
    if (into) {
        // The badge's scene carries it, and stays until the player has read it.
        el.classList.add("still");
        into.gain = { title: p.title, points: p.points };
        return;
    }
    fx.append(el);
    if (p.mood === "great")
        later(250, () => confetti(16));
    if (p.mood === "bad")
        later(200, () => sfx.play("buzz"));
    later(fresh.length ? 6200 : 3400, () => el.remove());
}
/** "+4" bursting out of a player's score, with the row giving a little hop. */
function scorePop(player, gain, mine) {
    const seat = document.querySelector(`.seat[data-player="${player}"]`);
    if (!seat)
        return;
    const r = (seat.querySelector(".cp") ?? seat).getBoundingClientRect(), el = document.createElement("b");
    el.className = "score-pop" + (gain < 0 ? " loss" : "");
    el.textContent = (gain > 0 ? "+" : "") + gain;
    // Beside the score it belongs to, inside that player's own row.
    el.style.left = r.left - 6 + "px";
    el.style.top = r.top + r.height / 2 + "px";
    fx.append(el);
    seat.classList.remove("hop");
    void seat.offsetWidth;
    seat.classList.add("hop");
    if (mine && gain > 0)
        sfx.play("coin");
    later(1500, () => el.remove());
}
function gameOver(s) {
    const win = winners(s), me = myself();
    if (win.includes(me)) {
        confetti(70);
        sfx.play("win");
    }
    else
        sfx.play("lose");
}
// ---------- food picker ----------
function payOrGain(n, mode, label, note, done) {
    if (!n) {
        done([]);
        return;
    }
    reveal("wallet");
    // Naledi fills in her suggestion; the player may change it before confirming.
    const s = room.game, pick = advising(s) ? A.foodPick(s, myself(), n, mode === "gain") : null;
    foodPicker = {
        n,
        mode,
        label,
        note: pick ? `${note} ${pick.why}` : note,
        selected: pick?.food.length === n ? pick.food.slice() : [],
        bank: room.game.players[myself()].bank,
        done,
    };
    renderFoodPicker();
}
function renderFoodPicker() {
    const f = foodPicker;
    modal.dataset.kind = "food";
    modal.innerHTML = `<div class="dialog-head"><span class="eyebrow">${f.mode === "gain" ? "FROM THE SUPPLY" : "FROM YOUR FOOD BANK"}</span>${button("✕", "close-modal", 'aria-label="Close food picker"', "icon-button")}</div><h2>${esc(f.label)}</h2>${advising(room?.game) ? `<div class="hello"><div class="naledi" role="img" aria-label="Naledi"></div><p><b>Naledi</b>${esc(f.note)}</p></div>` : `<p>Choose ${amount(f.n)}. ${f.mode === "pay" ? "These tokens leave your Food Bank." : "Any combination is fine."}</p>`}<div class="food-picker">${FOODS.map((food) => {
        const count = f.selected.filter((x) => x === food).length, available = f.mode === "gain" ? Infinity : f.bank[food];
        return `<div>${foodIcon(food)}<strong>${esc(food)}</strong><span>${f.mode === "pay" ? `${available} available` : "Unlimited supply"}</span><div>${button("−", "food-minus", `data-food="${food}" ${!count ? "disabled" : ""} aria-label="One less ${food}"`, "round")}<b>${count}</b>${button("+", "food-plus", `data-food="${food}" ${f.selected.length >= f.n || count >= available ? "disabled" : ""} aria-label="One more ${food}"`, "round")}</div></div>`;
    }).join("")}</div>${button(`${ICON.check}${f.mode === "pay" ? "Pay" : "Take"} ${amount(f.n)} · ${f.selected.length} / ${f.n}`, "food-confirm", f.selected.length === f.n ? "" : "disabled", "btn go full")}`;
    if (!modal.open)
        modal.showModal();
}
// ---------- decisions ----------
function legalSlots(s, card = selectedCard) {
    const t = s.tasks[0], p = s.players[myself()];
    if (!canPlay() || s.phase !== "resolve" || !t)
        return [];
    return p.slots.flatMap((slot, i) => {
        const a = slot ? CARD[slot.card.id] : null;
        let ok = false;
        if (t.kind === "place" && card > 0)
            ok = tucking
                ? !!a && slot.tucked.length < 5
                : !slot && !!CARD[card]?.habitats.includes(SLOT_HABITATS[i]);
        if (t.kind === "feed")
            ok =
                !!a &&
                    Math.floor(i / 5) === t.row &&
                    !t.used?.includes(i) &&
                    p.bank[a.food] > 0;
        if (t.kind === "trap")
            ok = !slot;
        return ok ? [i] : [];
    });
}
/**
 * The moves of a turn in mat order: what each would bring right now, which are
 * open, and Naledi's pick. In a lesson only the move being taught is offered.
 */
function moves(s) {
    const me = myself(), want = wantedAction(s), all = cached("moves", () => A.actionOptions(s, me)), open = all.filter((o) => !o.blocked && tutorialAllows(o.action)), offered = (a) => !want || a === want || onlyCollect(s, a);
    return ACTIONS.filter(offered).map((a) => {
        const o = all.find((x) => x.action === a);
        return {
            ...o,
            // The release lesson uses Place for tucking, not for a new home.
            gain: a === "place" && want && currentGuide()?.tuck
                ? "release an animal: +1 point"
                : o.gain,
            blocked: o.blocked ?? (tutorialAllows(a) ? undefined : "Not yet"),
            best: advising(s) && o === open[0],
        };
    });
}
/** One option as a card: what it is, what it brings, and Naledi's star on her pick. */
function optionCard(o, ui, attrs, cls = "", lead = "", picked = false) {
    return button(`${lead}<span class="o-text"><strong>${esc(o.title)}</strong><small>${esc(o.blocked ?? o.gain)}</small></span>${o.best ? `<span class="o-pick">${ICON.star}Naledi’s pick</span>` : ""}`, ui, `${attrs}${o.blocked ? " disabled" : ""}`, `opt ${cls}${o.best ? " best" : ""}${picked ? " selected" : ""}`);
}
/** Naledi's advice for a list of options: her pick, the reason to show, the control to point at. */
function advise(s, options, point, picked) {
    const best = options.find((o) => o.best);
    if (!advising(s) || !best)
        return;
    const other = picked && picked.id !== best.id ? picked : undefined;
    return {
        best,
        other,
        why: (other ?? best).why,
        point: point(picked ?? best),
        choice: options.filter((o) => !o.blocked).length > 1,
        settled: !!picked && !other,
    };
}
function disarmTargets(s, t) {
    const me = myself();
    return s.players.flatMap((other, pi) => {
        if (t.ability === "disarmOwn" ? pi !== me : pi === me)
            return [];
        return other.bot
            ? [...other.hand, ...other.placed]
                .filter((c) => c.id > 101)
                .map((c) => ({ target: pi, slot: -1, card: c.id }))
            : other.slots.flatMap((slot, i) => slot && slot.card.id > 101
                ? [{ target: pi, slot: i, card: slot.card.id }]
                : []);
    });
}
function currentCells(s) {
    const t = s.tasks[0];
    if (!canPlay() || s.phase !== "resolve" || t?.kind !== "tile")
        return null;
    const positions = landPlacements(s.players[myself()], t.tile);
    placement = Math.min(placement, positions.length - 1);
    return positions[placement] ?? null;
}
function buildView(s, me, live) {
    const t = s.tasks[0], p = s.players[me], playing = live && canPlay(), mine = playing && s.phase === "resolve" && t?.player === me, actions = {};
    // First the move: its spaces on the mat glow. Then the die that pays for it.
    if (playing && s.phase === "choose") {
        if (selectedAction)
            actions[selectedAction] = { ok: true, cost: "" };
        else
            for (const o of moves(s))
                if (!o.blocked)
                    actions[o.action] = { ok: true, cost: o.best ? "★" : "" };
    }
    return {
        me,
        focus: live ? viewPlayer : me,
        aspect: innerWidth / Math.max(1, innerHeight),
        playing,
        die: selectedDie,
        dice: playing && s.phase === "choose" && !!selectedAction,
        actions,
        card: mine && t.kind === "place" ? selectedCard : -1,
        tucking,
        legal: live ? legalSlots(s) : [],
        hints: mine &&
            t.kind === "place" &&
            (selectedCard > 0 ||
                (hover?.startsWith("card:") &&
                    p.hand.some((c) => c.id === Number(hover.slice(5)))))
            ? legalSlots(s, selectedCard > 0 ? selectedCard : Number(hover.slice(5)))
            : undefined,
        slot: targetSlot,
        offerOrder,
        offerPick,
        adopt: adoptPick,
        affordable: (owner, slot) => !!s.offers[owner]?.cards[slot] && total(p.bank) >= slot,
        draft: draftPick,
        fits: s.stacks.map((stack) => !!stack.length && landPlacements(p, stack.at(-1)).length > 0),
        cells: live ? currentCells(s) : null,
        spots: mine && t.kind === "tile" ? landPlacements(p, t.tile) : [],
        spot: placement,
        pull: pulled,
        claimable: live && s.active === me && s.phase !== "over" && !inIntro(s)
            ? Object.keys(s.claims).filter((k) => claimable(s, me, k))
            : [],
        disarm: mine && t.kind === "effect" && t.ability?.startsWith("disarm")
            ? disarmTargets(s, t)
            : [],
        landPick: !!mine && t.kind === "effect" && t.ability === "discardLand",
        hand: live ? handMode(s) : "hide",
        close: live && !tableView && viewPlayer === me,
        fade: live ? teaching?.fade : undefined,
        held: live && teaching?.held ? closeUp?.held : undefined,
        // A steady hand: the card under the pointer stays in the fan.
        hover: teaching?.steadyHand ? null : hover,
    };
}
/** The hand fan shows while it matters and steps aside for close-up work. */
function handMode(s) {
    if (watch || s.phase === "over" || tableView || viewPlayer !== myself())
        return "hide";
    // A close-up of something else: the hand steps aside until it is needed.
    if (teaching?.noHand)
        return "hide";
    // The welcome starts with a bare table; the hand is dealt on the second beat.
    if (inIntro(s))
        return guide.intro ? "show" : "hide";
    if (!play(s).hand)
        return "hide";
    return canPlay() && s.phase === "resolve" && s.tasks[0]?.kind === "place"
        ? selectedCard > 0
            ? "peek"
            : "select"
        : "show";
}
/** Camera for the adoption market: closer for one row, wider for a full table. */
function marketShot(s) {
    const t = s.tasks[0], me = myself(), mine = canPlay() && s.phase === "resolve", rows = mine && t?.kind === "offer"
        ? 1
        : mine && t?.kind === "adopt"
            ? s.offers.filter((o) => t.bonus || o.player !== me).length
            : s.offers.length;
    return L.market(Math.max(1, rows), s.players.length).shot;
}
/** The decision in front of the viewer, phrased as one clear step. */
function play(s) {
    const me = myself(), p = s.players[me], t = s.tasks[0], mine = canPlay(), round = s.finalLeft !== null ? "FINAL TURN" : `ROUND ${s.round}`;
    if (s.phase === "over") {
        const win = winners(s);
        return {
            moment: "over",
            tag: "THE RAIN HAS COME",
            title: `${win.map((i) => (i === me ? "You" : s.players[i].name)).join(" & ")} ${win.length > 1 ? "share the win" : win[0] === me ? "win" : "wins"}!`,
            sub: "",
            shot: L.overviewShot(s.players.length),
        };
    }
    if (!mine) {
        const who = s.players[s.phase === "resolve" && t ? t.player : s.active];
        return {
            moment: "wait",
            tag: `${round} · ${who.name.toUpperCase()}’S TURN`,
            title: `${who.name} is playing`,
            sub: s.phase === "resolve" && s.action
                ? `${ACTION_NAMES[s.action]}: everyone may join in.`
                : "Watch the table.",
            dock: room.host === room.you
                ? room.players
                    .filter((x) => x.canTakeover && !x.online && x.id !== room.you)
                    .map((x) => button("Cover " + esc(x.name) + "’s seat", "takeover", `data-id="${x.id}"`, "choice"))
                    .join("")
                : "",
            shot: s.action === "adopt" && s.phase === "resolve" && s.offers.length
                ? marketShot(s)
                : L.overviewShot(s.players.length),
            hand: true,
        };
    }
    const tag = s.active === me
        ? `${round} · YOUR TURN`
        : `JOIN IN · ${s.players[s.active].name.toUpperCase()}’S ${s.action ? ACTION_NAMES[s.action].toUpperCase() : "ACTION"}`;
    const go = ".actions .go:not(:disabled)", passBy = ".actions .ghost:not(:disabled)", hot = (ui, key, value) => `.hot[data-ui="${ui}"][data-${key}="${value}"]`, cards = (html) => html ? `<div class="options">${html}</div>` : "";
    if (s.phase === "choose") {
        if (!selectedAction) {
            // One thing at a time: first the move, then the die that pays for it.
            const list = moves(s), ready = currentGuide()
                ? []
                : cached("claims", () => A.claimOptions(s, me)), claim = advise(s, ready, (o) => `.claim-button[data-goal="${o.id}"]`);
            return {
                moment: "action",
                tag,
                title: PROMPT.action,
                sub: claim
                    ? "A Region Goal is ready. Claim it first: it is free."
                    : "One move per turn. Each card shows what it brings right now.",
                dock: cards(list
                    .map((o) => optionCard(o, "action", `data-action="${o.action}" title="${ACTION_NOTE[o.action]}"`, "act a-" + o.action, `<span class="n">${die(ACTION_MIN[o.action])}</span>`))
                    .join("")),
                advice: claim
                    ? { ...claim, choice: true }
                    : advise(s, list, (o) => `.opt[data-action="${o.action}"]`),
                shot: L.SHOTS.turn,
                hand: true,
            };
        }
        const action = selectedAction, dice = flagged(cached("dice:" + action, () => A.dieOptions(s, me, action)), advising(s)), 
        // Each die also says what it leaves Naledi: she takes the highest one.
        advice = advise(s, dice, (o) => `.die-chip[data-die="${o.die}"]`);
        if (advice) {
            const told = advice.other ?? advice.best;
            if (told.after)
                advice.why += " " + told.after;
        }
        return {
            moment: "die",
            tag,
            title: PROMPT.die,
            sub: `${ACTION_NAMES[action]} needs a ${ACTION_MIN[action]}. A bigger die earns food, a smaller one costs food.`,
            dock: `<div class="dice-row" role="group" aria-label="Shared dice pool">${dice
                .slice()
                .sort((x, y) => x.die - y.die)
                .map((o) => button(
            // The chip is narrow: what the die costs or earns, then any warning on a line of its own.
            `${die(s.dice[o.die])}${(o.blocked ?? o.gain)
                .split(" · ")
                .map((x, i) => i
                ? `<em>${esc(x)}</em>`
                : `<b class="${o.gain.startsWith("+") ? "plus" : o.gain.startsWith("costs") ? "minus" : ""}">${esc(x)}</b>`)
                .join("")}${o.note ? `<small>${esc(o.note)}</small>` : ""}${o.best ? `<span class="o-pick">${ICON.star}Naledi’s pick</span>` : ""}`, "die", `data-die="${o.die}" aria-label="Die ${s.dice[o.die]}: ${esc(o.gain)}"${o.blocked ? " disabled" : ""}`, "die-chip" +
                (o.best ? " best" : "") +
                (selectedDie === o.die ? " selected" : "")))
                .join("")}</div>`,
            back: { label: "Back", ui: "back" },
            advice,
            shot: L.SHOTS.turn,
            hand: true,
        };
    }
    if (s.phase === "end") {
        const ready = cached("claims", () => A.claimOptions(s, me)), claim = advise(s, ready, (o) => `.claim-button[data-goal="${o.id}"]`);
        return {
            moment: ready.length ? "claim" : "end",
            tag,
            title: PROMPT[ready.length ? "claim" : "end"],
            sub: ready.length
                ? "Claiming is free. Earlier claims score more."
                : "Pass the Active Player token.",
            primary: { label: "End turn", ui: "end", disabled: goalGate(s) },
            advice: claim && { ...claim, choice: true },
            shot: ready.length ? L.SHOTS.region : L.SHOTS.turn,
            hand: true,
        };
    }
    const l = currentGuide(), gate = !!l && !guide.demonstrated && hasLessonChoice(s, me, guide.lesson);
    const pass = (label) => ({ label, ui: "skip", disabled: gate });
    /** In a lesson the step being taught is not skipped: passing is not her pick. */
    const open = (options) => flagged(gate ? options.filter((o) => o.id !== "skip") : options, advising(s));
    switch (t.kind) {
        case "offer": {
            const o = cached("offer", () => A.offerOrder(s, me));
            return {
                moment: "offer",
                tag,
                title: PROMPT.offer,
                sub: "Free, 1 food, 2 food. Click two cards to swap them.",
                primary: { label: "Confirm offers", ui: "offer-confirm" },
                advice: advising(s)
                    ? {
                        why: o.why,
                        point: go,
                        choice: false,
                    }
                    : undefined,
                shot: marketShot(s),
            };
        }
        case "adopt": {
            const options = open(cached("adopt", () => A.adoptOptions(s, me, t))), chosen = (adoptPick &&
                options.find((o) => o.owner === adoptPick.owner && o.slot === adoptPick.slot)) ||
                null, pick = adoptPick && s.offers[adoptPick.owner]?.cards[adoptPick.slot], name = pick ? (pick.id ? cardName(pick.id) : "the face-down card") : "";
            return {
                moment: t.bonus ? "bonus" : "adopt",
                tag,
                title: PROMPT[t.bonus ? "bonus" : "adopt"],
                sub: t.bonus
                    ? "Any offer, your own included."
                    : "Pick a card from another sanctuary.",
                dock: cards(options
                    .filter((o) => o.id !== "skip")
                    .map((o) => optionCard(o, "adopt-card", `data-owner="${o.owner}" data-cost="${o.slot}"`, "", "", o === chosen))
                    .join("")),
                back: pass("Pass"),
                primary: {
                    label: pick
                        ? `Adopt ${name} · ${adoptPick.slot ? amount(adoptPick.slot) : "free"}`
                        : "Adopt",
                    ui: "adopt-confirm",
                    disabled: !pick,
                },
                advice: advise(s, options, (o) => o.id === "skip"
                    ? passBy
                    : chosen
                        ? go
                        : `${hot("adopt-card", "owner", o.owner)}[data-cost="${o.slot}"]`, chosen),
                shot: marketShot(s),
            };
        }
        case "place": {
            // The lesson decides between a home and a release; free play offers both.
            const mode = (o) => !l || !!o.tuck === !!l.tuck, moment = tucking
                ? selectedCard < 0
                    ? "tuckCard"
                    : targetSlot < 0
                        ? "tuckHome"
                        : "confirm"
                : selectedCard < 0
                    ? "card"
                    : targetSlot < 0
                        ? "home"
                        : "confirm";
            let options, dock, advice;
            if (selectedCard < 0) {
                const all = cached("place", () => A.placeOptions(s, me)).filter(mode), 
                // Each animal once, with its best use.
                list = all.filter((o, i) => all.findIndex((x) => x.card === o.card) === i);
                options = flagged(gate || list.length
                    ? list
                    : [
                        {
                            id: "skip",
                            title: "Pass",
                            gain: "nothing fits",
                            why: "No animal in your hand fits a free habitat. Pass for now.",
                            value: 0,
                        },
                    ], advising(s));
                dock = cards(options
                    .filter((o) => o.id !== "skip")
                    .slice(0, 5)
                    .map((o) => optionCard({ ...o, title: (o.tuck ? "Release " : "") + o.title }, "select-card", `data-card="${o.card}" data-tuck="${!!o.tuck}"`))
                    .join(""));
                advice = advise(s, options, (o) => o.id === "skip" ? passBy : hot("select-card", "card", o.card));
            }
            else {
                const homes = cached("slots:" + selectedCard, () => A.slotOptions(s, me, selectedCard)), under = cached("tucks:" + selectedCard, () => A.tuckOptions(s, me, selectedCard)), swap = tucking ? homes : under;
                options = flagged(tucking ? under : homes, advising(s));
                const chosen = options.find((o) => o.slot === targetSlot) ?? null;
                dock =
                    cards(options
                        // Spaces of one habitat that bring the same are one choice.
                        .filter((o, i) => o === chosen ||
                        options.findIndex((x) => x.title === o.title && x.gain === o.gain) === i)
                        .map((o) => optionCard(o, "habitat", `data-slot="${o.slot}"`, "", "", o === chosen))
                        .join("")) +
                        (!l && swap.length
                            ? button(tucking
                                ? "Give it a home instead"
                                : "Release it instead · +1 point", "place-mode", `data-tuck="${!tucking}"`, "choice quiet")
                            : "");
                advice = advise(s, options, (o) => (chosen ? go : hot("habitat", "slot", o.slot)), chosen);
            }
            return {
                moment,
                tag,
                title: PROMPT[moment],
                sub: selectedCard < 0
                    ? `${plural(t.remaining ?? 1, "move")} left.`
                    : tucking
                        ? "Tucked cards score 1 point each."
                        : "Glowing spaces suit the " + cardName(selectedCard) + ".",
                dock,
                back: selectedCard > 0 ? { label: "Back", ui: "back" } : pass("Pass"),
                primary: selectedCard > 0
                    ? {
                        label: tucking ? "Release here" : "Place here",
                        ui: "place-confirm",
                        disabled: targetSlot < 0,
                    }
                    : undefined,
                advice,
                shot: L.SHOTS.turn,
                hand: true,
            };
        }
        case "row": {
            // A row must be chosen even when nothing in it can eat.
            const options = flagged(cached("rows", () => A.rowOptions(s, me)).map((o) => ({
                ...o,
                gain: o.blocked ?? o.gain,
                blocked: undefined,
            })), advising(s));
            return {
                moment: "row",
                tag,
                title: PROMPT.row,
                sub: "You feed every animal in that row once.",
                dock: cards(options
                    .slice()
                    .sort((x, y) => x.row - y.row)
                    .map((o) => optionCard(o, "feed-row", `data-row="${o.row}"`))
                    .join("")),
                advice: advise(s, options, (o) => `.opt[data-row="${o.row}"]`),
                shot: L.SHOTS.sanctuary,
            };
        }
        case "feed": {
            const options = flagged(cached("feed", () => A.feedOptions(s, me, t)), advising(s)), done = t.used?.length ? "Done feeding" : "Pass";
            return {
                moment: "feed",
                tag,
                title: PROMPT.feed,
                sub: `${plural(t.remaining ?? 1, "feed")} left. Each one spends a matching food.`,
                dock: cards(options
                    .map((o) => optionCard(o, "habitat", `data-slot="${o.slot}"`))
                    .join("")),
                back: pass(done),
                advice: advise(s, options, (o) => hot("habitat", "slot", o.slot)) ??
                    (advising(s)
                        ? {
                            why: "Nothing else here gains from a meal. Keep your food.",
                            point: passBy,
                            choice: false,
                        }
                        : undefined),
                shot: L.SHOTS.sanctuary,
            };
        }
        case "draft": {
            const id = draftPick >= 0 ? s.stacks[draftPick]?.at(-1) : undefined, options = open(cached("draft", () => A.draftOptions(s, me))), chosen = options.find((o) => o.stack === draftPick) ?? null;
            return {
                moment: "draft",
                tag,
                title: PROMPT.draft,
                sub: id
                    ? `Worth ${TILE[id].cp} points once its animals are housed.`
                    : "Its goal is revealed when you take it.",
                dock: cards(options
                    .filter((o) => o.id !== "skip")
                    // Tiles that promise the same are one choice.
                    .filter((o, i, all) => o === chosen ||
                    all.findIndex((x) => x.title === o.title && x.gain === o.gain) === i)
                    .map((o) => optionCard(o, "draft", `data-stack="${o.stack}"`, "", "", o === chosen))
                    .join("")),
                back: pass("Pass"),
                primary: id
                    ? { label: "Take this tile", ui: "draft-confirm" }
                    : undefined,
                advice: advise(s, options, (o) => o.id === "skip"
                    ? passBy
                    : chosen
                        ? go
                        : hot("draft", "stack", o.stack), chosen),
                shot: L.SHOTS.board,
            };
        }
        case "tile": {
            const positions = landPlacements(p, t.tile), tile = TILE[t.tile], cells = currentCells(s) ?? [], spots = cached("cells", () => A.cellOptions(s, me, t.tile)), mine = spots.find((o) => o.cells.join() === cells.join()), best = spots[0], done = tileComplete(p, t.tile);
            return {
                moment: "tile",
                tag,
                title: PROMPT.tile,
                sub: `House ${S.asks(tile.goals)} to score ${tile.cp} points.`,
                dock: `<div class="position-switch">${button("Turn it ↻", "position-next", `aria-label="Next position, ${placement + 1} of ${positions.length}"`, "choice")}</div><p class="dock-note">Covers ${cells.map((i) => (GRID_BONUS[i] === "draw" ? "1 card" : "1 " + GRID_BONUS[i])).join(" + ")} right away.</p>`,
                primary: { label: "Place tile", ui: "tile-confirm" },
                advice: advising(s) && best
                    ? {
                        why: `It asks for ${S.asks(tile.goals)}. ` +
                            (done
                                ? `They already live with you: +${tile.cp} points!`
                                : `Once they live with you, the −4 becomes +${tile.cp}.`) +
                            " " +
                            (mine === best
                                ? `${naledi.tileSet} This spot pays ${best.gain}.`
                                : `My spot would pay ${best.gain}.`),
                        point: go,
                        choice: false,
                    }
                    : undefined,
                shot: L.SHOTS.sanctuary,
            };
        }
        case "trap": {
            const tip = cached("trap", () => A.trapSlot(s, me));
            return {
                moment: "trap",
                tag: "A TRAP WAS HIDING",
                title: PROMPT.trap,
                sub: "It blocks a space and costs 4 points until an animal disarms it.",
                primary: targetSlot >= 0
                    ? { label: "Set trap here", ui: "trap-confirm" }
                    : undefined,
                advice: advising(s)
                    ? {
                        why: tip.why,
                        point: targetSlot >= 0 ? go : hot("habitat", "slot", tip.slot),
                        choice: false,
                    }
                    : undefined,
                shot: L.SHOTS.turn,
            };
        }
        case "collect": {
            const options = flagged(cached("reserve", () => A.reserveOptions(s, me)), advising(s));
            return {
                moment: "reserve",
                tag,
                title: PROMPT.reserve,
                sub: "From your own Reserve.",
                dock: `<div class="food-row">${FOODS.map((f) => button(`${foodIcon(f)}<b>${p.reserve[f]}</b>`, "collect", `data-food="${f}" aria-label="${f}" ${!p.reserve[f] ? "disabled" : ""}`, "food-chip" + (options.find((o) => o.id === f)?.best ? " best" : ""))).join("")}</div>`,
                back: pass("Pass"),
                advice: advise(s, options, (o) => `.food-chip[data-food="${o.id}"]`),
                shot: L.SHOTS.supplies,
            };
        }
        case "effect":
            return ability(s, t, p, tag);
    }
}
function ability(s, t, p, tag) {
    const name = t.source ? cardName(t.source) : "", tip = advising(s)
        ? cached("effect", () => A.effectAdvice(s, myself(), t))
        : null, c = tip?.command.type === "effect" ? tip.command : null;
    let dock = "", primary, sub = "";
    if (t.ability === "food") {
        primary = { label: `Take ${amount(t.amount)}`, ui: "ability-simple" };
        sub = `Gain ${amount(t.amount)} of your choice.`;
    }
    else if (t.ability === "draw") {
        primary = {
            label: `Draw ${plural(t.amount, "card")}`,
            ui: "ability-simple",
        };
        sub = `Draw ${plural(t.amount, "card")} into your hand.`;
    }
    else if (t.ability === "discardLand") {
        dock =
            p.land
                .map((x, i) => button(`<strong>Remove ${x.id}</strong><small>${x.completed ? TILE[x.id].cp + " CP" : "unfinished"}</small>`, "ability-land", `data-land="${i}"`, "choice"))
                .join("") ||
                '<p class="dock-note">You have no Land Tiles to discard.</p>';
        sub = "Discard 1 Land Tile to free its spaces.";
    }
    else if (t.ability === "disarmOwn" || t.ability === "disarmOther") {
        const targets = disarmTargets(s, t);
        dock =
            targets
                .map((trap) => button(`<strong>Disarm ${esc(s.players[trap.target].name)}’s trap</strong><small>${esc(cardName(trap.card))}${trap.target !== myself() ? " · +4 CP" : ""}</small>`, "ability-disarm", `data-target="${trap.target}" data-slot="${trap.slot}" data-card="${trap.card}"`, "choice"))
                .join("") || '<p class="dock-note">No trap is in reach right now.</p>';
        sub =
            t.ability === "disarmOwn"
                ? "Disarm 1 trap in your sanctuary."
                : "Disarm 1 trap in another sanctuary.";
    }
    else if (t.ability === "swap") {
        dock = `<label>Back to your hand<select id="swap-out">${p.slots.flatMap((slot, i) => (slot && CARD[slot.card.id] ? [`<option value="${i}:-1">${esc(cardName(slot.card.id))} · space ${i + 1}</option>`, ...slot.tucked.map((c, j) => `<option value="${i}:${j}">${esc(cardName(c.id))} · tucked at ${i + 1}</option>`)] : [])).join("")}</select></label><label>Takes its place<select id="swap-in">${p.hand.map((c) => `<option value="${c.id}">${esc(cardName(c.id))}</option>`).join("")}</select></label>`;
        primary = {
            label: "Swap them",
            ui: "ability-swap",
            disabled: !p.hand.length,
        };
        sub = "Swap a sanctuary animal with one from your hand.";
    }
    return {
        moment: "ability",
        tag: t.source ? `WHEN FED · ${name.toUpperCase()}` : tag,
        title: t.source ? PROMPT.ability : "Choose your food",
        sub: t.source ? sub : "Naledi adopted from your offer and pays her fee.",
        dock,
        back: { label: "Skip", ui: "skip" },
        primary,
        advice: tip
            ? {
                why: tip.why,
                point: !tip.use
                    ? ".actions .ghost:not(:disabled)"
                    : c?.target !== undefined
                        ? `.dock .choice[data-target="${c.target}"]`
                        : c?.land !== undefined
                            ? `.dock .choice[data-land="${c.land}"]`
                            : ".actions .go:not(:disabled)",
                choice: false,
            }
            : undefined,
        shot: L.SHOTS.sanctuary,
    };
}
/** Her pick and the reason, as one sentence pair for the bubble. */
function pickLine(adv, lead = naledi.pick) {
    if (adv.other)
        return `<b>${esc(adv.other.title)}.</b> ${esc(adv.other.why)}${adv.best ? ` <i>${naledi.pick}: ${esc(adv.best.title)}.</i>` : ""}`;
    return adv.best && adv.choice
        ? `<b>${lead}: ${esc(adv.best.title)}.</b> ${esc(adv.why)}`
        : esc(adv.why);
}
/**
 * Naledi's line for this moment, or null when she has nothing to add and the
 * plain prompt speaks for itself. In a lesson she speaks the script and adds
 * her pick wherever there is a real choice; after the lessons, and in any game
 * with tips on, she names her pick and the reason for every decision.
 */
function coach(s, p) {
    const me = myself(), go = ".actions .go:not(:disabled)", bold = (text, vars = {}) => esc(text)
        .replace(/\{(\w+)\}/g, (_, k) => esc(vars[k] ?? ""))
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    if (watch && !sceneBusy())
        return {
            say: esc(watch.steps[watch.i].label),
            next: { label: "Skip replay", ui: "watch-skip" },
        };
    // A scene comes first: she tells her part once it has been closed.
    if (narration && !sceneBusy())
        return { say: esc(narration.lines[narration.i]), telling: true };
    if (!guided(s) && !advising(s))
        return null;
    if (s.phase === "over") {
        if (!guided(s))
            return null;
        const win = winners(s);
        return {
            say: bold(win.length > 1 && win.includes(me)
                ? naledi.tie
                : win.includes(me)
                    ? naledi.win
                    : naledi.lose),
        };
    }
    if (inIntro(s)) {
        const step = intros[guide.intro];
        const g = goalFocus(s, me);
        return {
            say: bold(step.say, {
                goal: g?.label ?? "a Region Goal",
                cp: g?.cp ?? 0,
                tiers: g?.tiers.map((cp, i) => `${ORDINAL[i]}: ${cp} CP`).join(" → ") ?? "",
                progress: g?.progress ?? 0,
                target: g?.target ?? 1,
            }),
            next: { label: step.button, ui: "guide-next" },
        };
    }
    if (goalGate(s)) {
        const g = goalFocus(s, me);
        return {
            say: bold(`You completed **${g.label}**. Claim it now for **${g.cp} CP**: no die and no move spent. The claim order is ${g.tiers.map((cp, i) => `${ORDINAL[i]}: ${cp} CP`).join(" → ")}.`),
            point: ".claim-button:not(:disabled)",
            only: "Claim your goal",
        };
    }
    if (gradGate(s))
        return {
            say: bold(naledi.graduate, { goals: s.length }),
            next: { label: "Let’s race!", ui: "guide-graduate" },
        };
    const m = p.moment, adv = p.advice, want = wantedAction(s), vars = {
        die: adv?.best?.die !== undefined ? s.dice[adv.best.die] : "",
        action: want ? ACTION_NAMES[want] : "",
    }, fallback = {
        action: ".opt:not(:disabled)",
        die: ".die-chip:not(:disabled)",
        card: '.hot[data-ui="select-card"]',
        tuckCard: '.hot[data-ui="select-card"]',
        home: '.hot[data-ui="habitat"]',
        tuckHome: '.hot[data-ui="habitat"]',
        confirm: go,
        row: ".dock .opt:not(:disabled)",
        feed: '.hot[data-ui="habitat"]',
        ability: go + ", .dock .choice",
        draft: draftPick >= 0 ? go : '.hot[data-ui="draft"]',
        tile: go,
        offer: go,
        adopt: adoptPick ? go : '.hot[data-ui="adopt-card"]',
        bonus: adoptPick ? go : '.hot[data-ui="adopt-card"]',
        reserve: ".food-chip:not(:disabled)",
        trap: targetSlot >= 0 ? go : '.hot[data-ui="habitat"]',
        end: go,
        claim: ".claim-button:not(:disabled)",
    }, point = adv?.point ?? fallback[m], pick = !!adv?.choice && !!adv.best && !adv.other && !adv.settled, 
    // Her reason goes with every choice still open. Where a lesson offers a
    // single move, its own line already says why.
    why = adv &&
        !adv.settled &&
        !(m === "action" && currentGuide() && !adv.choice && s.active === me)
        ? pickLine(adv)
        : undefined;
    // The dance is a move of its own: with this turn's move spent it waits a turn.
    if (rainGate(s) && (m === "action" || m === "die" || m === "end"))
        return {
            say: bold(m === "die"
                ? naledi.rainDie
                : m === "end"
                    ? naledi.rainSoon
                    : naledi.rainAction, vars),
            point,
        };
    const l = currentGuide(), myTurn = s.active === me;
    if (l && myTurn) {
        // A lesson can need a detour first: more food, usually.
        if (s.phase === "choose" && want && want !== l.action)
            return {
                say: bold(m === "die" ? naledi.prepDie : naledi.prepAction, vars),
                why: m === "die" ? why : undefined,
                point,
                pick,
            };
        if (m === "ability" && l.lines.ability && firstAbility < 0)
            firstAbility = s.revision;
        const teaching = s.phase !== "resolve" || s.action === l.action, line = m === "ability" && firstAbility === s.revision
            ? l.lines.ability
            : guide.demonstrated
                ? (l.done[m] ?? l.lines[m])
                : m === "end"
                    ? s.action === l.action
                        ? naledi.retry
                        : naledi.prepEnd
                    : l.lines[m];
        return {
            say: bold(teaching && line ? line : naledi.free[m], vars),
            why,
            point,
            pick,
        };
    }
    if (m === "wait")
        return guided(s) ? { say: bold(naledi.free.wait) } : null;
    if (!myTurn && s.phase === "resolve" && guided(s)) {
        // Naledi chose the action; the player is invited along.
        const invite = naledi.passive[m], known = !s.action || learned(s.action), later = invite && !known && p.back?.ui === "skip";
        return {
            say: bold((invite ?? naledi.free[m]) + (later ? " " + naledi.later : "")),
            why: later ? undefined : why,
            point: l && !known ? undefined : point,
            pick,
        };
    }
    // Outside the lessons she names her pick and says why, for every decision.
    if (adv)
        return {
            say: adv.settled
                ? bold(naledi.free[m])
                : (replying && m === "action"
                    ? `<b>${naledi.reply}.</b> `
                    : m === "offer"
                        ? esc(naledi.offerSet) + " "
                        : "") + pickLine(adv),
            point,
            pick,
        };
    // Steps without a choice still get their one line and the pointer.
    return m === "over" ? null : { say: bold(naledi.free[m]), point };
}
// ---------- HUD ----------
const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICON = {
    help: svg('<path d="M8.8 9.2a3.3 3.3 0 1 1 5 2.8c-1.1.7-1.8 1.3-1.8 2.6M12 18v.3" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>'),
    table: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
    journal: svg('<path d="M5 6.5h14M5 12h14M5 17.5h9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
    sound: svg('<path d="M4 9.5h3.5l4.5-4v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    mute: svg('<path d="M4 9.5h3.5l4.5-4v13l-4.5-4H4z" fill="currentColor"/><path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
    leave: svg('<path d="M10 4.5H5.5v15H10M14 8l4 4-4 4M18 12H9.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    check: svg('<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>'),
    star: svg('<path d="m12 2.8 2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.1l-5.7 3 1.2-6.3L2.9 9.4l6.3-.8z" fill="currentColor"/>'),
    chevron: svg('<path d="m6 9.5 6 6 6-6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    moves: svg('<path d="M4 5h16v11h-8.5L7 19.5V16H4z" fill="currentColor"/>'),
    tip: svg('<path d="M12 3a6.2 6.2 0 0 0-3.6 11.3c.6.5 1 1.2 1 2V17h5.2v-.7c0-.8.4-1.5 1-2A6.2 6.2 0 0 0 12 3Z" fill="currentColor"/><path d="M9.8 20.2h4.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
};
const tool = (icon, label, ui, attrs = "") => button(icon, ui, `title="${label}" aria-label="${label}" ${attrs}`, "tool");
/** Logo and a handful of round buttons: everything that is not the game itself. */
function menu() {
    const s = room?.game;
    return `<div class="menu"><a class="brand" href="/" data-ui="home">PAWS<small>WILD VENTURES</small></a>${tool(ICON.help, "How to play", "help")}${s && (shown("rail") || s.phase === "over") ? tool(ICON.table, tableView ? "Back to my seat" : "See the whole table", "table-view", tableView ? 'aria-pressed="true"' : "") + tool(ICON.journal, "Table journal", "journal") : ""}${s && !s.tutorial ? tool(ICON.tip, tips ? "Naledi’s tips are on" : "Naledi’s tips are off", "tips", `aria-pressed="${tips}"`) : ""}${tool(sfx.isMuted() ? ICON.mute : ICON.sound, sfx.isMuted() ? "Sound is off" : "Sound is on", "sound")}${room ? tool(ICON.leave, "Leave the table", "leave-ask") : ""}${room && room.mode !== "solo" ? button("Room " + room.code, "share", 'title="Copy the invite link"', "room-chip") : ""}<span id="connection" class="${connected ? "" : "offline"}"></span></div>`;
}
const WAY_SHORT = {
    animals: "Animals",
    companions: "Friends",
    tucked: "Tucked",
    land: "Land",
    regions: "Goals",
    food: "Food",
    traps: "Traps",
    rain: "Rain",
};
/** A header that folds its panel away or brings it back. */
const fold = (panel, body, cls, label) => button(`${body}<i class="chev">${ICON.chevron}</i>`, "panel-toggle", `data-panel="${panel}" aria-expanded="${panels[panel]}" title="${panels[panel] ? "Hide" : "Show"} ${label}"`, cls);
/**
 * The race: who leads and by how much, a bar per player that grows as points
 * come in, and the viewer's own score sheet with all eight ways to score. It
 * folds down to the standing and one score chip per player.
 */
function rail(s) {
    const me = myself(), st = S.standing(s, me), scale = Math.max(40, ...st.totals) * 1.08, sheet = score(s, me), open = panels.race;
    return `<section class="rail${open ? "" : " closed"}${arrived.has("rail") ? " arrive" : ""}" aria-label="The race">${fold("race", `<b>${esc(st.line || "The race")}</b><span>${s.phase === "over" ? "Final score" : s.finalLeft !== null ? "Final turns" : "Round " + s.round}</span>`, `race-head ${st.lead > 0 ? "ahead" : st.lead < 0 ? "behind" : ""}`, "the race")}<div class="seats">${s.players
        .map((p, i) => {
        const online = p.bot || p.auto || room.players.find((x) => x.id === p.id)?.online, need = p.bot ? 4 : s.length, total = st.totals[i], width = Math.round((100 * Math.max(0, total)) / scale), bar = moved("bar" + i, width), num = moved("cp" + i, total);
        return button(`<span class="face${p.bot ? " naledi" : ""}">${p.bot ? "" : esc((i === me ? "You" : p.name).slice(0, 1).toUpperCase())}</span><span class="who">${i === me ? "You" : esc(p.name)}${p.auto ? '<i class="bot-tag">BOT</i>' : ""}${online ? "" : " · away"}</span><span class="stars" aria-label="${p.goals.length} of ${need} Region Goals">${Array.from({ length: need }, (_, k) => `<i class="${k < p.goals.length ? "on" : ""}">${ICON.star}</i>`).join("")}</span><span class="track"><i style="--from:${bar.from}%;--to:${width}%;animation-delay:-${Math.min(bar.age, 900)}ms"></i></span><b class="cp${num.age < 1600 ? (total > num.from ? " up" : " down") : ""}" style="animation-delay:-${Math.min(num.age, 1600)}ms">${total}</b>`, "view-player", `data-player="${i}" title="${i === me ? "Your sanctuary" : `Visit ${esc(p.name)}’s sanctuary`}"`, "seat c" +
            i +
            (s.active === i && s.phase !== "over" ? " active" : "") +
            (viewPlayer === i && i !== me ? " viewing" : ""));
    })
        .join("")}</div>${open
        ? `${fold("ways", `<span>Your points</span><b>${sheet.total}</b>`, "ways-head", "your score sheet")}${panels.ways
            ? `<div class="ways" aria-label="Where your points come from">${WAYS.map((w) => {
                const n = sheet[w.key], m = moved("way:" + w.key, n);
                return button(`<small>${WAY_SHORT[w.key]}</small><b>${n}</b>`, "way", `data-way="${w.key}" title="${esc(w.name)}: ${esc(w.how)}" style="animation-delay:-${Math.min(m.age, 1600)}ms"`, "way" +
                    (n > 0 ? " on" : n < 0 ? " neg" : "") +
                    (m.age < 1600 ? (n > m.from ? " up" : " down") : ""));
            }).join("")}</div>`
            : ""}`
        : ""}</section>`;
}
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th"];
/**
 * Six goals, a bar each, and a big button when one is ready. The panel folds
 * to its header, and each goal unfolds to say where it is, how far along the
 * viewer is and what the next claim is worth.
 */
function goals(s) {
    const me = myself(), p = s.players[me], keys = Object.keys(s.claims), ready = keys.some((k) => claimable(s, me, k)), 
    // Folded by default so a ready goal only glows; except Naledi's one-time
    // "claim your first goal" lesson, whose pointer needs the claim button
    // actually on screen (see goalGate() in coach()).
    taught = taughtClaim(s), 
    // The welcome's last goal beat points at the tracker, so it is unfolded;
    // in the guided game a goal ready on your turn unfolds it as well, so the
    // Claim button Naledi points at is really there.
    open = panels.goals ||
        !!taught ||
        regionBeat(s) === 2 ||
        (guided(s) && ready && s.active === me && !inIntro(s)), focus = guided(s) ? goalFocus(s, me) : null, 
    // While one goal is taught, it is the only one listed.
    single = inIntro(s) || !!taught, shownKey = taught ?? focus?.key;
    return `<section class="goals${open ? "" : " closed"}${ready ? " ready" : ""}${arrived.has("goals") ? " arrive" : ""}${taught || regionBeat(s) === 2 ? " taught" : ""}" aria-label="Region Goals">${button(`<span>Region Goals</span><b>${ICON.star}${p.goals.length} / ${s.length}</b><i class="chev">${ICON.chevron}</i>`, "panel-toggle", `data-panel="goals" aria-expanded="${open}" title="${open ? "Hide" : "Show"} the Region Goals${ready && !open ? " · ready to claim" : ""}"`, "goals-head")}${open
        ? `${focus && !single && currentGuide() ? `<p class="goal-chase">Next target: <b>${esc(focus.label)}</b><span>${focus.progress}/${focus.target} · next claim ${focus.cp} CP${focus.ready ? " · ready!" : ""}</span></p>` : ""}` +
            s.regions
                .map((r) => r.goals
                .map((g, j) => {
                if (single && `${r.id}:${j}` !== shownKey)
                    return "";
                const key = `${r.id}:${j}`, claimed = p.goals.includes(key), can = claimable(s, me, key), progress = Math.min(g.target, goalProgress(p, g)), tier = s.claims[key].length, cp = claimed
                    ? (g.tiers[s.claims[key].indexOf(me)] ?? 0)
                    : (g.tiers[tier] ?? 0), more = goalOpen === key;
                return `<div class="goal ${claimed ? "claimed" : can ? "ready" : ""}${more ? " more" : ""}">${button(`<span class="g-name">${esc(g.label)}</span><span class="bar" aria-label="${progress} of ${g.target}"><i style="width:${Math.round((100 * progress) / g.target)}%"></i></span>`, "goal-more", `data-goal="${key}" aria-expanded="${more}" title="${esc(r.name)} · ${more ? "hide" : "show"} details"`, "g-main")}<span class="g-cp">${claimed ? ICON.check : ""}${cp}</span>${can ? button(`Claim +${cp}`, "claim", `data-goal="${key}" ${s.active !== me || s.phase === "over" || inIntro(s) ? "disabled" : ""}`, "claim-button") : ""}<span class="claimants">${s.claims[key].map((i) => `<i class="c${i}" title="${esc(s.players[i].name)}"></i>`).join("")}</span>${more
                    ? `<div class="g-more"><small>${esc(r.name)} · ${esc(r.country)}</small><span>${claimed ? `You claimed it for ${cp} points.` : `You have ${progress} of ${g.target}. ${cp ? `Claim it ${ORDINAL[tier]} for ${cp} points.` : "Claim for 0 CP; it still counts toward the Rain Dance."}`}</span><span class="tiers">${Array.from({ length: s.players.length }, (_, k) => g.tiers[k] ?? 0)
                        .map((t, k) => {
                        const by = s.claims[key][k];
                        return `<i class="${by !== undefined ? "taken c" + by : k === tier ? "next" : ""}" title="${by !== undefined ? esc(by === me ? "You" : s.players[by].name) + " claimed it " + ORDINAL[k] : ORDINAL[k] + " to claim"}"><small>${ORDINAL[k]}</small>${t}</i>`;
                    })
                        .join("")}</span></div>`
                    : ""}</div>`;
            })
                .join(""))
                .join("")
        : ""}</section>`;
}
/**
 * The moves box, bottom left: the last moves of everyone at the table, newest
 * at the bottom like a chat. Folded, it keeps showing the latest line.
 */
function moveLog(s) {
    const me = myself(), rows = S.history(s, me);
    if (!rows.length)
        return "";
    const now = performance.now(), count = new Map(), keys = rows.map((m) => {
        const k = `${m.turn}|${m.who}|${m.text}`, n = (count.get(k) ?? 0) + 1;
        count.set(k, n);
        return k + "|" + n;
    }), 
    // The first time the box is drawn nothing is new: it is simply there.
    first = !logBorn.size;
    for (const k of keys)
        if (!logBorn.has(k))
            logBorn.set(k, first ? 0 : now);
    for (const k of [...logBorn.keys()])
        if (!keys.includes(k))
            logBorn.delete(k);
    const line = (m) => m.who < 0 ? esc(m.text) : `<b>${esc(m.name)}</b> ${esc(m.text)}`, last = rows[rows.length - 1], open = panels.log;
    return `<section class="log${open ? "" : " closed"}" aria-label="Moves">${button(`${ICON.moves}<span>Moves</span><em class="c${last.who}">${line(last)}</em><i class="chev">${ICON.chevron}</i>`, "panel-toggle", `data-panel="log" aria-expanded="${open}" title="${open ? "Hide" : "Show"} the last moves"`, "log-head")}${open
        ? `<div class="log-body" role="log" aria-live="polite" tabindex="0">${rows
            .map((m, i) => {
            const age = now - logBorn.get(keys[i]), fresh = age < 700;
            return m.who < 0
                ? `<p class="move sys${fresh ? " new" : ""}">${line(m)}</p>`
                : `<p class="move c${m.who}${m.who === me ? " mine" : ""}${fresh ? " new" : ""}"${fresh ? ` style="animation-delay:-${Math.round(age)}ms"` : ""}><span class="face${s.players[m.who].bot ? " naledi" : ""}">${s.players[m.who].bot ? "" : esc(m.name.slice(0, 1).toUpperCase())}</span><span>${line(m)}</span></p>`;
        })
            .join("")}</div>`
        : ""}</section>`;
}
/** Top centre: whose turn, and the one thing to do (or the lesson being taught). */
function prompt(s, p, beat) {
    const l = currentGuide();
    let tag = p.tag, title = p.title, sub = beat ? "" : p.sub;
    if (guided(s) && s.phase !== "over") {
        if (inIntro(s)) {
            tag = "WELCOME TO THE RESERVE";
            title = "Naledi’s field school";
            sub = "";
        }
        else if (l) {
            // The lesson, and how far into it the player is: the trail above fills
            // by the same count.
            const { step, of } = lessonProgress(guide.lesson, "wait", !!guide.demonstrated, reached.step);
            tag = `LESSON ${guide.lesson + 1} OF ${lessons.length} · ${guide.demonstrated ? "DONE" : `STEP ${step + 1} OF ${of}`}`;
            title = l.title;
            sub = "";
        }
    }
    if (watch && !sceneBusy()) {
        tag = `NALEDI · ${watch.i + 1} / ${watch.steps.length}`;
        title = "Watch my move";
        sub = "";
    }
    return `<div class="prompt"><span>${tag}</span><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ""}</div>`;
}
/** Naledi and her speech bubble. The instruction itself sits in a chip under her words. */
function bubble(beat, task) {
    // The bubble pops in only when she says something new, not on every redraw.
    const words = beat.say + (beat.why ?? ""), fresh = words !== spoken;
    spoken = words;
    return `<section class="guide${beat.telling ? " telling" : ""}" aria-live="polite"><div class="naledi" role="img" aria-label="Naledi"></div><div class="bubble${fresh ? " fresh" : ""}"><b>Naledi</b><p>${beat.say}</p>${beat.why ? `<p class="why">${ICON.star}<span>${beat.why}</span></p>` : ""}${beat.next
        ? button(`${esc(beat.next.label)} &nbsp;→`, beat.next.ui, "", "btn go")
        : beat.telling
            ? button("Continue &nbsp;→", "narrate-next", "", "link")
            : task
                ? `<div class="task">${esc(task)}</div>`
                : ""}</div></section>`;
}
function scoreboard(s) {
    const labels = {
        animals: "Fed animals",
        companions: "Companions",
        tucked: "Tucked cards",
        land: "Protected land",
        regions: "Region Goals",
        food: "Leftover food",
        traps: "Traps",
        rain: "Rain Dance",
        adopted: "Adopted (Naledi)",
    };
    const win = winners(s), me = myself();
    return `<section class="scoreboard"><div class="podium">${s.players.map((p, i) => `<div class="c${i}${win.includes(i) ? " win" : ""}"><span class="face${p.bot ? " naledi" : ""}">${p.bot ? "" : esc((i === me ? "You" : p.name).slice(0, 1).toUpperCase())}</span><b>${score(s, i).total}</b><span>${i === me ? "You" : esc(p.name)}</span></div>`).join("")}</div><details${s.tutorial ? "" : " open"}><summary>How the points add up</summary><div class="score-table"><table><thead><tr><th></th>${s.players.map((p, i) => `<th class="${win.includes(i) ? "win" : ""}">${i === me ? "You" : esc(p.name)}</th>`).join("")}</tr></thead><tbody>${Object.entries(labels)
        .filter(([key]) => key !== "adopted" || s.players.some((p) => p.bot))
        .map(([key, label]) => `<tr><td>${label}</td>${s.players.map((_, i) => `<td>${score(s, i)[key]}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div><p class="dock-note">Only fully fed animals score their printed CP. Ties: most goals${s.players.some((p) => p.bot) ? "" : ", then most completed Land Tiles"}.</p></details><div class="score-actions">${button("Save record", "export", "", "btn ghost")}${button("Play again &nbsp;→", "leave", "", "btn go")}</div></section>`;
}
/** Food at a glance; the Reserve and Raindrops join once they matter. */
function wallet(s) {
    const p = s.players[myself()], reserve = total(p.reserve);
    return `<section class="wallet${arrived.has("wallet") ? " arrive" : ""}" aria-label="Your Food Bank">${FOODS.map((f) => `<span title="${f}">${foodIcon(f)}<b>${p.bank[f]}</b></span>`).join("")}${reserve || !guided(s) || learned("collect") ? `<span class="reserve" title="Reserve: locked until you Collect">Reserve <b>${reserve}</b></span>` : ""}${shown("goals") ? `<span class="drops" title="Raindrops left for Region Goals">${img(dropArt(myself()), "Raindrops", "food-icon")}<b>${(p.bot ? 4 : 5) - p.goals.length}</b></span>` : ""}</section>`;
}
function hud(s) {
    const p = play(s), over = s.phase === "over", beat = coach(s, p), 
    // A line to read, or Naledi's own turn: nothing else competes with it.
    quiet = !!beat && (!!beat.next || !!beat.telling || !!beat.only), lessonOn = !!beat && !over && !quiet;
    trailView = trailState(s, p);
    pointerSel =
        beat?.point && advising(s) && !over && !sceneBusy() ? beat.point : "";
    pointerPick = !!beat?.pick;
    return `${menu()}
${prompt(s, p, beat)}
<div class="side${over ? " over" : ""}">${shown("rail") ? rail(s) : ""}${over ? scoreboard(s) : shown("goals") ? goals(s) : ""}</div>
<div class="left">${beat ? bubble(beat, beat.only ?? (lessonOn && guided(s) && p.moment !== "wait" ? p.title : "")) : ""}${!quiet && p.dock ? `<section class="dock">${p.dock}</section>` : ""}${actingAs ? button("Covering an away seat · back to mine", "stop-takeover", "", "choice") : ""}</div>
<div class="bottom"><div class="corner">${shown("rail") ? moveLog(s) : ""}${over || !shown("wallet") ? "" : wallet(s)}</div>${!quiet && (p.back || p.primary)
        ? `<div class="actions">${p.back ? button(esc(p.back.label), p.back.ui, p.back.disabled ? 'disabled title="Try the lesson step first"' : "", "btn ghost") : ""}${p.primary ? button(`${ICON.check}${esc(p.primary.label)}`, p.primary.ui, p.primary.disabled ? "disabled" : "", "btn go") : ""}</div>`
        : ""}</div>`;
}
const LENGTHS = '<option value="3">Short · 3 goals</option><option value="4" selected>Normal · 4 goals</option><option value="5">Long · 5 goals</option>';
function welcome() {
    const join = new URLSearchParams(location.search).get("room") || "";
    const resume = localStorage.getItem("paws.resume");
    return `${menu()}
<div class="title-card"><span>A LITTLE SANCTUARY. A WILD ADVENTURE.</span><h1>Make room<br>for the wild</h1></div>
<section class="panel welcome" aria-label="Start a game"><div class="hello"><div class="naledi" role="img" aria-label="Naledi"></div><p><b>Naledi</b>Pull up a chair! Shall I show you around?</p></div>${button("<strong>Learn to play</strong><span>Naledi shows you, one step at a time</span>", "new-tutorial", "", "mode go")}${button("<strong>Solo game</strong><span>Race Naledi to the Rain Dance</span>", "new-solo", "", "mode")}${button("<strong>Play with friends</strong><span>Host a table for 2–5</span>", "new-friends", "", "mode")}${button("<strong>Play with bots</strong><span>Fill empty seats with bots</span>", "new-bots", "", "mode")}<div class="join-row"><input id="join-code" aria-label="Room code" placeholder="ROOM CODE" maxlength="6" value="${esc(join)}">${button("Join", "join", "", "btn ghost")}</div><div class="setup-row"><label>Your name<input id="player-name" maxlength="24" placeholder="Conservationist" value="${esc(localStorage.getItem("paws.name") || "")}"></label><label>Game length<select id="game-length">${LENGTHS}</select></label></div>${resume ? button("Back to my saved seat", "resume", "", "link") : ""}</section>`;
}
const SEAT_COUNTS = '<option value="2">2 players</option><option value="3">3 players</option><option value="4" selected>4 players</option><option value="5">5 players</option>';
function lobby() {
    const r = room, bots = r.mode === "bots";
    return `${menu()}
<div class="title-card"><span>${bots ? "BOTS FILL THE REST" : "A TABLE FOR FRIENDS"}</span><h1>Welcome<br>to the wild</h1></div>
<section class="panel lobby"><span class="eyebrow">ROOM CODE</span><div class="code-large">${r.code}</div>${button("Copy invite link", "share", "", "btn ghost")}<div class="lobby-seats">${r.players.map((p, i) => `<div class="c${i}"><span class="face">${esc(p.name.slice(0, 1).toUpperCase())}</span><strong>${esc(p.name)}</strong><span>${p.id === r.host ? "Host · " : ""}${p.online ? "Here" : "Away"}</span></div>`).join("")}${Array.from({ length: 5 - r.players.length }, () => '<div class="vacant"><span class="face"></span><span>Open chair</span></div>').join("")}</div>${r.you === r.host
        ? `<label>Game length<select id="game-length">${LENGTHS}</select></label>${bots
            ? `<label>Table size<select id="seat-count">${SEAT_COUNTS}</select></label><p class="dock-note">Any seat still open when you start fills with a bot that takes its turns on its own.</p>`
            : ""}${button("Start the game &nbsp;→", "start", !bots && r.players.length < 2 ? "disabled" : "", "btn go")}${!bots && r.players.length < 2 ? '<p class="dock-note">Friends open this address, choose Join and enter the code.</p>' : ""}`
        : '<p class="dock-note">Waiting for the host to start…</p>'}</section>`;
}
// ---------- inspector ----------
function feedingHtml(id) {
    const f = room?.game && feedingForCard(room.game, id);
    return f
        ? `<section class="feeding-note${f.hungry ? " hungry" : ""}"><strong>${esc(f.title)}</strong><p>${esc(f.timing)}</p><p>${esc(f.consequence)}</p></section>`
        : "";
}
function inspectHtml(i) {
    const s = room?.game;
    switch (i.kind) {
        case "card": {
            const a = CARD[i.id];
            return `${img(cardArt(i.id), cardName(i.id))}<div><b>Original printed face</b><br>${esc(cardName(i.id))} · ${a ? `${a.need} ${a.food} → ${a.cp} CP · ${a.habitats.length === 5 ? "any habitat" : a.habitats.map((h) => HABITAT_NAMES[h]).join(" / ")}` : "blocks a habitat · −4 CP until disarmed"}${feedingHtml(i.id)}</div>`;
        }
        case "tile": {
            const t = TILE[i.id];
            return `<span class="tile-art">${img(i.hidden ? t.art.replace("_Front", "_Back") : t.art, t.id)}</span><div><b>Original printed face</b><br>${i.hidden ? `${t.cp} CP reward · ${t.size} hex · goal revealed when drafted` : `${t.goals.map(([g, n]) => n + " " + g).join(" + ")} in habitats → ${t.cp} CP`}</div>`;
        }
        case "region": {
            const r = s?.regions.find((x) => x.id === i.id);
            return `${turned(regionArt(i.id), r?.name ?? "Region")}<div><b>Original printed face</b><br>${r ? esc(r.name) + " · " : ""}Region objectives and rewards</div>`;
        }
        case "solo":
            return `${img(soloArt(i.id), "Naledi action card")}<div><b>Original printed face</b><br>Naledi · solo card ${i.id}</div>`;
        case "rain":
            return `${img(RAIN_ART, "Rain Dance tile")}<div><b>Original printed face</b><br>Rain Dance · original conditions and endgame text</div>`;
    }
}
function inspectOf(el) {
    if (!el)
        return null;
    const d = el.dataset;
    if (d.card && Number(d.card) > 0)
        return { kind: "card", id: Number(d.card) };
    if (d.tile)
        return { kind: "tile", id: d.tile, hidden: !!d.hidden };
    if (d.region)
        return { kind: "region", id: Number(d.region) };
    if (d.solo)
        return { kind: "solo", id: Number(d.solo) };
    if (d.ui === "inspect-rain" || d.action === "rain")
        return { kind: "rain" };
    return null;
}
function renderInspect() {
    const s = room?.game, t = s?.tasks[0];
    let show = hoverInspect;
    // The lifted hero card already reads at full size; other picks get the panel.
    if (!show && s && canPlay() && s.phase === "resolve") {
        if (t?.kind === "adopt" && adoptPick) {
            const c = s.offers[adoptPick.owner]?.cards[adoptPick.slot];
            if (c?.id)
                show = { kind: "card", id: c.id };
        }
        if (t?.kind === "draft" && draftPick >= 0 && s.stacks[draftPick]?.length)
            show = { kind: "tile", id: s.stacks[draftPick].at(-1), hidden: true };
        if (t?.kind === "tile")
            show = { kind: "tile", id: t.tile };
        if (t?.kind === "trap")
            show = null;
    }
    if (!show && s && rainGate(s))
        show = { kind: "rain" };
    const html = show ? inspectHtml(show) : "";
    inspectEl.className = "inspect" + (show ? " show " + show.kind : "");
    document.body.classList.toggle("inspecting", !!show);
    if (html && inspectEl.innerHTML !== html)
        inspectEl.innerHTML = html;
    placeInspect();
}
/** The spotlight's frames as last drawn, so the inspector can keep off them. */
let litHoles = [];
inspectEl.addEventListener("load", () => placeInspect(), true);
/**
 * The inspector shows its print at the right. When that would lie across a
 * frame of the spotlight, it moves under Naledi's column instead, if there
 * is room there; the camera stays where it is either way.
 */
function placeInspect() {
    inspectEl.classList.remove("aside");
    if (!inspectEl.classList.contains("show") || !litHoles.length)
        return;
    // A print still loading counts at its full height already.
    const box = inspectEl.getBoundingClientRect(), r = new DOMRect(box.left, box.top, box.width, Math.max(box.height, inspectEl.querySelector("img") ? box.width * 1.5 : 0)), hits = (b) => litHoles.some((h) => b.left < h.x1 + 12 &&
        h.x0 - 12 < b.right &&
        b.top < h.y1 + 12 &&
        h.y0 - 12 < b.bottom);
    if (!hits(r))
        return;
    const col = app.querySelector(".left")?.getBoundingClientRect();
    if (!col?.width)
        return;
    const top = col.bottom + 18, floor = Math.min(innerHeight - 18, ...[...app.querySelectorAll(".bottom .corner > *")]
        .map((el) => el.getBoundingClientRect())
        .filter((b) => b.height > 0 && b.left < col.left + r.width)
        .map((b) => b.top - 12)), there = {
        left: col.left,
        top,
        right: col.left + r.width,
        bottom: top + r.height,
    };
    if (there.bottom > floor || hits(there))
        return;
    inspectEl.style.setProperty("--aside-left", there.left + "px");
    inspectEl.style.setProperty("--aside-top", there.top + "px");
    inspectEl.classList.add("aside");
}
// ---------- render ----------
let demo = null;
/** A dressed four-player table behind the welcome screen. */
function demoGame() {
    if (demo)
        return demo;
    const s = newGame(["You", "Naledi", "Thabo", "Amara"].map((name, i) => ({
        id: "d" + i,
        name,
    })), { seed: 20261105 });
    s.players.forEach((p, pi) => {
        for (let k = 0; k < 6; k++)
            p.hand.push(s.deck.pop());
        p.hand = p.hand.filter((c) => {
            const a = CARD[c.id], slot = a
                ? p.slots.findIndex((x, i) => !x && a.habitats.includes(SLOT_HABITATS[i]))
                : -1;
            if (slot < 0 || p.slots.filter(Boolean).length >= 5 + (pi % 2))
                return true;
            p.slots[slot] = { card: { id: c.id, fed: (slot + pi) % 2 }, tucked: [] };
            return false;
        });
        p.bank = { meat: 2, leaves: 1 + pi, bones: 2, bananas: 1 };
        p.reserve = { meat: 1, leaves: 0, bones: pi % 2, bananas: 0 };
        const id = s.stacks[pi].pop();
        p.land.push({ id, cells: [0], completed: pi % 2 === 0 });
        const goal = Object.keys(s.claims)[pi];
        s.claims[goal].push(pi);
        p.goals.push(goal);
        if (pi < 2)
            p.used = pi ? { place: 3 } : { adopt: 2 };
    });
    s.deckCount = s.deck.length;
    s.dice = [5, 3, 6];
    s.round = 5;
    return (demo = s);
}
/**
 * What the field school is teaching at this very step, so the table can show
 * that one thing and nothing else: the spotlight cuts a hole for each spot,
 * the camera closes in on `frame` and the hand steps aside when it is not
 * part of the lesson. Guided game only, and only for the player's own step;
 * Naledi's turn, scenes and the free race after graduation keep the table.
 */
function teach(s) {
    if (!guided(s) ||
        s.phase === "over" ||
        watch ||
        narration ||
        sceneBusy() ||
        tableView ||
        viewPlayer !== myself())
        return null;
    const me = myself(), p = s.players[me], seat = table.seat(s, me, me), n = s.regions.length, where = (key) => {
        const [rid, j] = key.split(":").map(Number);
        return { ri: s.regions.findIndex((r) => r.id === rid), j };
    }, pad = (r, by = 2) => ({ ...r, w: r.w + by, h: r.h + by }), others = (ri) => s.regions.flatMap((r, i) => (i === ri ? [] : ["region:" + r.id])), slots = (list) => list.map((i) => L.slotRect(seat, i)), sanctuary = L.bounds(slots([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    if (inIntro(s)) {
        const focus = intros[guide.intro].focus, g = goalFocus(s, me);
        // Seen from straight above, the mat in the room over the hand.
        if (focus === "hand")
            return {
                spots: [
                    { rect: L.matRect(seat), caption: "Your sanctuary" },
                    { hand: true, caption: "Your animals" },
                ],
                frame: pad(L.matRect(seat), 6),
                steadyHand: true,
            };
        if (focus === "dice")
            return {
                spots: [
                    {
                        rect: L.bounds(s.dice.map((_, i) => {
                            const [x, z] = L.poolPose(i);
                            return { x, z, w: L.DIE + 1.5, h: L.DIE + 1.5 };
                        })),
                        caption: "The shared dice",
                    },
                ],
                noHand: true,
            };
        if (focus !== "region" || !g)
            return null;
        // One Region Goal, almost full screen: what it is, then the claim order
        // printed under its circles, then the tracker that follows it for you.
        const { ri, j } = where(g.key), beat = regionBeat(s), spot = beat === 0
            ? {
                rect: L.goalRect(ri, n, j),
                caption: `${g.label} · ${g.cp} CP`,
                under: true,
            }
            : beat === 1
                ? {
                    rect: L.tiersRect(ri, n, j, s.players.length),
                    caption: g.tiers
                        .map((cp, i) => `${ORDINAL[i]} ${cp} CP`)
                        .join("  ·  "),
                    under: true,
                }
                : { el: ".goals .goal", caption: "Your tracker" };
        return {
            spots: [spot],
            frame: pad(L.regionRect(ri, n)),
            noHand: true,
            fade: others(ri),
            fill: 0.88,
        };
    }
    // A goal ready to claim: its Region card fills the screen, its Claim
    // button beside it. First as its own lesson, then whenever Naledi points
    // at a claim while the lessons last.
    const key = taughtClaim(s);
    if (key) {
        const { ri, j } = where(key);
        return {
            spots: [
                {
                    rect: L.goalRect(ri, n, j),
                    caption: `${s.regions[ri].goals[j].label} · done!`,
                    under: true,
                },
                { el: `.claim-button[data-goal="${key}"]` },
            ],
            frame: pad(L.regionRect(ri, n)),
            noHand: true,
            fade: others(ri),
            fill: 0.88,
        };
    }
    // Lesson steps, and joining in on Naledi's move once that move is taught.
    if (!currentGuide() || !canPlay())
        return null;
    if (s.active !== me && s.action && !learned(s.action))
        return null;
    const t = s.tasks[0], step = play(s), m = step.moment, best = step.advice?.best, legal = legalSlots(s);
    switch (m) {
        case "action": {
            const want = wantedAction(s);
            const spots = want && want !== "rain" ? L.ACTION_SPOT[want] : undefined;
            // Where the move lives on the mat: the mat fills the screen.
            return spots
                ? {
                    spots: spots.map((at) => ({ rect: L.spotRect(seat, at) })),
                    frame: pad(L.matRect(seat), 6),
                }
                : null;
        }
        case "die": {
            if (best?.die === undefined)
                return null;
            const [x, z] = L.poolPose(best.die);
            return {
                spots: [{ rect: { x, z, w: L.DIE + 1, h: L.DIE + 1 }, round: true }],
                frame: L.bounds(s.dice.map((_, i) => {
                    const [px, pz] = L.poolPose(i);
                    return { x: px, z: pz, w: L.DIE, h: L.DIE };
                }), { w: 46, h: 30 }),
                angled: true,
            };
        }
        case "card":
        case "tuckCard":
            return { spots: [{ hand: true }] };
        case "home":
        case "tuckHome":
        case "trap":
        case "confirm": {
            if (!legal.length)
                return null;
            const chosen = m === "confirm" && targetSlot >= 0 ? [targetSlot] : legal;
            return {
                spots: slots(chosen).map((rect) => ({ rect })),
                frame: L.bounds(slots(legal), { w: 62, h: 34 }),
                held: true,
            };
        }
        case "row": {
            const row = best?.row ?? 0;
            return {
                spots: [
                    { rect: L.bounds(slots([0, 1, 2, 3, 4].map((i) => row * 5 + i))) },
                ],
                frame: sanctuary,
            };
        }
        case "feed": {
            const row = t?.row ?? 0, eat = legal.length
                ? legal
                : p.slots.flatMap((x, i) => x && Math.floor(i / 5) === row && !t?.used?.includes(i)
                    ? [i]
                    : []);
            if (!eat.length)
                return null;
            return {
                spots: slots(eat).map((rect) => ({ rect })),
                frame: L.bounds(slots([0, 1, 2, 3, 4].map((i) => row * 5 + i)), {
                    h: 34,
                }),
            };
        }
        case "draft": {
            // The tile on top of each stack that fits, or the one picked.
            const tops = s.stacks.flatMap((stack, i) => stack.length &&
                landPlacements(p, stack.at(-1)).length &&
                (draftPick < 0 || draftPick === i)
                ? ["tile:" + stack.at(-1)]
                : []);
            if (!tops.length)
                return null;
            return {
                spots: tops.map((piece) => ({ pieces: [piece] })),
                frame: { x: L.BOARD.x, z: L.BOARD.z, w: L.BOARD.w, h: L.BOARD.h },
                noHand: true,
            };
        }
        case "tile":
            return {
                spots: [{ rect: L.gridRect(seat), caption: "Your Land Grid" }],
                frame: pad(L.gridRect(seat), 22),
                noHand: true,
                inspect: true,
            };
        // The offers lie flat beside the Land Board: seen from above, every row.
        case "offer": {
            const own = s.offers.find((o) => o.player === me);
            return own
                ? {
                    spots: [
                        {
                            pieces: own.cards.flatMap((c, k) => c ? [c.id ? "card:" + c.id : `hidden:${me}:${k}`] : []),
                        },
                    ],
                    frame: pad(L.marketRect(1, s.players.length), 5),
                }
                : null;
        }
        case "adopt":
        case "bonus": {
            const rows = s.offers.filter((o) => t?.bonus || o.player !== me), pieces = rows.flatMap((o) => o.cards.flatMap((c, k) => c && total(p.bank) >= k
                ? [c.id ? "card:" + c.id : `hidden:${o.player}:${k}`]
                : []));
            return pieces.length
                ? {
                    spots: [{ pieces }],
                    frame: pad(L.marketRect(rows.length, s.players.length), 5),
                    inspect: true,
                }
                : null;
        }
        default:
            return null;
    }
}
/** Where the hand fan rests on screen (NDC), and its cards, from the last table drawn. */
let handFan = null, handKeys = new Set();
/**
 * The close-up for a lesson step, worked out once and then held, camera
 * locked, until the step or the window changes: Naledi's words, the hand
 * or a hovered card may move around it, the table does not.
 */
function closeUpFor(s, t) {
    const hand = handMode(s), key = JSON.stringify([
        t.frame,
        t.angled,
        t.fill,
        t.held,
        t.inspect,
        hand,
        innerWidth,
        innerHeight,
    ]);
    if (closeUp?.key === key)
        return closeUp;
    const aspect = innerWidth / Math.max(1, innerHeight);
    let area = freeArea({
        hand: hand === "hide" ? null : handTop(aspect, hand),
        caption: t.spots.some((p) => p.hand && p.caption),
        frame: t.frame,
        inspect: t.inspect,
    }), held;
    if (t.held)
        [area, held] = holdAside(area, aspect);
    closeUp = {
        key,
        shot: L.frameShot(t.frame, aspect, area, {
            fill: t.fill ?? 0.8,
            top: !t.angled,
        }),
        held,
    };
    return closeUp;
}
/**
 * A card waiting for its home is held up beside the close-up rather than
 * over it: at the right of the free screen, or under it when that is tall.
 * Returns the room left for the close-up and where the card is held.
 */
function holdAside(a, aspect) {
    const gx = 36 / innerWidth, gy = 36 / innerHeight, w = a.x1 - a.x0, h = a.y1 - a.y0, across = (hf) => (2 * hf * L.CARD.w) / L.CARD.h / aspect;
    if (w * aspect >= h) {
        const hf = Math.min(0.27, h * 0.4), cw = across(hf);
        return [
            { ...a, x1: a.x1 - cw - gx },
            { nx: a.x1 - cw / 2, ny: (a.y0 + a.y1) / 2, hf },
        ];
    }
    const hf = Math.min(0.2, h * 0.2);
    return [
        { ...a, y0: a.y0 + 2 * hf + gy },
        { nx: (a.x0 + a.x1) / 2, ny: a.y0 + hf, hf },
    ];
}
/**
 * The part of the screen the HUD leaves free for a close-up: right of
 * Naledi's column (or under it on a narrow screen), under the lesson sign,
 * above the hand when it is out (`hand`: how high it reaches, NDC) and the
 * caption it gets when it is part of the lesson, and beside or under an
 * open side panel, whichever leaves `frame` larger.
 */
function freeArea(o) {
    const W = innerWidth, H = innerHeight, gap = 18;
    let left = gap, top = gap, bottom = H - gap, right = W - gap;
    const col = app.querySelector(".left")?.getBoundingClientRect(), stacked = getComputedStyle(app).getPropertyValue("--stacked").trim();
    if (col?.width) {
        if (stacked)
            top = Math.max(top, col.bottom + gap);
        else
            left = Math.max(left, col.right + gap);
    }
    for (const el of [app.querySelector(".prompt"), trailEl]) {
        const r = el?.getBoundingClientRect();
        if (r?.height && r.bottom < H / 3)
            top = Math.max(top, r.bottom + gap);
    }
    if (o.hand !== null)
        bottom = Math.min(bottom, H * 0.74, ((1 - o.hand) / 2) * H - (o.caption ? 64 : 20));
    const fit = (a) => o.frame
        ? Math.min((a.r - a.l) / o.frame.w, (a.b - a.t) / o.frame.h)
        : (a.r - a.l) * (a.b - a.t);
    const panels = [...app.querySelectorAll(".side > *")].map((el) => el.getBoundingClientRect());
    // The inspector, as tall as a card's print, wherever it would show.
    if (o.inspect) {
        const r = inspectEl.getBoundingClientRect();
        panels.push(new DOMRect(r.left, r.top, r.width, Math.max(r.height, r.width * 1.6)));
    }
    for (const r of panels) {
        if (r.height < 90 ||
            r.left >= right ||
            r.right <= left ||
            r.top >= bottom ||
            r.bottom <= top)
            continue;
        const beside = {
            l: left,
            t: top,
            r: Math.min(right, r.left - gap),
            b: bottom,
        }, under = {
            l: left,
            t: Math.max(top, r.bottom + gap),
            r: right,
            b: bottom,
        }, best = fit(beside) >= fit(under) ? beside : under;
        ({ l: left, t: top, r: right, b: bottom } = best);
    }
    // Coarse steps: a bubble that grows by a line must not nudge the camera.
    const q = (v) => Math.round(v * 25) / 25;
    return {
        x0: q((left / W) * 2 - 1),
        x1: q((right / W) * 2 - 1),
        y0: q(1 - (bottom / H) * 2),
        y1: q(1 - (top / H) * 2),
    };
}
/** Where a spot is on screen this frame, or null while it cannot be seen. */
function spotBox(spot) {
    const boxes = [];
    if (spot.hand && handFan) {
        boxes.push({
            x0: ((handFan.x0 + 1) / 2) * innerWidth,
            x1: ((handFan.x1 + 1) / 2) * innerWidth,
            y0: ((1 - handFan.y1) / 2) * innerHeight,
            y1: Math.min(innerHeight - 4, ((1 - handFan.y0) / 2) * innerHeight),
        });
        // A card the pointer lifts out of the fan stays in the light.
        const up = hover && !teaching?.steadyHand && handKeys.has(hover)
            ? stage.screenBox({ piece: hover })
            : null;
        if (up)
            boxes.push({ ...up, y1: Math.min(up.y1, innerHeight - 4) });
    }
    if (spot.rect) {
        const b = stage.screenBox({ rect: spot.rect, y: 0.3 });
        if (b)
            boxes.push(b);
    }
    for (const piece of spot.pieces ?? []) {
        const b = stage.screenBox({ piece });
        if (b)
            boxes.push(b);
    }
    if (spot.el)
        for (const el of document.querySelectorAll(spot.el)) {
            const r = el.getBoundingClientRect();
            if (r.width > 4 &&
                r.height > 4 &&
                getComputedStyle(el).display !== "none")
                boxes.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
        }
    if (!boxes.length)
        return null;
    return {
        x0: Math.min(...boxes.map((b) => b.x0)),
        y0: Math.min(...boxes.map((b) => b.y0)),
        x1: Math.max(...boxes.map((b) => b.x1)),
        y1: Math.max(...boxes.map((b) => b.y1)),
        round: spot.round,
        caption: spot.caption,
        under: spot.under,
    };
}
/** The spots the spotlight last drew, so a new step never shows stale holes. */
let spotSig = "";
/** The spotlight follows its spots every frame, wherever the camera goes. */
function trackSpot(now) {
    const t = teaching && !modal.open && !sceneBusy() ? teaching : null;
    const holes = t ? t.spots.map(spotBox).filter((h) => !!h) : [], sig = t ? JSON.stringify(t.spots) : "";
    // A spot not drawn yet keeps the shade where it was rather than flicker,
    // but never past a change of lesson step.
    if (!t || holes.length || sig !== spotSig) {
        const moved = sig !== spotSig;
        spotSig = sig;
        spotlight.update(holes, now);
        document.body.classList.toggle("isolate", holes.length > 0);
        litHoles = holes;
        if (moved)
            placeInspect();
    }
    requestAnimationFrame(trackSpot);
}
requestAnimationFrame(trackSpot);
function drawTable() {
    const live = !!room?.game, s = room?.game ?? demoGame(), me = live ? myself() : 0;
    if (!live)
        table.update(s, 0);
    stage.setTable(s.players.length);
    teaching = live ? teach(s) : null;
    // The lesson's one piece: a quick pan and zoom until it fills the free
    // screen, looking straight down on anything that lies flat.
    const close = teaching?.frame
        ? closeUpFor(s, { ...teaching, frame: teaching.frame })
        : (closeUp = null);
    const c = table.compose(s, buildView(s, me, live));
    const fan = c.hots.flatMap((h) => (h.screen ? [h.screen] : []));
    handKeys = new Set(c.hots.flatMap((h) => (h.screen ? [h.id] : [])));
    handFan = fan.length
        ? {
            x0: Math.min(...fan.map((f) => f.x0)),
            y0: Math.min(...fan.map((f) => f.y0)),
            x1: Math.max(...fan.map((f) => f.x1)),
            y1: Math.max(...fan.map((f) => f.y1)),
        }
        : null;
    if (!watch)
        lastTable = c;
    const watchingShot = live ? watchTable(c, s) : null;
    // A new table is simply there; only changes during play are animated.
    stage.sync(c.items, c.exits, freshTable);
    freshTable = false;
    stage.setCarry(live ? (c.carry ?? null) : null);
    stage.setHots(live ? c.hots : []);
    stage.setLabels(live ? c.labels : c.labels.filter((l) => l.cls?.startsWith("nameplate")));
    stage.setMarks(live ? c.marks : []);
    const over = live && s.phase === "over";
    stage.setDrift(!live ? 0.02 : over || (inIntro(s) && !guide.intro) ? 0.012 : 0);
    const wet = !live || over
        ? 0
        : Date.now() < weatherUntil
            ? 2
            : s.finalLeft !== null
                ? 1
                : 0;
    stage.weather(wet);
    weatherEl.className = ["", "drizzle", "storm"][wet];
    sfx.rain(wet);
    const whole = L.overviewShot(s.players.length);
    let shot = whole;
    if (!live)
        shot = { cam: [62, 128, 150], look: [0, 0, -8], fov: 46 };
    else if (watchingShot && !sceneBusy())
        shot = watchingShot;
    else if (tableView || over)
        shot = whole;
    else if (close)
        shot = close.shot;
    // The camera watches the first seconds of the storm, then returns to the decision.
    else if (Date.now() < weatherUntil - 2500)
        shot = L.SHOTS.rain;
    else if (viewPlayer !== me)
        shot = s.players[viewPlayer].bot
            ? L.stationShot(table.seat(s, me, viewPlayer))
            : L.seatShot(table.seat(s, me, viewPlayer));
    else if (inIntro(s))
        shot = {
            table: whole,
            hand: L.SHOTS.turn,
            dice: L.SHOTS.dice,
            region: L.SHOTS.region,
        }[intros[guide.intro].focus];
    // While Naledi tells her turn, the camera is at her ranger station.
    else if (narration?.visit && !sceneBusy() && s.players.some((p) => p.bot))
        shot = L.stationShot(table.seat(s, me, s.players.findIndex((p) => p.bot)));
    else if (goalGate(s))
        shot = L.SHOTS.region;
    else
        shot = play(s).shot;
    // While the field school points at something, the camera stays put: no
    // idle orbit, no dragging or zooming until the step is done.
    stage.lockCamera(!!teaching);
    stage.shot(shot, reducedMotion() ? 0 : watchingShot ? 0.65 : teaching?.frame ? 0.6 : 1.15);
}
function render() {
    document.body.classList.toggle("watching", !!watch && !sceneBusy());
    document.body.dataset.screen = !room
        ? "welcome"
        : !room.game
            ? "lobby"
            : "game";
    if (!room)
        app.innerHTML = welcome();
    else if (!room.game)
        app.innerHTML = lobby();
    else {
        const s = room.game;
        if (viewPlayer >= s.players.length)
            viewPlayer = myself();
        const l = currentGuide();
        if (l?.tuck && s.tasks[0]?.kind === "place")
            tucking = true;
        // Introduce one live example before the first move; keep checking it during lessons.
        if (inIntro(s) && intros[guide.intro].focus === "region") {
            reveal("goals");
            goalOpen = goalFocus(s, myself())?.key ?? "";
        }
        const claim = taughtClaim(s);
        if (claim)
            goalOpen = claim;
        if (s.active === myself() &&
            Object.keys(s.claims).some((k) => claimable(s, myself(), k)))
            reveal("goals");
        app.innerHTML = hud(s);
        // The last lesson is behind the player: field school closes with a scene.
        if (gradGate(s) && !narration && !sceneBusy() && !graduating) {
            graduating = true;
            queueScene({ kind: "graduate" }, 700);
        }
    }
    renderTrail();
    // The hover preview opens just under the race panel, however tall that is.
    const race = app.querySelector(".rail")?.getBoundingClientRect();
    document.documentElement.style.setProperty("--below-race", race ? race.bottom + 10 + "px" : "");
    if (!room?.game)
        pointerSel = "";
    document.body.classList.toggle("guided", guided(room?.game));
    fitLog();
    renderConnection();
    renderInspect();
    drawTable();
}
/**
 * Naledi and the choices come first: the moves box takes the room left between
 * them and the food, down to its header alone, and always shows its last line.
 */
function fitLog() {
    const left = app.querySelector(".left"), log = app.querySelector(".log"), head = log?.querySelector(".log-head"), body = log?.querySelector(".log-body");
    left?.style.removeProperty("max-height");
    if (!left || !log || !head)
        return;
    const stacked = getComputedStyle(app).getPropertyValue("--stacked").trim(), h = head.getBoundingClientRect().height, 
    // Where the header sits once the box is folded all the way down.
    floor = log.getBoundingClientRect().bottom - h, 
    // Room for the guide's arrow when it points up at a choice from below.
    gap = h * 0.8;
    log.style.setProperty("--log-room", "0px");
    if (!stacked)
        left.style.maxHeight =
            Math.max(h * 3, floor - gap - left.getBoundingClientRect().top) + "px";
    if (!body)
        return;
    const room = floor - gap - left.getBoundingClientRect().bottom;
    log.style.setProperty("--log-room", Math.max(0, Math.floor(room)) + "px");
    log.classList.toggle("tight", room < h * 0.9);
    body.scrollTop = body.scrollHeight;
    body.classList.toggle("over", body.scrollTop > 2);
}
// Scrolled back to the oldest line, the fade at the top goes away.
app.addEventListener("scroll", (e) => {
    const el = e.target;
    if (el.classList?.contains("log-body"))
        el.classList.toggle("over", el.scrollTop > 2);
}, true);
window.addEventListener("resize", fitLog);
// Icons that load late change the height of the choices.
app.addEventListener("load", fitLog, true);
function showDialog(html, kind = "info") {
    modal.dataset.kind = kind;
    modal.innerHTML = `<div class="dialog-head"><span class="eyebrow">PAWS · FIELD NOTES</span>${button("✕", "close-modal", 'aria-label="Close"', "icon-button")}</div>${html}`;
    if (!modal.open)
        modal.showModal();
}
function inspectCard(id) {
    if (!id)
        return;
    const a = CARD[id];
    showDialog(`<div class="inspector">${img(cardArt(id), cardName(id))}<div><span class="eyebrow">PRINT COMPONENT · ${id > 101 ? "TRAP CARD" : "ANIMAL CARD " + id}</span><h2>${esc(cardName(id))}</h2>${feedingHtml(id)}${a ? `<p>${a.age} · ${a.diet}${a.endangered ? " · endangered" : ""}</p><p><strong>Home:</strong> ${a.habitats.map((h) => HABITAT_NAMES[h]).join(" / ")}</p><p><strong>Fully fed:</strong> ${a.need} ${a.food} → ${a.cp} CP.</p><p><strong>Companion:</strong> ${esc(a.companion)} in your sanctuary → +${a.bonus} CP, fed or not.</p><p><strong>When Fed:</strong> ${ABILITY_NAMES[a.ability]}${a.ability === "food" || a.ability === "draw" ? " · " + a.amount : ""}.</p>` : "<p>A trap blocks a habitat and costs 4 CP. Feed an animal with the right disarm ability to remove it. Disarming another sanctuary’s trap earns 4 CP.</p>"}</div></div>`);
}
function help() {
    showDialog(`<h2>Your field guide</h2><div class="help-grid"><section><h3>Take a turn</h3><p>Choose an open move on your mat, then pay for it with a shared die. Match its minimum for free. Gain one food per extra pip, or pay one food per missing pip into your Reserve. Everyone may resolve the action; you get the stronger version. Pass the token when complete.</p><h3>Naledi’s pick</h3><p>Every choice is laid out as options that say what they bring. A gold star marks the one Naledi would take, and she says why. After each move a card shows what it gained or cost, and the race panel shows who leads and where your points come from. The lamp button switches her tips off and on.</p><h3>The five actions</h3><p><b>2 Adopt:</b> everyone draws three and sets fixed fees (0, 1, 2 food). Adopt from another offer, then the active player adopts again from any offer.</p><p><b>3 Place:</b> active player places or tucks two, others one. Place in a matching habitat; frugivores can live anywhere. Tuck up to five cards under an animal.</p><p><b>4 Feed:</b> active player chooses a row, feeding each animal at most once; others feed one in that row. Spend matching food. Abilities resolve top card, then tucked cards.</p><p>Food badges mark placed animals still short of their printed meals; hover for the food needed and points waiting. A gentle glow means that animal can eat in the current Feed choice. Feeding is optional: skipping loses no points now, but an underfed animal earns no animal CP at game end. Food stays on the card. Fully fed animals may eat again for abilities. Naledi needs no food under the solo rules.</p><p><b>5 Protect:</b> draft first, everyone drafts, then you draft again. Fit each tile in your seven-hex grid; earn all covered bonuses.</p><p><b>1 Collect:</b> reclaim all your Reserve; others take one. Food in the Reserve is locked and does not score. Collect is always available, even after using it this round or when your Reserve is empty.</p><h3>Goals &amp; the Rain Dance</h3><p>Claim completed Region Goals on your active turn, without a die. Earlier claims earn more CP. “Feed 5 different animals” means five different species holding food. After ${room?.game?.length ?? 4} goals, use a 6 for Rain Dance (or pay missing pips). All players get one final turn; the dancer goes last.</p><h3>Conservation Points</h3><p>Fully fed animals + companion bonuses + 1 per tucked card + completed Land Tiles (−4 if unfinished) + Region Goals + 3 per six bank food + 4 per opponent trap disarmed − 4 per own trap + 2 for Rain Dance.</p><p>Land must still meet its goal: swapping away an animal it needs makes the tile unfinished again, worth −4 until completed.</p><h3>Naledi</h3><p>Naledi takes the highest die: 2 adopts, 3 places, 4 claims a goal, 5 protects; 1 and 6 make her rest. Her fourth goal starts the Rain Dance.</p><h3>The table</h3><p>Cards and Land Tiles are magnetic: lift one, bring it near a glowing place and it is drawn in; let go and it snaps down. You can also drag a card straight out of your hand, or simply click a place. Nothing is final until you confirm.</p><p>The Moves box, bottom left, keeps the last moves of everyone at the table. It folds away with its arrow, and so do the race, your score sheet and the Region Goals; click a goal for its details.</p><p>Drag to turn the table, scroll to zoom, double-click to reset. Click a player to visit their sanctuary. Hover any component to read it; click to open the original. Everything saves on the host after each choice.</p></section><section><h3>Player aid · original card</h3>${turned("Tarot Cards/Player Aid Card/Player Aid Card_Front.webp", "Player aid: actions")}${turned("Tarot Cards/Player Aid Card/Player Aid Card_Back.webp", "Player aid: icons", "cw")}</section></div>${room?.game?.tutorial ? button(guide.enabled ? "Play without Naledi" : "Bring Naledi back", "guide-toggle", "", "btn ghost") : ""}`, "help");
}
function exportRecord() {
    if (!room?.game)
        return;
    const s = room.game;
    const record = {
        build: "2026-11-06",
        room: room.code,
        game: s,
        scores: s.players.map((p, i) => ({ name: p.name, score: score(s, i) })),
        guide,
    };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }));
    link.download = `paws-${room.code}-turn-${s.turn}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast("Playtest record saved.", true);
}
function back() {
    if (targetSlot >= 0)
        targetSlot = -1;
    else if (selectedCard > 0)
        selectedCard = -1;
    else if (adoptPick)
        adoptPick = null;
    else if (draftPick >= 0)
        draftPick = -1;
    else if (offerPick >= 0)
        offerPick = -1;
    else if (selectedAction)
        selectedAction = "";
    else
        return false;
    render();
    return true;
}
// ---------- input ----------
async function onClick(e) {
    const el = e.target.closest("[data-ui]");
    if (!el || (el instanceof HTMLButtonElement && el.disabled))
        return;
    const ui = el.dataset.ui, d = el.dataset, s = room?.game, t = s?.tasks[0];
    if (watch &&
        ![
            "watch-skip",
            "scene-next",
            "sound",
            "leave-ask",
            "leave",
            "close-modal",
        ].includes(ui))
        return;
    // Anything the player does cuts into Naledi's account of her turn.
    if (narration &&
        ui !== "narrate-next" &&
        ui !== "scene-next" &&
        ui !== "watch-skip")
        endNarration(true);
    sfx.play(CLICK_CUE[ui] ?? "tap");
    try {
        switch (ui) {
            case "home":
                e.preventDefault();
                if (!room)
                    break;
            // falls through
            case "leave-ask":
                showDialog(`<h2>Leave the table?</h2><p>Your seat is saved. You can come back to it from the welcome screen.</p>${button("Leave the table", "leave", "", "btn go")}`);
                break;
            case "sound":
                sfx.setMuted(!sfx.isMuted());
                sfx.play("tap");
                render();
                break;
            case "panel-toggle": {
                const k = d.panel;
                panels[k] = !panels[k];
                localStorage.setItem("paws.panels", JSON.stringify(panels));
                sfx.play("tap");
                render();
                break;
            }
            case "goal-more":
                goalOpen = goalOpen === d.goal ? "" : d.goal;
                sfx.play("tap");
                render();
                break;
            case "tips":
                tips = !tips;
                localStorage.setItem("paws.tips", tips ? "on" : "off");
                toast(tips
                    ? "Naledi’s tips are on: she marks her pick and says why."
                    : "Naledi’s tips are off.", true);
                render();
                break;
            case "way": {
                const w = WAYS.find((x) => x.key === d.way);
                if (w)
                    toast(`${w.name}: ${w.how}`, true);
                break;
            }
            case "watch-skip":
                stopWatch(true);
                break;
            case "narrate-next":
                nextNarration();
                break;
            case "new-tutorial":
            case "new-solo":
            case "new-friends":
            case "new-bots": {
                const name = document
                    .querySelector("#player-name")
                    .value.trim() || "Conservationist";
                localStorage.setItem("paws.name", name);
                const data = await api("create", {
                    name,
                    mode: ui === "new-friends"
                        ? "friends"
                        : ui === "new-bots"
                            ? "bots"
                            : "solo",
                    tutorial: ui === "new-tutorial",
                    length: Number(document.querySelector("#game-length").value),
                });
                enter(data);
                break;
            }
            case "join": {
                const name = document
                    .querySelector("#player-name")
                    .value.trim() || "Conservationist", code = document
                    .querySelector("#join-code")
                    .value.trim()
                    .toUpperCase();
                localStorage.setItem("paws.name", name);
                enter(await api("join", { name, code }));
                break;
            }
            case "resume": {
                const saved = JSON.parse(localStorage.getItem("paws.resume"));
                enter(await api("resume", saved), saved.token);
                break;
            }
            case "leave":
                stream?.close();
                stream = null;
                room = null;
                session = null;
                actingAs = "";
                connected = false;
                tableView = false;
                replying = false;
                marks.clear();
                goalOpen = "";
                logBorn.clear();
                weatherUntil = 0;
                hoverInspect = null;
                endNarration();
                dropScenes();
                arrived.clear();
                spoken = "";
                fx.replaceChildren();
                table.reset();
                freshTable = true;
                sessionStorage.removeItem("paws.seat");
                if (modal.open)
                    modal.close();
                render();
                break;
            case "start":
                receive(await api("start", {
                    ...credentials(),
                    length: Number(document.querySelector("#game-length").value),
                    seats: room?.mode === "bots"
                        ? Number(document.querySelector("#seat-count")
                            .value)
                        : undefined,
                }));
                break;
            case "share": {
                const url = location.origin + "/?room=" + room.code;
                try {
                    await navigator.clipboard.writeText(url);
                    toast("Invite link copied · room " + room.code, true);
                }
                catch {
                    showDialog(`<h2>Invite a conservationist</h2><p>Room code: <b>${room.code}</b></p><input readonly value="${esc(url)}" aria-label="Invite link"><p>Share this link, or just the room code — anyone who opens it on this same server can join.</p>`);
                }
                break;
            }
            case "help":
                help();
                break;
            case "close-modal":
                modal.close();
                closeFoodPicker();
                break;
            case "table-view":
                tableView = !tableView;
                viewPlayer = myself();
                render();
                break;
            case "journal":
                showDialog(`<h2>Table journal</h2><div class="journal">${s.log
                    .slice(0, 24)
                    .map((line) => `<p>${esc(line)}</p>`)
                    .join("")}</div>${button("Save playtest record", "export", "", "btn ghost")}`);
                break;
            case "back":
                back();
                break;
            case "inspect-card":
                inspectCard(Number(d.card));
                break;
            case "inspect-region": {
                const r = s.regions.find((x) => x.id === Number(d.region));
                showDialog(`<h2>${r.name}</h2><div class="region-inspect">${turned(regionArt(r.id), r.name)}</div><p>Printed tiers: ${r.goals.map((g) => g.label + ": " + g.tiers.join(" / ") + " CP").join(" · ")}. A fifth claimant scores 0 CP in this prototype.</p>`);
                break;
            }
            case "inspect-tile": {
                const tile = TILE[d.tile];
                showDialog(`<h2>${tile.id} · ${tile.cp} CP</h2><div class="tile-inspect">${img(d.hidden ? tile.art.replace("_Front", "_Back") : tile.art, tile.id)}</div><p>${d.hidden ? "Its goal is revealed after drafting." : tile.goals.map(([g, n]) => n + " " + g).join(" + ") + " placed in habitats."} ${tile.size} hex${tile.size > 1 ? "es" : ""}. Unfinished: −4 CP.</p>`);
                break;
            }
            case "inspect-solo":
                showDialog(`<h2>Naledi · Solo Card ${d.solo}</h2><div class="solo-inspect">${img(soloArt(Number(d.solo)), "Naledi action")}</div><p>Active cards resolve on her turns; passive cards react to yours.</p>`);
                break;
            case "inspect-rain":
                showDialog(`<h2>Rain Dance</h2><div class="solo-inspect">${img(RAIN_ART, "Rain Dance tile")}</div><p>Claim ${s?.length ?? 4} Region Goals, then spend a 6 (or pay the missing pips). Everyone takes one final turn; the dancer goes last and earns 2 CP.</p>`);
                break;
            case "inspect-deck":
                toast(`${s.deckCount} cards in the draw pile · ${s.discard.length} discarded`, true);
                break;
            case "view-player": {
                const i = Number(d.player);
                viewPlayer = viewPlayer === i ? myself() : i;
                tableView = false;
                render();
                break;
            }
            case "action": {
                // The move comes first; clicking it again takes it back.
                const action = d.action;
                if (!moves(s).some((o) => o.action === action && !o.blocked))
                    break;
                selectedAction = selectedAction === action ? "" : action;
                selectedDie = -1;
                render();
                break;
            }
            case "die": {
                if (!selectedAction) {
                    toast("Choose your move first.");
                    break;
                }
                const action = selectedAction, dieIndex = Number(d.die), delta = s.dice[dieIndex] - ACTION_MIN[action];
                if (delta < 0 && total(s.players[myself()].bank) < -delta) {
                    toast("You do not have the food for that die.");
                    break;
                }
                selectedDie = dieIndex;
                render();
                payOrGain(Math.abs(delta), delta >= 0 ? "gain" : "pay", delta >= 0 ? "Choose your bonus food" : "Pay for the smaller die", delta >= 0 ? naledi.change : naledi.pay, (food) => command({ type: "act", action, die: dieIndex, food }));
                break;
            }
            case "end":
                await command({ type: "end" });
                break;
            case "skip":
                await command({ type: "skip" });
                break;
            case "claim":
                await command({ type: "claim", goal: d.goal });
                break;
            case "select-card":
                selectedCard = selectedCard === Number(d.card) ? -1 : Number(d.card);
                // An option card says whether it is a home or a release; a card picked
                // from the hand is released only when no free habitat suits it.
                if (d.tuck)
                    tucking = d.tuck === "true";
                else if (currentGuide())
                    tucking = !!currentGuide().tuck;
                else if (selectedCard > 0 && t?.kind === "place")
                    tucking = !A.slotOptions(s, myself(), selectedCard).length;
                targetSlot = -1;
                viewPlayer = myself();
                hoverInspect = null;
                render();
                break;
            case "place-mode":
                tucking = d.tuck === "true";
                targetSlot = -1;
                render();
                break;
            case "habitat": {
                const slot = Number(d.slot);
                if (!canPlay())
                    break;
                if (t?.kind === "feed")
                    await command({ type: "feed", slot });
                else if (targetSlot === slot)
                    await confirmTarget();
                else {
                    targetSlot = slot;
                    render();
                }
                break;
            }
            case "place-confirm":
            case "trap-confirm":
                await confirmTarget();
                break;
            case "offer-pick": {
                const i = Number(d.index);
                if (offerPick < 0 || offerPick === i)
                    offerPick = offerPick === i ? -1 : i;
                else {
                    [offerOrder[i], offerOrder[offerPick]] = [
                        offerOrder[offerPick],
                        offerOrder[i],
                    ];
                    offerPick = -1;
                }
                render();
                break;
            }
            case "offer-left":
            case "offer-right": {
                const i = Number(d.index), j = i + (ui === "offer-left" ? -1 : 1);
                [offerOrder[i], offerOrder[j]] = [offerOrder[j], offerOrder[i]];
                offerPick = -1;
                render();
                break;
            }
            case "offer-confirm":
                await command({ type: "offer", order: offerOrder });
                break;
            case "adopt-card": {
                const pick = { owner: Number(d.owner), slot: Number(d.cost) };
                if (adoptPick?.owner === pick.owner && adoptPick.slot === pick.slot) {
                    await confirmAdopt();
                    break;
                }
                adoptPick = pick;
                hoverInspect = null;
                render();
                break;
            }
            case "adopt-confirm":
                await confirmAdopt();
                break;
            case "feed-row":
                await command({ type: "row", row: Number(d.row) });
                break;
            case "draft": {
                const stack = Number(d.stack);
                if (draftPick === stack)
                    await command({ type: "draft", stack });
                else {
                    draftPick = stack;
                    render();
                }
                break;
            }
            case "draft-confirm":
                if (draftPick >= 0)
                    await command({ type: "draft", stack: draftPick });
                break;
            case "position-prev":
            case "position-next": {
                const positions = landPlacements(s.players[myself()], t.tile);
                placement =
                    (placement + (ui === "position-next" ? 1 : positions.length - 1)) %
                        positions.length;
                render();
                break;
            }
            case "tile-cell": {
                // Clicking a hex cycles through the positions that cover it.
                const cell = Number(d.cell), positions = landPlacements(s.players[myself()], t.tile), options = positions.flatMap((cells, i) => cells.includes(cell) ? [i] : []);
                if (options.length)
                    placement =
                        options[(options.indexOf(placement) + 1) % options.length];
                render();
                break;
            }
            case "tile-confirm":
                await command({
                    type: "tile",
                    cells: landPlacements(s.players[myself()], t.tile)[placement],
                });
                break;
            case "collect":
                await command({ type: "collect", food: d.food });
                break;
            case "ability-simple":
                if (t.ability === "food")
                    payOrGain(t.amount, "gain", "Choose your food", naledi.gift, (food) => command({ type: "effect", food }));
                else
                    await command({ type: "effect" });
                break;
            case "ability-land":
                if (canPlay() && t?.kind === "effect" && t.ability === "discardLand")
                    await command({ type: "effect", land: Number(d.land) });
                else if (d.tile) {
                    const tile = TILE[d.tile];
                    showDialog(`<h2>${tile.id} · ${tile.cp} CP</h2><div class="tile-inspect">${img(tile.art, tile.id)}</div>`);
                }
                break;
            case "ability-disarm":
                await command({
                    type: "effect",
                    target: Number(d.target),
                    slot: Number(d.slot),
                    card: Number(d.card),
                });
                break;
            case "ability-swap": {
                const [slot, tuck] = document
                    .querySelector("#swap-out")
                    .value.split(":")
                    .map(Number), card = Number(document.querySelector("#swap-in").value);
                await command({ type: "effect", slot, tuck, card });
                break;
            }
            case "food-plus":
                foodPicker.selected.push(d.food);
                renderFoodPicker();
                break;
            case "food-minus": {
                const f = foodPicker, i = f.selected.lastIndexOf(d.food);
                if (i >= 0)
                    f.selected.splice(i, 1);
                renderFoodPicker();
                break;
            }
            case "food-confirm": {
                const f = foodPicker;
                foodPicker = null;
                modal.close();
                f.done(f.selected);
                break;
            }
            case "guide-next":
                guide.intro++;
                saveGuide();
                if (guide.intro === 1)
                    sfx.play("whoosh");
                if (guide.intro === intros.length && lessons[guide.lesson]) {
                    sfx.play("bell");
                    showChapter(guide.lesson);
                }
                render();
                break;
            case "guide-graduate":
                graduate();
                celebrate();
                showBanner("Ranger!", "Field school complete", "lesson");
                render();
                break;
            case "scene-next":
                closeScene();
                break;
            case "guide-off":
                guide.enabled = false;
                saveGuide();
                dropScenes();
                render();
                if (modal.open)
                    modal.close();
                break;
            case "guide-toggle":
                guide.enabled = !guide.enabled;
                saveGuide();
                render();
                modal.close();
                break;
            case "takeover":
                actingAs = d.id;
                viewPlayer = myself();
                table.reset();
                table.update(s, myself());
                render();
                toast("Covering the away seat until your friend is back.", true);
                break;
            case "stop-takeover":
                actingAs = "";
                viewPlayer = myself();
                table.reset();
                table.update(s, myself());
                render();
                break;
            case "export":
                exportRecord();
                break;
        }
    }
    catch (error) {
        toast(error.message);
    }
}
async function confirmTarget() {
    const s = room?.game, t = s?.tasks[0];
    if (!s || !canPlay() || targetSlot < 0)
        return;
    if (t?.kind === "place" && selectedCard > 0)
        await command({
            type: "place",
            card: selectedCard,
            slot: targetSlot,
            tuck: tucking,
        });
    else if (t?.kind === "trap")
        await command({ type: "trap", slot: targetSlot });
}
async function confirmAdopt() {
    if (!adoptPick)
        return;
    const { owner, slot } = adoptPick;
    payOrGain(slot, "pay", "Pay the adoption fee", naledi.fee, (food) => command({ type: "adopt", owner, slot, food }));
}
/** Sounds for clicks that are more than a plain button press. */
const CLICK_CUE = {
    die: "dice",
    "select-card": "pick",
    "adopt-card": "pick",
    "offer-pick": "pick",
    draft: "pick",
    "position-next": "tile",
    "position-prev": "tile",
    "tile-cell": "tile",
    "guide-next": "voice",
};
document.addEventListener("pointerdown", (e) => {
    sfx.unlock();
    lastTap = { x: e.clientX, y: e.clientY, at: performance.now() };
}, true);
document.addEventListener("keydown", () => sfx.unlock(), true);
document.addEventListener("click", onClick);
/** The guide's pointer follows its target, wherever the camera has put it. */
function trackPointer() {
    let target = null, side = "", edge = 0;
    if (pointerSel && !modal.open)
        for (const el of document.querySelectorAll(pointerSel)) {
            const r = el.getBoundingClientRect();
            if (r.width > 4 &&
                r.bottom > 0 &&
                r.top < innerHeight &&
                getComputedStyle(el).display !== "none") {
                target = r;
                // Panel buttons are pointed at from the table side, so the arrow never
                // covers Naledi's words; pieces on the table are pointed at from above.
                const goals = el.closest(".goals");
                side = el.classList.contains("die-chip")
                    ? "from-below"
                    : el.closest(".dock")
                        ? "from-right"
                        : goals
                            ? "from-left"
                            : "";
                edge = goals?.getBoundingClientRect().left ?? 0;
                if (side === "from-right" && r.right + 70 > innerWidth)
                    side = "";
                break;
            }
        }
    pointer.className =
        (target ? "on " : "") + side + (pointerPick ? " pick" : "");
    if (target)
        pointer.style.transform =
            side === "from-right"
                ? `translate(${target.right}px, ${target.top + target.height / 2}px)`
                : side === "from-left"
                    ? `translate(${edge}px, ${target.top + target.height / 2}px)`
                    : side === "from-below"
                        ? `translate(${target.left + target.width / 2}px, ${target.bottom}px)`
                        : `translate(${target.left + target.width / 2}px, ${target.top + (pointerSel.startsWith(".hot") ? target.height * 0.3 : 0)}px)`;
    requestAnimationFrame(trackPointer);
}
requestAnimationFrame(trackPointer);
// Hovering a hand card or a table piece previews its original face.
stage.onHover = (id) => {
    hover = id;
    const el = id
        ? document.querySelector(`[data-hot="${CSS.escape(id)}"]`)
        : null;
    hoverInspect = inspectOf(el);
    renderInspect();
    drawTable();
};
// A card pulled out of the hand is picked up exactly as if it had been clicked.
stage.onGrab = (id) => document
    .querySelector(`[data-hot="${CSS.escape(id)}"][data-ui="select-card"]`)
    ?.click();
// The carried piece caught on a place: name it, with the faintest of ticks.
stage.onPull = (id) => {
    if (id === pulled)
        return;
    pulled = id;
    if (id)
        sfx.play("magnet");
    drawTable();
};
// Let go on a place: that is the choice, exactly as a click on it would be.
stage.onSnap = (id) => {
    const s = room?.game, t = s?.tasks[0];
    if (!s || !canPlay())
        return;
    if (id.startsWith("slot:"))
        targetSlot = Number(id.slice(5));
    else if (id.startsWith("place:") && t?.kind === "tile")
        placement = Number(id.slice(6));
    else
        return;
    pulled = null;
    render();
};
stage.onLand = () => {
    sfx.play("snap");
    navigator.vibrate?.(12);
};
document.addEventListener("keydown", (e) => {
    if (modal.open || e.target.matches("input,select,textarea"))
        return;
    if (e.key === "Escape" && watch && !sceneBusy()) {
        e.preventDefault();
        stopWatch(true);
        return;
    }
    if (e.key === "Escape" && scene) {
        closeScene();
        e.preventDefault();
    }
    else if (e.key === "Escape" && back())
        e.preventDefault();
});
/** Closing the food picker without confirming takes the die back. */
function closeFoodPicker() {
    if (!foodPicker)
        return;
    foodPicker = null;
    if (selectedDie >= 0) {
        selectedDie = -1;
        render();
    }
}
modal.addEventListener("click", (e) => {
    if (e.target === modal) {
        modal.close();
        closeFoodPicker();
    }
});
modal.addEventListener("cancel", closeFoodPicker);
window.addEventListener("online", () => {
    if (session)
        attach();
});
window.addEventListener("resize", () => drawTable());
render();
try {
    const saved = JSON.parse(sessionStorage.getItem("paws.seat") || "null");
    if (saved)
        api("resume", saved)
            .then((data) => enter(data, saved.token))
            .catch(() => {
            sessionStorage.removeItem("paws.seat");
            toast("Saved room unavailable. Create a new table or join a room.");
        });
}
catch { }
// Test and capture hook: lets automation wait for the table to settle.
window.paws = {
    stage,
    busy: () => stage.busy(),
    narrating: () => !!narration,
    watching: () => watch
        ? {
            index: watch.i,
            step: watch.steps[watch.i],
            total: watch.steps.length,
        }
        : null,
    guide: () => guide,
    // What Naledi is pointing at, so a test player can follow her advice. A
    // scene comes first: its button is the only thing that can be pressed.
    pointer: () => scene
        ? "#scene [data-ui=scene-next]"
        : scenes.length || watch
            ? ""
            : pointerSel,
    scene: () => scene ?? (scenes.length ? { kind: "waiting" } : null),
    // For screenshots: call up a chapter card or a scene without playing to it.
    chapter: (i) => showChapter(i),
    preview: (sc) => queueScene(sc, 0),
    band: (label, worth, have, of) => showGoal(label, worth, have, of),
    // What the pointer carries, and the choice waiting to be confirmed.
    carried: () => stage.carried(),
    choice: () => ({ card: selectedCard, slot: targetSlot, placement }),
};
