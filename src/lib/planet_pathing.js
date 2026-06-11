import { getRandomFromArray } from "./helpers";
import { MinHeap } from "./min_heap";
import { getAdjacentCoords, PLANET_ROW_LENGTHS, WIDEST_PLANET_ROW } from "./planet_geometry";
import { getCrossTime, isPassable, STATUSES } from "./planet_map";

/**
 * planet_pathing.js: where droids decide where to explore and how to get there.
 *
 * One-way dependency on planet_geometry and planet_map; they should never import from here.
 *
 * Exploration model: a droid reveals the tiles around wherever it stands (line-of-sight). So to uncover the map it walks
 * to a "lookout" (an explored, passable tile that still borders an unknown) and standing there reveals that unknown.
 * Droids don't actually step onto unknown tiles; they survey from known ground.
 */

const UNKNOWN = STATUSES.unknown.enum;
const EXPLORED = STATUSES.explored.enum;

// True if `coord` borders at least one still-unknown tile.
function hasUnknownNeighbor(map, coord) {
    return getAdjacentCoords(coord).some(([r, c]) => map[r][c].status === UNKNOWN);
}

/**
 * The "lookout" tiles: explored, passable tiles that still border an unknown. Standing on one reveals that unknown, so
 * these are the tiles worth visiting (one next to an unknown mountain counts too; visiting it reveals the wall).
 */
export function getExplorationFrontier(map, unlocks = {}) {
    const frontier = [];

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.status !== EXPLORED) return;
            if (!isPassable(map, [rowIndex, colIndex], unlocks)) return;
            if (hasUnknownNeighbor(map, [rowIndex, colIndex])) frontier.push([rowIndex, colIndex]);
        });
    });

    return frontier;
}

/**
 * Done when no lookouts remain. Any unknowns left then can't be viewed from reachable ground (mountain interiors, sealed
 * pockets) until a crossing upgrade (via `unlocks`) makes that terrain passable and re-opens the frontier.
 */
export function isExplorationComplete(map, unlocks = {}) {
    return getExplorationFrontier(map, unlocks).length === 0;
}


// =====================================================================================================================
// Pathing:
//
// Weighted shortest paths (Dijkstra) over the coverage graph, edge cost = each tile's crossTime. Droids only
// travel revealed, passable terrain, so paths route around (and, once unlocked, slowly through) barriers for free.
//
// findPath() is the generic primitive; findNearestLookout() is just one caller of the same Dijkstra.
// =====================================================================================================================

/**
 * Shortest route from `fromCoord` to a specific `toCoord`, as step coords (excludes start, includes destination), or
 * null if unreachable. `toCoord` may be an unknown frontier tile; it's reached as the final step off an adjacent
 * traversable tile. TODO This is the primitive a future "send a droid here" feature would call.
 */
export function findPath(map, fromCoord, toCoord, { unlocks = {} } = {}) {
    const { dist, prev } = dijkstra(map, fromCoord, unlocks);
    const toK = coordKey(toCoord);

    // Destination is itself traversable and was reached directly.
    if (dist[toK] !== undefined) {
        return reconstructPath(prev, fromCoord, toCoord);
    }

    // Otherwise reach it as a final step off the cheapest adjacent traversable tile (only if it's passable to enter).
    if (getCrossTime(map[toCoord[0]][toCoord[1]].terrain, unlocks) === Infinity) return null;
    let bestVia = null;
    let bestCost = Infinity;
    getAdjacentCoords(toCoord).forEach(neighbor => {
        const nk = coordKey(neighbor);
        if (dist[nk] !== undefined && dist[nk] < bestCost) {
            bestCost = dist[nk];
            bestVia = neighbor;
        }
    });
    if (bestVia === null) return null;

    const viaPath = coordKey(bestVia) === coordKey(fromCoord) ? [] : reconstructPath(prev, fromCoord, bestVia);
    if (viaPath === null) return null;
    return [...viaPath, toCoord];
}

/**
 * The auto-explorer's pick: the nearest lookout to `fromCoord` (see getExplorationFrontier), reached over explored
 * terrain. Returns { target, path, heading } (path excludes start, ends on the lookout) or null when nothing's left to
 * reveal. Among equidistant lookouts it follows `heading` (random if none) so droids attempt to walk in a straight
 * direction. This means a fresh batch fans out, and it avoids lookouts already claimed by others (falling back to a
 * claimed one only when that's all that's reachable).
 */
