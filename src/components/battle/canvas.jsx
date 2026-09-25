import React from 'react';
import {ARENA_H, ARENA_W, FX_TTL_MS} from "../../lib/battle/sim";
import {TERRAIN_CELL_H, TERRAIN_CELL_W} from "../../lib/battle/layouts";
import {HOSTILE_TYPES} from "../../database/battle/units";
import {TERRAIN_PIECES} from "../../database/battle/terrain_art";
import {PLANET_COLORS} from "../../database/planet/colors";

/**
 * The battle arena inside the encounter popup: draws every unit of the live sim at its float position with
 * the look UNIT_LOOKS gives its type (a cached shape sprite, or a text glyph), plus the transient fx markers
 * (hits, deaths, heals, bomb blasts). Pure presentation; the sim is
 * ticked by planetTick and arrives here as the `battle` prop each frame. The arena coordinate space is fixed
 * (ARENA_W x ARENA_H); this component just scales it into however many pixels the popup gives it, which is
 * what lets the popup grow as armies scale.
 */

const DROID_COLOR = PLANET_COLORS.squad;   // friendly cyan, same as the map glyph
const HOSTILE_COLOR = PLANET_COLORS.battle;    // hostile orange, same as the map's fight effect

// Shape painters for UNIT_LOOKS: each returns a function that draws onto a sprite canvas centered at `mid`,
// with `size` the sprite edge in pixels and the side's color already set as both fill and stroke.
// Radii are fractions of the edge.
const dot = (r) => (g, mid, size) => { g.beginPath(); g.arc(mid, mid, size * r, 0, 2 * Math.PI); g.fill(); };
const ring = (r, width = 0.1) => (g, mid, size) => {
    g.lineWidth = Math.max(1, size * width);
    g.beginPath(); g.arc(mid, mid, size * r, 0, 2 * Math.PI); g.stroke();
};
const square = (r) => (g, mid, size) => { const h = size * r; g.fillRect(mid - h, mid - h, 2 * h, 2 * h); };
const hollowSquare = (r, width = 0.12) => (g, mid, size) => {
    g.lineWidth = Math.max(1, size * width);
    const h = size * r; g.strokeRect(mid - h, mid - h, 2 * h, 2 * h);
};
const diamond = (r) => (g, mid, size) => {
    const h = size * r;
    g.beginPath(); g.moveTo(mid, mid - h); g.lineTo(mid + h, mid); g.lineTo(mid, mid + h); g.lineTo(mid - h, mid); g.fill();
};
const triangle = (r) => (g, mid, size) => { // points at the droid side (they come from the left)
    const h = size * r;
    g.beginPath(); g.moveTo(mid - h, mid); g.lineTo(mid + h * 0.8, mid - h); g.lineTo(mid + h * 0.8, mid + h); g.fill();
};
const bullseye = () => (g, mid, size) => { dot(0.14)(g, mid, size); ring(0.32)(g, mid, size); };

// How each unit type draws, one row per row of the stat block (database/battle/units.ts). A `shape` rasterizes
// once per pixel size into a cached sprite (see sprite()); a `glyph` renders as text every frame, for the few
// fixtures worth a bespoke look (and eventually bosses, which can grow into multi-char ASCII art) where the
// per-frame fillText cost doesn't matter. `scale` enlarges a glyph and its hp bar so a fixture reads as a
// fixture, not a trooper. Droids are cyan, everything else the hostile orange (DROID_COLOR / HOSTILE_COLOR).
const UNIT_LOOKS = {
    droid:    { shape: diamond(0.42) },      // half-diagonal sized to touch at the sim's collision contact distance
    defender: { shape: dot(0.34) },
    runner:   { shape: dot(0.22) },          // smaller: quick and slight
    heavy:    { shape: square(0.36) },       // a touch bigger than the dot: bulk
    mounted:  { shape: triangle(0.4) },
    launcher: { shape: hollowSquare(0.28) }, // a shape that keeps its distance
    drone:    { shape: bullseye() },         // a thing that is mostly its payload
    herd:     { shape: ring(0.28) },         // a signature with nothing behind it
    sentry:   { glyph: '◈' },
    shelter:  { glyph: '◉', scale: 1.7 }
};

