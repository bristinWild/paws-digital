/** Print component IDs are permanent. Numbers refer to the supplied WebP filenames. */
export const FOODS = ["meat", "leaves", "bones", "bananas"];
export const HABITATS = [
    "woodland",
    "desert",
    "waterhole",
    "grassland",
    "shrubland",
];
export const HABITAT_NAMES = {
    woodland: "Open Woodland",
    desert: "Semi-Desert",
    waterhole: "Waterhole",
    grassland: "Grassland",
    shrubland: "Shrubland",
};
export const SLOT_HABITATS = [
    "woodland",
    "woodland",
    "desert",
    "desert",
    "waterhole",
    "grassland",
    "grassland",
    "grassland",
    "shrubland",
    "shrubland",
];
export const ANIMALS = [];
function group(start, name, diet, habitats, companion, bonus, ability, values) {
    values.forEach(([need, cp, age, amount, override], i) => ANIMALS.push({
        id: start + i,
        name,
        diet,
        habitats,
        companion,
        bonus,
        ability: override === 1
            ? "swap"
            : override === 2
                ? "discardLand"
                : override === 3
                    ? "disarmOwn"
                    : ability,
        amount: amount ?? 1,
        need,
        cp,
        age: ["baby", "juvenile", "adult"][age],
        food: {
            carnivore: "meat",
            herbivore: "leaves",
            scavenger: "bones",
            frugivore: "bananas",
        }[diet],
        endangered: start >= 92,
    }));
}
const common = [
    [1, 2, 0, 1],
    [1, 2, 0, 1],
    [1, 2, 0, 1],
    [1, 3, 1, 2],
    [2, 4, 2, 2],
];
const leaf = [
    [1, 2, 0, 1],
    [1, 2, 0, 1],
    [1, 2, 0, 1],
    [2, 3, 1, 2],
    [3, 4, 2, 2],
];
group(1, "Aardwolf", "scavenger", ["shrubland", "desert"], "Honey Badger", 1, "discardLand", common);
group(6, "African Savanna Hare", "herbivore", ["shrubland", "grassland"], "Caracal", 1, "food", leaf);
group(11, "Black-footed Cat", "carnivore", ["desert", "woodland"], "Long-eared Hedgehog", 1, "food", common);
group(16, "Caracal", "carnivore", ["shrubland", "desert"], "African Savanna Hare", 1, "discardLand", common);
group(21, "Chacma Baboon", "frugivore", [...HABITATS], "Vervet Monkey", 2, "disarmOther", common.map((v, i) => (i >= 3 ? [...v.slice(0, 4), 3] : v)));
group(26, "Common Warthog", "herbivore", ["waterhole", "grassland"], "Meerkat", 2, "food", leaf);
group(31, "Common Wildebeest", "herbivore", ["grassland", "waterhole"], "Plains Zebra", 3, "draw", leaf.map((v, i) => [...v.slice(0, 3), i === 4 ? 2 : 1]));
group(36, "Honey Badger", "scavenger", ["woodland", "grassland"], "Leopard", 3, "disarmOwn", common);
group(41, "Leopard", "carnivore", ["woodland", "shrubland"], "Reticulated Giraffe", 4, "draw", [
    [1, 3, 0, 1],
    [1, 4, 1, 1],
    [2, 5, 2, 2],
]);
group(44, "Lion", "carnivore", ["grassland", "woodland"], "Common Wildebeest", 4, "disarmOwn", [
    [1, 3, 0, 1],
    [1, 4, 1, 1],
    [2, 5, 2, 1],
]);
group(47, "Long-eared Hedgehog", "herbivore", ["shrubland", "woodland"], "Aardwolf", 1, "swap", leaf);
group(52, "Meerkat", "scavenger", ["desert", "grassland"], "Common Warthog", 2, "disarmOther", common);
group(57, "Pale Fox", "carnivore", ["desert", "shrubland"], "Striped Hyena", 1, "food", common);
group(62, "Patas Monkey", "frugivore", [...HABITATS], "Common Warthog", 2, "draw", common.map((v, i) => (i >= 3 ? [...v.slice(0, 4), 1] : v)));
group(67, "Plains Zebra", "herbivore", ["grassland", "waterhole"], "African Wild Donkey", 4, "swap", [
    [1, 2, 0, 1],
    [1, 2, 0, 1],
    [2, 4, 1, 1],
    [3, 5, 2, 1],
]);
group(71, "Reticulated Giraffe", "herbivore", ["grassland", "woodland"], "African Savanna Elephant", 4, "draw", [
    [1, 3, 0, 1],
    [2, 4, 0, 1],
    [3, 5, 2, 2],
]);
group(74, "Spotted Hyena", "scavenger", ["grassland", "waterhole"], "Common Wildebeest", 2, "draw", common.map((v, i) => [...v.slice(0, 3), i === 4 ? 2 : 1]));
group(79, "Striped Hyena", "scavenger", ["desert", "shrubland"], "Pale Fox", 2, "swap", [
    [1, 2, 0, 1],
    [1, 2, 0, 1],
    [1, 4, 1, 1],
    [2, 5, 2, 1],
]);
group(83, "Thomson’s Gazelle", "herbivore", ["grassland", "shrubland"], "Plains Zebra", 2, "food", [
    [1, 2, 0, 1],
    [1, 2, 0, 1],
    [2, 4, 1, 2],
    [3, 5, 2, 2],
]);
group(87, "Vervet Monkey", "frugivore", [...HABITATS], "Chacma Baboon", 2, "draw", common.map((v, i) => (i >= 3 ? [...v.slice(0, 4), 2] : v)));
group(92, "African Wild Dog", "carnivore", ["grassland", "shrubland"], "Spotted Hyena", 4, "disarmOwn", [
    [1, 5, 0, 1],
    [3, 6, 2, 1],
]);
group(94, "African Wild Donkey", "herbivore", ["desert", "shrubland"], "Plains Zebra", 4, "disarmOther", [
    [1, 3, 0, 1],
    [3, 5, 2, 1],
]);
group(96, "African Savanna Elephant", "herbivore", ["waterhole", "woodland"], "Plains Zebra", 4, "disarmOwn", [
    [1, 5, 0, 1],
    [3, 6, 2, 1],
]);
group(98, "Cheetah", "carnivore", ["grassland", "desert"], "Thomson’s Gazelle", 4, "disarmOther", [
    [1, 5, 0, 1],
    [3, 6, 2, 1],
]);
group(100, "Riverine Rabbit", "herbivore", ["waterhole", "shrubland"], "Endangered Animal", 4, "discardLand", [
    [1, 5, 0, 1],
    [3, 6, 2, 1],
]);
export const CARD = Object.fromEntries(ANIMALS.map((a) => [a.id, a]));
export const cardName = (id) => CARD[id]?.name ?? (id % 2 ? "Steel Jaw Trap" : "Snare Trap");
export const cardArt = (id) => id <= 101
    ? `Poker Cards/Animal Cards/Animal Card ${id}_Front.webp`
    : `Poker Cards/Trap Cards/Trap Card ${id % 2 ? 1 : 2}_Front.webp`;
