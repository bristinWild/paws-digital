/**
 * Table geometry shared by every presentation layer (browser now, Godot/Blender later).
 * One unit is one source pixel × 0.02, so a 745 × 1040 px animal card is 14.9 × 20.8 units.
 * +x is the viewer's right, +z points at the viewer, y is height above the tabletop.
 * Coordinates were measured on the supplied print art; see MIGRATION.md.
 */
import { GRID } from "./data.js";
export const PX = 0.02;
export const CARD = { w: 14.9, h: 20.8, thick: 0.14 };
export const SOLO = { w: 12.06, h: 12.06, thick: 0.14 };
export const MAT = { w: 81.76, h: 34.5, thick: 0.45 };
export const BOARD = { w: 41.7, h: 34.02, thick: 1.4, x: 0, z: -26 };
export const REGION = { w: 28.36, h: 16.54, thick: 0.15 };
export const RAIN = { w: 16.54, h: 28.36, thick: 0.25, x: 44, z: -13 };
export const TILE = { r: 4.08, thick: 0.65 };
export const DIE = 4.1;
export const DECK = { x: 43, z: -42 };
export const DISCARD = { x: 62, z: -42 };
/** Local mat point → world, for a seat rotated about the vertical axis. */
export function world(seat, lx, lz) {
    const c = Math.cos(seat.rot), s = Math.sin(seat.rot);
    return [seat.x + lx * c + lz * s, seat.z - lx * s + lz * c];
}
const BOTTOM = { x: 0, z: 40, rot: 0 }, TOP = { x: 0, z: -112, rot: Math.PI }, TOP_L = { x: -52, z: -112, rot: Math.PI }, TOP_R = { x: 52, z: -112, rot: Math.PI }, LEFT = { x: -110, z: -20, rot: -Math.PI / 2 }, RIGHT = { x: 110, z: -20, rot: Math.PI / 2 };
/** Seats run clockwise from the viewer, matching "play passes to the left". */
export function seats(players) {
    switch (players) {
        case 2:
            return [BOTTOM, TOP];
        case 3:
            return [BOTTOM, LEFT, RIGHT];
        case 4:
            return [BOTTOM, LEFT, TOP, RIGHT];
        default:
            return [BOTTOM, LEFT, TOP_L, TOP_R, RIGHT];
    }
}
/** Tabletop bounds for a player count: x half-width, far and near z edges. */
export function tableBounds(players) {
    return { halfW: players > 2 ? 152 : 123, far: -158, near: 90 };
}
/** Habitat columns on a player mat (local x of slot centres). */
const SLOT_X = [390, 1170, 1950, 2730, 3510].map((px) => px * PX - MAT.w / 2);
/** Row offset of a habitat card from the mat centre: the upper row lies beyond the mat. */
const ROW_Z = [-24, 24];
export function slotLocal(slot) {
    return [SLOT_X[slot % 5], ROW_Z[Math.floor(slot / 5)]];
}
/** Printed seven-hex Land Grid: centre, then engine GRID order (flat-top hexes). */
const GRID_C = { x: 1767 * PX - MAT.w / 2, z: 855 * PX - MAT.h / 2 }, GRID_DX = 314 * PX, GRID_DZ = 356 * PX;
export function cellLocal(cell) {
    const [q, r] = GRID[cell];
    return [GRID_C.x + GRID_DX * q, GRID_C.z + GRID_DZ * (r + q / 2)];
}
/** Centre and heading of a tile covering the given cells in a straight line. */
export function tileLocal(cells) {
    const pts = cells.map(cellLocal), x = pts.reduce((n, p) => n + p[0], 0) / pts.length, z = pts.reduce((n, p) => n + p[1], 0) / pts.length;
    if (pts.length < 2)
        return { x, z, rot: 0 };
    const a = pts[0], b = pts[pts.length - 1];
    // Tile art runs along local z; rotate it onto the line through its cells.
    return { x, z, rot: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}
/** Printed dice spaces. Feed has one space beside each row. */
export const ACTION_SPOT = {
    feed: [
        [332 * PX - MAT.w / 2, 503 * PX - MAT.h / 2],
        [321 * PX - MAT.w / 2, 1217 * PX - MAT.h / 2],
    ],
    protect: [[745 * PX - MAT.w / 2, 498 * PX - MAT.h / 2]],
    place: [[183 * PX - MAT.w / 2, 847 * PX - MAT.h / 2]],
    collect: [[2578 * PX - MAT.w / 2, 415 * PX - MAT.h / 2]],
    adopt: [[3424 * PX - MAT.w / 2, 1231 * PX - MAT.h / 2]],
};
/** Naledi's ranger station (Player Mat 1 back): printed dice across the top. */
export const BOT_SPOT = {
    protect: [-12.6, -13.65],
    feed: [0.74, -13.65],
    place: [13.92, -13.65],
    adopt: [26.98, -13.65],
};
export const BOT_REST = [-33.1, 6.7];
/** Solo deck squares: column per action, Active row above Passive row. */
export const BOT_DECK_X = {
    protect: -9.14,
    feed: 3.92,
    place: 17.06,
    adopt: 30.12,
};
export const BOT_DECK_Z = { active: -4.11, passive: 9.67 };
/**
 * Naledi keeps two piles (rulebook p. 28): adopted animals beyond the ADOPTED
 * tab, placed animals in front of the PLACED tab. Here each pile is a row
 * that starts at its tab and stays clear of the board, so every card and its
 * points can be read; long rows close up instead of running off the board.
 */
export const BOT_ROW = {
    x: -29.66,
    adopted: -28.85,
    placed: 28.85,
    span: 62.6,
};
export function botRowX(k, n) {
    return (BOT_ROW.x + k * Math.min(CARD.w + 0.8, BOT_ROW.span / Math.max(1, n - 1)));
}
/** Her four Raindrops wait on the table left of the board, as in the setup picture. */
export const BOT_DROPS = [
    [-47.6, 2.4],
    [-44.1, 4.6],
    [-47.4, 7.2],
    [-44.3, 9.6],
];
export const BOT_TOKEN = [-47.2, -10.4];
export const BOT_NAME = [-46, 14.6];
/** Her drafted Land Tiles lie in a row right of the board. */
export const BOT_LAND = { x: 46.5, z: 1.5, step: 8.7, perRow: 8 };
export const FOOD_BANK = { x: 14.28, z: 7.11, step: 3.7 };
export const RESERVE = { x: 14.16, z: -1.71, step: 2.7 };
/** Five printed Raindrop spaces on the mat's pond. */
export const DROP_SPOTS = [
    [23.3, -6.51],
    [27.34, -9.09],
    [34.88, -9.09],
    [31.82, -5.63],
    [34.8, -1.83],
];
/** Active Player token rests beside the upper habitat row. */
export const ACTIVE_TOKEN = [45, -22];
/** Public hands lie face-up to the left of their mat (rulebook setup). */
export const OPP_HAND = [-51, 0];
/** Offset between a card and each card tucked beneath it: the When Fed strip stays readable. */
export const TUCK_STEP = 2.5;
/**
 * Land Board lanes and hex rows in board-local units. The board art is stored
 * portrait; in play it is turned a quarter clockwise, which puts the printed
 * player-count hexes along the far edge and the lanes "1–2, 3, 4, 5" left to right
 * after two unlabelled lanes. A game uses the first players + 1 lanes.
 */
const LANE_X = [281, 587, 892, 1198, 1502, 1809].map((px) => px * PX - BOARD.w / 2), LANE_Z = [
    [588, 943, 1298].map((px) => px * PX - BOARD.h / 2),
    [767, 1122, 1477].map((px) => px * PX - BOARD.h / 2),
];
/**
 * World pose of a tile in a board stack, as set up in the rulebook: the trihex
 * is the base, the bihex covers its centre and lower hexes, the monohex covers
 * the bihex's lower hex. Every layer keeps one hex in view.
 */
export function stackPose(stack, size) {
    const rows = LANE_Z[stack % 2], z = size === 3 ? rows[1] : size === 2 ? (rows[1] + rows[2]) / 2 : rows[2];
    return {
        x: BOARD.x + LANE_X[stack],
        z: BOARD.z + z,
        y: BOARD.thick + (3 - size) * TILE.thick,
    };
}
/** Region cards in play sit in a row beyond the Land Board. */
export function regionPose(index, count) {
    return { x: (index - (count - 1) / 2) * 30.8, z: -60 };
}
/** A whole Region card on the table. */
export function regionRect(index, count) {
    const p = regionPose(index, count);
    return { x: p.x, z: p.z, w: REGION.w, h: REGION.h };
}
/** One goal of a Region card: its printed name and the row of claim circles. */
export function goalRect(index, count, goal) {
    const p = regionPose(index, count), band = goalBand(goal);
    return { x: p.x + band.x, z: p.z + band.z, w: band.w, h: band.h };
}
/**
 * The claim circles a table of this size can use on one goal, with the
 * points printed under them: the claim order, first claim on the left.
 */
export function tiersRect(index, count, goal, players) {
    const p = regionPose(index, count), n = Math.max(1, Math.min(4, players)), first = claimLocal(goal, 0), last = claimLocal(goal, n - 1), band = goalBand(goal);
    return {
        x: p.x + (first[0] + last[0]) / 2 + 0.3,
        z: p.z + band.z,
        w: last[0] - first[0] + 4.6,
        h: band.h,
    };
}
/** Raindrop circle for a claim: goal row (0 or 1) and claim order (tier). */
export function claimLocal(goal, tier) {
    const x = [585, 803, 1020, 1235][Math.min(tier, 3)] * PX - REGION.w / 2, z = (goal ? 595 : 320) * PX - REGION.h / 2;
    return [x + (tier > 3 ? 3.2 : 0), z];
}
/** Clickable band of one goal on a region card. */
export function goalBand(goal) {
    return {
        x: 0.3,
        z: (goal ? 624 : 350) * PX - REGION.h / 2,
        w: 26.6,
        h: 5.2,
    };
}
/**
 * Adoption offers are laid out in the open space left of the Land Board: one
 * row per sanctuary, columns free · 1 food · 2 food. Rows shrink to fit.
 */
export function market(rows, players) {
    const x = players > 2 ? -49 : -57, width = players > 2 ? 46 : 60, depth = 52, zc = -24, scale = Math.min(1, (depth / rows - (rows > 2 ? 1.6 : 4.4)) / CARD.h, (width / 3 - 0.9) / CARD.w), stepX = Math.min(width / 3, CARD.w * scale + 2.4), stepZ = depth / Math.max(rows, 2), dist = 98 + (rows - 1) * 24;
    return {
        scale,
        w: CARD.w * scale,
        h: CARD.h * scale,
        slot: (row, col) => [
            x + (col - 1) * stepX,
            zc + (row - (rows - 1) / 2) * stepZ,
        ],
        // Aim left of the cards: the phase card covers that side of the screen.
        shot: {
            cam: [x - 6 - 0.13 * dist, 0.76 * dist, zc + 3 + 0.64 * dist],
            look: [x - 6, 0, zc + 3],
            fov: 40,
        },
    };
}
/** Every card of a market with this many rows, as it lies on the table. */
export function marketRect(rows, players) {
    const m = market(rows, players), cards = [];
    for (let row = 0; row < rows; row++)
        for (let col = 0; col < 3; col++) {
            const [x, z] = m.slot(row, col);
            cards.push({ x, z, w: m.w, h: m.h });
        }
    return bounds(cards);
}
/** Shared dice pool: two short columns between the Land Board and the Rain Dance tile. */
export function poolPose(index) {
    return [25.4 + (index % 2) * 5.8, -21 + Math.floor(index / 2) * 6.4];
}
/** A seat's player mat. */
export function matRect(seat) {
    return { x: seat.x, z: seat.z, w: MAT.w, h: MAT.h, ry: seat.rot };
}
/** A habitat space of a seat, the size of the card that lives there. */
export function slotRect(seat, slot) {
    const [lx, lz] = slotLocal(slot), [x, z] = world(seat, lx, lz);
    return { x, z, w: CARD.w + 1, h: CARD.h + 1, ry: seat.rot };
}
/** A printed dice space of a seat's mat. */
export function spotRect(seat, local) {
    const [x, z] = world(seat, local[0], local[1]);
    return { x, z, w: 7.5, h: 7.5, ry: seat.rot };
}
/** The seven-hex Land Grid printed on a seat's mat. */
export function gridRect(seat) {
    const [x, z] = world(seat, GRID_C.x, GRID_C.z);
    return {
        x,
        z,
        w: GRID_DX * 2 + TILE.r * 2.3,
        h: GRID_DZ * 2 + TILE.r * 2,
        ry: seat.rot,
    };
}
/** The smallest table rectangle holding all of these (their headings ignored). */
export function bounds(rects, min = {}) {
    if (!rects.length)
        return null;
    const half = (r) => {
        const c = Math.abs(Math.cos(r.ry ?? 0)), s = Math.abs(Math.sin(r.ry ?? 0));
        return [(r.w * c + r.h * s) / 2, (r.w * s + r.h * c) / 2];
    };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const r of rects) {
        const [hw, hh] = half(r);
        x0 = Math.min(x0, r.x - hw);
        x1 = Math.max(x1, r.x + hw);
        z0 = Math.min(z0, r.z - hh);
        z1 = Math.max(z1, r.z + hh);
    }
    return {
        x: (x0 + x1) / 2,
        z: (z0 + z1) / 2,
        w: Math.max(x1 - x0, min.w ?? 0),
        h: Math.max(z1 - z0, min.h ?? 0),
    };
}
export function orbitOf(shot) {
    const o = [0, 1, 2].map((i) => shot.cam[i] - shot.look[i]), r = Math.hypot(o[0], o[1], o[2]) || 1, flat = Math.hypot(o[0], o[2]);
    return {
        look: [...shot.look],
        r,
        phi: Math.acos(Math.min(1, Math.max(-1, o[1] / r))),
        theta: flat > r * 1e-6 ? Math.atan2(o[0], o[2]) : (shot.yaw ?? 0),
        fov: shot.fov,
    };
}
/** Part way from one orbit to another; the heading turns the short way round. */
export function mixOrbit(a, b, k) {
    const turn = Math.atan2(Math.sin(b.theta - a.theta), Math.cos(b.theta - a.theta));
    return {
        look: a.look.map((v, i) => v + (b.look[i] - v) * k),
        r: a.r + (b.r - a.r) * k,
        phi: a.phi + (b.phi - a.phi) * k,
        theta: a.theta + turn * k,
        fov: a.fov + (b.fov - a.fov) * k,
    };
}
/**
 * Where an orbit puts the camera, its distance scaled by `pull`, and the
 * screen's up: towards the far side of the table, tipping to the sky as the
 * camera lowers. It stays well defined straight overhead, and never rolls.
 */
