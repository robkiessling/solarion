import _ from 'lodash';
import AUTHORED_MAP_TEXT from "../../database/planet/map.txt?raw";
import {STATUSES, TERRAINS, VISION_HOPS, type SectorStatus, type SectorStatusDef, type TerrainDef, type TerrainKey} from "../../database/planet/terrain";
import {getAdjacentCoords, getApproxDistance, getGraphDistancesFrom, NUM_PLANET_ROWS, PLANET_COLS} from "./geometry";

/**
 * The planet map: parsing the painted map (database/planet/map.txt) into sectors and answering questions
 * about the result (the powered grid and its halo, passability, line of sight, development areas). Terrain
 * and status records are content in database/planet/terrain.ts; the shaded picture of the map is built by
 * image.ts and drawn by render.ts.
 */

/** One tile on the planet map */
export interface Sector {
    terrain: TerrainKey;
    status: SectorStatus;
    exploreLength?: number;
    /** [row, col]; cached on the sector by map generation so callers iterating a map can address it */
    coord: Coord;
    /** heuristic distance to home (development ordering); Infinity until cacheDistancesToHome runs at generation */
    distanceHome: number;
    /** BFS hop distance to home (exploration ordering); Infinity until cacheDistancesToHome runs at generation */
    graphDistanceHome: number;
    /** authored placement zone letter (a-z) */
    zone?: string;
    /** authored exact-placement point letter (A-Z) */
    point?: string;
    /** authored tunnel system digit */
    tunnel?: string;
    /** poiId of the settlement whose territory covers this tile */
    heldBy?: string | null;
    sectorDividerLeft?: boolean;
    sectorDividerRight?: boolean;
    sectorDividerBottom?: boolean;
}

export type PlanetMap = Sector[][];

/** The set of unlocked crossing capabilities, e.g. { drill: true } */
export type Unlocks = { [capability: string]: boolean };

export { NUM_SECTORS } from "./geometry";

export const HOME_FRACTION = 0.75; // Defining home to be 75% of the way into planet, this way it lines up with 50% on slider

const START_WITH_ADJ_EXPLORED = true;

/**
 * --- The authored map ---
 * The planet is hand-drawn (database/planet/map.txt: NUM_PLANET_ROWS lines of PLANET_COLS chars, an
 * equirectangular grid, so col = (lon + 180) / 3 and row = (90 - lat) / 6). One char per tile:
 *   .      flatland
 *   a-z    flatland in placement zone <letter> (sector.zone): a POI def naming the zone lands on a random tile of it
 *   A-Z    flatland marking one exact spot (sector.point): a POI def naming the point lands on that tile; an
 *          unused point is just flatland
 *   1-9    tunnel mouth; every mouth sharing a digit belongs to one tunnel system (sector.tunnel; mechanics later)
 *   ^      mountain      ~  water (sea)      *  ice      =  shallows (crossable with Amphibious Tracks)
 *   #      home (exactly one; column floor(HOME_FRACTION * PLANET_COLS) keeps the noon/slider math honest)
 * Walls are permanent (mountain, water, ice), so every pocket of land is reachable only through what the
 * drawing leaves open; the load-time check below counts orphaned land so a bad edit shows up in the console.
 * Passage between land masses is by tunnel (the digits); there are no gate tiles, a choke is held by whatever
 * the content pass puts on the point painted there.
 */
/** exploreEverything: a dev skip (src/dev/skips.ts); the map starts fully revealed */
export function generatePlanetMap(exploreEverything = false): PlanetMap {
    return generateAuthoredMap(exploreEverything);
}

