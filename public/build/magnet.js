/** A magnet pulls fully inside this share of its reach. */
export const CORE = 0.4;
/** Pulled at least this far, the piece is locked on. */
export const LOCK = 0.5;
/** A locked magnet keeps its hold a little beyond the point where it took it. */
export const GRIP = 0.85;
/** The piece is carried at all while the pointer is within this many reaches. */
export const RANGE = 2;
const smooth = (t) => {
    const k = Math.min(1, Math.max(0, t));
    return k * k * (3 - 2 * k);
};
/** Distance from a table point to a magnet, measured in the field's own shape. */
export function distance(f, m, x, z) {
    return Math.hypot(x - m.x, (z - m.z) * (f.aspect ?? 1));
}
/** The magnet nearest to a table point, with its distance. */
export function nearest(f, x, z) {
    let best = null, d = Infinity;
    for (const m of f.magnets) {
        const dm = distance(f, m, x, z);
        if (dm < d) {
            d = dm;
            best = m;
        }
    }
    return { magnet: best, d };
}
/** Whether a pointer at this table point carries the piece at all. */
export function inRange(f, x, z) {
    return nearest(f, x, z).d <= f.reach * RANGE;
}
/**
 * Where the carried piece belongs for a pointer at (x, z). `held` is the magnet
 * it is locked on now: it keeps its hold until the pointer is clearly nearer to
 * another one or has left its grip, so the piece does not flicker between two
 * neighbours.
 */
export function pull(f, x, z, held = null) {
    const near = nearest(f, x, z);
    let m = near.magnet, d = near.d;
    if (!m)
        return { id: null, x, z, weight: 0, locked: false };
    const keep = held ? f.magnets.find((k) => k.id === held) : undefined;
    if (keep && keep !== m) {
        const dk = distance(f, keep, x, z);
        if (dk <= f.reach * GRIP && dk <= d * 1.18) {
            m = keep;
            d = dk;
        }
    }
    if (d >= f.reach)
        return { id: null, x, z, weight: 0, locked: false };
    const weight = smooth((f.reach - d) / (f.reach * (1 - CORE))), locked = weight >= LOCK || (m.id === held && d <= f.reach * GRIP && weight > 0.2);
    return {
        id: m.id,
        x: x + (m.x - x) * weight,
        z: z + (m.z - z) * weight,
        weight,
        locked,
    };
}
