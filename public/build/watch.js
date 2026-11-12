/** Presentation events derived from accepted snapshots. Never replays commands. */
import { ACTION_NAMES, CARD, TILE, cardName } from "./data.js";
import { goalDefinition } from "./engine.js";
import { fresh } from "./story.js";
export function watchPlan(a, b, bi) {
    const before = a.players[bi], after = b.players[bi];
    if (!before?.bot || !after)
        return [];
    const steps = [];
    for (const line of fresh(a, b)) {
        const m = line.match(/^Naledi (?:uses die (\d): (.+)\.|takes die (\d) and rests\.)$/);
        if (!m)
            continue;
        const die = Number(m[1] ?? m[3]), action = m[3]
            ? "rest"
            : Object.keys(ACTION_NAMES).find((k) => ACTION_NAMES[k] === m[2]);
        steps.push({
            kind: "die",
            die,
            action,
            label: `I take the highest die: ${die}.`,
        });
        steps.push({
            kind: "action",
            die,
            action,
            label: action === "rest"
                ? "This die makes me rest. No action this time."
                : `I put it on ${ACTION_NAMES[action]}. Watch what it brings me.`,
        });
    }
    for (const card of after.hand.filter((c) => ![...before.hand, ...before.placed].some((x) => x.id === c.id)))
        steps.push({
            kind: "card",
            piece: `card:${card.id}`,
            label: CARD[card.id]
                ? `I adopt ${cardName(card.id)}: 1 CP now, more once placed.`
                : "I adopted a hidden trap: −4 CP.",
        });
    for (const card of after.placed.filter((c) => !before.placed.some((x) => x.id === c.id)))
        steps.push({
            kind: "card",
            piece: `card:${card.id}`,
            label: CARD[card.id]
                ? `I place ${cardName(card.id)}: ${CARD[card.id].cp + CARD[card.id].bonus} CP in my placed pile. I need no food.`
                : "The trap moves to my placed pile: still −4 CP.",
        });
    for (const tile of after.land.filter((t) => !before.land.some((x) => x.id === t.id)))
        steps.push({
            kind: "tile",
            piece: `tile:${tile.id}`,
            label: `I protect this Land Tile: +${TILE[tile.id].cp} CP. My land counts as complete.`,
        });
    for (const key of after.goals.filter((k) => !before.goals.includes(k))) {
        const goal = goalDefinition(b, key), tier = b.claims[key].indexOf(bi);
        steps.push({
            kind: "goal",
            piece: `drop:${bi}:${after.goals.indexOf(key)}`,
            label: `I claim ${goal.label}: +${goal.tiers[tier] ?? 0} CP at this claim tier.`,
        });
    }
    return steps;
}
/** Later moves wait at their sources; a reward scene also holds the current move. */
export function holdUpcoming(final, before, steps, index, sceneOpen) {
    const items = new Map(final);
    for (let k = index + (sceneOpen ? 0 : 1); k < steps.length; k++) {
        const key = steps[k].piece, item = key && items.get(key);
        if (key && item)
            items.set(key, {
                ...item,
                pose: before.get(key)?.pose ?? item.from ?? item.pose,
            });
    }
    return items;
}
