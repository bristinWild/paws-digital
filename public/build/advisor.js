import { feedingStatus, foodUnit } from "./feeding.js";
/**
 * Naledi's advice. For every decision it lists the options a player has, what
 * each one brings, which one she would take and why, in plain words.
 * Pure and deterministic: it reads only what that player can see on the table,
 * so it runs unchanged in the browser, in tests and in a later Godot port.
 * recommend() turns the advice into a full command, so a test can play whole
 * games by doing what she says.
 */
import { ACTION_MIN, ACTION_NAMES, CARD, FOODS, GRID_BONUS, HABITAT_NAMES, SLOT_HABITATS, TILE, cardName, } from "./data.js";
import { COLLECT_REOPENED, applyCommand, awaiting, claimable, goalDefinition, goalProgress, landPlacements, legalActions, score, tileComplete, total, viewFor, } from "./engine.js";
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const list = (names) => names.length < 2
    ? (names[0] ?? "")
    : names.slice(0, -1).join(", ") + " and " + names.at(-1);
const points = (n) => `${n > 0 ? "+" : ""}${n} ${Math.abs(n) === 1 ? "point" : "points"}`;
const rank = (options) => {
    options.sort((a, b) => +!!a.blocked - +!!b.blocked || b.value - a.value || 0);
    if (options.length && !options[0].blocked)
        options[0].best = true;
    return options;
};
const housed = (p) => p.slots.flatMap((x, slot) => x && CARD[x.card.id]
    ? [
        {
            slot,
            a: CARD[x.card.id],
            fed: x.card.fed,
            tucked: x.tucked.map((t) => t.id),
        },
    ]
    : []);
const companionMet = (a, others) => a.companion === "Endangered Animal"
    ? others.some((o) => o.endangered)
    : others.some((o) => o.name === a.companion);
const hasTrap = (p) => p.bot
    ? [...p.hand, ...p.placed].some((c) => c.id > 101)
    : p.slots.some((x) => x && x.card.id > 101);