export function findNearestLookout(map, fromCoord, { claimed = new Set(), unlocks = {}, heading = null } = {}) {
    // Dijkstra outward, but stop once we can't beat the nearest lookout found. Lookouts sit right at the frontier the
    // droid just revealed, so in the common case this only explores a tiny local radius (not the whole explored map).
    const startKey = coordKey(fromCoord);
    const dist = { [startKey]: 0 };
    const prev = {};
    const settled = new Set();
    const heap = new MinHeap();
    heap.push(0, fromCoord);

    const candidates = [];
    let minCost = Infinity;
    // Nearest already-claimed lookout, used only if no unclaimed one is reachable (sparse end-game): head there anyway,
    // beating the faraway claimer, rather than sit idle.
    let claimedFallback = null;
    let claimedFallbackCost = Infinity;

    while (heap.size > 0) {
        const { priority: distance, value: coord } = heap.pop();
        if (distance > minCost) break; // nothing reachable from here can tie/beat the nearest unclaimed lookout found
        const k = coordKey(coord);
        if (settled.has(k)) continue;
        settled.add(k);

        // This tile is a lookout if it borders an unknown. Prefer unclaimed; remember the nearest claimed as a fallback.
        if (k !== startKey && hasUnknownNeighbor(map, coord)) {
            if (!claimed.has(k)) {
                candidates.push({ target: coord, cost: distance });
                if (distance < minCost) minCost = distance;
            } else if (distance < claimedFallbackCost) {
                claimedFallbackCost = distance;
                claimedFallback = coord;
            }
        }

        getAdjacentCoords(coord).forEach(neighbor => {
            if (!isTraversable(map, neighbor, unlocks)) return; // only travel over explored, passable terrain
            const newDist = distance + getCrossTime(map[neighbor[0]][neighbor[1]].terrain, unlocks);
            const nk = coordKey(neighbor);
            if (newDist < (dist[nk] ?? Infinity)) {
                dist[nk] = newDist;
                prev[nk] = coord;
                heap.push(newDist, neighbor);
            }
        });
    }

    let chosenTarget;
    if (candidates.length > 0) {
        const nearest = candidates.filter(c => c.cost <= minCost + 1e-9);
        chosenTarget = pickByHeading(nearest, fromCoord, heading).target;
    } else if (claimedFallback !== null) {
        chosenTarget = claimedFallback;
    } else {
        return null;
    }

    const path = reconstructPath(prev, fromCoord, chosenTarget);
    if (path === null) return null;
    return { target: chosenTarget, path, heading: bearing(fromCoord, chosenTarget) };
}


const coordKey = ([row, col]) => `${row},${col}`;

// A droid may travel over a tile if it is revealed (explored) and currently passable.
function isTraversable(map, coord, unlocks) {
    return map[coord[0]][coord[1]].status === EXPLORED && isPassable(map, coord, unlocks);
}

/**
 * Dijkstra from `fromCoord` over all traversable tiles, using a binary min-heap (min_heap.js) so it runs in O(E log V).
 * Returns { dist, prev } keyed by "row,col" (coordKey). The start tile is always seeded even if not otherwise traversable.
 */
function dijkstra(map, fromCoord, unlocks) {
    const dist = { [coordKey(fromCoord)]: 0 };
    const prev = {};
    const settled = new Set();
    const heap = new MinHeap();
    heap.push(0, fromCoord);

    while (heap.size > 0) {
        const { priority: distance, value: coord } = heap.pop();
        const k = coordKey(coord);
        if (settled.has(k)) continue;
        settled.add(k);

        getAdjacentCoords(coord).forEach(neighbor => {
            if (!isTraversable(map, neighbor, unlocks)) return;
            const newDist = distance + getCrossTime(map[neighbor[0]][neighbor[1]].terrain, unlocks);
            const nk = coordKey(neighbor);
            if (newDist < (dist[nk] ?? Infinity)) {
                dist[nk] = newDist;
                prev[nk] = coord;
                heap.push(newDist, neighbor);
            }
        });
    }

    return { dist, prev };
}

/**
 * Walks the `prev` chain back from `toCoord` to `fromCoord`, returning the coords stepped through (excludes the start,
 * includes `toCoord`). Returns null if `toCoord` was never reached.
 */
function reconstructPath(prev, fromCoord, toCoord) {
    const fromK = coordKey(fromCoord);
    const path = [];
    let current = toCoord;
    while (coordKey(current) !== fromK) {
        path.unshift(current);
        current = prev[coordKey(current)];
        if (current === undefined) return null;
    }
    return path;
}

/**
 * Of several equidistant candidates, pick the one whose direction best matches `heading` (dot of unit vectors). With no
 * heading (a just-deployed droid), pick randomly so a batch spreads out instead of all charging the same way.
 */
function pickByHeading(candidates, fromCoord, heading) {
    if (candidates.length === 1) return candidates[0];
    if (!heading || (heading[0] === 0 && heading[1] === 0)) return getRandomFromArray(candidates);

    const headingMag = Math.hypot(heading[0], heading[1]) || 1;
    let best = null;
    let bestScore = -Infinity;
    candidates.forEach(candidate => {
        const b = bearing(fromCoord, candidate.target);
        const bMag = Math.hypot(b[0], b[1]) || 1;
        const score = (b[0] * heading[0] + b[1] * heading[1]) / (bMag * headingMag);
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    });
    return best;
}

/**
 * Direction from one coord to another in "centered column" space, so a heading reads as roughly straight on the
 * rendered globe. Column wrap is ignored (this is only ever used for nearby targets).
 */
function bearing(fromCoord, toCoord) {
    const centeredCol = (row, col) => col + (WIDEST_PLANET_ROW - PLANET_ROW_LENGTHS[row]) / 2;
    return [
        toCoord[0] - fromCoord[0],
        centeredCol(toCoord[0], toCoord[1]) - centeredCol(fromCoord[0], fromCoord[1]),
    ];
}
