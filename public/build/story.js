/**
 * What just happened, in words a first-time player can use: the payoff of the
 * player's own move, Naledi explaining what her move did for her, and where
 * both stand. Pure: everything is read from two snapshots, before and after.
 */
import { ACTION_NAMES, CARD, FOODS, TILE, cardName, } from "./data.js";
import { claimable, goalDefinition, goalProgress, score, total, } from "./engine.js";
const signed = (n) => (n > 0 ? "+" : "−") + Math.abs(n);
const pts = (n) => `${signed(n)} ${Math.abs(n) === 1 ? "point" : "points"}`;
const list = (names) => names.length < 2
    ? (names[0] ?? "")
    : names.slice(0, -1).join(", ") + " and " + names.at(-1);
/** What a Land Tile asks for, in plain words: "2 babies and 1 endangered animal". */
export function asks(goals) {
    return list(goals.map(([kind, n]) => kind === "endangered"
        ? `${n} endangered ${n === 1 ? "animal" : "animals"}`
        : kind === "baby"
            ? `${n} ${n === 1 ? "baby" : "babies"}`
            : `${n} ${kind}${n === 1 ? "" : "s"}`));
}
/** Where points come from, in the order the score sheet lists them. */
export const SOURCES = [
    ["animals", "fed animals"],
    ["companions", "companions"],
    ["tucked", "tucked cards"],
    ["land", "land"],
    ["regions", "Region Goals"],
    ["food", "spare food"],
    ["traps", "traps"],
    ["rain", "Rain Dance"],
    ["adopted", "adopted animals"],
];
/** Verbs the journal uses, as they read after "You". */
const YOU = {
    uses: "use",
    places: "place",
    tucks: "tuck",
    feeds: "feed",
    adopts: "adopt",
    protects: "protect",
    claims: "claim",
    completes: "complete",
    turns: "turn",
    performs: "perform",
    removes: "remove",
    disarms: "disarm",
    swaps: "swap",
    discards: "discard",
    reveals: "reveal",
    sets: "set",
    takes: "take",
    has: "have",
};
/**
 * The last moves of every player, oldest first, for the moves box. The journal
 * is written for the record; here each line names its player, drops what only
 * the record needs (card numbers, tile ids, steps that were skipped) and talks
 * to the viewer as "You".
 */