export function parseAuthoredMap(text: string): { map: PlanetMap, homeCoord: Coord } {
    const lines = text.replace(/\r/g, '').split('\n').filter(line => line.length > 0);
    if (lines.length !== NUM_PLANET_ROWS) {
        throw new Error(`Authored map has ${lines.length} rows, expected ${NUM_PLANET_ROWS}`);
    }
    let homeCoord: Coord | null = null;
    const map = lines.map((line, rowIndex) => {
        if (line.length !== PLANET_COLS) {
            throw new Error(`Authored map row ${rowIndex} has ${line.length} cols, expected ${PLANET_COLS}`);
        }
        return Array.from(line).map((char, colIndex) => {
            const coord: Coord = [rowIndex, colIndex];
            const flat = () => createSector(TERRAINS.flatland, STATUSES.unknown, coord);
            switch (char) {
                case '.': return flat();
                case '^': return createSector(TERRAINS.mountain, STATUSES.unknown, coord);
                case '~': return createSector(TERRAINS.water, STATUSES.unknown, coord);
                case '=': return createSector(TERRAINS.shallows, STATUSES.unknown, coord);
                case '*': return createSector(TERRAINS.ice, STATUSES.unknown, coord);
                case '#':
                    if (homeCoord) throw new Error(`Authored map has two homes: ${homeCoord} and ${[rowIndex, colIndex]}`);
                    homeCoord = [rowIndex, colIndex];
                    return createSector(TERRAINS.home, STATUSES.explored, coord);
                default:
                    if (char >= 'a' && char <= 'z') { const sector = flat(); sector.zone = char; return sector; }
                    if (char >= 'A' && char <= 'Z') { const sector = flat(); sector.point = char; return sector; }
                    if (char >= '1' && char <= '9') { const sector = flat(); sector.tunnel = char; return sector; }
                    throw new Error(`Authored map: unknown char '${char}' at row ${rowIndex} col ${colIndex}`);
            }
        });
    });
    if (!homeCoord) throw new Error('Authored map has no home (#)');
    return { map, homeCoord };
}

function generateAuthoredMap(exploreEverything: boolean) {
    const { map, homeCoord } = parseAuthoredMap(AUTHORED_MAP_TEXT);

    if (START_WITH_ADJ_EXPLORED) {
        getVisibleCoords(map, homeCoord).forEach(([row, col]) => {
            map[row][col].status = STATUSES.explored.key;
        });
    }
    if (exploreEverything) {
        map.forEach(row => row.forEach(sector => { sector.status = STATUSES.explored.key; }));
    }

    cacheDistancesToHome(map, homeCoord);
    cacheCoords(map);
    warnAboutOrphanedLand(map, homeCoord);
    return map;
}

// Dev aid for the drawing: floods from home over everything a fully-tooled squad could ever cross (tunnel
// mouths sharing a digit adjacent) and reports the flat tiles it can never reach, so a range
// that seals a valley by accident is caught at load instead of by a player. Painted zones and points that
// are cut off are named: content assigned to them would never appear.
function warnAboutOrphanedLand(map: PlanetMap, homeCoord: Coord) {
    const walkable = (sector: Sector) => sector.terrain !== TERRAINS.mountain.key &&
        sector.terrain !== TERRAINS.water.key && sector.terrain !== TERRAINS.ice.key;
    const mouths: Record<string, Coord[]> = {};
    map.forEach(row => row.forEach(sector => {
        if (sector.tunnel) (mouths[sector.tunnel] = mouths[sector.tunnel] || []).push(sector.coord);
    }));
    const seen = new Set([`${homeCoord[0]},${homeCoord[1]}`]);
    let frontier = [homeCoord];
    while (frontier.length > 0) {
        const next: Coord[] = [];
        frontier.forEach(coord => {
            const tunnel = map[coord[0]][coord[1]].tunnel;
            [...getAdjacentCoords(coord), ...(tunnel ? mouths[tunnel] : [])].forEach(([row, col]) => {
                const key = `${row},${col}`;
                if (seen.has(key) || !walkable(map[row][col])) return;
                seen.add(key);
                next.push([row, col]);
            });
        });
        frontier = next;
    }
    let orphaned = 0, total = 0;
    const cutOff = new Set<string>();
    map.forEach((row, rowIndex) => row.forEach((sector, colIndex) => {
        if (!walkable(sector)) return;
        total++;
        if (seen.has(`${rowIndex},${colIndex}`)) return;
        orphaned++;
        if (sector.zone) cutOff.add(`zone ${sector.zone}`);
        if (sector.point) cutOff.add(`point ${sector.point}`);
    }));
    if (orphaned > 0) {
        console.warn(`Authored map: ${orphaned} of ${total} land tiles are unreachable from home (walled off by mountains/water/ice)` +
            (cutOff.size > 0 ? `, including ${[...cutOff].sort().join(', ')}` : ''));
    }
}

function createSector(terrain: TerrainDef, status: SectorStatusDef, coord: Coord): Sector {
    return {
        terrain: terrain.key,
        status: status.key,
        exploreLength: terrain.exploreLength,
        coord,
        distanceHome: Infinity,      // both distances are filled in by cacheDistancesToHome once the map is complete
        graphDistanceHome: Infinity
    }
}

function cacheCoords(map: PlanetMap) {
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            sector.coord = [rowIndex, colIndex];
        })
    })
}

export function getHomeBasePosition(map: PlanetMap): { coord: Coord, rotation: number } {
    let coord: Coord | undefined;

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.terrain === TERRAINS.home.key) {
                coord = [rowIndex, colIndex];
            }
        });
    });

    if (!coord) throw new Error('Planet map has no home base');
    return {
        coord: coord,
        rotation: HOME_FRACTION - 0.25 // the rotation required to center home base.
    };
}

