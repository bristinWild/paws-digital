const NS = "http://www.w3.org/2000/svg";
/** Room kept around each target, and the smallest hole worth drawing. */
const PAD = 10, MIN = 28, 
/** Clear space kept between two frames. */
GAP = 6;
export class Spotlight {
    shade;
    rings;
    holes = [];
    cuts;
    on = false;
    last = 0;
    constructor(shade, rings) {
        this.shade = shade;
        this.rings = rings;
        shade.innerHTML = `<svg width="100%" height="100%" aria-hidden="true"><defs><filter id="spot-soft" filterUnits="userSpaceOnUse" x="-50" y="-50" width="10000" height="10000"><feGaussianBlur stdDeviation="7"/></filter><mask id="spot-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="10000" height="10000"><rect x="0" y="0" width="10000" height="10000" fill="#fff"/><g class="cuts" filter="url(#spot-soft)"></g></mask></defs><rect class="spot-dim" x="0" y="0" width="10000" height="10000" mask="url(#spot-mask)"/></svg>`;
        this.cuts = shade.querySelector(".cuts");
    }
    /**
     * Call once a frame with where the holes belong; an empty list lowers the
     * shade. A hole that keeps its place in the list glides to its new target;
     * a new one closes in on its target from a little further out.
     */
    update(want, now) {
        const dt = Math.min(0.1, (now - this.last) / 1000 || 0.016);
        this.last = now;
        const on = want.length > 0;
        if (on !== this.on) {
            this.on = on;
            this.shade.classList.toggle("on", on);
            this.rings.classList.toggle("on", on);
            // Back after a pause: the holes close in afresh rather than drift over.
            if (on)
                this.drop(0);
        }
        if (!on)
            return;
        const plan = arrange(want);
        this.drop(plan.length);
        const still = matchMedia("(prefers-reduced-motion: reduce)").matches, k = still ? 1 : 1 - Math.exp(-dt * 11);
        plan.forEach((w, i) => {
            let h = this.holes[i];
            if (!h) {
                const ring = document.createElement("div"), cap = document.createElement("div"), cut = document.createElementNS(NS, "rect");
                ring.className = "spot-ring";
                cap.className = "spot-cap";
                cut.setAttribute("fill", "#000");
                this.rings.append(ring, cap);
                this.cuts.append(cut);
                const grow = still ? 0 : 70;
                h = {
                    ...w,
                    x0: w.x0 - grow,
                    y0: w.y0 - grow,
                    x1: w.x1 + grow,
                    y1: w.y1 + grow,
                    ring,
                    cap,
                    cut,
                };
                this.holes[i] = h;
            }
            h.x0 += (w.x0 - h.x0) * k;
            h.y0 += (w.y0 - h.y0) * k;
            h.x1 += (w.x1 - h.x1) * k;
            h.y1 += (w.y1 - h.y1) * k;
            h.round = w.round;
            h.under = w.under;
            this.draw(h, w.caption ?? "");
        });
        // A caption never lies across another frame: it moves to the other side.
        this.holes.forEach((h) => {
            if (!h.cap.textContent)
                return;
            const others = this.holes.filter((o) => o !== h), hits = () => {
                const c = h.cap.getBoundingClientRect();
                return others.some((o) => overlaps(c, o, 4));
            };
            if (others.length && hits()) {
                this.place(h, !h.cap.classList.contains("below"));
                if (hits())
                    this.place(h, !h.cap.classList.contains("below"));
            }
        });
    }
    /** Removes the holes past the first `keep`. */
    drop(keep) {
        while (this.holes.length > keep) {
            const h = this.holes.pop();
            h.ring.remove();
            h.cap.remove();
            h.cut.remove();
        }
    }
    draw(h, caption) {
        const w = h.x1 - h.x0, ht = h.y1 - h.y0, r = h.round ? Math.min(w, ht) / 2 : Math.min(18, Math.min(w, ht) / 3);
        h.cut.setAttribute("x", h.x0.toFixed(1));
        h.cut.setAttribute("y", h.y0.toFixed(1));
        h.cut.setAttribute("width", w.toFixed(1));
        h.cut.setAttribute("height", ht.toFixed(1));
        h.cut.setAttribute("rx", r.toFixed(1));
        h.ring.style.cssText = `left:${h.x0.toFixed(1)}px;top:${h.y0.toFixed(1)}px;width:${w.toFixed(1)}px;height:${ht.toFixed(1)}px;border-radius:${r.toFixed(1)}px`;
        if (h.cap.textContent !== caption)
            h.cap.textContent = caption;
        h.cap.style.display = caption ? "" : "none";
        if (!caption)
            return;
        // Above the ring when there is room, under it otherwise.
        this.place(h, h.under ? h.y1 > innerHeight - 64 : h.y0 > 64);
    }
    place(h, above) {
        h.cap.classList.toggle("below", !above);
        h.cap.style.left = ((h.x0 + h.x1) / 2).toFixed(1) + "px";
        h.cap.style.top = (above ? h.y0 : h.y1).toFixed(1) + "px";
    }
}
/** Whether two boxes come within `gap` pixels of each other. */
function overlaps(a, b, gap = 0) {
    const [ax0, ay0, ax1, ay1] = "x0" in a ? [a.x0, a.y0, a.x1, a.y1] : [a.left, a.top, a.right, a.bottom];
    return (ax0 < b.x1 + gap && b.x0 < ax1 + gap && ay0 < b.y1 + gap && b.y0 < ay1 + gap);
}
/**
 * The frames to draw for these targets, each hugging its target with a
 * little room, none crossing another. Targets too close to keep apart share
 * one frame (neighbouring spaces, interlocking tiles), unless both are named:
 * then each frame gives up its room on the side facing the other.
 */