export function history(s, me, limit = 30) {
    // Longest name first, so "Sam" never claims a line written about "Samira".
    const order = s.players
        .map((p, i) => i)
        .sort((a, b) => s.players[b].name.length - s.players[a].name.length), mine = s.players[me]?.name, out = [];
    for (const e of s.events) {
        if (e.kind === "setup")
            continue;
        const dice = /^Fresh dice pool: (.+?)\. /.exec(e.text);
        if (dice) {
            out.push({ ...e, who: -1, name: "", text: `New dice: ${dice[1]}` });
            continue;
        }
        const who = order.find((i) => e.text.startsWith(s.players[i].name + " "));
        if (who === undefined) {
            out.push({ ...e, who: -1, name: "", text: e.text });
            continue;
        }
        let text = e.text.slice(s.players[who].name.length + 1);
        // Housekeeping the table does not need to hear about.
        if (/^reveals Solo Card /.test(text) || /^passes \w+\.$/.test(text))
            continue;
        const tile = /^(protects|completes|removes|turns) ([a-z]+-\d+)\b/.exec(text), land = tile && TILE[tile[2]], cp = /\((\d+) CP\)|: (\d+) CP secured/.exec(text), some = /^places (\d+) animals? \(as available\)/.exec(text);
        if (tile && tile[1] === "protects")
            text = cp
                ? `protects a Land Tile worth ${cp[1]} CP.`
                : land
                    ? `protects a ${land.size}-hex Land Tile.`
                    : "protects a Land Tile.";
        else if (tile && tile[1] === "completes")
            text = `completes a Land Tile: +${cp?.[2] ?? land?.cp ?? 0} CP.`;
        else if (tile && tile[1] === "turns")
            text =
                "turns a Land Tile face-up again: an animal it needs is gone, −4 CP until it is complete.";
        else if (tile)
            text = "removes a Land Tile.";
        else if (some)
            text =
                some[1] === "0"
                    ? "has no animal to place."
                    : `places ${some[1]} ${some[1] === "1" ? "animal" : "animals"}.`;
        else if (text.startsWith("revealed a trap"))
            text = "reveals a trap.";
        else if (/^adopts .+ for 0 food\.$/.test(text))
            text = text.replace("for 0 food", "for free");
        else if (text.startsWith("performs the Rain Dance"))
            text = "performs the Rain Dance! One final turn each.";
        // Two players with one name: the journal cannot say whose line it is, so
        // it stays a line of the table and nobody is told "You" by mistake.
        if (s.players.filter((p) => p.name === s.players[who].name).length > 1) {
            out.push({
                ...e,
                who: -1,
                name: "",
                text: `${s.players[who].name} ${text}`,
            });
            continue;
        }
        const you = who === me;
        if (you) {
            const [verb, ...rest] = text.split(" ");
            text = [YOU[verb] ?? verb, ...rest]
                .join(" ")
                .replace(" their ", " your ")
                .replace(mine + "’s", "your own");
        }
        else if (mine)
            text = text.replace(mine + "’s", "your");
        out.push({ ...e, who, name: you ? "You" : s.players[who].name, text });
    }
    return out.slice(-limit);
}
/** Journal lines written between two snapshots, oldest first. */
export function fresh(a, b) {
    // The journal is newest first and capped, so the new lines are whatever sits
    // in front of the old journal's opening lines.
    const head = a.log.slice(0, 6);
    if (!head.length)
        return b.log.slice().reverse();
    for (let k = 0; k <= b.log.length; k++)
        if (head.every((line, i) => b.log[k + i] === line))
            return b.log.slice(0, k).reverse();
    return b.log.slice(0, 6).reverse();
}
/** The reward card for a move the player just made; null when nothing changed for them. */
export function payoff(a, b, me, c) {
    const pa = a.players[me], pb = b.players[me], sa = score(a, me), sb = score(b, me), 
    // Spare food comes and goes with every meal, so the headline number counts
    // the lasting points; the spare-food change still shows as its own chip.
    points = sb.total - sa.total - (sb.food - sa.food), chips = [];
    for (const [key, label] of SOURCES) {
        const n = sb[key] - sa[key];
        if (n)
            chips.push({
                text: `${signed(n)} ${label}`,
                tone: n > 0 ? "gain" : "cost",
            });
    }
    for (const f of FOODS) {
        const n = pb.bank[f] - pa.bank[f];
        if (n)
            chips.push({ text: signed(n), tone: n > 0 ? "gain" : "cost", food: f });
    }
    const kept = total(pb.reserve) - total(pa.reserve);
    if (kept > 0)
        chips.push({ text: `${kept} food waits in your Reserve`, tone: "note" });
    const cards = pb.hand.filter((x) => CARD[x.id]).length -
        pa.hand.filter((x) => CARD[x.id]).length;
    if (cards > 0)
        chips.push({
            text: `+${cards} ${cards === 1 ? "animal" : "animals"} in hand`,
            tone: "gain",
        });
    for (const key of Object.keys(b.claims)) {
        if (pb.goals.includes(key))
            continue;
        const g = goalDefinition(b, key), before = Math.min(g.target, goalProgress(pa, g)), after = Math.min(g.target, goalProgress(pb, g));
        if (after <= before)
            continue;
        chips.push(claimable(b, me, key) && b.active === me
            ? { text: `Goal ready: ${g.label}`, tone: "gain" }
            : { text: `Goal ${after}/${g.target}: ${g.label}`, tone: "note" });
    }
    let title = "";
    switch (c.type) {
        case "act":
            title =
                c.action === "collect"
                    ? "Reserve collected"
                    : c.action === "rain"
                        ? "You called the Rain Dance!"
                        : chips.length
                            ? `Die placed on ${ACTION_NAMES[c.action]}`
                            : "";
            break;
        case "place": {
            const a2 = CARD[c.card];
            if (c.tuck)
                title = `${cardName(c.card)} is back in the wild`;
            else {
                title = `${cardName(c.card)} has a home!`;
                if (a2 && !points)
                    chips.unshift({
                        text: `scores ${a2.cp} once fed (${a2.need} × ${a2.food})`,
                        tone: "note",
                    });
            }
            break;
        }
        case "feed": {
            const slot = pb.slots[c.slot], a2 = slot && CARD[slot.card.id];
            if (a2) {
                const left = a2.need - slot.card.fed;
                title =
                    left === 0
                        ? `${a2.name} is fully fed!`
                        : left > 0
                            ? `${a2.name} ate: ${slot.card.fed} of ${a2.need} meals`
                            : `${a2.name} ate again`;
                if (left > 0)
                    chips.unshift({
                        text: `scores ${a2.cp} after ${left} more ${left === 1 ? "meal" : "meals"}`,
                        tone: "note",
                    });
            }
            break;
        }
        case "tile": {
            const land = pb.land.at(-1);
            title = land?.completed
                ? "Land protected and complete!"
                : "Land protected";
            if (land && !land.completed)
                chips.push({
                    text: `worth +${TILE[land.id].cp} once ${asks(TILE[land.id].goals)} live with you`,
                    tone: "note",
                });
            break;
        }
        case "adopt": {
            const got = pb.hand.find((x) => !pa.hand.some((y) => y.id === x.id));
            title = got ? `${cardName(got.id)} joins you` : "Adopted";
            break;
        }
        case "collect":
            title = "Food back from your Reserve";
            break;
        case "effect":
            title = !chips.length
                ? ""
                : sb.traps > sa.traps
                    ? "Trap disarmed!"
                    : "When Fed ability";
            break;
        case "claim":
            title = "Region Goal claimed!";
            break;
        case "trap":
            title = "A trap in your sanctuary";
            break;
    }
    if (!title || !chips.length)
        return null;
    return {
        title,
        chips: chips.slice(0, 5),
        points,
        mood: points >= 8
            ? "great"
            : points > 0
                ? "good"
                : points < 0
                    ? "bad"
                    : "plain",
    };
}
/** The same moves once their rule has been said. */
const BRIEF = {
    feed: "feed and claim a Region Goal",
};
const VERB = {
    adopt: "adopt animals",
    place: "place animals",
    feed: "feed, and when I feed I claim a Region Goal",
    protect: "protect land",
};
/**
 * Naledi explains her own move: which rule made her do it, what it gave her
 * and what that means for the race. Null when she did nothing worth telling.
 * `heard` remembers which of her rules she has explained: each is spelled out
 * once and only named after that, so her turns get shorter as the game goes on.
 */