// Terrain obstacles: weathered stone, deliberately neutral next to the two sides' colors
const TERRAIN_COLOR = 'rgba(164, 152, 128, 0.85)';

// Attack lunge: on each swing the glyph nudges toward its target and springs back (out-and-back half
// sine, same feel as the map's movement bump). Render-side only; sim positions never move.
const LUNGE_MS = 200;
const LUNGE_DIST = 1.4; // arena units at full extension

// Per-unit hp bars, StarCraft style: a grey track above each glyph with a colored fill whose hue
// slides green -> yellow -> orange -> red as hp drops. Sized in arena units so they scale with the popup.
// Above HP_BAR_FORCE_LIMIT total starting units, rank-and-file bars disappear entirely: at army scale no
// individual droid's hull is actionable (the header fractions carry the aggregate), so only units worth
// tracking by name -- elites and bosses -- keep one.
const HP_BAR_FORCE_LIMIT = 60;
const HP_BAR_W = 2.6;       // arena units wide (about a glyph)
const HP_BAR_LIFT = 2.8;    // arena units above the unit's center
const HP_BAR_PX = 2;        // bar thickness in CSS pixels
const HP_TRACK = 'rgba(145, 155, 165, 0.35)';
const hpColor = (fraction) => `hsl(${Math.round(120 * fraction)}, 75%, 48%)`; // 120=green .. 0=red

export default class BattleCanvas extends React.Component {
    constructor(props) {
        super(props);
        this.canvas = React.createRef();
        this.sprites = new Map();
        this.terrainLayer = null;   // cached offscreen render of the battle's obstacles
        this.terrainKey = null;
    }

    // Terrain never moves, so its ASCII pieces rasterize once to an offscreen canvas and get stamped
    // each frame; the cache invalidates on popup resize or when a different battle's terrain arrives.
    // Chars draw at the terrain cell metrics (TERRAIN_CELL_W/H in lib/battle/layouts.ts), so the art sits
    // exactly on the cells the sim blocks.
    terrainSprite(terrain, width, height, scaleX, scaleY) {
        if (!terrain || !terrain.pieces || terrain.pieces.length === 0) return null;
        const key = `${width}x${height}`;
        if (this.terrainLayer && this.terrainKey === key && this.terrainFor === terrain) return this.terrainLayer;
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const g = c.getContext('2d');
        g.font = `${TERRAIN_CELL_H * scaleY}px monospace`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = TERRAIN_COLOR;
        terrain.pieces.forEach(({ art, col, row }) => {
            const lines = TERRAIN_PIECES[art];
            if (!lines) return;
            lines.forEach((line, j) => {
                for (let i = 0; i < line.length; i++) {
                    if (line[i] === ' ') continue;
                    g.fillText(line[i], (col + i + 0.5) * TERRAIN_CELL_W * scaleX, (row + j + 0.5) * TERRAIN_CELL_H * scaleY);
                }
            });
        });
        this.terrainLayer = c;
        this.terrainKey = key;
        this.terrainFor = terrain;
        return c;
    }

