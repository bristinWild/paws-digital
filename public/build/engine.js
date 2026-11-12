import { ACTIONS, ACTION_MIN, ACTION_NAMES, ANIMALS, CARD, FOODS, GRID, GRID_BONUS, HABITATS, REGIONS, SLOT_HABITATS, SOLO_DECKS, TILE, TILES, cardName, } from "./data.js";
const COMMAND_TYPES = [
    "act",
    "offer",
    "adopt",
    "place",
    "row",
    "feed",
    "draft",
    "tile",
    "effect",
    "trap",
    "collect",
    "skip",
    "end",
    "claim",
];
export const bank = () => ({ meat: 0, leaves: 0, bones: 0, bananas: 0 });
export const total = (b) => FOODS.reduce((n, f) => n + b[f], 0);
function requireRule(ok, message) {
    if (!ok)
        throw new Error(message);
}
function random(s) {
    s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
    return s.seed / 4294967296;
}
function shuffle(s, a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random(s) * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function say(s, text, kind = "action") {
    s.log.unshift(text);
    s.log = s.log.slice(0, 120);
    s.events.push({ kind, text, turn: s.turn });
    s.events = s.events.slice(-30);
}
function refresh(s) {
    s.dice = Array.from({ length: s.players.length + 1 }, () => 1 + Math.floor(random(s) * 6));
    s.players.forEach((p) => (p.used = {}));
    s.round++;
    say(s, `Fresh dice pool: ${s.dice.join(" · ")}. All action spaces reopen.`, "dice");
}
function draw(s) {
    if (!s.deck.length)
        s.deck = shuffle(s, s.discard.splice(0));
    const c = s.deck.pop() ?? null;
    s.deckCount = s.deck.length;
    return c;
}
function animalDraw(s) {
    const traps = [];
    let c;
    do {
        c = draw(s);
        requireRule(c, "No animal cards remain.");
        if (c.id > 101)
            traps.push(c);
    } while (c.id > 101);
    s.deck.push(...traps);
    shuffle(s, s.deck);
    s.deckCount = s.deck.length;
    return c;
}
function acquire(s, pi, c) {
    const p = s.players[pi];
    if (c.id <= 101 || p.bot)
        p.hand.push(c);
    else if (p.slots.some((x) => !x)) {
        s.tasks.unshift({ kind: "trap", player: pi, card: c });
        say(s, `${p.name} revealed a trap. Choose an empty habitat for it.`, "trap");
    }
    else {
        s.discard.push(c);
        say(s, `${p.name} discards a trap: no empty habitat.`, "trap");
    }
}
function drawHand(s, pi, n) {
    for (let i = 0; i < n; i++) {
        const c = draw(s);
        if (c)
            acquire(s, pi, c);
    }
}
function takeFood(p, foods, n, to) {
    requireRule(Array.isArray(foods) && foods.length === n, `Choose exactly ${n} food token${n === 1 ? "" : "s"}.`);
    const b = { ...p.bank };
    for (const f of foods) {
        requireRule(FOODS.includes(f) && b[f] > 0, "That food is unavailable.");
        b[f]--;
    }
    p.bank = b;
    if (to)
        for (const f of foods)
            to[f]++;
}
function gainFood(p, foods, n) {
    requireRule(Array.isArray(foods) && foods.length === n, `Choose ${n} food token${n === 1 ? "" : "s"}.`);
    for (const f of foods) {
        requireRule(FOODS.includes(f), "Unknown food.");
        p.bank[f]++;
    }
}
function cycle(s, key) {
    const deck = s.soloDecks[key];
    requireRule(deck?.length, "Missing Naledi deck.");
    const c = deck.shift();
    deck.push(c);
    s.soloCard = c;
    say(s, `Naledi reveals Solo Card ${c} (${key.replace(/([A-Z])/g, " $1").toLowerCase()}).`, "naledi");
    return c;
}
const soloKey = (active, a) => (active ? "active" : "passive") + a[0].toUpperCase() + a.slice(1);
export function newGame(names, options = {}) {
    requireRule(names.length >= 2 && names.length <= 5, "PAWS supports 2–5 players, including Naledi.");
    const s = {
        schema: 1,
        seed: options.seed ?? Date.now() >>> 0,
        revision: 0,
        players: names.map((n) => ({
            id: n.id,
            name: n.name,
            bot: !!n.bot,
            auto: !!n.auto,
            hand: [],
            slots: Array(10).fill(null),
            placed: [],
            bank: { meat: 1, leaves: 1, bones: 1, bananas: 1 },
            reserve: bank(),
            land: [],
            used: {},
            disarmed: 0,
            savedTraps: 0,
            goals: [],
        })),
        active: 0,
        phase: "choose",
        dice: [],
        round: 0,
        turn: 1,
        deck: [],
        discard: [],
        deckCount: 0,
        regions: [],
        claims: {},
        stacks: [],
        offers: [],
        tasks: [],
        action: null,
        row: null,
        length: options.length ?? 4,
        rain: null,
        finalLeft: null,
        soloDecks: {},
        soloCard: null,
        log: [],
        events: [],
        tutorial: !!options.tutorial,
    };
    requireRule([3, 4, 5].includes(s.length), "Choose short, normal or long.");
    s.deck = shuffle(s, [
        ...ANIMALS.map((a) => ({ id: a.id, fed: 0 })),
        ...Array.from({ length: 7 }, (_, i) => ({ id: 102 + i, fed: 0 })),
    ]);
    s.regions = shuffle(s, [...REGIONS]).slice(0, 3);
    for (const r of s.regions)
        for (let g = 0; g < 2; g++)
            s.claims[`${r.id}:${g}`] = [];
    const layers = [1, 2, 3].map((size) => shuffle(s, TILES.filter((t) => t.size === size).map((t) => t.id)));
    s.stacks = Array.from({ length: names.length + 1 }, () => [
        layers[2].pop(),
        layers[1].pop(),
        layers[0].pop(),
    ]);
    for (const p of s.players)
        for (let i = 0; i < 4; i++)
            p.hand.push(animalDraw(s));
    for (const [k, cs] of Object.entries(SOLO_DECKS))
        s.soloDecks[k] = shuffle(s, [...cs]);
    refresh(s);
    say(s, "Your sanctuary begins with 4 animals, 1 of each food and 5 Raindrops. Choose a die, then an action.", "setup");
    requireLegalMove(s);
    return s;
}
export function landPlacements(p, id) {
    const size = TILE[id]?.size ?? 0;
    const occupied = new Set(p.land.flatMap((t) => t.cells));
    const out = [];
    for (let a = 0; a < 7; a++)
        for (const [dq, dr] of GRID.slice(1)) {
            const cells = Array.from({ length: size }, (_, i) => GRID.findIndex(([q, r]) => q === GRID[a][0] + i * dq && r === GRID[a][1] + i * dr));
            if (cells.every((i) => i >= 0 && !occupied.has(i)) &&
                !out.some((v) => v.slice().sort().join() === cells.slice().sort().join()))
                out.push(cells);
        }
    return out;
}
export function tileComplete(p, id) {
    const animals = p.slots.flatMap((x) => x && CARD[x.card.id] ? [CARD[x.card.id]] : []);
    return TILE[id].goals.every(([kind, n]) => animals.filter((a) => a.diet === kind ||
        a.age === kind ||
        (kind === "endangered" && a.endangered)).length >= n);
}
/**
 * A Land Tile is completed exactly while the animals now placed in its owner's
 * sanctuary fulfil its goal. An animal swapped out can turn a finished tile
 * face-up again: it then counts −4 CP like any unfinished tile, until its goal
 * is met once more. Runs after every command, so the mark follows every change
 * to the placed animals. Naledi's land always counts as complete (solo rules).
 */
function updateLand(s) {
    for (const p of s.players) {
        if (p.bot)
            continue;
        for (const t of p.land) {
            const done = tileComplete(p, t.id);
            if (done === t.completed)
                continue;
            t.completed = done;
            say(s, done
                ? `${p.name} completes ${t.id}: ${TILE[t.id].cp} CP secured.`
                : `${p.name} turns ${t.id} face-up again: its goal is no longer met, so it counts −4 CP until it is completed again.`, "land");
        }
    }
}
export function goalProgress(p, g) {
    const animals = p.slots.map((x) => (x && CARD[x.card.id] ? x : null));
    if (HABITATS.includes(g.kind))
        return animals.filter((x, i) => x && SLOT_HABITATS[i] === g.kind).length;
    switch (g.kind) {
        case "tucked":
            return p.slots.reduce((n, x) => n + (x?.tucked.length ?? 0), 0);
        case "food":
            return total(p.bank);
        case "land":
            return p.land.reduce((n, t) => n + t.cells.length, 0);
        case "disarmed":
            return p.disarmed;
        case "fed":
            // "Feed 5 different animals": different species, each placed and holding
            // at least one food token. Two cards of one species count once.
            return new Set(animals.flatMap((x) => x && x.card.fed > 0 ? [CARD[x.card.id].name] : [])).size;
        case "each":
            return HABITATS.filter((h) => animals.some((x, i) => x && SLOT_HABITATS[i] === h)).length;
        case "row":
            return Math.max(animals.slice(0, 5).filter(Boolean).length, animals.slice(5).filter(Boolean).length);
        default:
            return 0;
    }
}
export function goalDefinition(s, key) {
    const [r, g] = key.split(":").map(Number);
    return s.regions.find((x) => x.id === r)?.goals[g];
}
export function claimable(s, pi, key) {
    const g = goalDefinition(s, key);
    return (!!g &&
        !s.players[pi].goals.includes(key) &&
        s.players[pi].goals.length < 5 &&
        goalProgress(s.players[pi], g) >= g.target);
}
function claim(s, pi, key, bot = false) {
    const p = s.players[pi];
    requireRule(bot || claimable(s, pi, key), "Complete this goal before claiming it.");
    requireRule(s.claims[key] && !p.goals.includes(key), "Goal already claimed or unavailable.");
    requireRule(p.goals.length < (p.bot ? 4 : 5), "No Raindrops remain.");
    s.claims[key].push(pi);
    p.goals.push(key);
    const g = goalDefinition(s, key);
    say(s, `${p.name} claims ${g.label} for ${g.tiers[s.claims[key].length - 1] ?? 0} CP.`, "goal");
}
function triggerRain(s, pi) {
    if (s.rain !== null)
        return;
    s.rain = pi;
    s.finalLeft = s.players.length;
    s.tasks = [];
    s.phase = "choose";
    s.active = (pi + 1) % s.players.length;
    s.turn++;
    refresh(s);
    say(s, `${s.players[pi].name} performs the Rain Dance! Everyone gets one final turn; the dancer goes last.`, "rain");
}
function finishTurn(s) {
    if (s.finalLeft !== null) {
        s.finalLeft--;
        if (s.finalLeft === 0) {
            s.phase = "over";
            say(s, "The final turn is complete. Count your Conservation Points.", "scoring");
            return;
        }
    }
    s.active = (s.active + 1) % s.players.length;
    s.turn++;
    s.phase = "choose";
    s.action = null;
    s.row = null;
    s.offers = [];
    if (!s.dice.length)
        refresh(s);
}
function order(s) {
    return s.players.map((_, i) => (s.active + i) % s.players.length);
}
function reactionTasks(s, a) {
    const tasks = [];
    const indices = order(s);
    switch (a) {
        case "adopt":
            s.offers = s.players.map((_, player) => ({
                player,
                cards: Array.from({ length: 3 }, () => draw(s)),
                ready: s.players[player].bot,
            }));
            tasks.push(...indices
                .filter((i) => !s.players[i].bot)
                .map((player) => ({ kind: "offer", player })));
            tasks.push(...indices.map((player) => ({ kind: "adopt", player })), { kind: "adopt", player: s.active, bonus: true });
            break;
        case "place":
            tasks.push(...indices.map((player) => ({
                kind: "place",
                player,
                remaining: player === s.active ? 2 : 1,
            })));
            break;
        case "feed":
            tasks.push({ kind: "row", player: s.active });
            break;
        case "protect":
            tasks.push(...indices.map((player) => ({ kind: "draft", player })), { kind: "draft", player: s.active, bonus: true });
            break;
        case "collect":
            for (const pi of indices) {
                const p = s.players[pi];
                if (pi === s.active) {
                    for (const f of FOODS) {
                        p.bank[f] += p.reserve[f];
                        p.reserve[f] = 0;
                    }
                }
                else if (total(p.reserve))
                    tasks.push({ kind: "collect", player: pi });
            }
            break;
    }
    return tasks;
}
// ---------- ruling: "Collect Reserve is always a legal move" ----------
/** Why Collect Reserve is offered on an occupied space, as the HUD words it. */
export const COLLECT_REOPENED = "always available";
/** Collect Reserve is exempt from Blocked Actions, including an empty Reserve. */
function collectReopens() {
    return true;
}
/**
 * The actions a player may take when it is their turn to choose (by default
 * the active player), each with the dice that can pay for it, counting the
 * food in their Food Bank for missing pips. Naledi follows her own cards.
 */
export function legalActions(s, pi = s.active) {
    const p = s.players[pi];
    if (!p || p.bot)
        return [];
    const have = total(p.bank), payers = (a) => s.dice.flatMap((v, i) => (v + have >= ACTION_MIN[a] ? [i] : [])), out = [];
    for (const action of ACTIONS) {
        if (p.used[action])
            continue;
        if (action === "rain" && (p.goals.length < s.length || s.rain !== null))
            continue;
        const dice = payers(action);
        if (dice.length)
            out.push({ action, dice });
    }
    if (p.used.collect && collectReopens()) {
        const dice = payers("collect");
        if (dice.length)
            out.push({ action: "collect", dice, reopened: true });
    }
    return out;
}
/**
 * Invariant: a player who must choose with dice in the pool has a legal
 * action. Collect Reserve guarantees one, so a failure here is an engine bug.
 */
function requireLegalMove(s) {
    const p = s.players[s.active];
    if (s.phase !== "choose" || p.bot || !s.dice.length)
        return;
    if (!legalActions(s).length)
        throw new Error(`Engine bug: ${p.name} must choose an action, but none is legal with dice ${s.dice.join(" · ")}. Collect Reserve must always be offered.`);
}
/**
 * The player who must act next, or null once the game is over. Naledi's own
 * automa turns never surface here: `pump()` already resolves every one of
 * them inside `applyCommand`, so this only ever names a real seat (human or
 * an `auto` seat driven by the advisor) with a genuine choice outstanding.
 */
export function awaiting(s) {
    if (s.phase === "over")
        return null;
    if (s.phase === "resolve")
        return s.tasks[0]?.player ?? s.active;
    return s.active;
}
function startAction(s, pi, c, bot = false) {
    requireRule(s.phase === "choose" && s.active === pi, "Wait for your action turn.");
    requireRule(c.action in ACTION_MIN, "Unknown action.");
    requireRule(Number.isInteger(c.die) && c.die >= 0 && c.die < s.dice.length, "Choose a remaining die.");
    const p = s.players[pi], value = s.dice[c.die], min = ACTION_MIN[c.action], 
    // Blocked Actions, with the one exception `collectReopens` allows.
    reopened = !!p.used[c.action] &&
        legalActions(s, pi).some((x) => x.action === c.action && x.reopened);
    requireRule(!p.used[c.action] || reopened, "That action space is occupied until the next dice refresh.");
    if (c.action === "rain")
        requireRule(p.goals.length >= s.length && s.rain === null, "Claim enough Region Goals before the Rain Dance.");
    if (!bot) {
        if (value < min)
            takeFood(p, c.food, min - value, p.reserve);
        else
            gainFood(p, c.food, value - min);
    }
    s.dice.splice(c.die, 1);
    p.used[c.action] = value;
    s.action = c.action;
    s.phase = "resolve";
    s.row = null;
    say(s, `${p.name} uses die ${value}: ${ACTION_NAMES[c.action]}${reopened ? " again" : ""}.`);
    if (c.action === "rain") {
        triggerRain(s, pi);
        return;
    }
    s.tasks = reactionTasks(s, c.action);
    if (s.players.some((p) => p.bot) &&
        ["adopt", "place", "feed", "protect"].includes(c.action))
        cycle(s, soloKey(bot, c.action));
}
function completeTask(s) {
    s.tasks.shift();
}
function advancePlace(s, t) {
    t.remaining = (t.remaining ?? 1) - 1;
    if (t.remaining <= 0)
        completeTask(s);
}
function feedRow(s, row) {
    requireRule(row === 0 || row === 1, "Choose the upper or lower row.");
    s.row = row;
    completeTask(s);
    s.tasks.unshift(...order(s).map((player) => ({
        kind: "feed",
        player,
        row,
        remaining: player === s.active ? 5 : 1,
        used: [],
    })));
}
function botClaim(s, c) {
    let keys = [];
    if (c === 8 || c === 19)
        keys = [`${s.regions[1].id}:${c === 8 ? 1 : 0}`];
    else {
        const right = c === 6 || c === 11;
        const top = c === 6 || c === 12;
        const rs = right ? [...s.regions].reverse() : s.regions;
        keys = rs.map((r) => `${r.id}:${top ? 0 : 1}`);
    }
    const pi = s.players.findIndex((p) => p.bot), p = s.players[pi];
    const key = keys.find((k) => !p.goals.includes(k));
    if (key && p.goals.length < 4) {
        claim(s, pi, key, true);
        if (p.goals.length === 4 && s.rain === null)
            triggerRain(s, pi);
    }
}
function botAdopt(s, t) {
    const c = s.soloCard ?? 13, pi = t.player, p = s.players[pi];
    const own = s.offers[pi], other = s.offers.find((o) => o.player !== pi);
    let candidates;
    if (t.bonus)
        candidates = c === 3 ? [0, 1, 2] : [2, 1, 0];
    else
        candidates = [
            c === 1 || c === 13 ? 2 : c === 2 || c === 14 ? 1 : 0,
            1,
            2,
            0,
        ];
    const offer = t.bonus ? own : other;
    const slot = candidates.find((i) => offer.cards[i] && (i === 0 || offer.cards[i].id <= 101));
    completeTask(s);
    if (slot !== undefined) {
        const animal = offer.cards[slot];
        offer.cards[slot] = null;
        p.hand.push(animal);
        if (offer.player !== pi && slot)
            s.tasks.unshift({
                kind: "effect",
                player: offer.player,
                ability: "food",
                amount: slot,
            });
        say(s, `Naledi adopts ${cardName(animal.id)}${slot ? `; pays ${slot} food from the supply` : ""}.`, "naledi");
    }
}
function botTask(s, t) {
    const p = s.players[t.player], c = s.soloCard ?? 0;
    switch (t.kind) {
        case "adopt":
            botAdopt(s, t);
            break;
        case "place": {
            const n = s.active === t.player ? (c === 5 ? 2 : 1) : c === 17 ? 1 : 0;
            for (let i = 0; i < n && p.hand.length; i++)
                p.placed.push(p.hand.shift());
            completeTask(s);
            say(s, `Naledi places ${n} animal${n === 1 ? "" : "s"} (as available).`, "naledi");
            break;
        }
        case "row":
            feedRow(s, 0);
            break;
        case "feed":
            completeTask(s);
            if (c !== 18)
                botClaim(s, c);
            break;
        case "draft": {
            const right = c === 10 || c === 21;
            const options = s.stacks
                .map((x, i) => (x.length ? i : -1))
                .filter((i) => i >= 0);
            const i = right ? options.at(-1) : options[0];
            if (i !== undefined) {
                const id = s.stacks[i].pop();
                p.land.push({ id, cells: [], completed: true });
                say(s, `Naledi protects ${id} (${TILE[id].cp} CP).`, "naledi");
            }
            completeTask(s);
            break;
        }
        default:
            completeTask(s);
    }
}
/** Runs automatic transitions only; stops whenever a human choice is required. */
function pump(s) {
    for (let guard = 0; guard < 120; guard++) {
        updateLand(s);
        if (s.phase === "over")
            return;
        if (s.phase === "choose" && s.players[s.active].bot) {
            if (!s.dice.length)
                refresh(s);
            const die = s.dice.indexOf(Math.max(...s.dice)), value = s.dice[die], a = [
                null,
                null,
                "adopt",
                "place",
                "feed",
                "protect",
                null,
            ][value];
            if (!a || s.players[s.active].used[a]) {
                s.dice.splice(die, 1);
                say(s, `Naledi takes die ${value} and rests.`, "naledi");
                finishTurn(s);
                continue;
            }
            startAction(s, s.active, { type: "act", action: a, die, food: [] }, true);
            continue;
        }
        if (s.phase === "resolve") {
            const t = s.tasks[0];
            if (!t) {
                for (const o of s.offers)
                    for (const c of o.cards)
                        if (c)
                            s.discard.push(c);
                s.offers = [];
                s.phase = "end";
                if (s.players[s.active].bot) {
                    finishTurn(s);
                    continue;
                }
                return;
            }
            if (s.players[t.player].bot) {
                botTask(s, t);
                continue;
            }
            const p = s.players[t.player];
            if ((t.kind === "place" && !p.hand.length) ||
                (t.kind === "collect" && !total(p.reserve))) {
                completeTask(s);
                continue;
            }
            if (t.kind === "draft" &&
                !s.stacks.some((x) => x.length && landPlacements(p, x.at(-1)).length)) {
                completeTask(s);
                continue;
            }
            return;
        }
        return;
    }
    throw new Error("Automatic transition limit exceeded.");
}
export function applyCommand(state, playerId, c) {
    const s = structuredClone(state), pi = s.players.findIndex((p) => p.id === playerId);
    requireRule(pi >= 0 && !s.players[pi].bot, "Unknown player.");
    requireRule(s.phase !== "over", "The game has ended.");
    requireRule(COMMAND_TYPES.includes(c?.type), "Unknown command.");
    const p = s.players[pi];
    if (c.type === "claim") {
        requireRule(pi === s.active, "Claim goals on your active turn.");
        claim(s, pi, c.goal);
    }
    else if (c.type === "act")
        startAction(s, pi, c);
    else if (c.type === "end") {
        requireRule(s.phase === "end" && s.active === pi, "Finish the action before ending your turn.");
        finishTurn(s);
    }
    else {
        const t = s.tasks[0];
        requireRule(s.phase === "resolve" && t?.player === pi, "Wait for your choice.");
        if (c.type === "skip") {
            requireRule(!["offer", "row", "tile", "trap"].includes(t.kind), "Finish this required choice.");
            completeTask(s);
            say(s, `${p.name} passes ${t.kind}.`);
        }
        else
            switch (t.kind) {
                case "offer": {
                    requireRule(c.type === "offer", "Arrange your adoption offer.");
                    requireRule(c.order.length === 3 &&
                        new Set(c.order).size === 3 &&
                        c.order.every((i) => Number.isInteger(i) && i >= 0 && i < 3), "Use each drawn card once.");
                    const o = s.offers[pi];
                    o.cards = c.order.map((i) => o.cards[i]);
                    o.ready = true;
                    completeTask(s);
                    say(s, `${p.name} sets their adoption fees.`);
                    break;
                }
                case "adopt": {
                    requireRule(c.type === "adopt", "Choose an animal from an offer.");
                    requireRule(Number.isInteger(c.owner) &&
                        c.owner >= 0 &&
                        c.owner < s.players.length, "Unknown offer.");
                    requireRule(t.bonus || c.owner !== pi, "Your first adoption must come from someone else.");
                    requireRule([0, 1, 2].includes(c.slot), "Unknown fee slot.");
                    const o = s.offers[c.owner], animal = o.cards[c.slot];
                    requireRule(animal, "That card has already been adopted.");
                    const to = c.owner === pi
                        ? p.reserve
                        : s.players[c.owner].bot
                            ? undefined
                            : s.players[c.owner].bank;
                    takeFood(p, c.food, c.slot, to);
                    o.cards[c.slot] = null;
                    completeTask(s);
                    acquire(s, pi, animal);
                    say(s, `${p.name} adopts ${cardName(animal.id)} for ${c.slot} food.`, "adopt");
                    break;
                }
                case "place": {
                    requireRule(c.type === "place", "Choose a hand card and a habitat.");
                    const i = p.hand.findIndex((x) => x.id === c.card);
                    requireRule(i >= 0 && CARD[c.card], "Choose an animal in your hand.");
                    requireRule(Number.isInteger(c.slot) && c.slot >= 0 && c.slot < 10, "Unknown habitat.");
                    const dest = p.slots[c.slot];
                    if (c.tuck) {
                        requireRule(dest && CARD[dest.card.id] && dest.tucked.length < 5, "Tuck under an animal with fewer than 5 tucked cards.");
                        const animal = p.hand.splice(i, 1)[0];
                        animal.fed = 0;
                        dest.tucked.push(animal);
                    }
                    else {
                        requireRule(!dest, "That habitat is occupied.");
                        requireRule(CARD[c.card].habitats.includes(SLOT_HABITATS[c.slot]), "This animal needs a matching habitat.");
                        p.slots[c.slot] = { card: p.hand.splice(i, 1)[0], tucked: [] };
                    }
                    advancePlace(s, t);
                    say(s, `${p.name} ${c.tuck ? "tucks" : "places"} ${cardName(c.card)}.`, "place");
                    break;
                }
                case "row":
                    requireRule(c.type === "row", "Choose a row to feed.");
                    feedRow(s, c.row);
                    break;
                case "feed": {
                    requireRule(c.type === "feed", "Choose an animal in the selected row.");
                    requireRule(Number.isInteger(c.slot) &&
                        c.slot >= 0 &&
                        c.slot < 10 &&
                        Math.floor(c.slot / 5) === t.row, "Feed in the chosen row.");
                    const slot = p.slots[c.slot];
                    requireRule(slot && CARD[slot.card.id], "Choose an animal.");
                    requireRule(!t.used?.includes(c.slot), "An animal can receive only 1 food per Feed action.");
                    const a = CARD[slot.card.id];
                    requireRule(p.bank[a.food] > 0, `You need ${a.food} in your Food Bank.`);
                    p.bank[a.food]--;
                    slot.card.fed++;
                    t.used.push(c.slot);
                    advancePlace(s, t);
                    const abilities = [slot.card, ...slot.tucked].map((x) => ({
                        kind: "effect",
                        player: pi,
                        ability: CARD[x.id].ability,
                        amount: CARD[x.id].amount,
                        source: x.id,
                    }));
                    s.tasks.unshift(...abilities);
                    say(s, `${p.name} feeds ${a.name} (${slot.card.fed}/${a.need}).`, "feed");
                    break;
                }
                case "draft": {
                    requireRule(c.type === "draft", "Choose an available Land Tile.");
                    requireRule(Number.isInteger(c.stack) &&
                        c.stack >= 0 &&
                        c.stack < s.stacks.length, "Unknown stack.");
                    const id = s.stacks[c.stack].at(-1);
                    requireRule(id && landPlacements(p, id).length, "This tile cannot fit on your Land Grid.");
                    s.stacks[c.stack].pop();
                    completeTask(s);
                    s.tasks.unshift({ kind: "tile", player: pi, tile: id });
                    break;
                }
                case "tile": {
                    requireRule(c.type === "tile", "Choose a legal tile position.");
                    const id = t.tile;
                    requireRule(Array.isArray(c.cells) &&
                        c.cells.every((i) => Number.isInteger(i) && i >= 0 && i < 7), "Choose numeric Land Grid positions.");
                    requireRule(landPlacements(p, id).some((x) => x.slice().sort().join() === c.cells.slice().sort().join()), "Tiles must fit in a straight line without overlap.");
                    p.land.push({ id, cells: c.cells, completed: tileComplete(p, id) });
                    completeTask(s);
                    for (const cell of c.cells) {
                        const reward = GRID_BONUS[cell];
                        if (reward === "draw")
                            drawHand(s, pi, 1);
                        else
                            p.bank[reward]++;
                    }
                    say(s, `${p.name} protects ${id}; gains all covered hex rewards.`, "protect");
                    break;
                }
                case "trap": {
                    requireRule(c.type === "trap", "Place the revealed trap.");
                    requireRule(Number.isInteger(c.slot) &&
                        c.slot >= 0 &&
                        c.slot < 10 &&
                        !p.slots[c.slot], "Choose an empty habitat.");
                    p.slots[c.slot] = { card: t.card, tucked: [] };
                    completeTask(s);
                    say(s, `${p.name} places a trap in habitat ${c.slot + 1}.`, "trap");
                    break;
                }
                case "collect": {
                    requireRule(c.type === "collect" && FOODS.includes(c.food), "Choose 1 food from your Reserve.");
                    requireRule(p.reserve[c.food] > 0, "That food is not in your Reserve.");
                    p.reserve[c.food]--;
                    p.bank[c.food]++;
                    completeTask(s);
                    break;
                }
                case "effect": {
                    requireRule(c.type === "effect", "Resolve or skip the When Fed ability.");
                    if (t.ability === "food") {
                        gainFood(p, c.food ?? [], t.amount);
                        completeTask(s);
                    }
                    else if (t.ability === "draw") {
                        completeTask(s);
                        drawHand(s, pi, t.amount);
                    }
                    else if (t.ability === "discardLand") {
                        requireRule(Number.isInteger(c.land) && p.land[c.land], "Choose a Land Tile to discard.");
                        const tile = p.land.splice(c.land, 1)[0];
                        completeTask(s);
                        say(s, `${p.name} removes ${tile.id}; its hex rewards can be earned again later.`);
                    }
                    else if (t.ability === "disarmOwn" || t.ability === "disarmOther") {
                        const target = c.target;
                        requireRule(Number.isInteger(target) &&
                            target >= 0 &&
                            target < s.players.length, "Choose a sanctuary.");
                        requireRule(t.ability === "disarmOwn" ? target === pi : target !== pi, "This ability targets a different sanctuary.");
                        const victim = s.players[target];
                        let trap;
                        if (victim.bot) {
                            const area = [...victim.hand, ...victim.placed];
                            const tr = area.find((x) => x.id === c.card && x.id > 101);
                            requireRule(tr, "Choose one of Naledi’s traps.");
                            trap = tr;
                            victim.hand = victim.hand.filter((x) => x.id !== tr.id);
                            victim.placed = victim.placed.filter((x) => x.id !== tr.id);
                        }
                        else {
                            requireRule(Number.isInteger(c.slot) && c.slot >= 0 && c.slot < 10, "Choose a trap.");
                            const slot = victim.slots[c.slot];
                            requireRule(slot && slot.card.id > 101, "That habitat has no trap.");
                            trap = slot.card;
                            victim.slots[c.slot] = null;
                        }
                        s.discard.push(trap);
                        p.disarmed++;
                        if (target !== pi)
                            p.savedTraps++;
                        completeTask(s);
                        say(s, `${p.name} disarms ${victim.name}’s trap${target !== pi ? " (+4 CP)" : ""}.`, "disarm");
                    }
                    else if (t.ability === "swap") {
                        requireRule(Number.isInteger(c.slot) && c.slot >= 0 && c.slot < 10, "Choose a sanctuary animal.");
                        const slot = p.slots[c.slot];
                        requireRule(slot && CARD[slot.card.id], "Choose a sanctuary animal.");
                        const hi = p.hand.findIndex((x) => x.id === c.card);
                        requireRule(hi >= 0 && CARD[c.card], "Choose a replacement from your hand.");
                        const incoming = p.hand[hi];
                        let outgoing;
                        if (c.tuck !== undefined && c.tuck >= 0) {
                            requireRule(slot.tucked[c.tuck], "Choose a tucked animal.");
                            outgoing = slot.tucked[c.tuck];
                            incoming.fed = 0;
                            slot.tucked[c.tuck] = incoming;
                        }
                        else {
                            requireRule(CARD[incoming.id].habitats.includes(SLOT_HABITATS[c.slot]), "The replacement must match the habitat.");
                            outgoing = slot.card;
                            slot.card = incoming;
                        }
                        p.hand.splice(hi, 1, outgoing);
                        completeTask(s);
                        say(s, `${p.name} swaps ${cardName(outgoing.id)} for ${cardName(incoming.id)}.`, "swap");
                    }
                    break;
                }
            }
    }
    pump(s);
    requireLegalMove(s);
    s.revision++;
    return s;
}
export function score(s, pi) {
    const p = s.players[pi], r = {
        animals: 0,
        companions: 0,
        tucked: 0,
        land: 0,
        regions: 0,
        food: 0,
        traps: 0,
        rain: s.rain === pi ? 2 : 0,
        adopted: 0,
        total: 0,
    };
    if (p.bot) {
        r.adopted = p.hand.filter((x) => x.id <= 101).length;
        for (const c of p.placed)
            if (CARD[c.id]) {
                r.animals += CARD[c.id].cp;
                r.companions += CARD[c.id].bonus;
            }
        r.traps = -4 * [...p.hand, ...p.placed].filter((x) => x.id > 101).length;
    }
    else {
        const animals = p.slots.flatMap((x) => (x && CARD[x.card.id] ? [x] : []));
        for (const slot of animals) {
            const a = CARD[slot.card.id];
            if (slot.card.fed >= a.need)
                r.animals += a.cp;
            if (animals.some((x) => x.card.id !== slot.card.id &&
                (a.companion === "Endangered Animal"
                    ? CARD[x.card.id].endangered
                    : CARD[x.card.id].name === a.companion)))
                r.companions += a.bonus;
            r.tucked += slot.tucked.length;
        }
        r.food = Math.floor(total(p.bank) / 6) * 3;
        r.traps =
            p.savedTraps * 4 - p.slots.filter((x) => x && x.card.id > 101).length * 4;
    }
    r.land = p.land.reduce((n, t) => n + (t.completed ? TILE[t.id].cp : -4), 0);
    r.regions = p.goals.reduce((n, key) => n + (goalDefinition(s, key).tiers[s.claims[key].indexOf(pi)] ?? 0), 0);
    r.total = Object.values(r).reduce((a, b) => a + b, 0);
    return r;
}
export function winners(s) {
    let result = s.players.map((_, i) => i);
    for (const value of [
        (i) => score(s, i).total,
        (i) => s.players[i].goals.length,
        ...(s.players.some((p) => p.bot)
            ? []
            : [(i) => s.players[i].land.filter((t) => t.completed).length]),
    ]) {
        const max = Math.max(...result.map(value));
        result = result.filter((i) => value(i) === max);
    }
    return result;
}
/** Hidden offers, draw order and automa order never leave the authoritative server. */
export function viewFor(s, playerId) {
    const v = structuredClone(s);
    v.seed = 0;
    v.deck = [];
    v.soloDecks = {};
    const pi = s.players.findIndex((p) => p.id === playerId);
    for (const o of v.offers)
        if (o.player !== pi) {
            if (o.ready) {
                if (o.cards[0])
                    o.cards[0] = { id: 0, fed: 0 };
            }
            else
                o.cards = o.cards.map((c) => (c ? { id: 0, fed: 0 } : null));
        }
    return v;
}
