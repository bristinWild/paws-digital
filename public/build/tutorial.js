/**
 * The deal of the guided game. It was picked from a scan of several hundred
 * deals as one that teaches well and treats a first-timer fairly: a Region
 * Goal falls in the first lesson, the feeding lesson scores at once, the
 * game runs about 23 turns. Temporary score deficits can occur during lessons.
 * Following Naledi's picks wins it clearly; the advisor tests keep that true.
 */
export const GUIDED_SEED = 20262163;
/** The short instruction shown for each moment. */
export const PROMPT = {
    action: "Choose your move",
    die: "Pay with a die",
    card: "Pick an animal",
    home: "Pick a glowing space",
    confirm: "Confirm",
    tuckCard: "Pick a card to release",
    tuckHome: "Pick an animal to tuck under",
    row: "Choose a row",
    feed: "Feed an animal",
    ability: "Use its ability",
    draft: "Pick a land tile",
    tile: "Fit the tile",
    offer: "Set your offers",
    adopt: "Adopt an animal",
    bonus: "Adopt one more",
    reserve: "Take one food back",
    trap: "Place the trap",
    end: "End your turn",
    claim: "Claim your goal",
    wait: "Watch the table",
    over: "Final score",
};
/**
 * The eight ways to score. Each lights up on the score sheet the first time it
 * pays, and Naledi says in one line how it works.
 */
export const WAYS = [
    {
        key: "animals",
        name: "Fed animals",
        how: "An animal scores its points once it is fully fed.",
    },
    {
        key: "companions",
        name: "Companions",
        how: "Two companions in one sanctuary score extra, fed or not.",
    },
    {
        key: "tucked",
        name: "Tucked cards",
        how: "Every card tucked under an animal scores 1 point.",
    },
    {
        key: "land",
        name: "Land",
        how: "A Land Tile scores once the animals it asks for live with you. Until then it costs 4 points.",
    },
    {
        key: "regions",
        name: "Region Goals",
        how: "Region Goals are the big prizes. Claim early: the first claim scores most.",
    },
    {
        key: "food",
        name: "Spare food",
        how: "Every 6 food left in your Food Bank score 3 points.",
    },
    {
        key: "traps",
        name: "Traps",
        how: "Disarming another sanctuary's trap scores 4. A trap of your own costs 4 points.",
    },
    {
        key: "rain",
        name: "Rain Dance",
        how: "Whoever calls the Rain Dance scores 2 points and ends the game.",
    },
];
/**
 * Stops on the ranger trail: one badge per lesson, plus the two big milestones.
 * Earning one opens a scene of its own: `praise` is what Naledi says there and
 * `learned` the rule the player has just used, in one line.
 */
export const BADGES = [
    {
        id: "home",
        name: "First Home",
        praise: "Welcome home! Housed animals are where your points come from.",
        learned: "Place (needs a 3) houses an animal in a habitat that suits it.",
    },
    {
        id: "feed",
        name: "First Meal",
        praise: "Look at that appetite! Only a fully fed animal scores.",
        learned: "Feed (needs a 4) works one row at a time: one matching food per animal.",
    },
    {
        id: "protect",
        name: "Land Protected",
        praise: "Wild land, safe for good. Now bring it the animals it asks for.",
        learned: "Protect Land (needs a 5) fits a tile on your Land Grid. It scores once its animals move in.",
    },
    {
        id: "adopt",
        name: "New Arrival",
        praise: "The family grows! New animals mean new points.",
        learned: "Adopt (needs a 2): everyone offers three animals, and the fee goes to the owner.",
    },
    {
        id: "tuck",
        name: "Back to the Wild",
        praise: "Free again! One point for you, and its ability stays behind.",
        learned: "Releasing tucks a card under an animal: 1 point, and its ability is shared.",
    },
    {
        id: "collect",
        name: "Reserve Keeper",
        praise: "Nothing wasted! Your Reserve is back in the Food Bank.",
        learned: "Collect (any die) brings your Reserve back into your Food Bank.",
    },
    {
        id: "goal",
        name: "Region Goal",
        praise: "A Region Goal! These are the biggest prizes on the table.",
        learned: "Claim a Region Goal the moment it is complete: the first claim scores most.",
    },
    {
        id: "rain",
        name: "Rainmaker",
        praise: "You called the rain! The whole reserve is dancing.",
        learned: "The Rain Dance scores 2 points and gives everyone one final turn.",
    },
];
/**
 * `lines` are spoken while the lesson's action is still to be shown; `done`
 * replaces them once the player has done it. `**word**` marks emphasis and
 * `{die}` the die Naledi would take.
 */