export function arrange(want) {
    const raw = want.map((h) => ({ ...h }));
    for (let merged = true; merged;) {
        merged = false;
        for (let i = 0; i < raw.length && !merged; i++)
            for (let j = i + 1; j < raw.length && !merged; j++) {
                const a = raw[i], b = raw[j];
                if ((a.caption && b.caption) || !overlaps(pad(a), pad(b), GAP))
                    continue;
                raw[i] = {
                    ...a,
                    x0: Math.min(a.x0, b.x0),
                    y0: Math.min(a.y0, b.y0),
                    x1: Math.max(a.x1, b.x1),
                    y1: Math.max(a.y1, b.y1),
                    round: a.round && b.round,
                    caption: a.caption ?? b.caption,
                    under: a.caption ? a.under : b.under,
                };
                raw.splice(j, 1);
                merged = true;
            }
    }
    const out = raw.map(pad);
    for (let i = 0; i < out.length; i++)
        for (let j = i + 1; j < out.length; j++) {
            const a = out[i], b = out[j];
            if (!overlaps(a, b, GAP))
                continue;
            // Split the room between them where they are furthest apart.
            const ra = raw[i], rb = raw[j], side = Math.max(rb.x0 - ra.x1, ra.x0 - rb.x1) >=
                Math.max(rb.y0 - ra.y1, ra.y0 - rb.y1)
                ? ["x0", "x1"]
                : ["y0", "y1"], [lo, hi] = ra[side[1]] <= rb[side[1]] ? [a, b] : [b, a], [rlo, rhi] = lo === a ? [ra, rb] : [rb, ra], mid = (rlo[side[1]] + rhi[side[0]]) / 2;
            lo[side[1]] = Math.max(rlo[side[1]], mid - GAP / 2);
            hi[side[0]] = Math.min(rhi[side[0]], mid + GAP / 2);
        }
    return out;
}
function pad(h) {
    const cx = (h.x0 + h.x1) / 2, cy = (h.y0 + h.y1) / 2, hw = Math.max(MIN, h.x1 - h.x0 + PAD * 2) / 2, hh = Math.max(MIN, h.y1 - h.y0 + PAD * 2) / 2;
    if (h.round) {
        const r = Math.max(hw, hh);
        return { ...h, x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r };
    }
    return { ...h, x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
}