/** What a Region Goal would pay this player if claimed next. */
const nextTier = (s, key) => goalDefinition(s, key)?.tiers[s.claims[key].length] ?? 0;
const openGoals = (s, pi) => Object.keys(s.claims).filter((k) => !s.players[pi].goals.includes(k));
function matches(a, kind) {
    return (a.diet === kind || a.age === kind || (kind === "endangered" && a.endangered));
}
/** Rough worth of one food token: six left over score 3, and food feeds animals. */
const FOOD = 0.6;
function abilityWorth(s, pi, id) {
    const a = CARD[id], p = s.players[pi];
    if (!a)
        return 0;
    switch (a.ability) {
        case "food":
            return FOOD * a.amount;
        case "draw":
            return a.amount;
        case "disarmOwn":
            return hasTrap(p) ? 4 : 0;
        case "disarmOther":
            return s.players.some((q, i) => i !== pi && hasTrap(q)) ? 6 : 0;
        case "discardLand":
            return p.land.some((t) => !t.completed) ? 2 : 0;
        default:
            return 0;
    }
}
/** What giving this animal that home is worth, and the best reason for it. */
function placement(s, pi, id, slot) {
    const p = s.players[pi], a = CARD[id], here = housed(p), others = here.map((h) => h.a), q = structuredClone(p);
    q.slots[slot] = { card: { id, fed: 0 }, tucked: [] };
    const have = p.bank[a.food];
    // Points arrive once it is fed, so food on hand makes it worth more today.
    let value = a.cp * (have >= a.need ? 0.75 : have > 0 ? 0.6 : 0.45);
    const gains = [`${points(a.cp)} when fed`];
    let why = have >= a.need
        ? `It eats ${a.food}, and you have enough to feed it: ${points(a.cp)}.`
        : have > 0
            ? `It scores ${a.cp} once fully fed; you already hold some ${a.food} for it.`
            : `It scores ${a.cp} once fed. It eats ${a.food}, so look for some.`;
    let weight = 0;
    const reason = (w, text) => {
        if (w > weight)
            [weight, why] = [w, text];
    };
    if (a.bonus && companionMet(a, others)) {
        value += a.bonus;
        gains.push(`${points(a.bonus)} companion`);
        reason(a.bonus, `Its companion is already in your sanctuary: ${points(a.bonus)} at once, no food needed.`);
    }
    for (const h of here) {
        const rest = others.filter((o) => o !== h.a);
        if (h.a.bonus && !companionMet(h.a, rest) && companionMet(h.a, [a])) {
            value += h.a.bonus;
            gains.push(`${points(h.a.bonus)} companion`);
            reason(h.a.bonus + 0.5, `Your ${h.a.name} was waiting for this companion: ${points(h.a.bonus)} at once.`);
        }
    }
    for (const t of p.land)
        if (!t.completed && tileComplete(q, t.id)) {
            const cp = TILE[t.id].cp;
            value += cp + 4;
            gains.push(`land ${points(cp)}`);
            reason(cp + 4, `It completes your land tile: the −4 turns into ${points(cp)}.`);
        }
    for (const key of openGoals(s, pi)) {
        const g = goalDefinition(s, key), before = goalProgress(p, g), after = goalProgress(q, g), tier = nextTier(s, key);
        if (after <= before || before >= g.target)
            continue;
        if (after >= g.target) {
            value += tier * 0.6;
            gains.push("goal ready");
            reason(tier * 0.6, `It completes “${g.label}”: a Region Goal worth ${tier} points.`);
        }
        else {
            value += (tier / g.target) * 0.35;
            reason((tier / g.target) * 0.35, `It moves “${g.label}” to ${after} of ${g.target}; the goal is worth ${tier}.`);
        }
    }
    return { value, gain: gains.join(" · "), why };
}
/** Every hand animal with its best home, and tucking where it makes sense. */
export function placeOptions(s, pi) {
    const p = s.players[pi], out = [];
    for (const c of p.hand) {
        const a = CARD[c.id];
        if (!a)
            continue;
        const top = slotOptions(s, pi, c.id)[0];
        if (top)
            out.push({ ...top, id: String(c.id), title: a.name, best: false });
        const under = tuckOptions(s, pi, c.id)[0];
        if (under)
            out.push({
                ...under,
                id: `${c.id}:tuck`,
                title: a.name,
                card: c.id,
                best: false,
                // An animal with a free home is worth more placed than tucked.
                value: top ? Math.min(under.value, 0.9) : under.value,
            });
    }
    return rank(out);
}
/** Homes that suit one hand animal, best first. */
export function slotOptions(s, pi, id) {
    const p = s.players[pi], a = CARD[id];
    if (!a)
        return [];
    return rank(p.slots.flatMap((x, slot) => x || !a.habitats.includes(SLOT_HABITATS[slot])
        ? []
        : [
            {
                id: String(slot),
                title: HABITAT_NAMES[SLOT_HABITATS[slot]],
                slot,
                card: id,
                tuck: false,
                ...placement(s, pi, id, slot),
            },
        ]));
}
/** Animals a card could be tucked under: 1 point, plus its ability rides along. */
export function tuckOptions(s, pi, id) {
    const p = s.players[pi], extra = abilityWorth(s, pi, id) * 0.5;
    return rank(p.slots.flatMap((x, slot) => x && CARD[x.card.id] && x.tucked.length < 5
        ? [
            {
                id: String(slot),
                title: CARD[x.card.id].name,
                slot,
                card: id,
                tuck: true,
                gain: "+1 point",
                why: extra
                    ? `Tucked cards score 1 point, and its When Fed ability fires every time you feed the ${CARD[x.card.id].name}.`
                    : `A tucked card scores 1 point for sure, with no feeding needed.`,
                // Prefer the animal that is fed most often: fewest meals still needed.
                value: 1 + extra + (CARD[x.card.id].need - x.card.fed > 0 ? 0.2 : 0),
            },
        ]
        : []));
}
function meals(s, pi, row, used = []) {
    const p = s.players[pi];
    return housed(p)
        .filter((h) => Math.floor(h.slot / 5) === row && !used.includes(h.slot))
        .map((h) => {
        const scores = h.fed < h.a.need && h.fed + 1 >= h.a.need, closer = h.fed + 1 < h.a.need, extra = [h.a.id, ...h.tucked].reduce((n, id) => n + abilityWorth(s, pi, id), 0);
        return {
            slot: h.slot,
            a: h.a,
            now: scores ? h.a.cp : 0,
            value: (scores ? h.a.cp : closer ? (h.a.cp / h.a.need) * 0.6 : 0) + extra,
            full: h.fed >= h.a.need,
            extra,
        };
    })
        .filter((m) => m.value > 0)
        .sort((x, y) => y.value - x.value);
}
/** The meals one Feed action can serve in a row with the food in the bank. */
function feedPlan(s, pi, row, limit, used = []) {
    const stock = { ...s.players[pi].bank }, picks = [];
    for (const m of meals(s, pi, row, used)) {
        if (picks.length >= limit || stock[m.a.food] < 1)
            continue;
        stock[m.a.food]--;
        picks.push(m);
    }
    return {
        picks,
        now: picks.reduce((n, m) => n + m.now, 0),
        value: picks.reduce((n, m) => n + m.value, 0),
    };
}
const feedGain = (plan) => plan.now
    ? `${points(plan.now)} now`
    : plan.picks.length
        ? `${plural(plan.picks.length, "animal")} closer to scoring`
        : "nothing to feed";