export function orbitCamera(v, pull = 1) {
    const sp = Math.sin(v.phi), cp = Math.cos(v.phi), st = Math.sin(v.theta), ct = Math.cos(v.theta), r = v.r * pull;
    return {
        cam: [v.look[0] + r * sp * st, v.look[1] + r * cp, v.look[2] + r * sp * ct],
        up: [-st * cp, sp, -ct * cp],
    };
}
/**
 * Narrow windows pull the camera back along its line of sight, so the same
 * table area stays in frame; the stage applies it to every shot.
 */
export const narrowPull = (aspect) => Math.pow(Math.min(2.6, Math.max(1, 1.6 / aspect)), 0.9);
/**
 * A close-up that fills `area` of the screen with one table rectangle: the
 * taught piece, centred in the room the HUD leaves, everything around it
 * pushed to the edges. The camera looks down from the viewer's side at
 * `pitch` (radians above the table), turned by `yaw`. With `top` it looks
 * straight down, turned so the rectangle reads upright: a card, a mat or a
 * board then shows square, its print undistorted, its corners where a frame
 * drawn around it on screen would put them.
 */
export function frameShot(r, aspect, area = { x0: -1, y0: -1, x1: 1, y1: 1 }, o = {}) {
    const pitch = o.top ? Math.PI / 2 : (o.pitch ?? 1.1), yaw = o.yaw ?? (o.top ? (r.ry ?? 0) : 0), fov = o.fov ?? 34, fill = o.fill ?? 0.84, t = Math.tan((fov * Math.PI) / 360), cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), 
    // The rectangle's extent across and along the camera's view.
    rc = Math.abs(Math.cos((r.ry ?? 0) - yaw)), rs = Math.abs(Math.sin((r.ry ?? 0) - yaw)), across = r.w * rc + r.h * rs, along = r.w * rs + r.h * rc, halfW = ((area.x1 - area.x0) / 2) * fill, halfH = ((area.y1 - area.y0) / 2) * fill, 
    // Far enough that it fits both ways; the near edge looms a little larger.
    d = Math.max(across / 2 / (t * aspect * halfW), (along * sp) / 2 / (t * halfH) + (along / 2) * cp), mx = (area.x0 + area.x1) / 2, my = (area.y0 + area.y1) / 2, 
    // Camera right and up: the look point moves so the rectangle lands in the area.
    right = [cy, 0, -sy], up = [-sy * sp, cp, -cy * sp], look = [0, 1, 2].map((i) => [r.x, 0, r.z][i] - right[i] * mx * d * t * aspect - up[i] * my * d * t), 
    // Pre-shrunk: the stage pulls narrow windows back by the same factor.
    back = d / narrowPull(aspect), off = [sy * cp, sp, cy * cp];
    const shot = {
        cam: [0, 1, 2].map((i) => +(look[i] + off[i] * back).toFixed(2)),
        look: look.map((v) => +v.toFixed(2)),
        fov,
    };
    if (o.top)
        shot.yaw = +yaw.toFixed(4);
    return shot;
}
/**
 * Camera presets for the viewer's seat, taken from the art-locked concept stills.
 * `turn` is the concept's peak-action camera pulled back a little so the whole
 * sanctuary stays above the hand.
 */