// The powered grid: home base plus replicated land. The squad recharges here, cargo banks here, the survey
// halo radiates from here, and development grows from here. Mid-replication ('developing') tiles are still
// under construction -- not powered until the cast finishes. (They also never exist when development picks
// its next batch: replicate is single-flight and the previous batch completes before the next cast starts.)
export const GRID_TERRAINS = new Set<TerrainKey>([TERRAINS.home.key, TERRAINS.outpost.key, TERRAINS.developed.key]);

export function isOnGrid(map: PlanetMap, coord: Coord): boolean {
    return GRID_TERRAINS.has(map[coord[0]][coord[1]].terrain);
}

/**
 * The grid halo: every tile within `radius` hops of any powered tile, via
 * multi-source BFS on pure topology (terrain is ignored -- the halo is uplink range, not walkability).
 * Scouts only target unknown tiles inside it, and it's drawn as a faint ring so automation's reach is
 * legible at a glance.
 *
 * Returns { halo, ring }: halo is a Set of "row,col" keys (grid tiles included), ring is the subset at
 * exactly `radius` hops (the drawn boundary). Memoized on the map reference: any map change (reveal,
 * development) produces a new array from immutability-helper, so identity is a correct cache key.
 */
let gridHaloCache: { map: PlanetMap, radius: number, result: { halo: Set<string>, ring: Set<string> } } | null = null;
export function getGridHalo(map: PlanetMap, radius: number): { halo: Set<string>, ring: Set<string> } {
    if (gridHaloCache && gridHaloCache.map === map && gridHaloCache.radius === radius) {
        return gridHaloCache.result;
    }

    const halo = new Set<string>();
    const ring = new Set<string>();
    let frontier: Coord[] = [];

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (GRID_TERRAINS.has(sector.terrain)) {
                halo.add(`${rowIndex},${colIndex}`);
                frontier.push([rowIndex, colIndex]);
            }
        });
    });

    for (let distance = 1; distance <= radius && frontier.length > 0; distance++) {
        const nextFrontier: Coord[] = [];
        frontier.forEach(coord => {
            getAdjacentCoords(coord).forEach(([row, col]) => {
                const key = `${row},${col}`;
                if (!halo.has(key)) {
                    halo.add(key);
                    nextFrontier.push([row, col]);
                    if (distance === radius) ring.add(key);
                }
            });
        });
        frontier = nextFrontier;
    }

    const result = { halo, ring };
    gridHaloCache = { map, radius, result };
    return result;
}

// The TERRAINS attributes object for a sector's terrain enum (display char, label, crossTime).
export function getTerrain(terrainKey: TerrainKey): TerrainDef {
    return TERRAINS[terrainKey];
}

// ms to cross one tile of the given terrain, given the set of unlocked crossing upgrades. Returns Infinity when the
// terrain is currently blocked (its crossUpgrade hasn't been researched). `unlocks` is a map like { mountaineering: true }.
export function getCrossTime(terrainKey: TerrainKey, unlocks: Unlocks = {}): number {
    const terrain = TERRAINS[terrainKey];
    if (terrain.crossUpgrade && !unlocks[terrain.crossUpgrade]) { return Infinity; }
    return terrain.crossTime;
}

export function isPassable(map: PlanetMap, coord: Coord | null, unlocks: Unlocks = {}): boolean {
    if (coord === null) { return false; }
    return getCrossTime(map[coord[0]][coord[1]].terrain, unlocks) < Infinity;
}

export function blocksVision(terrainKey: TerrainKey): boolean {
    return !!TERRAINS[terrainKey].blocksVision;
}

/**
 * Everything visible from `coord` within `hops` (excluding `coord` itself). Same flood fill as
 * getCoordsWithinHops, with one rule added: a vision-blocking tile is revealed but never expanded through,
 * so a ridge shows up as a wall and hides the ground behind it. Because sight flows around obstacles the
 * same way movement does, a lone peak only hides the tile directly behind it; a run of them hides an arc.
 * The tile being looked FROM never blocks (standing on a summit shouldn't blind you).
 */