export function rowOptions(s, pi) {
    return rank([0, 1].map((row) => {
        const plan = feedPlan(s, pi, row, s.active === pi ? 5 : 1), names = plan.picks.map((m) => m.a.name);
        return {
            id: String(row),
            row,
            title: row ? "Lower row" : "Upper row",
            gain: feedGain(plan),
            why: plan.now
                ? `${list(names)} can eat there. A fully fed animal scores its points right away: ${points(plan.now)}.`
                : plan.picks.length
                    ? `${list(names)} can eat there. Each meal brings an animal closer to scoring.`
                    : "No animal in that row can eat what is in your Food Bank.",
            value: plan.value,
            blocked: plan.picks.length ? undefined : "Nothing there can eat",
        };
    }));
}
export function feedOptions(s, pi, t) {
    const p = s.players[pi], stock = p.bank;
    return rank(meals(s, pi, t.row ?? 0, t.used ?? [])
        .filter((m) => stock[m.a.food] > 0)
        .map((m) => ({
        id: String(m.slot),
        slot: m.slot,
        title: m.a.name,
        gain: m.now
            ? `${points(m.now)} now`
            : m.full
                ? "When Fed ability"
                : "closer to scoring",
        why: m.full
            ? `The ${m.a.name} is already fed and has scored, but every meal fires its When Fed ability again. No hunger badge means no more meals are needed for animal points.`
            : `${m.now ? `One ${foodUnit[m.a.food]} clears the hunger badge: ${points(m.now)} for you right away.` : `One ${foodUnit[m.a.food]} reduces the badge to ${feedingStatus(s, pi, m.a.id).missing - 1} more meals; ${m.a.cp} animal CP are still waiting.`} Feeding is optional. Skip now and those points stay locked until fully fed.`,
        value: m.value,
    })));
}
// ---------- land ----------
const bonusWorth = (cells) => cells.reduce((n, c) => n + (GRID_BONUS[c] === "draw" ? 1 : FOOD), 0);
/** One token of a food, in words. */
const ONE = {
    meat: "meat",
    leaves: "leaf",
    bones: "bone",
    bananas: "banana",
};
/** What the covered spaces pay, counted per kind: "1 banana + 2 cards". */
const bonusText = (cells) => {
    const count = new Map();
    for (const c of cells)
        count.set(GRID_BONUS[c], (count.get(GRID_BONUS[c]) ?? 0) + 1);
    return [...count]
        .map(([kind, n]) => kind === "draw"
        ? plural(n, "card")
        : n === 1
            ? "1 " + ONE[kind]
            : `${n} ${kind}`)
        .join(" + ");
};
/** Where a tile fits, the spot with the best covered rewards first. */
export function cellOptions(s, pi, id) {
    return rank(landPlacements(s.players[pi], id).map((cells) => ({
        id: cells.join("-"),
        cells,
        title: "Land Grid",
        gain: bonusText(cells),
        why: `Each space you cover pays out once. This spot gives you ${bonusText(cells)}.`,
        value: bonusWorth(cells),
    })));
}
/** What passing on a land tile is worth: no risk taken. */
const SAFE = 1;
/**
 * Tiles on the Land Board lie face-down: only the reward and the shape show,
 * the goal is revealed when the tile is taken. So drafting is a bet on how many
 * animals the player houses; bigger rewards ask for more animals of one kind.
 */