export function tale(a, b, bi, me, heard) {
    /** The long form the first time a rule comes up, the short one after. */
    const once = (rule, long, short) => {
        if (heard?.has(rule))
            return short;
        heard?.add(rule);
        return long;
    };
    const pa = a.players[bi], pb = b.players[bi];
    if (!pa?.bot)
        return null;
    const sa = score(a, bi), sb = score(b, bi), gain = sb.total - sa.total, log = fresh(a, b).filter((x) => x.startsWith("Naledi ")), lines = [];
    // Reacting to the player's move, unless this step is part of her own turn.
    let passive = a.active !== bi;
    for (const line of log) {
        let m;
        if ((m = line.match(/uses die (\d): (.+)\.$/))) {
            passive = false;
            const action = Object.keys(ACTION_NAMES).find((k) => ACTION_NAMES[k] === m[2]);
            const did = (action && VERB[action]) ?? m[2].toLowerCase();
            lines.push(once("highest", `I always take the highest die. It was a ${m[1]}, so I ${did}.`, `The ${m[1]} was highest, so I ${action && heard?.has(action) ? (BRIEF[action] ?? did) : did}.`));
            if (action)
                heard?.add(action);
        }
        else if ((m = line.match(/takes die (\d) and rests/))) {
            passive = false;
            lines.push(m[1] === "1" || m[1] === "6"
                ? once("rest", `I always take the highest die. It was a ${m[1]}, and on a 1 or a 6 I rest. Nothing for me!`, `A ${m[1]}: I rest.`)
                : once("used", `The highest die was a ${m[1]}, but I already used that action this round. I rest.`, `The ${m[1]} again, and that action is used: I rest.`));
        }
    }
    const placed = pb.placed.filter((x) => !pa.placed.some((y) => y.id === x.id)), adopted = pb.hand.filter((x) => ![...pa.hand, ...pa.placed].some((y) => y.id === x.id)), land = pb.land.slice(pa.land.length), goals = pb.goals.slice(pa.goals.length), because = passive
        ? (verb) => `You ${verb}, so I may too. `
        : () => "";
    const pets = adopted.filter((x) => CARD[x.id]), traps = adopted.length - pets.length;
    if (pets.length)
        lines.push(`${because("adopted")}I adopted the ${list(pets.map((x) => cardName(x.id)))}${once("adopted", `: ${pets.length === 1 ? "1 point for now, and more once I place it" : "1 point each for now, and more once I place them"}`, "")}.`);
    if (traps)
        lines.push("Ouch, I picked up a trap: that costs me 4 points.");
    if (placed.length) {
        const worth = sb.animals + sb.companions - sa.animals - sa.companions;
        lines.push(`${because("placed animals")}I placed the ${list(placed.map((x) => cardName(x.id)))}: ${once("placed", `${placed.length === 1 ? "it now scores" : "they now score"} ${worth} for me. By the solo rules my animals need no food.`, `${pts(worth)}.`)}`);
    }
    else if (log.some((x) => /places \d+ animal/.test(x)) && !passive)
        lines.push("I had no adopted animal to place, so that brought me nothing.");
    if (land.length)
        lines.push(`${because("protected land")}I took ${land.length === 1 ? "a land tile" : land.length + " land tiles"}: ${pts(sb.land - sa.land)}.${once("land", " By the solo rules my land always counts as complete.", "")}`);
    for (const key of goals) {
        const g = goalDefinition(b, key), worth = g.tiers[b.claims[key].indexOf(bi)] ?? 0;
        lines.push(`${because("fed")}I claimed “${g.label}”: ${pts(worth)}. ` +
            (b.rain === bi && a.rain === null
                ? "That was my fourth Raindrop, so the Rain Dance begins: one last turn each!"
                : `That is ${pb.goals.length} of my 4 Raindrops; at 4 I call the Rain Dance.`));
    }
    if (!lines.length)
        return null;
    if (gain || !passive) {
        const lead = score(b, me).total - sb.total;
        lines.push(gain > 0
            ? lead > 0
                ? `You still lead by ${lead}.`
                : lead < 0
                    ? `That puts me ${-lead} ahead.`
                    : "We are level now."
            : lead > 0
                ? `You lead by ${lead}.`
                : lead < 0
                    ? `I am still ${-lead} ahead.`
                    : "We are level.");
    }
    return { lines, gain, passive };
}
/** Who is ahead, said the way a commentator would. */
export function standing(s, me) {
    const totals = s.players.map((_, i) => score(s, i).total), order = totals
        .map((_, i) => i)
        .sort((x, y) => totals[y] - totals[x] || x - y), rival = order.find((i) => i !== me) ?? me, lead = totals[me] - totals[rival], name = s.players[rival].name;
    return {
        order,
        totals,
        lead,
        line: s.phase === "over"
            ? lead > 0
                ? `You win by ${lead}`
                : lead < 0
                    ? `${name} wins by ${-lead}`
                    : "A tie with " + name
            : lead > 0
                ? `You lead by ${lead}`
                : lead < 0
                    ? `${name} leads by ${-lead}`
                    : s.players.length > 1
                        ? "Level with " + name
                        : "",
    };
}