export const SHOTS = {
    turn: { cam: [36, 88, 132], look: [-4, 0, 22], fov: 44 },
    sanctuary: { cam: [14, 86, 104], look: [-10, 0, 40], fov: 43 },
    rain: { cam: [53, 70, 66], look: [23, 1, -24], fov: 44 },
    region: { cam: [-10, 88, 24], look: [-8, 0, -64], fov: 43 },
    board: { cam: [10, 80, 30], look: [-8, 0, -26], fov: 40 },
    dice: { cam: [62, 60, 66], look: [26, 0, -8], fov: 44 },
    supplies: { cam: [44, 52, 86], look: [20, 0, 40], fov: 38 },
};
/** The whole table from above the viewer's right shoulder. */
export function overviewShot(players) {
    return players > 2
        ? { cam: [78, 205, 168], look: [0, 0, -30], fov: 48 }
        : { cam: [60, 162, 134], look: [-6, 0, -29], fov: 48 };
}
/** The sanctuary shot re-aimed at any seat, so every mat reads upright. */
export function seatShot(seat) {
    const [cx, cz] = world(seat, 31, 53), [lx, lz] = world(seat, 0, -3);
    return { cam: [cx, 73, cz], look: [lx, 0, lz], fov: 41 };
}
/** Naledi's station with both card rows and her land in view, clear of the HUD. */
export function stationShot(seat) {
    const [cx, cz] = world(seat, 34, 86), [lx, lz] = world(seat, 6, 3);
    return { cam: [cx, 104, cz], look: [lx, 0, lz], fov: 44 };
}