export function getVisibleCoords(map: PlanetMap, coord: Coord, hops: number = VISION_HOPS): Coord[] {
    const visited = new Set([`${coord[0]},${coord[1]}`]);
    let frontier = [coord];
    const result: Coord[] = [];

    for (let step = 0; step < hops && frontier.length > 0; step++) {
        const nextFrontier: Coord[] = [];
        frontier.forEach(current => {
            getAdjacentCoords(current).forEach(neighbor => {
                const key = `${neighbor[0]},${neighbor[1]}`;
                if (visited.has(key)) { return; }
                visited.add(key);
                result.push(neighbor);
                if (!blocksVision(map[neighbor[0]][neighbor[1]].terrain)) { nextFrontier.push(neighbor); }
            });
        });
        frontier = nextFrontier;
    }

    return result;
}

// Scout passability: beyond raw terrain, held ground (sector.heldBy, stamped around settlements) stops the
// dumb remotes. The player-driven squad crosses territory freely.
export function isScoutPassable(map: PlanetMap, coord: Coord | null, unlocks: Unlocks = {}): boolean {
    if (coord === null || !isPassable(map, coord, unlocks)) { return false; }
    return !map[coord[0]][coord[1]].heldBy;
}

function cacheDistancesToHome(map: PlanetMap, homeCoord: Coord) {
    // graphDistanceHome (BFS hops on the coverage graph) is the unbiased metric used to order exploration; distanceHome
    // (the centered-column metric) is kept for development ordering. See planet_geometry for the difference.
    const graphDistances = getGraphDistancesFrom(homeCoord);
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            sector.distanceHome = getApproxDistance(homeCoord, [rowIndex, colIndex]);
            sector.graphDistanceHome = graphDistances[rowIndex][colIndex];
        });
    });
}

/**
 * Returns the coords to develop next. Candidates are explored from the frontier towards `anchorCoord` (if given),
 * otherwise it expands equally in all directions. Will not pass through walls/ice.
 */
export function getNextDevelopmentArea(map: PlanetMap, size: number, anchorCoord: Coord | null): Coord[] {
    const distanceTo = (coord: Coord) => anchorCoord ?
        getApproxDistance(anchorCoord, coord) : map[coord[0]][coord[1]].distanceHome;

    // Held ground isn't developable until its settlement is cleared
    const isCandidate = ([row, col]: Coord) =>
        map[row][col].terrain === TERRAINS.flatland.key &&
        map[row][col].status === STATUSES.explored.key &&
        !map[row][col].heldBy;

    const seen = new Set<string>(); // candidate or chosen already (never re-added)
    const candidates: Coord[] = [];
    const addCandidatesAround = (coord: Coord) => {
        getAdjacentCoords(coord).forEach(neighbor => {
            const key = `${neighbor[0]},${neighbor[1]}`;
            if (!seen.has(key) && isCandidate(neighbor)) {
                seen.add(key);
                candidates.push(neighbor);
            }
        });
    };

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (GRID_TERRAINS.has(sector.terrain)) addCandidatesAround([rowIndex, colIndex]);
        });
    });

    const chosen: Coord[] = [];
    while (chosen.length < size && candidates.length > 0) {
        let bestIndex = 0;
        for (let i = 1; i < candidates.length; i++) {
            if (distanceTo(candidates[i]) < distanceTo(candidates[bestIndex])) bestIndex = i;
        }
        const pick = candidates.splice(bestIndex, 1)[0];
        chosen.push(pick);
        addCandidatesAround(pick); // the blob just grew; its new neighbors join the frontier
    }

    if (chosen.length < size) {
        const leftovers: Coord[] = [];
        map.forEach((row, rowIndex) => {
            row.forEach((sector, colIndex) => {
                const coord: Coord = [rowIndex, colIndex];
                if (!seen.has(`${rowIndex},${colIndex}`) && isCandidate(coord)) leftovers.push(coord);
            });
        });
        _.sortBy(leftovers, distanceTo)
            .slice(0, size - chosen.length)
            .forEach(coord => chosen.push(coord));
    }

    return chosen;
}

export function getCurrentDevelopmentArea(map: PlanetMap): Coord[] {
    const coords: Coord[] = []
    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if (sector.terrain === TERRAINS.developing.key) {
                coords.push([rowIndex, colIndex])
            }
        });
    });
    return coords;
}

export function isMapFullyExplored(map: PlanetMap): boolean {
    return map.every(row => {
        return row.every(sector => {
            return sector.status === STATUSES.explored.key;
        })
    })
}

export function numSectorsMatching(map: PlanetMap, status?: SectorStatus, terrain?: TerrainKey): number {
    let count = 0;

    map.forEach((row, rowIndex) => {
        row.forEach((sector, colIndex) => {
            if ((status === undefined || sector.status === status) && (terrain === undefined || sector.terrain === terrain)) {
                count += 1;
            }
        })
    })

    return count;
}