export const lessons = [
    {
        action: "place",
        title: "A home for your animals",
        badge: "home",
        lines: {
            action: "Every turn you make one move. Animals are your points, so start with **Place**.",
            die: "Every move is paid with a die. Place needs a 3. Take the **{die}**.",
            card: "Who moves in first? Pick an animal from your hand.",
            home: "See the glowing spaces? Those habitats suit it. Pick one.",
            confirm: "A good spot. Confirm it!",
        },
        done: {
            card: "Welcome home! You may place one more animal, or pass.",
            home: "Pick a glowing space for this one too.",
            end: "That is a whole turn. Pass me the token: it is my go.",
        },
    },
    {
        action: "feed",
        title: "Feeding time",
        badge: "feed",
        lines: {
            action: "Food badges show animals still short of meals. Feed them to unlock their printed points. Choose **Feed**.",
            die: "Feed needs a 4. Take the **{die}**.",
            row: "Feed works one row at a time. Choose the row where your animal lives.",
            feed: "Click a glowing animal. Its badge names the food it needs. Feeding is optional; food stays on the card.",
            ability: "A fed animal returns the favour: that is its **When Fed** ability. Use it, or skip.",
        },
        done: {
            feed: "Yum! Each meal counts the badge down. Fully fed animals score and lose the badge. Feed another, or finish.",
            ability: "Another When Fed ability. Use it, or skip.",
            end: "Full bellies, happy ranger. Pass the token.",
        },
    },
    {
        action: "protect",
        title: "Protect the land",
        badge: "protect",
        lines: {
            action: "Animals need wild land, and land scores too. Choose **Protect Land**.",
            die: "Protect Land needs a 5. Take the **{die}**.",
            draft: "Pick a tile. Its number is what it earns once its animals move in; until then it counts 4 points against you.",
            tile: "Fit it on your Land Grid. Rotate until you like it, then place it. Covered spaces pay out at once.",
        },
        done: {
            draft: "Protected! Land is an investment: 4 points down now, its full number once the animals arrive. Draft a second, or pass.",
            tile: "Fit this one too, then place it.",
            end: "House the animals a tile asks for and its points are yours. Pass the token.",
        },
    },
    {
        action: "adopt",
        title: "New arrivals",
        badge: "adopt",
        lines: {
            action: "Time to grow the family. Choose **Adopt**.",
            die: "Adopt needs a 2. Take the **{die}**.",
            offer: "First lay out three cards that I may adopt from you: one free, one for 1 food, one for 2. I sorted them. Confirm.",
            adopt: "Now adopt from my three. The free one lies face-down: a gamble, it could even be a trap.",
            bonus: "As the active player you adopt once more, from any offer, even your own.",
        },
        done: {
            adopt: "Now choose one of mine, or pass.",
            bonus: "A new arrival! Adopt one more from any offer, or pass.",
            end: "Your hand has grown. Pass the token.",
        },
    },
    {
        action: "place",
        title: "Back to the wild",
        badge: "tuck",
        tuck: true,
        lines: {
            action: "Sometimes the kindest thing is to set an animal free. Choose **Place** again.",
            die: "Take the **{die}**.",
            tuckCard: "This time we release one. Pick a card from your hand.",
            tuckHome: "Now tuck it under any animal in your sanctuary.",
            confirm: "Release it!",
        },
        done: {
            tuckCard: "Free again! It scores 1 point and lends its ability to the animal on top. Release one more, or pass.",
            tuckHome: "Choose the animal to tuck it under.",
            end: "Up to five animals can be tucked under each one. Pass the token.",
        },
    },
    {
        action: "collect",
        title: "The Reserve",
        badge: "collect",
        lines: {
            action: "Food you paid for small dice is not gone. It waits in your Reserve. Choose **Collect**.",
            die: "Collect works with any die. Take the **{die}**: the rest comes back as food.",
        },
        done: {
            end: "Back in your Food Bank! Spare food scores too: 3 points per 6. That was the last lesson!",
        },
    },
];
/** The steps of a lesson in the order Naledi teaches them: the moments of its script. */
export const lessonSteps = (lesson) => lessons[lesson] ? Object.keys(lessons[lesson].lines) : [];
/**
 * How far along a lesson the player is: `step` steps done out of `of`. The
 * lesson's move itself is the last step, so a lesson whose move is made is
 * complete. `reached` is the furthest step seen this turn: a step outside the
 * script (a food choice, taking a move back) never walks the marker backwards.
 */
