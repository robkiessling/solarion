/**
 * Battle openings: where everyone stands when a fight starts (droidOpening, hostileOpening), deterministic
 * and keyed by what a settlement's level declares (`opening`, `spread` in database/planet/pois.ts). The sim
 * (sim.ts) takes the positions and never cares what produced them.
 */
import {FRONT_GAP, hash01, type XY} from "./arena";
import type {BattleSide} from "./sim";
import type {TerrainMarkers} from "./terrain";

/**
 * How a fight opens, as a level declares it (`opening` in database/planet/pois.ts):
 *   marked    the place decides: hostiles form up on the terrain's numbered spawn points and the squad starts
 *             on its `0`. A terrain that marks no points opens like `front`; one with no `0` starts the squad
 *             at the left edge. What a level gets when it names nothing.
 *   front     groups in a line down the hostile side, the squad at the left edge
 *   groups    groups spread over the hostile half, the squad at the left edge
 *   surround  groups in the corners of the whole field, the squad in the middle (an ambush)
 * Naming one of the last three overrules the terrain's points and its `0`.
 */
export type Opening = 'marked' | 'front' | 'groups' | 'surround';

/** How close a group stands around its point: formed up, or caught going about its business */
export type Spread = 'tight' | 'loose';

/** Which side waits, as a level declares it (`waits` in database/planet/pois.ts): it stands where the opening
 * put it and lets the other side come (the squad caught in an ambush, hostiles keeping to their caves). Each of
 * its units holds until an enemy comes close in plain sight or it is hit, then fights like any other (see
 * WAKE_RANGE in sim.ts) and takes others with it: the squad stirs as one, hostiles a group at a time (see
 * spreadAlarm in sim.ts). Unset = both sides go out to meet, except in a fight sprung on the squad and opened
 * `surround` (a camp, an ambush), where the squad waits; `nobody` says both go out to meet there too. */
export type Waits = 'squad' | 'hostiles' | 'nobody';

/** What a hostile does in the opening, read off its stats (never its name): a `source` produces other units and
 * takes the centre of a group, a `post` cannot move but attacks and stands where it has a line of fire, and
 * everything else is the `body` of a group. */
export type SpawnRole = 'body' | 'source' | 'post';

/**
 * The opening: where everyone stands when a fight starts. Pure and deterministic. Hostiles form groups around
 * spawn points (the terrain's own, or the ones a named opening lays out), about GROUP_SIZE to a point, so a bigger
 * garrison brings more points into use; the squad deploys in squadron blocks. Nobody spawns closer than
 * SPAWN_SPACING (just above the collision contact distance). The opening only shapes the first contact
 * (targeting takes over after it), but it decides the geometry: wrap, split, or wall.
 */
const SPAWN_SPACING = 2.6;
const GROUP_SIZE = 40;
// A loose group stands out of line (see groupSlots) and up to twice as far apart: as far as the field has
// room for, which at design density (a full garrison on a field sized to it) is only a little
const LOOSE_SPACING = SPAWN_SPACING * 2;
const LOOSE_FILL = 0.5;          // the share of the hostile half a loose garrison may spread itself over

function frontX(side: BattleSide, arenaW: number) {
    return side === 'droid' ? arenaW / 2 - FRONT_GAP / 2 : arenaW / 2 + FRONT_GAP / 2;
}

// Legion-style blocks: rectangular squadrons of ~24 on a grid with lanes between them. Blocks fill
// vertically first (a 5-droid team is one short column), ranks deepen away from the front.
function squadronLayout(count: number, arenaW: number, arenaH: number, side: BattleSide): XY[] {
    const PER_BLOCK = 24, BLOCK_H = 6, BLOCK_W = 4, LANE = 5;
    const blockHpx = (BLOCK_H - 1) * SPAWN_SPACING, blockWpx = (BLOCK_W - 1) * SPAWN_SPACING;
    const blocks = Math.ceil(count / PER_BLOCK);
    const maxRows = Math.max(1, Math.floor((arenaH - 8 + LANE) / (blockHpx + LANE)));
    const rows = Math.min(maxRows, Math.max(1, Math.round(Math.sqrt(blocks))));
    const totalH = rows * blockHpx + (rows - 1) * LANE;
    const front = frontX(side, arenaW);
    const dir = side === 'droid' ? -1 : 1;
    return Array.from({ length: count }, (_, i) => {
        const b = Math.floor(i / PER_BLOCK);
        const u = i % PER_BLOCK;
        const depthCol = Math.floor(b / rows);  // squadron grid: fills a vertical stack, then deepens
        const row = b % rows;
        return {
            x: front + dir * (Math.floor(u / BLOCK_H) * SPAWN_SPACING + depthCol * (blockWpx + LANE)),
            y: arenaH / 2 - totalH / 2 + row * (blockHpx + LANE) + (u % BLOCK_H) * SPAWN_SPACING
        };
    });
}