function tileWorth(s, pi, id) {
    const p = s.players[pi], t = TILE[id], spots = cellOptions(s, pi, id);
    if (!t || !spots.length)
        return null;
    const extra = spots[0].value, homes = housed(p).length, free = p.slots.filter((x) => !x).length, waiting = p.hand.filter((c) => CARD[c.id] &&
        p.slots.some((x, i) => !x && CARD[c.id].habitats.includes(SLOT_HABITATS[i]))).length, animals = homes + 0.5 * Math.min(waiting, free), chance = t.cp <= 3
        ? Math.min(0.85, 0.2 + 0.13 * animals)
        : t.cp <= 6
            ? Math.min(0.7, 0.09 * animals)
            : t.cp <= 8
                ? Math.min(0.55, 0.065 * animals)
                : Math.min(0.4, 0.04 * animals), covers = bonusText(spots[0].cells);
    return {
        value: chance * t.cp - (1 - chance) * 4 + extra,
        gain: `${covers} now · ${points(t.cp)} when complete`,
        why: chance >= 0.55
            ? `Its goal shows once you take it. A reward of ${t.cp} asks for few animals and you house ${homes}: a good bet. It pays ${covers} at once.`
            : `A gamble: its goal stays hidden until you take it, and a reward of ${t.cp} asks for several animals of one kind. But it pays ${covers} at once.`,
    };
}
export function draftOptions(s, pi) {
    const out = s.stacks.flatMap((stack, i) => {
        const id = stack.at(-1), w = id ? tileWorth(s, pi, id) : null;
        return id && w
            ? [{ id: String(i), stack: i, title: `Land worth ${TILE[id].cp}`, ...w }]
            : [];
    });
    out.push({
        id: "skip",
        title: "Pass",
        gain: "no risk",
        why: "A tile's goal stays hidden until you take it, and an unfinished tile costs 4 points. With few animals at home, passing is the safe choice.",
        value: SAFE,
    });
    return rank(out);
}
// ---------- adopting ----------
/** How much a card is wanted in this player's hand. */
function cardWant(s, pi, id) {
    if (id > 101)
        return {
            value: -5,
            gain: "−4 points",
            why: "That is a trap: it blocks a habitat and costs 4 points until disarmed.",
        };
    if (!CARD[id])
        return {
            value: 2,
            gain: "a gamble",
            why: "The free card is face-down: it costs nothing, but it is a gamble. It could be anything, even a trap (−4).",
        };
    const slots = slotOptions(s, pi, id);
    if (slots.length)
        return slots[0];
    const under = tuckOptions(s, pi, id)[0];
    return under
        ? {
            value: under.value,
            gain: under.gain,
            why: `No free habitat suits it, but tucked it is worth a point.`,
        }
        : { value: 0.3, gain: "no home yet", why: "No free habitat suits it yet." };
}
export function adoptOptions(s, pi, t) {
    const p = s.players[pi], out = [];
    for (const o of s.offers) {
        if (!t.bonus && o.player === pi)
            continue;
        o.cards.forEach((c, slot) => {
            if (!c)
                return;
            const w = cardWant(s, pi, c.id), own = o.player === pi, short = slot > total(p.bank), drop = short ? 0 : spareDrop(p, slot);
            out.push({
                id: `${o.player}:${slot}`,
                owner: o.player,
                slot,
                cost: slot,
                card: c.id,
                title: c.id ? cardName(c.id) : "Face-down card",
                gain: w.gain +
                    (slot ? ` · costs ${slot} food` : " · free") +
                    (drop ? ` · −${drop} points for now` : ""),
                why: w.why +
                    (slot
                        ? own
                            ? ` The ${slot} food only moves to your Reserve.`
                            : ` It costs ${slot} food.`
                        : "") +
                    (drop ? ` ${SPARE(drop)}` : ""),
                value: w.value - slot * (own ? 0.3 : FOOD),
                blocked: short ? "Not enough food" : undefined,
            });
        });
    }
    out.push({
        id: "skip",
        title: "Pass",
        gain: "keep your food",
        why: "Nothing here helps your sanctuary enough to pay for it.",
        value: 0.4,
    });
    return rank(out);
}
/** The order to lay out one's own three offers: free, 1 food, 2 food. */
export function offerOrder(s, pi) {
    const cards = s.offers[pi]?.cards ?? [], idx = [0, 1, 2], trap = idx.find((i) => (cards[i]?.id ?? 0) > 101), want = (i) => (cards[i] ? cardWant(s, pi, cards[i].id).value : -9);
    if (trap !== undefined) {
        const rest = idx
            .filter((i) => i !== trap)
            .sort((a, b) => want(b) - want(a));
        return {
            order: [trap, ...rest],
            why: "Hide the trap in the free slot. It lies face-down there, and whoever takes it loses 4 points.",
        };
    }
    if (s.active === pi) {
        const order = idx.slice().sort((a, b) => want(b) - want(a));
        return {
            order,
            why: `You adopt again from any offer this turn. Keep the ${cards[order[0]] ? cardName(cards[order[0]].id) : "best card"} in your free slot and it costs you nothing.`,
        };
    }
    return {
        order: idx,
        why: "These go to the others. The free card lies face-down; the order is fine as it is.",
    };
}
// ---------- food ----------
/** After the suggested payment, can any animal at home still eat (including for an ability)? */
function mealLeft(s, pi, n) {
    const p = s.players[pi], stock = { ...p.bank };
    for (const f of foodPick(s, pi, n, false).food)
        stock[f]--;
    return housed(p).some((h) => stock[h.a.food] > 0);
}
/** Said wherever a payment takes spare-food points with it. */
const SPARE = (drop) => `Every 6 food you hold count 3 points, so that is ${drop} points less until you restock.`;
/** Points of spare food lost when `n` food leaves the Food Bank: 3 for every full six. */
export function spareDrop(p, n) {
    const have = total(p.bank);
    return (Math.floor(have / 6) - Math.floor(Math.max(0, have - n) / 6)) * 3;
}
/** How much each food type is needed by animals at home or in hand. */
function appetite(p) {
    const need = {
        meat: 0,
        leaves: 0,
        bones: 0,
        bananas: 0,
    };
    for (const h of housed(p))
        need[h.a.food] += Math.max(0, h.a.need - h.fed) * 2;
    for (const c of p.hand)
        if (CARD[c.id])
            need[CARD[c.id].food] += 1;
    return need;
}
/** Which food to take (gain) or give up (pay), with the reason. */
export function foodPick(s, pi, n, gain) {
    const p = s.players[pi], need = appetite(p), stock = { ...p.bank }, food = [];
    for (let i = 0; i < n; i++) {
        // Paying: food nobody eats goes first, then whatever is most plentiful.
        const order = FOODS.slice().sort((a, b) => gain
            ? need[b] - stock[b] - (need[a] - stock[a])
            : +(need[a] > 0) - +(need[b] > 0) ||
                need[a] - stock[a] - (need[b] - stock[b]));
        const f = gain ? order[0] : order.find((x) => stock[x] > 0);
        if (!f)
            break;
        food.push(f);
        stock[f] += gain ? 1 : -1;
    }
    const eater = [
        ...housed(p)
            .filter((h) => h.fed < h.a.need)
            .map((h) => h.a),
        ...p.hand.flatMap((c) => (CARD[c.id] ? [CARD[c.id]] : [])),
    ].find((a) => a.food === food[0]);
    return {
        food,
        why: gain
            ? eater
                ? `I picked ${food[0]} first: your ${eater.name} eats it. Change it if you like.`
                : "Any food helps: six left at the end score 3 points."
            : "I picked the food your animals need least.",
    };
}
// ---------- the turn: an action and a die ----------
const NALEDI_ACTION = [
    null,
    null,
    "adopt",
    "place",
    "feed",
    "protect",
    null,
];
/** What Naledi gets from the dice a player leaves behind (she takes the highest). */
export function threat(s, pi, die) {
    const bi = s.players.findIndex((p) => p.bot);
    if (bi < 0 || (pi + 1) % s.players.length !== bi)
        return { value: 0, text: "", short: "" };
    const bot = s.players[bi], left = s.dice.filter((_, i) => i !== die);
    if (!left.length)
        return {
            value: 5,
            text: "The pool is then empty, so I roll fresh dice.",
            short: "Naledi rolls new dice",
        };
    const v = Math.max(...left), a = NALEDI_ACTION[v];
    if (!a)
        return {
            value: 0,
            text: `It leaves me the ${v}, and on a ${v} I must rest.`,
            short: "Naledi rests",
        };
    if (bot.used[a])
        return {
            value: 0,
            text: `It leaves me the ${v}, but I used that move this round, so I rest.`,
            short: "Naledi rests",
        };
    const lead = score(s, pi).total - score(s, bi).total;
    switch (a) {
        case "adopt":
            return {
                value: 2.5,
                text: `It leaves me the ${v}: I adopt two animals.`,
                short: "Naledi adopts",
            };
        case "place": {
            const worth = (i) => {
                const c = bot.hand[i];
                return !c ? 0 : CARD[c.id] ? CARD[c.id].cp + CARD[c.id].bonus - 1 : -4;
            };
            return bot.hand.length
                ? {
                    value: worth(0) + 0.5 * worth(1),
                    text: `It leaves me the ${v}: I place animals, and mine score without food.`,
                    short: "Naledi places animals",
                }
                : {
                    value: 0,
                    text: `It leaves me the ${v}, but I have no animals to place.`,
                    short: "Naledi gets nothing",
                };
        }
        case "feed": {
            if (bot.goals.length >= 4)
                return {
                    value: 0,
                    text: `It leaves me the ${v}, which brings me nothing more.`,
                    short: "Naledi gets nothing",
                };
            const tiers = openGoals(s, bi).map((k) => nextTier(s, k)), goal = tiers.length
                ? tiers.reduce((a, b) => a + b, 0) / tiers.length
                : 0, last = bot.goals.length === 3;
            return {
                value: goal + (last ? (lead - goal > 0 ? -2 : 8) : 2),
                text: last
                    ? `It leaves me the ${v}: I claim my fourth Region Goal and call the Rain Dance.`
                    : `It leaves me the ${v}: I claim a Region Goal.`,
                short: last ? "Naledi ends the game" : "Naledi claims a goal",
            };
        }
        default: {
            const tops = s.stacks.flatMap((x) => x.length ? [TILE[x.at(-1)].cp] : []);
            return tops.length
                ? {
                    value: tops[0] + tops[tops.length - 1],
                    text: `It leaves me the ${v}: I protect two land tiles.`,
                    short: "Naledi takes land",
                }
                : {
                    value: 0,
                    text: `It leaves me the ${v}, but no land is left.`,
                    short: "Naledi gets nothing",
                };
        }
    }
}
/** The dice that can pay for an action: what each costs or earns, and what it leaves Naledi. */
export function dieOptions(s, pi, action) {
    const p = s.players[pi], min = ACTION_MIN[action], seen = new Set(), out = [];
    s.dice.forEach((v, die) => {
        if (seen.has(v))
            return;
        seen.add(v);
        const diff = v - min, th = action === "rain"
            ? { value: 0, text: "", short: "" }
            : threat(s, pi, die);
        const drop = diff < 0 ? spareDrop(p, -diff) : 0, 
        // Feeding with a die that eats the meal itself feeds nobody.
        starve = action === "feed" && diff < 0 && !mealLeft(s, pi, -diff);
        const pay = diff > 0
            ? `The ${v} is bigger than ${ACTION_NAMES[action]} needs, so you gain ${diff} food.`
            : diff < 0
                ? `The ${v} is ${-diff} short, so ${-diff} food moves to your Reserve. You can collect it back.` +
                    (drop ? ` ${SPARE(drop)}` : "") +
                    (starve
                        ? " After paying that, no food your animals eat is left."
                        : "")
                : `The ${v} pays for ${ACTION_NAMES[action]} exactly.`;
        out.push({
            id: String(die),
            die,
            action,
            title: `The ${v}`,
            gain: diff > 0
                ? `+${diff} food`
                : diff < 0
                    ? `costs ${-diff} food` +
                        (drop ? ` · −${drop} points for now` : "") +
                        (starve ? " · no meal left" : "")
                    : "exact",
            why: pay,
            after: th.text,
            note: th.short,
            value: (diff > 0 ? FOOD * diff : 0.5 * diff) - th.value - (starve ? 6 : 0),
            blocked: diff < 0 && total(p.bank) < -diff ? "Not enough food" : undefined,
        });
    });
    return rank(out);
}
/** Allowed, but it would bring nothing: ranked below everything useful. */
const POINTLESS = -5;
/**
 * Naledi joins every move the player makes on their own turn. This is what
 * her share is worth to her, and how she would warn about it.
 */
