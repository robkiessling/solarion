import { getRandomFromArray } from "./helpers";
import { getAdjacentCoords } from "./planet_geometry";
import { getCrossTime, isPassable, STATUSES } from "./planet_map";

/**
 * planet_pathing -- where droids decide what to explore next.
 *
 * Built on the coverage graph from planet_geometry (gameplay adjacency) plus terrain/status from planet_map. The
 * dependency points one way (pathing -> map -> geometry), so planet_map must never import from here.
 *
 * The core idea is the "exploration frontier": exploration can only ever expand into tiles that are (a) still unknown,
 * (b) passable, and (c) adjacent to something already explored. Because every newly-explored tile only opens up its own
 * neighbors, the explored region grows as one contiguous blob and automatically routes around impassable terrain
 * (mountains/ice) -- it never teleports across gaps and never explores behind a barrier it can't reach.
 */

const UNKNOWN = STATUSES.unknown.enum;
const EXPLORED = STATUSES.explored.enum;

// Returns every frontier coord: unknown + passable + adjacent to an explored tile. These are the only tiles
// exploration is allowed to expand into this step.
export function getExplorationFrontier(map) {
    const frontier = [];

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.status !== UNKNOWN) return;
            if (!isPassable(map, [rowIndex, colIndex])) return;

            const touchesExplored = getAdjacentCoords([rowIndex, colIndex])
                .some(([r, c]) => map[r][c].status === EXPLORED);
            if (touchesExplored) frontier.push([rowIndex, colIndex]);
        });
    });

    return frontier;
}

// Picks the next sector to explore: the frontier tile closest to home by GRAPH distance (cached as
// sector.graphDistanceHome), so exploration spreads as a clean ring outward rather than jumping around the perimeter.
// Ties are broken randomly. Returns [undefined, undefined] when nothing is reachable (frontier exhausted).
export function getNextExplorableSector(map) {
    const frontier = getExplorationFrontier(map);
    if (frontier.length === 0) return [undefined, undefined];

    let minDistance = Infinity;
    let closestCoords = [];
    frontier.forEach(coord => {
        const distance = map[coord[0]][coord[1]].graphDistanceHome;
        if (distance < minDistance) {
            minDistance = distance;
            closestCoords = [coord];
        } else if (distance === minDistance) {
            closestCoords.push(coord);
        }
    });

    return getRandomFromArray(closestCoords);
}

// Exploration is complete when there is nothing left to expand into. Note this can happen before every tile is
// explored: impassable barriers (mountains/ice, until researched) seal off whatever sits behind them.
export function isExplorationComplete(map) {
    return getExplorationFrontier(map).length === 0;
}


// =====================================================================================================================
// Pathing
//
// Weighted shortest-path (Dijkstra) over the coverage graph, using each tile's crossTime as the edge cost. Droids only
// ever travel over revealed, passable terrain, so paths route around (and -- once researched -- slowly through)
// barriers automatically.
//
// findPath() is the generic primitive: a route from A to any destination B. The auto-explorer
// (findNearestUnknownTarget) is just one caller of the same machinery, so supporting user-CHOSEN destinations later is
// only a matter of calling findPath() with the chosen coord -- no rework of movement or pathing.
// =====================================================================================================================

// Shortest route from `fromCoord` to a specific destination, as an array of step coords (excludes start, includes
// destination), or null if unreachable. The destination may itself be an as-yet-unrevealed frontier tile -- it's
// reached as the final step from an adjacent traversable tile. This is the entry point a future "send droid to a
// chosen tile" feature would call; the auto-explorer below is just another caller.
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

// Auto-explore target: the nearest reachable unknown+passable tile to `fromCoord` by travel time, skipping any already
// claimed by another droid. Returns { target, path } (path excludes start, ends on target), or null if none reachable.
// Picking nearest-to-the-DROID (not nearest-to-home) is what makes a droid nibble outward contiguously instead of
// jumping around the perimeter.
export function findNearestUnknownTarget(map, fromCoord, { claimed = new Set(), unlocks = {} } = {}) {
    const { dist, prev } = dijkstra(map, fromCoord, unlocks);

    let best = null;
    let bestCost = Infinity;
    Object.keys(dist).forEach(k => {
        const [row, col] = k.split(',').map(Number);
        getAdjacentCoords([row, col]).forEach(neighbor => {
            const sector = map[neighbor[0]][neighbor[1]];
            if (sector.status !== UNKNOWN) return;
            if (!isPassable(map, neighbor, unlocks)) return;
            if (claimed.has(coordKey(neighbor))) return;
            const cost = dist[k] + getCrossTime(sector.terrain, unlocks);
            if (cost < bestCost) {
                bestCost = cost;
                best = { target: neighbor, via: [row, col] };
            }
        });
    });
    if (best === null) return null;

    const viaPath = coordKey(best.via) === coordKey(fromCoord) ? [] : reconstructPath(prev, fromCoord, best.via);
    if (viaPath === null) return null;
    return { target: best.target, path: [...viaPath, best.target] };
}


const coordKey = ([row, col]) => `${row},${col}`;

// A droid may travel over a tile if it is revealed (explored) and currently passable.
function isTraversable(map, coord, unlocks) {
    return map[coord[0]][coord[1]].status === EXPLORED && isPassable(map, coord, unlocks);
}

// Dijkstra from `fromCoord` over all traversable tiles. Returns { dist, prev } keyed by "row,col" (coordKey). The start
// tile is always seeded even if it weren't otherwise traversable.
function dijkstra(map, fromCoord, unlocks) {
    const dist = { [coordKey(fromCoord)]: 0 };
    const prev = {};
    const settled = new Set();
    const queue = [[0, fromCoord]];

    while (queue.length > 0) {
        let minIndex = 0;
        for (let i = 1; i < queue.length; i++) {
            if (queue[i][0] < queue[minIndex][0]) minIndex = i;
        }
        const [distance, coord] = queue.splice(minIndex, 1)[0];
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
                queue.push([newDist, neighbor]);
            }
        });
    }

    return { dist, prev };
}

// Walks the `prev` chain back from `toCoord` to `fromCoord`, returning the coords stepped through (excludes the start,
// includes `toCoord`). Returns null if `toCoord` was never reached.
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