/**
 * Where the squad stands. At the left edge by default: it arrives from the side it withdraws to, so a fight
 * opens with an approach across the field (the blocks' near face a body in from the boundary). A surround
 * puts it in the middle (an ambush only reads as one if the droids start encircled), and a terrain that marks
 * a `0` puts it there, unless the level named an opening of its own. Several `0`s split the squad evenly
 * between them (in reading order, so which droids go where is stable), a block of squadrons centred on each.
 */
export function droidOpening(count: number, opening: Opening, markers: TerrainMarkers, arenaW: number, arenaH: number): XY[] {
    if (count === 0) return [];
    const centred = (n: number, at: XY): XY[] => {
        const blocks = squadronLayout(n, arenaW, arenaH, 'droid');
        const meanX = blocks.reduce((sum, p) => sum + p.x, 0) / n;
        const meanY = blocks.reduce((sum, p) => sum + p.y, 0) / n;
        return blocks.map(p => ({ x: p.x + at.x - meanX, y: p.y + at.y - meanY }));
    };
    if (opening === 'marked' && markers.squad.length > 0) {
        const starts = [...markers.squad].sort((a, b) => a.y - b.y || a.x - b.x);
        return starts.flatMap((at, i) => centred(Math.floor(count / starts.length) + (i < count % starts.length ? 1 : 0), at));
    }
    if (opening === 'surround') return centred(count, { x: arenaW / 2, y: arenaH / 2 });
    const blocks = squadronLayout(count, arenaW, arenaH, 'droid');
    const minX = Math.min(...blocks.map(p => p.x));
    return blocks.map(p => ({ x: p.x - minX + SPAWN_SPACING, y: p.y }));
}

// Concentric rings around a center: a group standing on its point. Ring m holds as many units as fit at
// the spacing; per-ring angular offsets stop the radial spokes lining up. A `jitter` salt knocks every slot
// but the centre out of line (a loose group is not drawn up in rings), by as much as the spacing can spare
// with any two neighbours still SPAWN_SPACING apart.
function groupSlots(count: number, cx: number, cy: number, startIndex: number, spacing: number, jitter: number | null): XY[] {
    const positions: { x: number, y: number }[] = [];
    if (count > 0) positions.push({ x: cx, y: cy });
    let ring = 1;
    while (positions.length < count) {
        const radius = ring * spacing;
        const capacity = Math.floor((2 * Math.PI * radius) / spacing);
        const offset = hash01(startIndex + ring) * 2 * Math.PI;
        for (let j = 0; j < capacity && positions.length < count; j++) {
            const angle = offset + (2 * Math.PI * j) / capacity;
            positions.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
        }
        ring++;
    }
    if (jitter === null) return positions;
    const spare = Math.max(0, spacing - SPAWN_SPACING) / (2 * Math.SQRT2);
    return positions.map((p, i) => (i === 0 ? p : {
        x: p.x + (hash01(jitter + i * 2) * 2 - 1) * spare,
        y: p.y + (hash01(jitter + i * 2 + 1) * 2 - 1) * spare
    }));
}

// Exact outer radius of a groupSlots(n) group: mirrors its ring-capacity math, so the spawn points budget
// true extents. (An earlier padded estimate cost midgame fights their groups entirely: group area scales
// with the garrison exactly as arena area scales with the fight, so at design density the fit is genuinely
// tight and every wasted unit of padding matters.)
function groupExtent(n: number, spacing: number) {
    let placed = Math.min(n, 1);
    let ring = 0;
    while (placed < n) {
        ring++;
        placed += Math.floor(2 * Math.PI * ring);
    }
    return ring * spacing;
}

// True when every pair of centers sits at least minSep apart: separated groups need center gaps of both
// extents plus spawn spacing, or their rings spawn overlapped.
function fitsApart(centers: XY[], minSep: number) {
    return centers.every((a, i) => centers.slice(i + 1).every(b => Math.hypot(a.x - b.x, a.y - b.y) >= minSep));
}