function reaction(s, pi, action) {
    const none = { value: 0, text: "" }, bi = s.players.findIndex((q) => q.bot), bot = s.players[bi];
    if (!bot || bi === pi || s.active !== pi)
        return none;
    switch (action) {
        case "adopt":
            return { value: 1.5, text: "I adopt one of your offers too." };
        case "place": {
            const c = bot.hand[0];
            return c && CARD[c.id]
                ? {
                    value: 0.5 * (CARD[c.id].cp + CARD[c.id].bonus - 1),
                    text: "I may place one of my adopted animals too.",
                }
                : none;
        }
        case "feed": {
            // Her answer to a Feed is one particular Region Goal, on every second Feed.
            const key = s.regions[1] ? `${s.regions[1].id}:0` : "", g = key ? goalDefinition(s, key) : undefined;
            if (!g || bot.goals.includes(key) || bot.goals.length >= 4)
                return none;
            const tier = nextTier(s, key), last = bot.goals.length === 3;
            return {
                value: 0.5 * tier + (last ? 4 : 0),
                text: last
                    ? `when you feed, I may claim “${g.label}”. That would be my fourth goal: the Rain Dance.`
                    : `when you feed, I may claim “${g.label}” for ${tier} points.`,
            };
        }
        case "protect": {
            const tops = s.stacks.flatMap((x) => x.length ? [TILE[x.at(-1)].cp] : []);
            return tops.length
                ? {
                    value: (tops[0] + tops[tops.length - 1]) / 2,
                    text: "I take a land tile too, and mine always counts as complete.",
                }
                : none;
        }
        default:
            return none;
    }
}
/** What a move is worth now: the player's own gain, less what it hands Naledi. */
function idea(s, pi, action) {
    const own = plan(s, pi, action), hers = reaction(s, pi, action);
    if (own.blocked || !hers.value)
        return own;
    return {
        ...own,
        value: own.value - hers.value,
        why: hers.value >= 2 ? `${own.why} Mind: ${hers.text}` : own.why,
    };
}
function plan(s, pi, action) {
    const p = s.players[pi], active = s.active === pi;
    switch (action) {
        case "place": {
            const all = placeOptions(s, pi), 
            // Two different animals in two different homes.
            picks = [];
            for (const o of all) {
                if (picks.length >= (active ? 2 : 1))
                    break;
                if (picks.some((x) => x.card === o.card || (!o.tuck && x.slot === o.slot)))
                    continue;
                picks.push(o);
            }
            if (!picks.length)
                return {
                    value: POINTLESS,
                    gain: "nothing to place",
                    why: p.hand.some((c) => CARD[c.id])
                        ? "None of your animals fits a free habitat."
                        : "You have no animals in your hand. Adopt some first.",
                };
            const homes = picks.filter((o) => !o.tuck);
            return {
                value: picks.reduce((n, o) => n + o.value, 0),
                gain: homes.length
                    ? `home for ${homes.map((o) => o.title).join(" + ")}`
                    : `${points(picks.length)} for tucked cards`,
                why: homes.length
                    ? `Animals only score once they live in your sanctuary. ${picks[0].why}`
                    : picks[0].why,
            };
        }
        case "feed": {
            const rows = rowOptions(s, pi), best = rows[0];
            if (!best || best.blocked)
                return {
                    value: POINTLESS,
                    gain: "nothing to feed",
                    why: housed(p).length
                        ? "None of your animals can eat what is in your Food Bank."
                        : "You have no animals at home to feed yet. Place one first.",
                };
            return { value: best.value, gain: best.gain, why: best.why };
        }
        case "protect": {
            const tiles = draftOptions(s, pi).filter((o) => o.id !== "skip");
            if (!tiles.length)
                return {
                    value: POINTLESS,
                    gain: "no tile fits",
                    why: "No Land Tile fits on your Land Grid right now.",
                };
            const good = tiles.filter((o) => o.value > SAFE);
            // The active player drafts twice.
            const mine = (good[0]?.value ?? 0) + (active ? 0.6 * (good[1]?.value ?? 0) : 0);
            return good.length
                ? { value: mine, gain: good[0].gain, why: good[0].why }
                : {
                    value: -1,
                    gain: "−4 points until complete",
                    why: "No tile on the board suits your animals yet, and an unfinished tile costs 4 points.",
                };
        }
        case "adopt": {
            const want = Math.max(0, 3 - p.hand.filter((c) => CARD[c.id]).length), free = p.slots.filter((x) => !x).length;
            return {
                value: free ? 1.5 + want * 1.6 : 0.6,
                gain: active ? "up to 2 new animals" : "1 new animal",
                why: !free
                    ? "Your habitats are full, so new animals could only be tucked."
                    : want
                        ? `Your hand is running low. New animals are new points: you choose from the offers${active ? " twice" : ""}.`
                        : "You already hold animals waiting for a home; place those first.",
            };
        }
        case "collect": {
            const r = total(p.reserve);
            return {
                value: FOOD * r + 0.1,
                gain: r ? `+${r} food from your Reserve` : "Reserve is empty",
                why: r
                    ? `Your Reserve holds ${r} food. Collecting returns all of it to your Food Bank, and I get nothing from it.`
                    : Math.max(...s.dice) > ACTION_MIN.collect
                        ? "Your Reserve is empty, but a big die on this space still pays its difference in food, and I get nothing from it."
                        : "No die here pays for a better move. Collect costs you nothing, and I get nothing from it.",
            };
        }
        default: {
            if (p.goals.length < s.length || s.rain !== null)
                return {
                    value: 0,
                    gain: `${p.goals.length} of ${s.length} goals`,
                    why: `The Rain Dance opens once you have claimed ${s.length} Region Goals.`,
                    blocked: `${p.goals.length} / ${s.length} goals`,
                };
            const lead = score(s, pi).total -
                Math.max(...s.players.map((_, i) => (i === pi ? -99 : score(s, i).total)));
            return lead >= 0
                ? {
                    value: 60,
                    gain: "+2 points, ends the game",
                    why: `You lead by ${lead}. The Rain Dance ends the game while you are ahead: one last turn each, and 2 points for you.`,
                }
                : {
                    value: -6,
                    gain: "+2 points, ends the game",
                    why: `You are ${-lead} behind. The Rain Dance would end the game now; score more first if you can.`,
                };
        }
    }
}
const ORDER = [
    "place",
    "feed",
    "protect",
    "adopt",
    "collect",
    "rain",
];
/** Collect Reserve offered although its space holds a die: said plainly, with what it brings. */
function reopenedCollect(p) {
    const r = total(p.reserve);
    return {
        gain: COLLECT_REOPENED + (r ? ` · +${r} food` : ""),
        why: "Collect Reserve is always open, even though you used it this round. " +
            (r
                ? `It returns the ${r} food in your Reserve.`
                : "Your Reserve is empty; any surplus pips on the die still give you food."),
    };
}
/**
 * The six action spaces with what each would bring now and the die to pay with.
 * Which of them are open is the engine's word: `legalActions`.
 */