    // Pre-rendered marks (unit shapes and fx marks), keyed by kind and pixel size. fillText (and shadowBlur for the overcharge
    // glow) are the expensive raster calls: at replicated-army scale (thousands of units) they froze
    // the tab, while stamping a cached bitmap with drawImage is ~10x cheaper. Each shape rasterizes
    // once per size (sizes only change on popup resize) and lives here for the component's lifetime.
    sprite(kind, size) {
        const key = `${kind}@${size}`;
        const cached = this.sprites.get(key);
        if (cached) return cached;
        // Unit kinds are the stat block's type names; 'droid-glow' is the droid with the overcharge halo baked in
        const glow = kind === 'droid-glow';
        const look = UNIT_LOOKS[glow ? 'droid' : kind];
        const pad = glow ? size : 0; // halo bleeds past the glyph box
        const c = document.createElement('canvas');
        c.width = c.height = size + 2 * pad;
        const g = c.getContext('2d');
        const mid = c.width / 2;
        if (look) {
            const color = kind === 'droid' || glow ? DROID_COLOR : HOSTILE_COLOR;
            g.fillStyle = color;
            g.strokeStyle = color;
            if (glow) { g.shadowColor = DROID_COLOR; g.shadowBlur = size * 0.7; }
            look.shape(g, mid, size);
        }
        else if (kind === 'death') { // ×
            g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            g.lineWidth = Math.max(1, size * 0.1);
            const r = size * 0.28;
            g.beginPath();
            g.moveTo(mid - r, mid - r); g.lineTo(mid + r, mid + r);
            g.moveTo(mid + r, mid - r); g.lineTo(mid - r, mid + r);
            g.stroke();
        }
        else if (kind === 'heal') { // +
            g.strokeStyle = 'rgba(155, 226, 155, 1)';
            g.lineWidth = Math.max(1, size * 0.1);
            const r = size * 0.3;
            g.beginPath();
            g.moveTo(mid - r, mid); g.lineTo(mid + r, mid);
            g.moveTo(mid, mid - r); g.lineTo(mid, mid + r);
            g.stroke();
        }
        else if (kind === 'spawn') { // arrival ring around the fresh hostile
            g.strokeStyle = 'rgba(255, 170, 60, 0.8)';
            g.lineWidth = Math.max(1, size * 0.08);
            g.beginPath();
            g.arc(mid, mid, size * 0.24, 0, 2 * Math.PI);
            g.stroke();
        }
        else { // hit: faint spark
            g.fillStyle = 'rgba(255, 235, 200, 0.5)';
            g.beginPath();
            g.arc(mid, mid, size * 0.1, 0, 2 * Math.PI);
            g.fill();
        }
        this.sprites.set(key, c);
        return c;
    }

    componentDidMount() {
        this.draw();
    }

    componentDidUpdate() {
        this.draw();
    }