// k centers packed into a boxW x boxH space, all pairs at least minSep apart, or null when no
// arrangement manages it. Picks the rows x cols grid whose smallest neighbor gap is largest (matched to
// the box's aspect: a tall half stacks groups, a wide one ranks them), then jitters each center
// deterministically inside its spare separation so the openings stay organic rather than parade-ground.
// An axis without neighbors (single column/row) is free and jitters across its whole span.
function packCenters(k: number, boxW: number, boxH: number, minSep: number, salt: number): [number, number][] | null {
    if (boxW <= 0 || boxH <= 0) return null;
    let cols = 1, rows = k, bestGap = -Infinity;
    for (let c = 1; c <= k; c++) {
        const r = Math.ceil(k / c);
        const gap = Math.min(c > 1 ? boxW / (c - 1) : Infinity, r > 1 ? boxH / (r - 1) : Infinity);
        if (gap > bestGap) { bestGap = gap; cols = c; rows = r; }
    }
    if (bestGap < minSep) return null;
    const gapX = cols > 1 ? boxW / (cols - 1) : 0;
    const gapY = rows > 1 ? boxH / (rows - 1) : 0;
    const jx = cols > 1 ? Math.min((gapX - minSep) / 2, gapX * 0.3) : boxW / 2;
    const jy = rows > 1 ? Math.min((gapY - minSep) / 2, gapY * 0.3) : boxH / 2;
    return Array.from({ length: k }, (_, i): [number, number] => {
        const row = Math.floor(i / cols);
        const inRow = Math.min(k - row * cols, cols); // the last row may be partial (and gets centered)
        const cx = inRow > 1 ? (cols - inRow) * gapX / 2 + (i % cols) * gapX : boxW / 2;
        const cy = rows > 1 ? row * gapY : boxH / 2;
        return [
            Math.min(boxW, Math.max(0, cx + (hash01(salt + i * 2) * 2 - 1) * jx)),
            Math.min(boxH, Math.max(0, cy + (hash01(salt + i * 2 + 1) * 2 - 1) * jy))
        ];
    });
}

// `front`: the points in a line down the hostile side, their near edge on the front line. A line that is
// full starts another behind it; when even that runs out of field the groups get bigger instead (fewer
// points), down to the one group every fight has room for (pulled back inside the arena if it must be).
function frontPoints(wanted: number, grouped: number, spacing: number, arenaW: number, arenaH: number): XY[] {
    for (let k = wanted; k >= 1; k--) {
        const extent = groupExtent(Math.ceil(grouped / k), spacing);
        const gap = 2 * extent + SPAWN_SPACING;
        const span = arenaH - 2 * (extent + 2); // clear of the walls (the spawn clamp sits at 2)
        const perLine = Math.max(1, Math.floor(span / gap) + 1); // centres anywhere in the span, a gap apart
        const lines = Math.ceil(k / perLine);
        const nearest = frontX('hostile', arenaW) + extent;
        const overrun = nearest + (lines - 1) * gap + extent - (arenaW - 2);
        if (overrun > 0 && k > 1) continue;
        return Array.from({ length: k }, (_, i) => {
            const line = Math.floor(i / perLine);
            const inLine = Math.min(perLine, k - line * perLine);
            // A line's groups stand about the middle of the field, as far apart as an even share of its
            // height gives them (never closer than they fit, never so far that the outer ones leave the span)
            const apart = inLine > 1 ? Math.min(span / (inLine - 1), Math.max(gap, arenaH / inLine)) : 0;
            return {
                x: nearest + line * gap - Math.max(0, overrun),
                y: arenaH / 2 + ((i % perLine) - (inLine - 1) / 2) * apart
            };
        });
    }
    return [];
}

// `groups`: the points spread over the hostile half, packed by packCenters. Never fewer than two while two
// fit with clear water between; when they do not, it is a front.
function groupsPoints(wanted: number, grouped: number, spacing: number, arenaW: number, arenaH: number, salt: number): XY[] {
    for (let k = Math.min(grouped, Math.max(2, wanted)); k >= 2; k--) {
        const extent = groupExtent(Math.ceil(grouped / k), spacing);
        const margin = extent + 2;
        const centers = packCenters(k, arenaW / 2 - 2 * margin, arenaH - 2 * margin,
            2 * extent + SPAWN_SPACING, salt + grouped * 31 + k * 7919);
        if (centers) return centers.map(([x, y]) => ({ x: arenaW / 2 + margin + x, y: margin + y }));
    }
    return frontPoints(1, grouped, spacing, arenaW, arenaH);
}

// `surround`: the points in the corners of the WHOLE arena, the field's middle left empty for the prey, so
// first contact comes from every direction at once. Four corners when they fit with clear water, backing
// off to a diagonal pincer, then to a front for fights too big for their field to encircle anything.
function surroundPoints(grouped: number, spacing: number, arenaW: number, arenaH: number): XY[] {
    for (const k of [4, 2]) {
        const extent = groupExtent(Math.ceil(grouped / k), spacing);
        const margin = extent + 2;
        const corners: XY[] = k === 4
            ? [{ x: margin, y: margin }, { x: arenaW - margin, y: margin },
               { x: margin, y: arenaH - margin }, { x: arenaW - margin, y: arenaH - margin }]
            : [{ x: margin, y: margin }, { x: arenaW - margin, y: arenaH - margin }];
        if (fitsApart(corners, 2 * extent + SPAWN_SPACING)) return corners;
    }
    return frontPoints(1, grouped, spacing, arenaW, arenaH);
}