export function actionOptions(s, pi) {
    const p = s.players[pi], legal = legalActions(s, pi);
    return rank(ORDER.map((action) => {
        const open = legal.find((x) => x.action === action), i = idea(s, pi, action), dice = dieOptions(s, pi, action).filter((o) => !o.blocked), die = dice[0], blocked = open
            ? undefined
            : p.used[action]
                ? "Used this round"
                : (i.blocked ?? "No die you can afford"), said = open?.reopened ? reopenedCollect(p) : i;
        return {
            id: action,
            action,
            die: die?.die,
            title: ACTION_NAMES[action],
            gain: said.gain,
            why: said.why,
            value: i.value + (die?.value ?? 0),
            blocked,
        };
    }));
}
// ---------- smaller choices ----------
export function trapSlot(s, pi) {
    const p = s.players[pi], wanted = (slot) => p.hand.filter((c) => CARD[c.id] && CARD[c.id].habitats.includes(SLOT_HABITATS[slot])).length, free = p.slots.flatMap((x, i) => (x ? [] : [i])), slot = free.sort((a, b) => wanted(a) - wanted(b))[0] ?? 0;
    return {
        slot,
        why: `Put it in ${HABITAT_NAMES[SLOT_HABITATS[slot]]}: none of your animals is waiting for that space.`,
    };
}
/** Whether a When Fed ability is worth using, and the command that uses it. */
export function effectAdvice(s, pi, t) {
    const p = s.players[pi], skip = { type: "skip" };
    switch (t.ability) {
        case "food": {
            const pick = foodPick(s, pi, t.amount ?? 1, true);
            return {
                use: true,
                command: { type: "effect", food: pick.food },
                why: `Free food! ${pick.why}`,
            };
        }
        case "draw":
            return {
                use: true,
                command: { type: "effect" },
                why: "Free cards: more animals to place, more points later.",
            };
        case "disarmOwn": {
            const slot = p.slots.findIndex((x) => x && x.card.id > 101);
            return slot >= 0
                ? {
                    use: true,
                    command: { type: "effect", target: pi, slot },
                    why: "Disarm your trap: the habitat is free again and the −4 is gone.",
                }
                : {
                    use: false,
                    command: skip,
                    why: "You have no trap to disarm. Skip it.",
                };
        }
        case "disarmOther": {
            for (let j = 0; j < s.players.length; j++) {
                if (j === pi)
                    continue;
                const v = s.players[j];
                if (v.bot) {
                    const trap = [...v.hand, ...v.placed].find((x) => x.id > 101);
                    if (trap)
                        return {
                            use: true,
                            command: { type: "effect", target: j, card: trap.id },
                            why: `Disarm ${v.name}’s trap: +4 points for you.`,
                        };
                }
                else {
                    const slot = v.slots.findIndex((x) => x && x.card.id > 101);
                    if (slot >= 0)
                        return {
                            use: true,
                            command: { type: "effect", target: j, slot },
                            why: `Disarm ${v.name}’s trap: +4 points for you.`,
                        };
                }
            }
            return {
                use: false,
                command: skip,
                why: "Nobody else has a trap. Skip it.",
            };
        }
        case "discardLand": {
            const land = p.land.findIndex((x) => !x.completed);
            return land >= 0 && tileWorthless(s, pi, p.land[land].id)
                ? {
                    use: true,
                    command: { type: "effect", land },
                    why: "That tile will not be completed: remove it and its −4 is gone.",
                }
                : {
                    use: false,
                    command: skip,
                    why: "Your land is fine as it is. Skip it.",
                };
        }
        default:
            return {
                use: false,
                command: skip,
                why: "A swap only helps when a better animal is waiting in your hand. Skip it for now.",
            };
    }
}
/** An unfinished tile nobody in hand can help with. */
function tileWorthless(s, pi, id) {
    const p = s.players[pi], here = housed(p).map((h) => h.a), hand = p.hand.flatMap((c) => (CARD[c.id] ? [CARD[c.id]] : []));
    return TILE[id].goals.some(([kind, n]) => [...here, ...hand].filter((a) => matches(a, kind)).length < n);
}
export function reserveOptions(s, pi) {
    const p = s.players[pi], need = appetite(p);
    return rank(FOODS.filter((f) => p.reserve[f] > 0).map((f) => ({
        id: f,
        title: f,
        gain: `+1 ${ONE[f]}`,
        why: need[f]
            ? `Take the ${ONE[f]}: one of your animals eats it.`
            : `Any food helps: six left at the end score 3 points.`,
        value: 1 + need[f] - p.bank[f] * 0.1,
    })));
}
/** Region Goals this player can claim right now, most valuable first. */
export function claimOptions(s, pi) {
    if (s.active !== pi)
        return [];
    return rank(Object.keys(s.claims)
        .filter((k) => claimable(s, pi, k))
        .map((k) => ({
        id: k,
        title: goalDefinition(s, k).label,
        gain: points(nextTier(s, k)),
        why: `Claiming is free and takes no die. You are ${["first", "second", "third", "fourth"][s.claims[k].length] ?? "next"} to claim it: ${points(nextTier(s, k))}.`,
        value: nextTier(s, k) + 1,
    })));
}
/** The move Naledi would make for this player right now, as a full command. */
export function recommend(s, pi) {
    const p = s.players[pi], t = s.tasks[0];
    const goal = claimOptions(s, pi)[0];
    if (goal && s.phase !== "over")
        return { type: "claim", goal: goal.id };
    if (s.phase === "end")
        return { type: "end" };
    if (s.phase === "choose") {
        const best = actionOptions(s, pi).find((o) => !o.blocked);
        // The engine always leaves a legal move: Collect Reserve at the very least.
        if (!best)
            throw new Error("Engine bug: no legal action to recommend. Collect Reserve must always be offered.");
        const diff = s.dice[best.die] - ACTION_MIN[best.action];
        return {
            type: "act",
            action: best.action,
            die: best.die,
            food: foodPick(s, pi, Math.abs(diff), diff > 0).food,
        };
    }
    switch (t.kind) {
        case "offer":
            return { type: "offer", order: offerOrder(s, pi).order };
        case "adopt": {
            const o = adoptOptions(s, pi, t)[0];
            return o.id === "skip" || o.blocked
                ? { type: "skip" }
                : {
                    type: "adopt",
                    owner: o.owner,
                    slot: o.slot,
                    food: foodPick(s, pi, o.cost, false).food,
                };
        }
        case "place": {
            const o = placeOptions(s, pi)[0];
            return o
                ? { type: "place", card: o.card, slot: o.slot, tuck: !!o.tuck }
                : { type: "skip" };
        }
        case "row":
            return { type: "row", row: rowOptions(s, pi)[0].row };
        case "feed": {
            const o = feedOptions(s, pi, t)[0];
            return o ? { type: "feed", slot: o.slot } : { type: "skip" };
        }
        case "draft": {
            const o = draftOptions(s, pi)[0];
            return o.id === "skip"
                ? { type: "skip" }
                : { type: "draft", stack: o.stack };
        }
        case "tile":
            return { type: "tile", cells: cellOptions(s, pi, t.tile)[0].cells };
        case "trap":
            return { type: "trap", slot: trapSlot(s, pi).slot };
        case "collect": {
            const o = reserveOptions(s, pi)[0];
            return o ? { type: "collect", food: o.id } : { type: "skip" };
        }
        default:
            return effectAdvice(s, pi, t).command;
    }
}
/**
 * Plays every `auto` seat's turn by her advice, one command at a time, until
 * a human (or a seat with no advisor opinion) has a real choice outstanding,
 * or the game ends. Each bot decides from its own hidden-information view,
 * the same as a human would, never the authoritative state: it cannot peek
 * at another seat's face-down land goal or an unready offer. The server
 * steps through this one command at a time, at a human pace; this is the
 * all-at-once version a test can call to finish a whole table of bots.
 */
export function autoplay(s) {
    let cur = s;
    for (let guard = 0; guard < 4000; guard++) {
        const pi = awaiting(cur);
        if (pi === null || !cur.players[pi].auto)
            return cur;
        const seat = cur.players[pi];
        cur = applyCommand(cur, seat.id, recommend(viewFor(cur, seat.id), pi));
    }
    throw new Error("Bot autoplay did not settle.");
}
