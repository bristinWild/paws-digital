/** Public feeding facts for any client. Rulebook pp. 16–17, 28–31:
 * food persists; feeding is optional; Naledi ignores feeding requirements.
 * This describes a snapshot, without changing rules or recommending urgency.
 */
import { CARD } from "./data.js";
export const foodUnit = {
    meat: "meat",
    leaves: "leaf",
    bones: "bone",
    bananas: "banana",
};
/** Only top animals in play have a feeding status; never hands, traps or tucks. */
export function feedingStatus(s, pi, id) {
    const p = s.players[pi], a = CARD[id];
    if (!p || !a)
        return null;
    if (p.bot) {
        if (!p.placed.some((c) => c.id === id))
            return null;
        return {
            food: a.food,
            missing: 0,
            cp: a.cp,
            hungry: false,
            canFeedNow: false,
            title: `${p.name} · no food needed`,
            timing: "Naledi ignores feeding requirements under the solo rules.",
            consequence: `This placed animal scores ${a.cp} animal CP and ${a.bonus} companion CP automatically.`,
        };
    }
    const si = p.slots.findIndex((x) => x?.card.id === id);
    if (si < 0)
        return null;
    const fed = p.slots[si].card.fed, missing = Math.max(0, a.need - fed), task = s.tasks[0], feeding = s.phase === "resolve" && task?.kind === "feed" && task.player === pi, used = feeding && task.used?.includes(si), rightRow = feeding && Math.floor(si / 5) === task.row, canFeedNow = !!(rightRow &&
        !used &&
        (task.remaining ?? 1) > 0 &&
        p.bank[a.food] > 0);
    const timing = s.phase === "over"
        ? "The game is over."
        : missing === 0
            ? canFeedNow
                ? "An optional extra meal is available now."
                : "No feeding needed for animal points."
            : used
                ? "Already ate in this Feed action; wait for another."
                : feeding && !rightRow
                    ? "Outside the chosen row; wait for another Feed action."
                    : p.bank[a.food] < 1
                        ? `No ${a.food} in ${p.name}’s Food Bank. Collect or earn some first.`
                        : canFeedNow
                            ? `Can eat 1 ${foodUnit[a.food]} now (optional).`
                            : `Feed is optional. Wait for ${p.name}’s next feeding choice.`;
    return {
        food: a.food,
        missing,
        cp: a.cp,
        hungry: missing > 0,
        canFeedNow,
        title: missing > 0
            ? `Needs ${missing} more ${a.food} · ${fed}/${a.need} fed`
            : `Fully fed · ${a.cp} animal CP`,
        timing: timing +
            (missing > 0 && s.rain !== null && s.phase !== "over"
                ? " Final turns: feed before scoring if an opportunity remains."
                : ""),
        consequence: missing > 0
            ? s.phase === "over"
                ? `Underfed: 0 of ${a.cp} animal CP earned. Companion bonuses still count.`
                : `${missing === 1 ? `One meal unlocks ${a.cp} animal CP.` : `${missing} more Feed actions unlock ${a.cp} animal CP.`} Still underfed at game end: 0 animal CP. Skipping loses no points now; companion bonuses still count.`
            : "No more food needed for animal points. An optional extra meal triggers When Fed abilities again, with no extra animal CP.",
    };
}
export function feedingForCard(s, id) {
    for (let pi = 0; pi < s.players.length; pi++) {
        const status = feedingStatus(s, pi, id);
        if (status)
            return status;
    }
    return null;
}