// The spawn points a fight uses. A terrain's own come into use in number order, as many numbers as it takes
// to have a point for every GROUP_SIZE of the garrison (points that share a number open together); a
// named opening lays out as many as the garrison needs.
function spawnPoints(opening: Opening, markers: TerrainMarkers, grouped: number, spacing: number,
                     arenaW: number, arenaH: number, salt: number): XY[] {
    const wanted = Math.max(1, Math.round(grouped / GROUP_SIZE));
    if (opening === 'marked' && markers.points.length > 0) {
        const inOrder = [...markers.points].sort((a, b) => a.n - b.n || a.y - b.y || a.x - b.x);
        const inUse: typeof inOrder = [];
        for (const point of inOrder) {
            if (inUse.length >= wanted && point.n !== inUse[inUse.length - 1].n) break;
            inUse.push(point);
        }
        return inUse.map(({ x, y }) => ({ x, y }));
    }
    if (opening === 'surround') return surroundPoints(grouped, spacing, arenaW, arenaH);
    if (opening === 'groups') return groupsPoints(wanted, grouped, spacing, arenaW, arenaH, salt);
    return frontPoints(wanted, grouped, spacing, arenaW, arenaH);
}

/**
 * Where the hostiles stand: a position for each of `roles`, in order (the roster's). The sources and the
 * bodies are dealt evenly over the spawn points in use and each point's group arranges itself: a source at
 * the centre (dealt one to a point before any point gets a second), the bodies in rings around it. A post
 * stands on one of the terrain's `P` markers (taken in reading order); a post with no marker left stands just
 * outside a group, on the side facing `toward` (the squad).
 */
export function hostileOpening(roles: SpawnRole[], opening: Opening, markers: TerrainMarkers, spread: Spread,
                               toward: XY, arenaW: number, arenaH: number, salt: number): XY[] {
    const grouped = roles.filter(role => role !== 'post').length;
    const room = Math.sqrt((arenaW / 2) * arenaH * LOOSE_FILL / Math.max(1, grouped));
    const spacing = spread === 'loose' ? Math.min(LOOSE_SPACING, Math.max(SPAWN_SPACING, room)) : SPAWN_SPACING;
    const points = spawnPoints(opening, markers, grouped, spacing, arenaW, arenaH, salt);
    const sizes = points.map((_, g) => Math.floor(grouped / points.length) + (g < grouped % points.length ? 1 : 0));
    const slots = points.map(({ x, y }, g) => groupSlots(sizes[g], x, y, g * 1000, spacing, spread === 'loose' ? salt + g * 7919 : null));

    // Slot order: every group's centre, then every group's next slot in, and so on. Sources draw from the front
    // of it (so they sit at centres, one to a group first); bodies fill what is left, group by group.
    const deepest = Math.max(0, ...sizes);
    const sourceOrder: XY[] = [];
    for (let depth = 0; depth < deepest; depth++) slots.forEach(group => { if (depth < group.length) sourceOrder.push(group[depth]); });
    const sources = roles.filter(role => role === 'source').length;
    const taken = new Set(sourceOrder.slice(0, sources));
    const bodyOrder = slots.flat().filter(slot => !taken.has(slot));

    const marked = [...markers.posts].sort((a, b) => a.y - b.y || a.x - b.x);
    let nextSource = 0, nextBody = 0, nextPost = 0;
    return roles.map(role => {
        if (role === 'source') return sourceOrder[nextSource++];
        if (role === 'body') return bodyOrder[nextBody++];
        const post = nextPost++;
        if (post < marked.length) return marked[post];
        // Unmarked: fanned out just beyond a group's edge, around the line from its point to the squad
        const unmarked = post - marked.length, g = unmarked % points.length, turn = Math.floor(unmarked / points.length);
        const facing = Math.atan2(toward.y - points[g].y, toward.x - points[g].x) + Math.ceil(turn / 2) * 0.45 * (turn % 2 ? 1 : -1);
        const reach = groupExtent(sizes[g], spacing) + SPAWN_SPACING * 1.5;
        return { x: points[g].x + Math.cos(facing) * reach, y: points[g].y + Math.sin(facing) * reach };
    });
}