export function lessonProgress(lesson, moment, done, reached = 0) {
    const steps = lessonSteps(lesson), of = steps.length;
    if (!of)
        return { step: 0, of: 0 };
    if (done)
        return { step: of, of };
    return { step: Math.max(reached, steps.indexOf(moment), 0), of };
}
/** The welcome and Region Goals, six short beats before the first lesson. */
export const intros = [
    {
        say: "Hello! I am Naledi, head ranger of this reserve. So you are our new conservationist. Welcome!",
        button: "Hello, Naledi!",
        focus: "table",
    },
    {
        say: "This mat is your sanctuary. And look: four animals are already hoping you will take them in.",
        button: "Let me see them",
        focus: "hand",
    },
    {
        say: "This is a **Region Goal**, a shared challenge. **{goal}** pays **{cp} CP** to the next player to claim it.",
        button: "Why claim early?",
        focus: "region",
    },
    {
        say: "These circles are the claim order: **{tiers}**. We each claim a goal once, so the early bird scores most.",
        button: "How do I claim?",
        focus: "region",
    },
    {
        say: "Meet its condition, then **Claim**: it costs no die and no move. Your tracker here: **{progress}/{target}**.",
        button: "Let’s build!",
        focus: "region",
    },
    {
        say: "A turn is simple: choose one move, pay with one die. I will show you every way to score.",
        button: "I am ready!",
        focus: "dice",
    },
];
/** What Naledi says outside a lesson script. */
export const naledi = {
    /** Your own turn once the lessons are behind you. */
    free: {
        action: "Your move. What will it be?",
        die: "Now pay for it with a die.",
        card: "Pick an animal from your hand.",
        home: "Choose one of the glowing spaces.",
        confirm: "Happy with that? Confirm it.",
        tuckCard: "Pick a card to release.",
        tuckHome: "Choose the animal to tuck it under.",
        row: "Which row shall we feed?",
        feed: "Click a glowing animal to feed it.",
        ability: "A When Fed ability is ready. Use it, or skip.",
        draft: "Pick a tile from the Land Board.",
        tile: "Fit the tile on your Land Grid, then place it.",
        offer: "Arrange your three offers, then confirm.",
        adopt: "Choose an animal to adopt, or pass.",
        bonus: "One more adoption, from any offer.",
        reserve: "Take one food back from your Reserve.",
        trap: "Oh no, a trap was hiding in that card! Set it on an empty space. An animal with a disarm ability can clear it later.",
        end: "All done? Pass the token.",
        claim: "A Region Goal is ready. Claim it before you pass!",
        wait: "My turn. Watch the table!",
        over: "What a sanctuary. Let us count the Conservation Points.",
    },
    /** Naledi chose the action; the player may join in. */
    passive: {
        offer: "I chose Adopt, so we both lay out three animals. Arrange yours and confirm.",
        adopt: "You may adopt one of mine too.",
        card: "I am placing animals, so you may place one too.",
        tuckCard: "I am placing animals, so you may release one too.",
        row: "I am feeding. Choose a row to join in.",
        feed: "I am feeding. You may feed one animal too.",
        draft: "I am protecting land. You may take a tile too.",
        reserve: "I collected my Reserve. Take one food back from yours.",
    },
    /** Added to a passive invitation for an action not yet taught. */
    later: "Or pass for now. We will practise this together soon.",
    prepAction: "Before the lesson we need a detour. Choose **{action}**.",
    prepDie: "Take the **{die}** for it.",
    retry: "No rush. We will try that again next turn. Pass the token.",
    prepEnd: "That will do nicely. Pass the token; the lesson is next.",
    change: "Your die was bigger than the action needs, so you get the difference in food. Take any you like.",
    pay: "Your die was smaller than the action needs. Pay the difference; it waits in your Reserve.",
    fee: "The adoption fee goes to the animal's owner.",
    gift: "This food is yours to choose.",
    goal: "Look at that! You completed a **Region Goal**. Claim it now: it is free, and early claims score more.",
    goalDone: "Claimed! First to {goals} Region Goals may call the Rain Dance and end the game.",
    rainAction: "You have your Region Goals and the clouds are ready. Call the **Rain Dance**!",
    /** The last goal was claimed after this turn's move: the dance has to wait a turn. */
    rainSoon: "That is all {goals} Region Goals! **End your turn**: on your next one the Rain Dance is yours to call.",
    rainDie: "Pay for it with the **{die}**.",
    rainDone: "Here comes the rain! Everyone gets one last turn.",
    graduate: "You know every move now, ranger. From here it is a race: complete {goals} Region Goals, then call the Rain Dance. I will keep telling you my pick.",
    /** Introduces her recommendation among several options. */
    pick: "My pick",
    /** Opens her advice right after her own turn. */
    reply: "Your answer",
    offerSet: "I sorted your offers. Confirm, or swap two.",
    tileSet: "I turned it to the best spot. Place it, or turn it.",
    win: "You win! The reserve is in the best of hands. I am proud of you.",
    lose: "I win this time, but what a sanctuary you built. Rematch?",
    tie: "A tie! We make a fine team.",
};
import { CARD, SLOT_HABITATS } from "./data.js";
import { landPlacements, goalProgress, claimable, legalActions, total, } from "./engine.js";
/** The guide observes accepted commands. Passing a lesson never counts as learning it. */
export function demonstrated(lesson, c) {
    const l = lessons[lesson];
    if (!l)
        return false;
    if (l.tuck)
        return c.type === "place" && c.tuck;
    switch (l.action) {
        case "place":
            return c.type === "place" && !c.tuck;
        case "feed":
            return c.type === "feed";
        case "protect":
            return c.type === "tile";
        case "adopt":
            return c.type === "adopt";
        case "collect":
            return c.type === "act" && c.action === "collect";
        default:
            return false;
    }
}
export function lessonAction(s, pi, lesson) {
    const l = lessons[lesson], p = s.players[pi];
    if (!l)
        return;
    let action = l.action;
    if (action === "place" && !p.hand.length)
        action = "adopt";
    if (action === "feed") {
        const animals = p.slots.filter((x) => x && CARD[x.card.id]);
        if (!animals.length)
            action = p.hand.length ? "place" : "adopt";
        else if (!animals.some((x) => x && p.bank[CARD[x.card.id].food] > 0))
            action = "collect";
    }
    const legal = legalActions(s, pi);
    if (legal.some((x) => x.action === action))
        return action;
    return legal.some((x) => x.action === "collect") ? "collect" : undefined;
}
export function hasLessonChoice(s, pi, lesson) {
    const t = s.tasks[0], p = s.players[pi], l = lessons[lesson];
    if (!t || !l || t.player !== pi || s.active !== pi)
        return false;
    if (t.kind === "place" && l.action === "place")
        return p.hand.some((c) => CARD[c.id] &&
            p.slots.some((x, i) => l.tuck
                ? x && CARD[x.card.id] && x.tucked.length < 5
                : !x && CARD[c.id].habitats.includes(SLOT_HABITATS[i])));
    if (t.kind === "feed" && l.action === "feed")
        return p.slots.some((x, i) => x &&
            CARD[x.card.id] &&
            Math.floor(i / 5) === t.row &&
            !t.used?.includes(i) &&
            p.bank[CARD[x.card.id].food] > 0);
    if (t.kind === "draft" && l.action === "protect")
        return s.stacks.some((stack) => stack.length && landPlacements(p, stack.at(-1)).length);
    if (t.kind === "adopt" && l.action === "adopt")
        return s.offers.some((o) => (t.bonus || o.player !== pi) &&
            o.cards.some((c, i) => c && i <= total(p.bank)));
    return false;
}
/** One concrete, live goal to teach or check; never suggests an already claimed goal. */
export function goalFocus(s, pi) {
    const p = s.players[pi];
    return (s.regions
        .flatMap((r) => r.goals.map((g, j) => {
        const key = `${r.id}:${j}`, progress = Math.min(g.target, goalProgress(p, g)), potential = Math.max(progress, ...p.hand.flatMap((c) => p.slots.flatMap((slot, i) => !slot && CARD[c.id]?.habitats.includes(SLOT_HABITATS[i])
            ? [
                goalProgress({
                    ...p,
                    slots: p.slots.map((x, k) => k === i ? { card: c, tucked: [] } : x),
                }, g),
            ]
            : [])));
        return {
            key,
            region: r.id,
            label: g.label,
            progress,
            potential,
            target: g.target,
            cp: g.tiers[s.claims[key].length] ?? 0,
            tiers: Array.from({ length: s.players.length }, (_, i) => g.tiers[i] ?? 0),
            ready: claimable(s, pi, key),
            claimed: p.goals.includes(key),
        };
    }))
        .filter((g) => !g.claimed)
        .sort((a, b) => Number(b.ready) - Number(a.ready) ||
        Number(b.potential >= b.target) - Number(a.potential >= a.target) ||
        b.progress / b.target - a.progress / a.target ||
        b.potential / b.target - a.potential / a.target ||
        b.cp - a.cp)[0] ?? null);
}
