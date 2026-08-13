import React from 'react';
import {ARENA_H, ARENA_W, BATTLE_PHASES, BUG_TYPES, FX_TTL_MS} from "../lib/battle";
import {PLANET_COLORS} from "../lib/planet_render";

/**
 * The battle arena inside the encounter popup: draws every unit of the live sim as a glyph at its float
 * position, plus the transient fx markers (hits, deaths, heals, bomb blasts). Pure presentation; the sim is
 * ticked by planetTick and arrives here as the `battle` prop each frame. The arena coordinate space is fixed
 * (ARENA_W x ARENA_H); this component just scales it into however many pixels the popup gives it, which is
 * what lets the popup grow as armies scale.
 */

const DROID_GLYPH = '◆';
const BUG_GLYPH = '✳';
const DROID_COLOR = PLANET_COLORS.squad;   // friendly cyan, same as the map glyph
const BUG_COLOR = PLANET_COLORS.battle;    // hostile orange, same as the map's fight effect

// Per-type glyph overrides (future bug variants/bosses get their own look here); side glyph is the fallback
const TYPE_GLYPHS = { droid: DROID_GLYPH, bug: BUG_GLYPH };

// Attack lunge: on each swing the glyph nudges toward its target and springs back (out-and-back half
// sine, same feel as the map's movement bump). Render-side only; sim positions never move.
const LUNGE_MS = 200;
const LUNGE_DIST = 1.4; // arena units at full extension

// Per-unit hp bars, StarCraft style: a grey track above each glyph with a colored fill whose hue
// slides green -> yellow -> orange -> red as hp drops. Sized in arena units so they scale with the popup.
// Above HP_BAR_FORCE_LIMIT total starting units, rank-and-file bars disappear entirely: at army scale no
// individual droid's hull is actionable (the header pips and the sidebar HP bar carry the aggregate), so
// only units worth tracking by name -- elites and bosses -- keep one.
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

        const fontSize = Math.max(8, py(3.2));
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Transient fx underneath the units: bomb blast rings, deaths, hits, heals. Age fades them out.
        const overcharged = battle.buffs.overchargeMs > 0;
        battle.fx.forEach(fx => {
            const age = (battle.elapsedMs - fx.t) / FX_TTL_MS;
            if (age < 0 || age >= 1) return;
            const alpha = 1 - age;
            if (fx.type === 'bomb') {
                ctx.strokeStyle = `rgba(255, 190, 80, ${alpha})`;
                ctx.lineWidth = Math.max(1.5, py(0.5));
                ctx.beginPath();
                ctx.ellipse(px(fx.x), py(fx.y), px(10) * (0.4 + 0.6 * age), py(10) * (0.4 + 0.6 * age), 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            else if (fx.type === 'death') {
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
                ctx.fillText('×', px(fx.x), py(fx.y));
            }
            else if (fx.type === 'heal') {
                ctx.fillStyle = `rgba(155, 226, 155, ${alpha})`;
                ctx.fillText('+', px(fx.x), py(fx.y - age * 2)); // drifts upward as it fades
            }
            else { // hit
                ctx.fillStyle = `rgba(255, 235, 200, ${alpha * 0.5})`;
                ctx.fillText('·', px(fx.x), py(fx.y));
            }
        });

        // Units: glyph at position (plus any mid-lunge offset) with a thin hp sliver above it. The bar
        // carries the health information, so glyphs stay full-strength colors.
        const barH = Math.max(2, Math.round(HP_BAR_PX * dpr));
        const bigFight = battle.startingDroids + battle.startingBugs > HP_BAR_FORCE_LIMIT;
        battle.units.forEach(unit => {
            const droid = unit.side === 'droid';
            let x = unit.x, y = unit.y;
            if (unit.strike) {
                const age = battle.elapsedMs - unit.strike.t;
                if (age >= 0 && age < LUNGE_MS) {
                    const extension = Math.sin((age / LUNGE_MS) * Math.PI) * LUNGE_DIST;
                    x += unit.strike.dx * extension;
                    y += unit.strike.dy * extension;
                }
            }
            ctx.fillStyle = droid ? DROID_COLOR : BUG_COLOR;
            // Overcharged droids glow: a soft halo behind the glyph while the buff runs
            if (droid && overcharged) {
                ctx.shadowColor = DROID_COLOR;
                ctx.shadowBlur = fontSize * 0.7;
            }
            ctx.fillText(TYPE_GLYPHS[unit.type] || (droid ? DROID_GLYPH : BUG_GLYPH), px(x), py(y));
            ctx.shadowBlur = 0;

            // Rank-and-file bugs get no bar: they can't be targeted, so per-bug hp isn't actionable
            // (the header's pips track the swarm), and hiding them halves the clutter that makes bar
            // ownership ambiguous. Hostiles tougher than a standard bug (elites and bosses) do earn one,
            // at any scale; friendlies show theirs only in small fights (see HP_BAR_FORCE_LIMIT).
            const elite = !droid && unit.maxHp > BUG_TYPES.bug.hp;
            if (elite || (droid && !bigFight)) {
                const fraction = unit.hp / unit.maxHp;
                const barW = px(HP_BAR_W);
                const barX = px(x) - barW / 2;
                const barY = py(y - HP_BAR_LIFT);
                ctx.fillStyle = HP_TRACK;
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = hpColor(fraction);
                ctx.fillRect(barX, barY, barW * fraction, barH);
            }
        });

        // Withdrawal banner: the field edge the droids are running for glows as the way out
        if (battle.phase === BATTLE_PHASES.withdrawing) {
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