    draw() {
        const canvas = this.canvas.current;
        const battle = this.props.battle;
        if (!canvas || !battle) return;

        // Match the canvas backing store to its CSS size (crisp on retina, resilient to popup resizes)
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = Math.round(rect.width * dpr);
        const height = Math.round(rect.height * dpr);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        const ctx = canvas.getContext('2d');
        // Arena dimensions are per battle (bigger armies fight on a bigger field at the same density);
        // the constants are the fallback for battles saved before arena scaling existed.
        const arenaW = battle.arenaW || ARENA_W;
        const arenaH = battle.arenaH || ARENA_H;
        const scaleX = width / arenaW;
        const scaleY = height / arenaH;
        const px = (x) => x * scaleX;
        const py = (y) => y * scaleY;

        ctx.clearRect(0, 0, width, height);

        // Ground: a whisper of grid so the field reads as a place, not empty popup
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(120, 140, 160, 0.07)';
        ctx.lineWidth = 1;
        for (let gx = 10; gx < arenaW; gx += 10) {
            ctx.beginPath();
            ctx.moveTo(px(gx), 0);
            ctx.lineTo(px(gx), height);
            ctx.stroke();
        }

        // Obstacles sit on the ground, under fx and units
        const terrainLayer = this.terrainSprite(battle.terrain, width, height, scaleX, scaleY);
        if (terrainLayer) ctx.drawImage(terrainLayer, 0, 0);

        const fontSize = Math.max(8, py(3.2));
        const markPx = Math.round(fontSize); // sprite edge; quantized so the cache stays small
        ctx.font = `${fontSize}px monospace`; // text path is only used by glyph units (see UNIT_LOOKS)
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Transient fx underneath the units: bomb blast rings, deaths, hits, heals, arrivals. Sprites
        // stamped with globalAlpha fading them out by age (base intensity per kind is baked into the
        // sprite's colors); the bomb ring stays vector since it grows and there's at most one or two.
        const overcharged = battle.buffs.overchargeMs > 0;
        battle.fx.forEach(fx => {
            const age = (battle.elapsedMs - fx.t) / FX_TTL_MS;
            if (age < 0 || age >= 1) return;
            const alpha = 1 - age;
            if (fx.type === 'shot') {
                // A tracer from shooter to target: bright and gone fast (it lives a third of the marker ttl),
                // so a steady rate of fire reads as flashes, not a lingering web of lines
                const life = age * 3;
                if (life >= 1) return;
                ctx.strokeStyle = `rgba(255, 230, 170, ${1 - life})`;
                ctx.lineWidth = Math.max(1, py(0.25));
                ctx.beginPath();
                ctx.moveTo(px(fx.x2), py(fx.y2));
                ctx.lineTo(px(fx.x), py(fx.y));
                ctx.stroke();
            }
            else if (fx.type === 'bomb' || fx.type === 'blast') {
                // An expanding ring: the squad's bomb at its fixed radius in the equipment's warm gold, a hostile
                // splash at its own radius (fx.r) in the hostile orange
                const radius = fx.type === 'bomb' ? 10 : fx.r;
                ctx.strokeStyle = fx.type === 'bomb' ? `rgba(255, 190, 80, ${alpha})` : `rgba(255, 120, 60, ${alpha})`;
                ctx.lineWidth = Math.max(1.5, py(0.5));
                ctx.beginPath();
                ctx.ellipse(px(fx.x), py(fx.y), px(radius) * (0.4 + 0.6 * age), py(radius) * (0.4 + 0.6 * age), 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            else {
                const mark = this.sprite(fx.type, markPx);
                const y = fx.type === 'heal' ? fx.y - age * 2 : fx.y; // heals drift upward as they fade
                ctx.globalAlpha = alpha;
                ctx.drawImage(mark, px(fx.x) - mark.width / 2, py(y) - mark.height / 2);
                ctx.globalAlpha = 1;
            }
        });

        // Units: the type's look (see UNIT_LOOKS) at position (plus any mid-lunge offset) with a thin hp
        // sliver above it. The bar carries the health information, so the marks stay full-strength colors.
        const barH = Math.max(2, Math.round(HP_BAR_PX * dpr));
        const bigFight = battle.startingDroids + battle.startingHostiles > HP_BAR_FORCE_LIMIT;
        battle.units.forEach(unit => {
            const droid = unit.side === 'droid';
            const look = UNIT_LOOKS[unit.type];
            const scale = look.scale || 1;
            let x = unit.x, y = unit.y;
            if (unit.strike) {
                const age = battle.elapsedMs - unit.strike.t;
                if (age >= 0 && age < LUNGE_MS) {
                    const extension = Math.sin((age / LUNGE_MS) * Math.PI) * LUNGE_DIST;
                    x += unit.strike.dx * extension;
                    y += unit.strike.dy * extension;
                }
            }
            if (look.glyph) {
                ctx.fillStyle = droid ? DROID_COLOR : HOSTILE_COLOR;
                if (scale !== 1) ctx.font = `${fontSize * scale}px monospace`;
                ctx.fillText(look.glyph, px(x), py(y));
                if (scale !== 1) ctx.font = `${fontSize}px monospace`;
            }
            else {
                // Overcharged droids swap to the glow sprite (halo baked in: shadowBlur per unit is slow)
                const mark = this.sprite(droid && overcharged ? 'droid-glow' : unit.type, markPx);
                ctx.drawImage(mark, px(x) - mark.width / 2, py(y) - mark.height / 2);
            }

            // Rank-and-file hostiles get no bar: they can't be targeted, so per-hostile hp isn't actionable
            // (the header's fraction tracks them), and hiding them halves the clutter that makes bar
            // ownership ambiguous. Hostiles tougher than a standard defender (elites and bosses) do earn one,
            // at any scale; friendlies show theirs only in small fights (see HP_BAR_FORCE_LIMIT).
            const elite = !droid && unit.maxHp > HOSTILE_TYPES.defender.hp;
            if (elite || (droid && !bigFight)) {
                const fraction = unit.hp / unit.maxHp;
                // A scaled glyph's bar matches it (wider, lifted clear of the bigger mark)
                const barW = px(HP_BAR_W) * scale;
                const barX = px(x) - barW / 2;
                const barY = py(y - (scale !== 1 ? HP_BAR_LIFT + 1 : HP_BAR_LIFT));
                ctx.fillStyle = HP_TRACK;
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = hpColor(fraction);
                ctx.fillRect(barX, barY, barW * fraction, barH);
            }
        });

        // Withdrawal banner: the field edge the droids are running for glows as the way out
        if (battle.phase === 'withdrawing') {
            const gradient = ctx.createLinearGradient(0, 0, px(12), 0);
            gradient.addColorStop(0, 'rgba(32, 217, 255, 0.25)');
            gradient.addColorStop(1, 'rgba(32, 217, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, px(12), height);
        }
    }

    render() {
        return <canvas className="battle-canvas" ref={this.canvas}/>;
    }
}
