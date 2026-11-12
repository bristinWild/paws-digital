/**
 * WebGL tabletop. Every component face is an original PAWS WebP on a thick piece;
 * faces are unlit so print colours stay intact. The stage knows nothing about rules:
 * it receives keyed pieces with poses, tweens between them, and mirrors clickable
 * pieces as DOM buttons so the table stays keyboard- and test-drivable.
 */
import { TILE, mixOrbit, narrowPull, orbitCamera, orbitOf, tableBounds, } from "./layout.js";
import * as M from "./magnet.js";
const ASSET = (path) => "/assets/" + path.split("/").map(encodeURIComponent).join("/");
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const HOLD = 60;
export class Stage {
    canvas;
    onHover = () => { };
    /** A grab hotspot was pressed and dragged: its piece should be picked up. */
    onGrab = () => { };
    /** The carried piece locked onto a magnet, or let go of it. */
    onPull = () => { };
    /** The carried piece was dropped on a magnet. */
    onSnap = () => { };
    /** A piece the player set down has landed (see `Pose.snap`). */
    onLand = () => { };
    renderer;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(44, 16 / 9, 1, 2400);
    pieces = new Map();
    textures = new Map();
    geos = new Map();
    loader = new THREE.TextureLoader();
    env = new THREE.Group();
    marks = new Map();
    hots = new Map();
    labels = new Map();
    hotLayer;
    labelLayer;
    bursts = [];
    floats = [];
    ripple = 0;
    quality = new URLSearchParams(location.search).get("quality");
    contact;
    sun;
    fill;
    rain;
    rainLevel = 0;
    rainTarget = 0;
    sky = new THREE.Color("#b8c8ad");
    storm = new THREE.Color("#738f8e");
    players = 0;
    dirty = true;
    last = 0;
    slow = 0;
    width = 1;
    height = 1;
    shotTo = { cam: [78, 205, 168], look: [0, 0, -30], fov: 48 };
    viewFrom = orbitOf(this.shotTo);
    viewTo = this.viewFrom;
    shotT = 1;
    shotDur = 1.1;
    orbit = { yaw: 0, pitch: 0, zoom: 1 };
    drift = 0;
    /** The camera holds still: no idle orbit, no dragging or zooming it. */
    locked = false;
    drag = null;
    hover = null;
    carry = null;
    carrying = false;
    lock = null;
    /** Where the piece was last dropped; it stays put until the pointer moves on. */
    parked = null;
    pointer = null;
    grab = null;
    swallow = 0;
    lean = { x: 0, z: 0 };
    told = [];
    goal = new THREE.Vector3();
    v = new THREE.Vector3();
    q = new THREE.Quaternion();
    q2 = new THREE.Quaternion();
    e = new THREE.Euler();
    constructor(host) {
        const capture = new URLSearchParams(location.search).has("capture");
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: capture,
            powerPreference: "high-performance",
        });
        const r = this.renderer;
        r.outputEncoding = THREE.sRGBEncoding;
        r.shadowMap.enabled = true;
        r.shadowMap.type = THREE.PCFSoftShadowMap;
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.1;
        this.canvas = r.domElement;
        this.canvas.className = "stage-canvas";
        this.hotLayer = document.createElement("div");
        this.hotLayer.className = "hots";
        this.labelLayer = document.createElement("div");
        this.labelLayer.className = "wlabels";
        host.append(this.canvas, this.hotLayer, this.labelLayer);
        this.scene.background = this.sky.clone();
        this.scene.fog = new THREE.Fog(this.sky.getHex(), 340, 980);
        this.scene.add(new THREE.HemisphereLight("#e8f1d5", "#7a6550", 0.95));
        this.sun = new THREE.DirectionalLight("#fff0c5", 1.5);
        this.sun.position.set(-75, 145, -8);
        this.sun.target.position.set(0, 0, -38);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sun.shadow.camera, {
            left: -215,
            right: 215,
            top: 190,
            bottom: -190,
            near: 1,
            far: 520,
        });
        this.sun.shadow.bias = -0.0005;
        this.sun.shadow.normalBias = 0.1;
        this.sun.shadow.radius = 4;
        this.fill = new THREE.DirectionalLight("#d9e8ee", 0.5);
        this.fill.position.set(90, 80, -108);
        this.scene.add(this.sun, this.sun.target, this.fill, this.env, this.camera);
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        const g = c.getContext("2d");
        g.filter = "blur(13px)";
        g.fillStyle = "#000";
        g.fillRect(24, 24, 208, 208);
        this.contact = new THREE.CanvasTexture(c);
        const drops = [];
        let seed = 75;
        const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
        for (let i = 0; i < 1100; i++) {
            const x = rand() * 330 - 165, y = rand() * 90, z = rand() * 260 - 170;
            drops.push(x, y, z, x - 0.9, y - 3.4, z + 0.4);
        }
        const rg = new THREE.BufferGeometry();
        rg.setAttribute("position", new THREE.Float32BufferAttribute(drops, 3));
        this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({
            color: "#d2eeed",
            transparent: true,
            opacity: 0,
            depthWrite: false,
        }));
        this.rain.visible = false;
        this.rain.frustumCulled = false;
        this.scene.add(this.rain);
        new ResizeObserver(() => this.resize(host)).observe(host);
        this.resize(host);
        this.bindPointer();
        this.applyShot(1);
        requestAnimationFrame((t) => this.frame(t));
    }
    // ---------- environment ----------
    /** Rebuilds the lodge backdrop and tabletop for a player count. */
    setTable(players) {
        if (players === this.players)
            return;
        this.players = players;
        for (const child of [...this.env.children]) {
            this.env.remove(child);
            const mesh = child;
            mesh.geometry?.dispose();
        }
        const b = tableBounds(players), w = b.halfW * 2, d = b.near - b.far, cz = (b.near + b.far) / 2;
        const box = (bw, bh, bd, x, y, z, color) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), new THREE.MeshStandardMaterial({ color, roughness: 0.75 }));
            m.position.set(x, y, z);
            m.castShadow = m.receiveShadow = true;
            this.env.add(m);
            return m;
        };
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.MeshStandardMaterial({ color: "#9eae87", roughness: 1 }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, -65, cz);
        ground.receiveShadow = true;
        this.env.add(ground);
        // Quiet acacia shapes all around, so every seat has a backdrop.
        for (let i = 0; i < 22; i++) {
            const a = (i / 22) * Math.PI * 2 + 0.14, x = Math.sin(a) * (b.halfW + 250), z = cz - Math.cos(a) * (d / 2 + 190);
            box(5, 95, 5, x, -20, z, "#6e7652");
            const crown = new THREE.Mesh(new THREE.SphereGeometry(55, 14, 9), new THREE.MeshStandardMaterial({
                color: i % 2 ? "#76896a" : "#8d9c76",
                roughness: 1,
            }));
            crown.scale.y = 0.4;
            crown.position.set(x, 30, z);
            this.env.add(crown);
        }
        const wc = document.createElement("canvas");
        wc.width = 2048;
        wc.height = 1024;
        const ctx = wc.getContext("2d");
        ctx.fillStyle = "#6f5035";
        ctx.fillRect(0, 0, 2048, 1024);
        let seed = 75;
        const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
        for (let i = 0; i < 1100; i++) {
            const y = rand() * 1024;
            ctx.strokeStyle = `rgba(${rand() > 0.5 ? "30,15,3" : "213,173,108"},${rand() * 0.08})`;
            ctx.lineWidth = rand() * 1.3 + 0.3;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(600, y + rand() * 60 - 30, 1400, y + rand() * 70 - 35, 2048, y + rand() * 22);
            ctx.stroke();
        }
        for (let i = 1; i < 7; i++) {
            ctx.fillStyle = "#2e1e1280";
            ctx.fillRect(0, i * 150, 2048, 2);
            ctx.fillStyle = "#cbaf762f";
            ctx.fillRect(0, i * 150 + 2, 2048, 2);
        }
        const wood = new THREE.CanvasTexture(wc);
        wood.encoding = THREE.sRGBEncoding;
        wood.anisotropy = 8;
        const slab = (sw, sd, thick, color) => {
            const geo = new THREE.ExtrudeGeometry(rounded(sw, sd, 12), {
                depth: thick,
                bevelEnabled: false,
                curveSegments: 10,
            });
            geo.rotateX(-Math.PI / 2);
            const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
            m.castShadow = m.receiveShadow = true;
            this.env.add(m);
            return m;
        };
        const top = slab(w, d, 5, "#705334"), mat = top.material;
        mat.map = wood;
        mat.roughness = 0.7;
        top.position.set(0, -5, cz);
        // World-space UVs keep the grain continuous across the whole tabletop.
        const pos = top.geometry.attributes.position, uv = top.geometry.attributes.uv;
        for (let i = 0; i < pos.count; i++)
            uv.setXY(i, (pos.getX(i) + w / 2) / 246, (pos.getZ(i) + d / 2) / 192);
        uv.needsUpdate = true;
        slab(w + 3, d + 3, 2, "#3e392b").position.set(0, -5.8, cz);
        box(w - 22, 9, d - 22, 0, -9, cz, "#5c4930");
        this.dirty = true;
    }
    /** 0 clear, 1 drizzle for the final turns, 2 the Rain Dance itself. */
    weather(level) {
        this.rainTarget = level;
        this.dirty = true;
    }
    // ---------- pieces ----------
    texture(path) {
        let entry = this.textures.get(path);
        if (!entry) {
            const tex = this.loader.load(ASSET(path), () => (this.dirty = true));
            tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
            entry = { tex, refs: 0 };
            this.textures.set(path, entry);
        }
        entry.refs++;
        return entry.tex;
    }
    release(path) {
        const entry = this.textures.get(path);
        if (entry && --entry.refs <= 0) {
            entry.tex.dispose();
            this.textures.delete(path);
        }
    }
    geometry(key, make) {
        let g = this.geos.get(key);
        if (!g)
            this.geos.set(key, (g = make()));
        return g;
    }
    faceGeometry(spec, under) {
        return this.geometry(`face:${spec.w}:${spec.h}:${spec.turn ?? ""}:${under}`, () => {
            const g = new THREE.PlaneGeometry(spec.w, spec.h);
            // Vertex order is top-left, top-right, bottom-left, bottom-right.
            if (spec.turn === "cw")
                g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1], 2));
            if (spec.turn === "ccw")
                g.setAttribute("uv", new THREE.Float32BufferAttribute([1, 1, 1, 0, 0, 1, 0, 0], 2));
            g.rotateX(-Math.PI / 2);
            if (under)
                g.rotateZ(Math.PI);
            return g;
        });
    }
    build(key, spec) {
        const group = new THREE.Group(), faces = [], textures = [];
        let body, shadow, base;
        const art = (path, under = false, tint) => {
            textures.push(path);
            const m = new THREE.Mesh(this.faceGeometry(spec, under), new THREE.MeshBasicMaterial({
                map: this.texture(path),
                transparent: true,
                alphaTest: 0.05,
                toneMapped: false,
                color: tint ?? "#ffffff",
            }));
            group.add(m);
            faces.push(m);
            return m;
        };
        if (spec.shape === "die") {
            body = new THREE.Mesh(this.geometry(`die:${spec.w}`, () => dieGeometry(spec.w)), dieMaterials());
            body.castShadow = true;
            body.quaternion.copy((base = dieTurn(Number(spec.face))));
            group.add(body);
        }
        else if (spec.shape === "token") {
            for (let i = 2; i >= 1; i--)
                art(spec.face, false, "#7d6c50").position.y =
                    spec.thick * (0.5 - i / 2);
            art(spec.face).position.y = spec.thick / 2;
        }
        else {
            if (!spec.ghost) {
                const shape = spec.shape === "card" || spec.shape === "slab"
                    ? rounded(spec.w, spec.h, Math.min(0.5, spec.w * 0.04))
                    : hexLine(Number(spec.shape.slice(3)));
                body = new THREE.Mesh(this.geometry(`body:${spec.shape}:${spec.w}:${spec.h}:${spec.thick}`, () => {
                    const g = new THREE.ExtrudeGeometry(shape, {
                        depth: spec.thick,
                        bevelEnabled: false,
                        curveSegments: 8,
                    });
                    g.rotateX(-Math.PI / 2);
                    g.translate(0, -spec.thick / 2, 0);
                    return g;
                }), new THREE.MeshStandardMaterial({
                    color: spec.edge ??
                        (spec.shape.startsWith("hex") ? "#c7af7d" : "#f3e6c7"),
                    roughness: 0.8,
                }));
                body.castShadow = body.receiveShadow = true;
                group.add(body);
            }
            art(spec.face).position.y = spec.thick / 2 + 0.015;
            if (spec.back && !spec.ghost)
                art(spec.back, true).position.y = -spec.thick / 2 - 0.015;
        }
        if (!spec.ghost && spec.shape !== "die" && spec.shape !== "token") {
            shadow = new THREE.Mesh(this.geometry(`shadow:${spec.w}:${spec.h}`, () => {
                const g = new THREE.PlaneGeometry(spec.w * 1.16 + 2, spec.h * 1.12 + 2);
                g.rotateX(-Math.PI / 2);
                return g;
            }), new THREE.MeshBasicMaterial({
                map: this.contact,
                color: "#152b20",
                transparent: true,
                opacity: 0.33,
                depthWrite: false,
            }));
            this.scene.add(shadow);
        }
        this.scene.add(group);
        return {
            key,
            spec,
            pose: { x: 0, y: 0, z: 0 },
            group,
            body,
            faces,
            shadow,
            fromPos: new THREE.Vector3(),
            fromQuat: new THREE.Quaternion(),
            fromScale: 1,
            fromOpacity: 1,
            t: 1,
            dur: 0.6,
            delay: 0,
            arc: 0,
            spin: 0,
            base,
            dying: false,
            textures,
            snap: false,
            quick: false,
            punch: 0,
        };
    }
    destroy(p) {
        this.scene.remove(p.group);
        if (p.shadow) {
            this.scene.remove(p.shadow);
            p.shadow.material.dispose();
        }
        for (const f of p.faces)
            f.material.dispose();
        if (p.body && p.spec.shape !== "die")
            p.body.material.dispose();
        for (const t of p.textures)
            this.release(t);
        this.pieces.delete(p.key);
    }
    /** World position, orientation and scale that a pose asks for right now. */
    resolve(pose, spec, pos, quat) {
        if (pose.cam) {
            const th = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), d = HOLD - (pose.cam.layer ?? 0) * 0.3;
            pos
                .set(pose.cam.nx * d * th * this.camera.aspect, pose.cam.ny * d * th, -d)
                .applyMatrix4(this.camera.matrixWorld);
            quat
                .copy(this.camera.quaternion)
                .multiply(this.q2.setFromEuler(this.e.set(Math.PI / 2, pose.tilt ?? 0, pose.flip ? Math.PI : 0, "XYZ")));
            return ((pose.cam.hf * 2 * d * th) / spec.h) * (pose.scale ?? 1);
        }
        pos.set(pose.x, pose.y + spec.thick / 2, pose.z);
        quat.setFromEuler(this.e.set(pose.tilt ?? 0, pose.ry ?? 0, pose.flip ? Math.PI : 0, "YXZ"));
        return pose.scale ?? 1;
    }
    place(p, pose) {
        const scale = this.resolve(pose, p.spec, p.group.position, p.group.quaternion);
        p.group.scale.setScalar(scale);
        this.fade(p, pose.opacity ?? 1);
    }
    fade(p, opacity) {
        for (const f of p.faces) {
            const m = f.material;
            m.opacity = opacity;
            m.depthWrite = opacity > 0.95;
        }
        p.group.userData.opacity = opacity;
    }
    retarget(p, pose, delay = 0) {
        p.fromPos.copy(p.group.position);
        p.fromQuat.copy(p.group.quaternion);
        p.fromScale = p.group.scale.x;
        p.fromOpacity = p.group.userData.opacity ?? 1;
        const flipped = !!p.pose.flip !== !!pose.flip;
        p.pose = pose;
        this.resolve(pose, p.spec, this.v, this.q);
        const dist = this.v.distanceTo(p.fromPos);
        p.t = 0;
        p.delay = delay;
        p.dur = clamp(0.38 + dist / 190, 0.38, 1.05);
        p.arc = pose.cam || dist < 0.4 ? 0 : clamp(dist * 0.16, 1.2, 15);
        if (flipped && !pose.cam)
            p.arc = Math.max(p.arc, p.spec.w * 0.55);
        if (p.spin) {
            p.dur = Math.max(p.dur, 0.7);
            p.arc = Math.max(p.arc, 3);
        }
        p.snap = !!pose.snap && dist > 0.05;
        p.quick = false;
        if (this.carrying && this.carry?.piece === p.key) {
            // Let go while carried: a short, straight drop instead of a flight.
            this.carrying = false;
            p.dur = 0.15;
            p.arc = 0;
            p.delay = 0;
            p.quick = true;
            p.snap = !pose.cam;
        }
    }
    /**
     * Hands one piece to the pointer (or takes it back with null). While the
     * pointer is near its magnets the piece leaves its pose and follows; anywhere
     * else it rests where the table put it.
     */
    setCarry(c) {
        const old = this.carry;
        if (old && (!c || c.piece !== old.piece)) {
            if (this.carrying) {
                this.carrying = false;
                const p = this.pieces.get(old.piece);
                if (p && !p.dying && p.t >= 1)
                    this.retarget(p, p.pose);
            }
            this.parked = null;
        }
        this.carry = c;
        if (!c || (this.lock && !c.magnets.some((m) => m.id === this.lock)))
            this.setLock(null);
        this.dirty = true;
    }
    setLock(id) {
        if (id === this.lock)
            return;
        this.lock = id;
        // Listeners may redraw the table, so they hear about it after the frame.
        this.told.push(() => this.onPull(id));
        this.dirty = true;
    }
    /** Where a screen point meets the table at a given height. */
    tablePoint(cx, cy, y) {
        const r = this.canvas.getBoundingClientRect();
        this.v
            .set(((cx - r.left) / r.width) * 2 - 1, 1 - ((cy - r.top) / r.height) * 2, 0.5)
            .unproject(this.camera);
        const o = this.camera.position, dy = this.v.y - o.y;
        if (dy > -1e-4)
            return null;
        const t = (y - o.y) / dy;
        return { x: o.x + (this.v.x - o.x) * t, z: o.z + (this.v.z - o.z) * t };
    }
    /** The pointer is over the part of the table where the carried piece follows it. */
    overField(cx, cy) {
        const at = this.carry && this.tablePoint(cx, cy, 1);
        return !!at && M.inRange(this.carry, at.x, at.z);
    }
    /** Moves the carried piece: under the pointer, or drawn to a magnet near it. */
    carryStep(dt) {
        const c = this.carry, p = c && this.pieces.get(c.piece), ptr = this.pointer;
        if (!c || !p || p.dying)
            return (this.carrying = false);
        // Dragged out of the hand it follows everywhere; otherwise only near its
        // magnets, and never while the pointer is on some other control.
        const dragged = !!this.grab?.moved, over = ptr?.hot ? this.hots.get(ptr.hot)?.hot : undefined, 
        // Hotspots that only show a piece's print do not hold the pointer back.
        blocked = !dragged &&
            !!over &&
            !over.ui.startsWith("inspect") &&
            !c.across.some((prefix) => over.id.startsWith(prefix));
        let at = ptr?.inside && !this.drag && !blocked
            ? this.tablePoint(ptr.x, ptr.y, 1)
            : null;
        if (at && !dragged && !M.inRange(c, at.x, at.z))
            at = null;
        if (at && this.parked) {
            // Just dropped here: it stays down until the pointer moves away.
            if (Math.hypot(at.x - this.parked.x, at.z - this.parked.z) <
                c.reach * 0.7)
                at = null;
            else
                this.parked = null;
        }
        if (!at) {
            this.setLock(null);
            if (this.carrying) {
                // Back to where it was resting: a return, not a drop.
                this.carrying = false;
                this.retarget(p, p.pose);
                p.dur = Math.min(p.dur, 0.42);
                p.snap = false;
            }
            return false;
        }
        const pl = M.pull(c, at.x, at.z, this.lock), m = pl.id ? c.magnets.find((k) => k.id === pl.id) : undefined;
        this.setLock(pl.locked ? pl.id : null);
        this.carrying = true;
        const ground = 0.5 + ((m?.y ?? 0.5) - 0.5) * pl.weight, y = c.lift + (ground + (c.hover ?? 1.5) - c.lift) * pl.weight, k = 1 - Math.exp(-dt * (pl.locked ? 24 : 15)), bx = p.group.position.x, bz = p.group.position.z;
        p.group.position.lerp(this.goal.set(pl.x, y + p.spec.thick / 2, pl.z), k);
        // It leans into the way it is going and straightens as the magnet takes it.
        const free = 1 - pl.weight, step = Math.max(dt, 0.001), ease2 = 1 - Math.exp(-dt * 10);
        this.lean.x +=
            (clamp(((p.group.position.x - bx) / step) * 0.0035, -0.3, 0.3) * free -
                this.lean.x) *
                ease2;
        this.lean.z +=
            (clamp(((p.group.position.z - bz) / step) * 0.0035, -0.24, 0.24) * free -
                this.lean.z) *
                ease2;
        const from = c.ry ?? 0, turn = Math.atan2(Math.sin((m?.ry ?? from) - from), Math.cos((m?.ry ?? from) - from));
        p.group.quaternion.slerp(this.q.setFromEuler(this.e.set(this.lean.z, from + turn * pl.weight, -this.lean.x, "YXZ")), k);
        const scale = p.group.scale.x + (1.08 - 0.05 * pl.weight - p.group.scale.x) * k;
        p.group.scale.setScalar(scale);
        this.fade(p, 1);
        p.t = 1;
        p.delay = 0;
        p.punch = 0;
        for (const f of p.faces)
            f.renderOrder = 90 + f.position.y;
        if (p.shadow) {
            const lift = p.group.position.y - p.spec.thick / 2 - ground;
            p.shadow.visible = true;
            p.shadow.position.set(p.group.position.x + 0.5 + lift * 0.05, ground + 0.06, p.group.position.z + 0.8 + lift * 0.07);
            p.shadow.rotation.y = from + turn * pl.weight;
            p.shadow.scale.setScalar(scale * (1 + clamp(lift, 0, 30) * 0.012));
            p.shadow.material.opacity =
                0.36 * clamp(1 - lift / 34, 0.18, 1);
            p.shadow.renderOrder = 89;
        }
        this.dirty = true;
        return true;
    }
    /** Lets the carried piece go on the magnet that holds it. */
    drop() {
        const id = this.lock, c = this.carry, ptr = this.pointer;
        if (!id || !c || !this.carrying)
            return false;
        this.swallow = performance.now() + 400;
        this.parked = (ptr && this.tablePoint(ptr.x, ptr.y, 1)) || null;
        this.onSnap(id);
        // The table usually answers with a new pose; if the piece already belongs
        // here it still gets its drop.
        const p = this.pieces.get(c.piece);
        if (this.carrying && this.carry?.piece === c.piece && p && !p.dying)
            this.retarget(p, p.pose);
        this.setLock(null);
        return true;
    }
    /**
     * Reconciles the table. New keys appear at `from` (or pop in), changed poses
     * tween, and missing keys leave towards `exits[key]` (or shrink away).
     */
    sync(items, exits = new Map(), instant = false) {
        if (instant)
            for (const p of [...this.pieces.values()])
                this.destroy(p);
        for (const [key, given] of items) {
            const item = instant ? { ...given, from: given.pose, delay: 0 } : given;
            let p = this.pieces.get(key);
            if (p &&
                (p.dying || JSON.stringify(p.spec) !== JSON.stringify(item.spec))) {
                const keep = p.dying ? null : p;
                const at = keep
                    ? {
                        pos: keep.group.position.clone(),
                        quat: keep.group.quaternion.clone(),
                        scale: keep.group.scale.x,
                    }
                    : null;
                this.destroy(p);
                p = this.build(key, item.spec);
                this.pieces.set(key, p);
                if (at) {
                    p.group.position.copy(at.pos);
                    p.group.quaternion.copy(at.quat);
                    p.group.scale.setScalar(at.scale);
                    p.pose = { x: NaN, y: 0, z: 0 };
                    if (item.spec.shape === "die")
                        p.spin = 1;
                }
                else
                    this.spawn(p, item);
            }
            else if (!p) {
                p = this.build(key, item.spec);
                this.pieces.set(key, p);
                this.spawn(p, item);
            }
            if (JSON.stringify(p.pose) !== JSON.stringify(item.pose))
                this.retarget(p, item.pose, item.delay ?? 0);
        }
        for (const [key, p] of this.pieces)
            if (!items.has(key) && !p.dying) {
                p.dying = true;
                const exit = exits.get(key);
                this.retarget(p, exit ?? { ...p.pose, scale: 0.01, opacity: 0, cam: p.pose.cam });
                if (!exit)
                    p.dur = 0.28;
            }
        this.dirty = true;
    }
    spawn(p, item) {
        p.pose = item.from ?? { ...item.pose, scale: 0.01, opacity: 0 };
        this.place(p, p.pose);
        this.settle(p);
        if (item.spec.shape === "die" && item.from !== item.pose)
            p.spin = 1;
    }
    step(dt) {
        let moving = this.carryStep(dt);
        for (const p of this.pieces.values()) {
            if (this.carrying && p.key === this.carry.piece)
                continue;
            if (p.punch > 0 && !p.pose.cam && p.t >= 1) {
                // The little bounce of a piece that has just snapped into place.
                p.punch = Math.max(0, p.punch - dt / 0.24);
                p.group.scale.setScalar((p.pose.scale ?? 1) * (1 + 0.09 * Math.sin(Math.PI * (1 - p.punch))));
                moving = true;
            }
            const held = !!p.pose.cam;
            if (p.t >= 1 && !held && !p.dying)
                continue;
            if (p.delay > 0) {
                p.delay -= dt;
                moving = true;
                continue;
            }
            p.t = Math.min(1, p.t + dt / p.dur);
            const k = p.quick ? 1 - Math.pow(1 - p.t, 3) : ease(p.t), scale = this.resolve(p.pose, p.spec, this.v, this.q);
            p.group.position.lerpVectors(p.fromPos, this.v, k);
            p.group.position.y += p.arc * Math.sin(Math.PI * k);
            p.group.quaternion.copy(p.fromQuat).slerp(this.q, k);
            p.group.scale.setScalar(p.fromScale + (scale - p.fromScale) * k);
            this.fade(p, p.fromOpacity + ((p.pose.opacity ?? 1) - p.fromOpacity) * k);
            if (p.spin && p.body && p.base) {
                const turn = (1 - k) * Math.PI * 3;
                p.body.quaternion
                    .setFromEuler(this.e.set(turn, turn * 0.7, 0, "XYZ"))
                    .multiply(p.base);
                if (p.t >= 1)
                    p.spin = 0;
            }
            if (p.t < 1)
                moving = true;
            else if (p.dying) {
                this.destroy(p);
                continue;
            }
            else if (p.snap) {
                p.snap = p.quick = false;
                p.punch = 1;
                moving = true;
                this.told.push(() => this.onLand(p.key));
                this.burst(p.group.position.x, p.group.position.y - p.spec.thick / 2 + 0.25, p.group.position.z, "#fff1c2", Math.max(p.spec.w, p.spec.h) * 0.46);
            }
            this.settle(p);
        }
        return moving;
    }
    /** Paint order follows height: the camera always looks down on the table. */
    settle(p) {
        const y = p.group.position.y;
        for (const f of p.faces)
            f.renderOrder = y + f.position.y;
        if (!p.shadow)
            return;
        const rest = (p.pose.cam ? y : p.pose.y) - 0.05, lift = y - p.spec.thick / 2 - rest, s = p.group.scale.x;
        p.shadow.visible = !p.pose.cam || p.t < 1;
        p.shadow.position.set(p.group.position.x + 0.5, Math.max(0.025, Math.min(rest, y - p.spec.thick / 2 - 0.05)), p.group.position.z + 0.8);
        p.shadow.rotation.y = p.pose.ry ?? 0;
        p.shadow.scale.setScalar(s * (1 + clamp(lift, 0, 30) * 0.012));
        p.shadow.material.opacity =
            0.33 *
                clamp(1 - lift / 34, 0.18, 1) *
                (p.group.userData.opacity ?? 1) *
                (p.pose.cam ? 1 - p.t : 1);
        p.shadow.renderOrder = p.shadow.position.y;
    }
    // ---------- camera ----------
    /** Presentation sequences wait for actual motion, including on slow renderers. */
    settled() {
        return (this.shotT >= 1 &&
            [...this.pieces.values()].every((p) => p.t >= 1 && p.delay <= 0));
    }
    /**
     * Glides to a preset from wherever the camera is now, the player's own
     * turn of it included, which eases back to neutral on the way.
     */
    shot(shot, seconds = 1.15) {
        if (JSON.stringify(shot) === JSON.stringify(this.shotTo))
            return;
        this.viewFrom = this.view();
        this.viewTo = orbitOf(shot);
        this.shotTo = shot;
        this.shotT = seconds <= 0 ? 1 : 0;
        this.shotDur = Math.max(0.01, seconds);
        this.orbit = { yaw: 0, pitch: 0, zoom: 1 };
        this.dirty = true;
    }
    /** Slow idle orbit for the welcome table and final scoring. */
    setDrift(speed) {
        this.drift = speed;
        this.dirty = true;
    }
    /**
     * Holds the camera on its shot while the field school points at something:
     * no idle orbit, and the player cannot drag or zoom it until released. A
     * camera the player had turned eases back onto the shot.
     */
    lockCamera(on) {
        if (on === this.locked)
            return;
        this.locked = on;
        if (!on)
            return;
        this.drag = null;
        const o = this.orbit;
        if (o.yaw || o.pitch || o.zoom !== 1) {
            this.viewFrom = this.view();
            this.orbit = { yaw: 0, pitch: 0, zoom: 1 };
            this.shotDur = this.shotT < 1 ? this.shotDur : 0.5;
            this.shotT = 0;
        }
        this.dirty = true;
    }
    /** Where the camera is on its way between shots, with the player's turn. */
    view() {
        const v = mixOrbit(this.viewFrom, this.viewTo, ease(this.shotT)), o = this.orbit;
        return {
            ...v,
            theta: v.theta + o.yaw,
            phi: clamp(v.phi + o.pitch, Math.min(v.phi, 0.12), Math.max(v.phi, 1.42)),
            r: v.r * o.zoom,
        };
    }
    applyShot(dt) {
        const moving = this.shotT < 1;
        if (moving)
            this.shotT = Math.min(1, this.shotT + dt / this.shotDur);
        const v = this.view(), 
        // Narrow windows pull back so the same table area stays in frame.
        { cam, up } = orbitCamera(v, narrowPull(this.camera.aspect));
        this.camera.position.set(...cam);
        this.camera.up.set(...up);
        this.camera.fov = v.fov;
        this.camera.lookAt(this.v.set(...v.look));
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
        return moving;
    }
    bindPointer() {
        const c = this.canvas;
        const host = c.parentElement, track = (e, inside = true) => {
            this.pointer = {
                x: e.clientX,
                y: e.clientY,
                inside,
                hot: e.target?.closest?.("[data-hot]")?.dataset.hot ?? null,
            };
            if (this.carry)
                this.dirty = true;
        };
        host.addEventListener("pointermove", (e) => track(e), true);
        host.addEventListener("pointerdown", (e) => track(e), true);
        host.addEventListener("pointerleave", (e) => track(e, false));
        // Letting go over a magnet drops the piece there; the click that follows
        // belongs to the drop and goes no further.
        host.addEventListener("pointerup", (e) => {
            track(e);
            if (!this.grab)
                this.drop();
        }, true);
        host.addEventListener("click", (e) => {
            if (performance.now() > this.swallow)
                return;
            this.swallow = 0;
            e.stopPropagation();
            e.preventDefault();
        }, true);
        c.addEventListener("pointerdown", (e) => {
            if (this.locked)
                return;
            // Over the field the press belongs to the piece, not to the camera.
            if (this.carry && this.overField(e.clientX, e.clientY))
                return;
            this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
            c.setPointerCapture(e.pointerId);
        });
        c.addEventListener("pointermove", (e) => {
            if (!this.drag || this.drag.id !== e.pointerId)
                return;
            this.orbit.yaw = clamp(this.orbit.yaw - (e.clientX - this.drag.x) * 0.004, -1.4, 1.4);
            this.orbit.pitch = clamp(this.orbit.pitch - (e.clientY - this.drag.y) * 0.003, -0.7, 0.7);
            this.drag.x = e.clientX;
            this.drag.y = e.clientY;
            this.dirty = true;
        });
        const end = () => (this.drag = null);
        c.addEventListener("pointerup", end);
        c.addEventListener("pointercancel", end);
        c.addEventListener("dblclick", () => {
            if (this.locked)
                return;
            this.orbit = { yaw: 0, pitch: 0, zoom: 1 };
            this.dirty = true;
        });
        c.addEventListener("wheel", (e) => {
            e.preventDefault();
            if (this.locked)
                return;
            this.orbit.zoom = clamp(this.orbit.zoom * Math.exp(e.deltaY * 0.0011), 0.45, 1.7);
            this.dirty = true;
        }, { passive: false });
        const over = (e, enter) => {
            const el = e.target.closest("[data-hot]"), id = enter && el ? el.dataset.hot : null;
            if (id === this.hover || (!enter && el?.dataset.hot !== this.hover))
                return;
            this.hover = id;
            this.onHover(id);
        };
        // Press a grab hotspot and pull: its piece comes along and can be dropped
        // on a magnet in one gesture.
        this.hotLayer.addEventListener("pointerdown", (e) => {
            const id = e.target.closest("[data-hot]")
                ?.dataset.hot, hot = id ? this.hots.get(id)?.hot : undefined;
            if (!hot?.grab || hot.disabled || e.button > 0)
                return;
            this.grab = { id: hot.id, x: e.clientX, y: e.clientY, moved: false };
            const move = (ev) => {
                const g = this.grab;
                if (!g)
                    return;
                const r = host.getBoundingClientRect();
                track(ev, ev.clientX >= r.left &&
                    ev.clientX <= r.right &&
                    ev.clientY >= r.top &&
                    ev.clientY <= r.bottom);
                if (!g.moved && Math.hypot(ev.clientX - g.x, ev.clientY - g.y) > 10) {
                    g.moved = true;
                    this.onGrab(g.id);
                }
            }, end = (ev) => {
                const g = this.grab;
                this.grab = null;
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", end);
                window.removeEventListener("pointercancel", end);
                if (!g?.moved || ev.type === "pointercancel")
                    return;
                // A drag is never also a click on whatever lies under the release.
                this.swallow = performance.now() + 400;
                this.drop();
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", end);
            window.addEventListener("pointercancel", end);
        });
        this.hotLayer.addEventListener("pointerover", (e) => over(e, true));
        this.hotLayer.addEventListener("pointerout", (e) => over(e, false));
        this.hotLayer.addEventListener("focusin", (e) => over(e, true));
        this.hotLayer.addEventListener("focusout", (e) => over(e, false));
        // The table still turns and zooms when the pointer starts on a hotspot.
        this.hotLayer.addEventListener("wheel", (e) => c.dispatchEvent(new WheelEvent("wheel", e)), { passive: true });
    }
    resize(host) {
        this.width = Math.max(1, host.clientWidth);
        this.height = Math.max(1, host.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.slow > 40 ? 1 : 2));
        this.renderer.setSize(this.width, this.height, false);
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.dirty = true;
    }
    // ---------- overlays ----------
    /** Mirrors clickable table pieces as real buttons clipped to their outline. */
    setHots(list) {
        const keep = new Set(list.map((h) => h.id));
        for (const [id, h] of this.hots)
            if (!keep.has(id)) {
                h.el.remove();
                this.hots.delete(id);
                if (this.hover === id) {
                    this.hover = null;
                    this.onHover(null);
                }
            }
        for (const hot of list) {
            let h = this.hots.get(hot.id);
            if (!h) {
                const el = document.createElement("button");
                el.className = "hot";
                el.dataset.hot = hot.id;
                this.hotLayer.append(el);
                this.hots.set(hot.id, (h = { hot, el }));
            }
            h.hot = hot;
            const el = h.el;
            for (const k of Object.keys(el.dataset))
                if (k !== "hot" && k !== "css")
                    delete el.dataset[k];
            el.dataset.ui = hot.ui;
            for (const [k, v] of Object.entries(hot.data ?? {}))
                el.dataset[k] = String(v);
            el.disabled = !!hot.disabled;
            el.setAttribute("aria-label", hot.label);
        }
        this.dirty = true;
    }
    setLabels(list) {
        const keep = new Set(list.map((l) => l.id));
        for (const [id, l] of this.labels)
            if (!keep.has(id)) {
                l.el.remove();
                this.labels.delete(id);
            }
        for (const label of list) {
            let l = this.labels.get(label.id);
            if (!l) {
                const el = document.createElement("div");
                this.labelLayer.append(el);
                this.labels.set(label.id, (l = { label, el }));
                el.style.visibility = "hidden";
            }
            if (l.el.innerHTML !== label.html)
                l.el.innerHTML = label.html;
            l.el.className = "wlabel " + (label.cls ?? "");
            l.label = label;
        }
        this.dirty = true;
    }
    /** A short-lived label that rises from a table position: "+5 CP". */
    float(x, y, z, html, cls = "") {
        const el = document.createElement("div"), entry = { el, at: [x, y, z] };
        el.className = "wlabel float " + cls;
        el.innerHTML = html;
        el.style.visibility = "hidden";
        this.labelLayer.append(el);
        this.floats.push(entry);
        this.dirty = true;
        setTimeout(() => {
            el.remove();
            this.floats.splice(this.floats.indexOf(entry), 1);
        }, 2200);
    }
    setMarks(list) {
        const keep = new Set(list.map((m) => m.id));
        for (const [id, m] of this.marks)
            if (!keep.has(id)) {
                this.dropMark(m.object);
                this.marks.delete(id);
            }
        for (const mark of list) {
            const sig = JSON.stringify(mark), old = this.marks.get(mark.id);
            if (old?.sig === sig)
                continue;
            if (old)
                this.dropMark(old.object);
            let object;
            if (mark.kind === "shade") {
                const w = mark.w ?? 1, h = mark.h ?? 1;
                const mesh = new THREE.Mesh(this.geometry(`shade:${w}:${h}`, () => {
                    const g = new THREE.PlaneGeometry(w, h);
                    g.rotateX(-Math.PI / 2);
                    return g;
                }), new THREE.MeshBasicMaterial({
                    color: "#10251d",
                    transparent: true,
                    opacity: 0.62,
                    depthWrite: false,
                    depthTest: false,
                    toneMapped: false,
                }));
                mesh.position.set(mark.x ?? 0, mark.y ?? 1, mark.z ?? 0);
                mesh.rotation.y = mark.ry ?? 0;
                mesh.renderOrder = 59;
                object = mesh;
            }
            else if (mark.kind === "ring") {
                const r = mark.r ?? 8.3;
                const mesh = new THREE.Mesh(this.geometry(`ring:${r}`, () => {
                    const w = Math.max(0.2, r * 0.03);
                    const g = new THREE.RingGeometry(r - w, r + w, 72);
                    g.rotateX(-Math.PI / 2);
                    return g;
                }), new THREE.MeshBasicMaterial({
                    color: mark.color ?? "#f4d27a",
                    transparent: true,
                    opacity: 0.95,
                    toneMapped: false,
                    depthWrite: false,
                }));
                mesh.position.set(mark.x ?? 0, mark.y ?? 0.8, mark.z ?? 0);
                mesh.renderOrder = 60;
                object = mesh;
            }
            else {
                const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({
                    color: mark.color ?? "#f4cc65",
                    dashSize: 1,
                    gapSize: 0.6,
                    transparent: true,
                    opacity: 0.9,
                    toneMapped: false,
                }));
                line.frustumCulled = false;
                line.renderOrder = 61;
                object = line;
            }
            this.scene.add(object);
            this.marks.set(mark.id, { mark, object, sig });
        }
        this.dirty = true;
    }
    dropMark(object) {
        this.scene.remove(object);
        const m = object;
        m.material.dispose();
        if (object instanceof THREE.Line)
            m.geometry.dispose();
    }
    /** One expanding ring where something just landed. */
    burst(x, y, z, color = "#f4d27a", r = 6) {
        const g = new THREE.RingGeometry(r - 0.28, r + 0.28, 64);
        g.rotateX(-Math.PI / 2);
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            toneMapped: false,
            depthWrite: false,
        }));
        mesh.position.set(x, y, z);
        mesh.renderOrder = 62;
        this.scene.add(mesh);
        this.bursts.push({ mesh, t: 0 });
        this.dirty = true;
    }
    project(v) {
        v.project(this.camera);
        return {
            x: (v.x + 1) * 0.5 * this.width,
            y: (1 - v.y) * 0.5 * this.height,
            ok: v.z > -1 && v.z < 1,
        };
    }
    layout(time) {
        for (const { hot, el } of this.hots.values()) {
            if (hot.screen) {
                const r = hot.screen, px = (v) => ((v + 1) / 2) * this.width, py = (v) => ((1 - v) / 2) * this.height;
                const css = `display:block;left:${px(r.x0).toFixed(1)}px;top:${py(r.y1).toFixed(1)}px;width:${(px(r.x1) - px(r.x0)).toFixed(1)}px;height:${(py(r.y0) - py(r.y1)).toFixed(1)}px;z-index:${(hot.prio ?? 2) * 20000}`;
                if (el.dataset.css !== css) {
                    el.style.cssText = css;
                    el.dataset.css = css;
                }
                continue;
            }
            const corners = [];
            let centre = null;
            if (hot.piece) {
                const p = this.pieces.get(hot.piece);
                if (p && !p.dying) {
                    const { w, h } = p.spec;
                    for (const [x, z] of [
                        [-w / 2, -h / 2],
                        [w / 2, -h / 2],
                        [w / 2, h / 2],
                        [-w / 2, h / 2],
                    ])
                        corners.push(new THREE.Vector3(x, 0, z).applyMatrix4(p.group.matrixWorld));
                    centre = p.group.position;
                }
            }
            else if (hot.rect) {
                const r = hot.rect, c = Math.cos(r.ry ?? 0), s = Math.sin(r.ry ?? 0);
                for (const [x, z] of [
                    [-r.w / 2, -r.h / 2],
                    [r.w / 2, -r.h / 2],
                    [r.w / 2, r.h / 2],
                    [-r.w / 2, r.h / 2],
                ])
                    corners.push(new THREE.Vector3(r.x + x * c + z * s, r.y, r.z - x * s + z * c));
                centre = new THREE.Vector3(r.x, r.y, r.z);
            }
            if (!centre || !corners.length) {
                el.style.display = "none";
                continue;
            }
            const depth = centre.distanceTo(this.camera.position), pts = corners.map((c) => this.project(c));
            if (pts.some((p) => !p.ok)) {
                el.style.display = "none";
                continue;
            }
            const x0 = Math.min(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y)), x1 = Math.max(...pts.map((p) => p.x)), y1 = Math.max(...pts.map((p) => p.y));
            const css = `display:block;left:${x0.toFixed(1)}px;top:${y0.toFixed(1)}px;width:${(x1 - x0).toFixed(1)}px;height:${(y1 - y0).toFixed(1)}px;z-index:${(hot.prio ?? 2) * 20000 + Math.round(20000 - depth * 20)};clip-path:polygon(${pts.map((p) => `${(p.x - x0).toFixed(1)}px ${(p.y - y0).toFixed(1)}px`).join(",")})`;
            if (el.dataset.css !== css) {
                el.style.cssText = css;
                el.dataset.css = css;
            }
        }
        for (const { label, el } of this.labels.values()) {
            const piece = label.piece ? this.pieces.get(label.piece) : null;
            if (label.piece && (!piece || piece.dying)) {
                el.style.visibility = "hidden";
                continue;
            }
            if (piece)
                this.v
                    .set((label.anchor?.[0] ?? 0) * piece.spec.w, 0, (label.anchor?.[1] ?? 0) * piece.spec.h)
                    .applyMatrix4(piece.group.matrixWorld);
            else
                this.v.set(label.x ?? 0, label.y ?? 0, label.z ?? 0);
            const p = this.project(this.v);
            el.style.visibility = p.ok ? "visible" : "hidden";
            el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
        }
        for (const f of this.floats) {
            const p = this.project(this.v.set(...f.at));
            f.el.style.visibility = p.ok ? "visible" : "hidden";
            f.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
        }
        for (const { mark, object } of this.marks.values()) {
            if (mark.kind === "ring") {
                const m = object.material, follow = mark.piece ? this.pieces.get(mark.piece) : null;
                if (follow)
                    object.position
                        .copy(follow.group.position)
                        .setY(follow.group.position.y + follow.spec.thick / 2 + 0.3);
                object.visible = !mark.piece || !!follow;
                // The ring under the pointer, or the one holding the carried piece,
                // stands out from the others.
                const key = mark.id.startsWith("ring:") ? mark.id.slice(5) : "", hot = !!key && (key === this.hover || key === this.lock);
                if (hot) {
                    m.opacity = 1;
                    object.scale.setScalar(1.1 + 0.03 * Math.sin(time * 0.012));
                }
                else if (mark.pulse) {
                    const k = 0.5 + 0.5 * Math.sin(time * 0.0042);
                    m.opacity = 0.5 + 0.45 * k;
                    object.scale.setScalar(1 + 0.035 * k);
                }
                else {
                    m.opacity = 0.95;
                    object.scale.setScalar(1);
                }
            }
            else if (mark.to) {
                const from = mark.piece
                    ? this.pieces.get(mark.piece)?.group.position
                    : null, a = from ?? new THREE.Vector3(mark.x ?? 0, mark.y ?? 0, mark.z ?? 0), b = new THREE.Vector3(...mark.to), mid = a.clone().lerp(b, 0.5);
                mid.y = Math.max(a.y, b.y) + a.distanceTo(b) * 0.16 + 2;
                const line = object;
                line.geometry.setFromPoints(new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(48));
                line.computeLineDistances();
                line.material.dashSize = 1;
            }
        }
    }
    // ---------- frame ----------
    frame(time) {
        requestAnimationFrame((t) => this.frame(t));
        const elapsed = (time - this.last) / 1000 || 0.016, dt = Math.min(0.1, elapsed), 
        // Weather runs on the wall clock, so slow machines still get a full storm.
        real = Math.min(0.5, elapsed);
        this.last = time;
        if (this.drift && !this.locked) {
            this.orbit.yaw += this.drift * dt;
            this.dirty = true;
        }
        const cameraMoving = this.applyShot(dt), piecesMoving = this.step(dt);
        // Weather eases in and out; drizzle keeps falling during the final turns.
        const want = this.rainTarget;
        if (Math.abs(this.rainLevel - want) > 0.002) {
            this.rainLevel += clamp(want - this.rainLevel, -real * 1.6, real * 1.6);
            this.dirty = true;
        }
        else
            this.rainLevel = want;
        const wet = clamp(this.rainLevel, 0, 2);
        this.rain.visible = wet > 0.01;
        if (this.rain.visible) {
            const pos = this.rain.geometry.attributes
                .position;
            for (let i = 0; i < pos.count; i += 2) {
                let y = pos.getY(i) - real * 95;
                while (y < 0)
                    y += 90;
                pos.setY(i, y);
                pos.setY(i + 1, y - 3.4);
            }
            pos.needsUpdate = true;
            this.rain.material.opacity =
                0.2 + 0.22 * Math.min(wet, 2);
            this.ripple -= real * wet;
            for (let n = 0; this.ripple < 0 && n < 8; n++) {
                this.ripple += 0.1;
                const look = this.shotTo.look;
                this.burst(look[0] + (Math.random() - 0.5) * 130, 0.3, look[2] + (Math.random() - 0.5) * 100, "#cdeee9", 1.2 + Math.random() * 2.2);
            }
            if (this.ripple < 0)
                this.ripple = 0;
        }
        const k = Math.min(1, wet / 2) * 0.85 + Math.min(1, wet) * 0.15;
        this.scene.background.copy(this.sky).lerp(this.storm, k);
        this.scene.fog.color.copy(this.scene.background);
        this.sun.intensity = 1.5 - 0.85 * k;
        this.fill.intensity = 0.5 + 0.3 * k;
        for (const b of [...this.bursts]) {
            b.t += real / 0.75;
            b.mesh.scale.setScalar(0.35 + 1.5 * ease(Math.min(1, b.t)));
            b.mesh.material.opacity = 1 - b.t;
            if (b.t >= 1) {
                this.scene.remove(b.mesh);
                b.mesh.geometry.dispose();
                b.mesh.material.dispose();
                this.bursts.splice(this.bursts.indexOf(b), 1);
            }
        }
        const pulsing = [...this.marks.values()].some((m) => m.mark.pulse) || this.carrying;
        for (const tell of this.told.splice(0))
            tell();
        if (!this.dirty &&
            !cameraMoving &&
            !piecesMoving &&
            !this.rain.visible &&
            !this.bursts.length &&
            !pulsing &&
            !this.drag)
            return;
        this.dirty = false;
        // Camera-held pieces follow the camera even when nothing else moves.
        for (const p of this.pieces.values())
            if (p.pose.cam &&
                p.t >= 1 &&
                !p.dying &&
                !(this.carrying && p.key === this.carry.piece)) {
                p.group.scale.setScalar(this.resolve(p.pose, p.spec, p.group.position, p.group.quaternion));
                this.settle(p);
            }
        this.scene.updateMatrixWorld();
        this.layout(time);
        const start = performance.now();
        this.renderer.render(this.scene, this.camera);
        // Software renderers and weak GPUs drop soft shadows and retina scale.
        const cost = performance.now() - start;
        this.slow = this.slow * 0.9 + cost * 0.1;
        if (this.renderer.shadowMap.enabled &&
            (this.quality === "low" || (this.slow > 45 && this.quality !== "high"))) {
            this.renderer.shadowMap.enabled = false;
            this.sun.castShadow = false;
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this.width, this.height, false);
            this.scene.traverse((o) => {
                const m = o.material;
                if (m && !Array.isArray(m))
                    m.needsUpdate = true;
            });
        }
    }
    /**
     * Where a piece or a table rectangle is on screen right now, in CSS pixels:
     * the box around its projected corners, or null while it is behind the
     * camera or gone. Pieces held up to the camera count too.
     */
    screenBox(t) {
        const corners = [];
        if (t.piece) {
            const p = this.pieces.get(t.piece);
            if (!p || p.dying)
                return null;
            const { w, h } = p.spec;
            for (const [x, z] of [
                [-w / 2, -h / 2],
                [w / 2, -h / 2],
                [w / 2, h / 2],
                [-w / 2, h / 2],
            ])
                corners.push(new THREE.Vector3(x, 0, z).applyMatrix4(p.group.matrixWorld));
        }
        else if (t.rect) {
            const r = t.rect, c = Math.cos(r.ry ?? 0), s = Math.sin(r.ry ?? 0);
            for (const [x, z] of [
                [-r.w / 2, -r.h / 2],
                [r.w / 2, -r.h / 2],
                [r.w / 2, r.h / 2],
                [-r.w / 2, r.h / 2],
            ])
                corners.push(new THREE.Vector3(r.x + x * c + z * s, t.y ?? 0.3, r.z - x * s + z * c));
        }
        if (!corners.length)
            return null;
        const pts = corners.map((c) => this.project(c));
        if (pts.some((p) => !p.ok))
            return null;
        return {
            x0: Math.min(...pts.map((p) => p.x)),
            y0: Math.min(...pts.map((p) => p.y)),
            x1: Math.max(...pts.map((p) => p.x)),
            y1: Math.max(...pts.map((p) => p.y)),
        };
    }
    /** What the pointer is carrying: the piece, whether it follows, and its magnet. */
    carried() {
        return this.carry
            ? { piece: this.carry.piece, following: this.carrying, lock: this.lock }
            : null;
    }
    /** True while textures are still loading or pieces are in flight. */
    busy() {
        return ([...this.pieces.values()].some((p) => p.t < 1 || p.delay > 0) ||
            [...this.textures.values()].some((t) => !t.tex.image) ||
            this.shotT < 1);
    }
}
function rounded(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
}
/** Outline of one to three flat-top hexes in a straight line. */
function hexLine(kind) {
    const R = TILE.r, hh = Math.sqrt(3) * R, top = ((kind - 1) * hh) / 2, bot = -top, s = new THREE.Shape();
    s.moveTo(R, top);
    s.lineTo(R / 2, top + hh / 2);
    s.lineTo(-R / 2, top + hh / 2);
    s.lineTo(-R, top);
    for (let i = 1; i < kind; i++) {
        const c = top - i * hh;
        s.lineTo(-R / 2, c + hh / 2);
        s.lineTo(-R, c);
    }
    s.lineTo(-R / 2, bot - hh / 2);
    s.lineTo(R / 2, bot - hh / 2);
    s.lineTo(R, bot);
    for (let i = kind - 2; i >= 0; i--) {
        const c = top - i * hh;
        s.lineTo(R / 2, c - hh / 2);
        s.lineTo(R, c);
    }
    s.closePath();
    return s;
}
/** A die whose upper face (+y) shows 1; the piece spec rotates the right value up. */
function dieGeometry(size) {
    return new THREE.BoxGeometry(size, size, size);
}
let dieFaces = null;
function dieMaterials() {
    if (dieFaces)
        return dieFaces;
    const pips = {
        1: [[0, 0]],
        2: [
            [-1, -1],
            [1, 1],
        ],
        3: [
            [-1, -1],
            [0, 0],
            [1, 1],
        ],
        4: [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
        ],
        5: [
            [-1, -1],
            [1, -1],
            [0, 0],
            [-1, 1],
            [1, 1],
        ],
        6: [
            [-1, -1],
            [1, -1],
            [-1, 0],
            [1, 0],
            [-1, 1],
            [1, 1],
        ],
    };
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z.
    dieFaces = [2, 5, 1, 6, 3, 4].map((value) => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const g = c.getContext("2d");
        g.fillStyle = "#8a5a2e";
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = "#fffaf0";
        g.beginPath();
        g.roundRect(7, 7, 114, 114, 26);
        g.fill();
        g.fillStyle = "#5f3b1c";
        for (const [x, y] of pips[value]) {
            g.beginPath();
            g.arc(64 + x * 28, 64 + y * 28, 11, 0, Math.PI * 2);
            g.fill();
        }
        const tex = new THREE.CanvasTexture(c);
        tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = 4;
        return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
    });
    return dieFaces;
}
/** Orientation that turns a die's value face upwards. */
function dieTurn(value) {
    const turns = {
        1: [0, 0],
        6: [Math.PI, 0],
        2: [0, Math.PI / 2],
        5: [0, -Math.PI / 2],
        3: [-Math.PI / 2, 0],
        4: [Math.PI / 2, 0],
    };
    const [x, z] = turns[value] ?? [0, 0];
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, z));
}