export const TILES = [];
function tiles(kind, size, goals, points) {
    goals.forEach((g, i) => TILES.push({
        id: `${kind.toLowerCase()}-${i + 1}`,
        size,
        cp: points[i],
        goals: g,
        art: `Land Tiles/${kind}/${kind} ${i + 1}_Front.webp`,
    }));
}
tiles("Monohex", 1, [
    [["scavenger", 3]],
    [["frugivore", 2]],
    [["frugivore", 1]],
    [["endangered", 1]],
    [["carnivore", 2]],
    [["adult", 2]],
    [["herbivore", 4]],
    [["carnivore", 3]],
    [["herbivore", 3]],
    [
        ["carnivore", 1],
        ["herbivore", 1],
    ],
    [["baby", 2]],
    [["juvenile", 2]],
    [["endangered", 2]],
    [["scavenger", 2]],
], [6, 6, 3, 3, 3, 3, 6, 6, 3, 3, 3, 3, 6, 3]);
tiles("Bihex", 2, [
    [["baby", 5]],
    [
        ["carnivore", 1],
        ["scavenger", 1],
        ["frugivore", 1],
    ],
    [["frugivore", 3]],
    [["adult", 3]],
    [["herbivore", 5]],
    [["juvenile", 3]],
    [["scavenger", 4]],
    [["carnivore", 4]],
    [
        ["carnivore", 1],
        ["scavenger", 1],
        ["herbivore", 1],
    ],
    [
        ["baby", 2],
        ["juvenile", 2],
        ["adult", 2],
    ],
    [
        ["frugivore", 1],
        ["scavenger", 1],
        ["herbivore", 1],
    ],
    [["endangered", 3]],
], [6, 8, 8, 6, 8, 6, 8, 8, 6, 6, 6, 8]);
tiles("Trihex", 3, [
    [
        ["baby", 3],
        ["juvenile", 3],
        ["adult", 3],
    ],
    [["carnivore", 6]],
    [["frugivore", 5]],
    [["endangered", 4]],
    [["herbivore", 7]],
    [["scavenger", 6]],
    [
        ["carnivore", 2],
        ["herbivore", 2],
        ["frugivore", 2],
        ["scavenger", 2],
    ],
], Array(7).fill(10));
export const TILE = Object.fromEntries(TILES.map((t) => [t.id, t]));
export const GRID = [
    [0, 0],
    [0, -1],
    [1, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
];
export const GRID_BONUS = [
    "draw",
    "bananas",
    "leaves",
    "draw",
    "meat",
    "bones",
    "draw",
];
const goal = (label, kind, target, tiers = [12, 8, 6, 4]) => ({ label, kind, target, tiers });
export const REGIONS = [
    {
        id: 1,
        name: "Etosha",
        country: "Namibia",
        goals: [
            goal("Tuck 5 animals", "tucked", 5),
            goal("10 food in your Food Bank", "food", 10, [10, 6, 4, 2]),
        ],
    },
    {
        id: 2,
        name: "Maasai Mara",
        country: "Kenya",
        goals: [
            goal("Complete Shrubland", "shrubland", 2),
            goal("Fill your Land Grid", "land", 7, [14, 10, 8, 6]),
        ],
    },
    {
        id: 3,
        name: "Kalahari",
        country: "Botswana · Namibia · South Africa",
        goals: [
            goal("Complete Semi-Desert", "desert", 2),
            goal("Complete 1 row of animals", "row", 5, [14, 10, 8, 6]),
        ],
    },
    {
        id: 4,
        name: "Kruger",
        country: "South Africa",
        goals: [
            goal("Complete Open Woodland", "woodland", 2),
            goal("Disarm 1 trap", "disarmed", 1, [10, 6, 4, 2]),
        ],
    },
    {
        id: 5,
        name: "Okavango Delta",
        country: "Botswana",
        goals: [
            goal("Complete Waterhole", "waterhole", 1, [6, 4, 3, 2]),
            goal("1 animal in each habitat", "each", 5, [14, 10, 8, 6]),
        ],
    },
    {
        id: 6,
        name: "Serengeti",
        country: "Tanzania",
        goals: [
            goal("Complete Grassland", "grassland", 3),
            goal("Feed 5 different animals", "fed", 5, [14, 10, 8, 6]),
        ],
    },
];
export const ACTIONS = [
    "collect",
    "adopt",
    "place",
    "feed",
    "protect",
    "rain",
];
export const ACTION_MIN = {
    collect: 1,
    adopt: 2,
    place: 3,
    feed: 4,
    protect: 5,
    rain: 6,
};
export const ACTION_NAMES = {
    collect: "Collect Reserve",
    adopt: "Adopt Animals",
    place: "Place Animals",
    feed: "Feed Animals",
    protect: "Protect Land",
    rain: "Rain Dance",
};
export const ABILITY_NAMES = {
    draw: "Draw cards",
    food: "Gain any food",
    discardLand: "Discard 1 Land Tile",
    disarmOwn: "Disarm 1 trap in your sanctuary",
    disarmOther: "Disarm 1 trap in another sanctuary",
    swap: "Swap a sanctuary animal with your hand",
};
export const SOLO_DECKS = {
    activeAdopt: [1, 2, 3],
    activePlace: [4, 5],
    activeFeed: [6, 7, 8, 11, 12],
    activeProtect: [9, 10],
    passiveAdopt: [13, 14, 15],
    passivePlace: [16, 17],
    passiveFeed: [18, 19],
    passiveProtect: [20, 21],
};
