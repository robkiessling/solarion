import {NUM_PLANET_ROWS, PLANET_COLS} from "./planet_geometry";
import {getCrossTime, getTerrain, getVisibleCoords, isOnGrid, STATUSES} from "./planet_map";
import {mod} from "./helpers";
import {POI_STATUS} from "./expeditions";
import {advanceBattle, DROID_BASE_STATS, fullDroidHp} from "./battle";
import {EQUIPMENT_DEFS} from "../database/equipment";

/**
 * The player-driven squad that IS act-2 exploration. Owns the
 * pure movement/charge/reveal simulation plus routing, and ticks the live battle sim while fighting; input
 * handling lives in the planet component and redux thunks. The battle itself (per-unit combat) is lib/battle.js.
 *
 * Contact model: every uncleared POI is walkable and resolves on entry -- caches and story sites raise their
 * prompt, a nest starts the fight. Only capability-gated sites are impassable, bumping like a wall until the
 * tool is researched. Assaulting a nest is therefore a real step onto its tile: win and the squad is already
 * through, standing on cleared ground; retreat and it walks back to the tile it came from (fromCoord, carried
 * on the contact event and held in `fighting` for the duration).
 */

export const SQUAD_GLYPH = '@';

// Movement pace. crossTime is seconds-per-tile for scouts; the squad multiplies it down so driving feels
// snappy (flatland 0.5s * 0.8 = 400ms/tile, ~2.5 tiles/sec).
export const SQUAD_SPEED_FACTOR = 0.8;

// Battery model: drains per tile entered while off the powered grid, snaps to full capacity on the
// grid. At zero the squad runs on reserve power: every unit burns hull each tile, so hull is the
// overdraft on range -- overextend far enough and the squad dies in the field (cargo and all). Speed is
// unaffected (the bleed is per tile, so slowness would only stretch the dying in real time, not raise
// the stakes).
// Drain scales with the assigned droids (not the replicated units, so growing the multiplier never shrinks
// range): a bigger team is a shorter-legged team, which is what makes force sizing a real decision.
// The contact beat between stepping onto a nest and the fight being shown: the squad shrinks into the hive
// (planet.jsx draws it), the battle sim holds its opening frame, and the encounter popup waits. Doubles as
// the climb-back-out duration when the fight ends.
export const CONTACT_MS = 400;

export const SQUAD_BATTERY_CAPACITY = 100;
export const SQUAD_DRAIN_PER_DROID = 0.4; // per assigned droid per tile; the default 5-droid team drains 2
export const RESERVE_HP_PER_TILE = 1;     // hull every unit burns per tile on reserve power

// isOnGrid lives in planet_map (the halo shares it); re-exported so squad consumers keep one import site.
export {isOnGrid} from "./planet_map";

// The kind of ground a coord is, as far as the driver feels it: hive territory first (it overrides the
// terrain), then powered grid, then the terrain itself. Zone changes drive the terminal's terrain notes and
// the map frame's tint.
export function squadZone(map, coord) {
    const sector = map[coord[0]][coord[1]];
    if (sector.infestedBy) return 'infested';
    if (isOnGrid(map, coord)) return 'grid';
    return getTerrain(sector.terrain).key;
}

export function squadDrainPerTile(squad) {
    return SQUAD_DRAIN_PER_DROID * (squad.assignedDroids || 5);
}

export function squadBatteryCapacity(squad) {
    return squad.batteryCapacity || SQUAD_BATTERY_CAPACITY;
}

/**
 * The fielded squad's hull as {hp, hpMax}, summed over units. Mid-fight the settlement snapshot
 * (squad.droidHp) is stale, so read the live battle instead: fielded units' current hp plus the wounds
 * the escapees carried out. That way a bar tracks the fight in real time and already sits at the
 * settlement value when it ends.
 */
export function squadHp(squad) {
    const hpMax = squad.squadSize * ((squad.droidStats || DROID_BASE_STATS).hp);
    const battle = squad.fighting && squad.fighting.battle;
    const hp = battle ?
        battle.units.reduce((sum, unit) => sum + (unit.side === 'droid' ? unit.hp : 0), 0) +
            (battle.escapedHp || []).reduce((sum, unitHp) => sum + unitHp, 0) :
        (squad.droidHp || []).reduce((sum, unitHp) => sum + unitHp, 0) || hpMax;
    return { hp, hpMax };
}

/**
 * Replication multiplies the fielded force: `assignedDroids` leave the pool, but the squad's roster is
 * assignedDroids x multiplier effective UNITS (snapshotted at deploy; replicating while deployed doesn't
 * grow a fielded squad). Everything downstream -- battles, wounds (droidHp), losses, the sidebar --
 * deals in units 1:1; whole droids only reappear at disband settlement (droidsRecovered).
 */
export function createSquad(homeCoord, assignedDroids = 1, multiplier = 1, equipment = {}, droidStats = DROID_BASE_STATS,
                            batteryCapacity = SQUAD_BATTERY_CAPACITY) {
    const numUnits = assignedDroids * multiplier;
    return {
        coord: homeCoord,
        path: [],
        moveProgress: 0,
        battery: batteryCapacity,
        batteryCapacity,         // deploy-time snapshot (base + battery upgrades): refit at base, like droidStats
        assignedDroids,          // droids consumed from the pool at deploy; the resource-side contract
        multiplier,              // replication multiplier snapshotted at deploy
        squadSize: numUnits,     // current roster in effective units (shrinks as units die)
        cargo: {},               // loot collected at POIs; banks whenever the squad touches the grid, dies on a wipe
        equipment,               // carried gear charges { itemId: chargesLeft }; spend in battle, reload on the grid
        droidStats,              // effective unit stats (base + upgrades), snapshotted at deploy: refit at base
        droidHp: fullDroidHp(numUnits, droidStats.hp), // per-unit hull; wounds persist in the field, repaired on the grid
        fighting: null           // null | { poiId, battle } -- live per-unit sim (see lib/battle.js)
    };
}

// Disband settlement: surviving units round back to whole droids, to the nearest (losing less than half a
// multiplier's worth of units costs nothing: partial stacks re-replicate at home, the same fiction as
// heals-at-home; unexploitable because nests reset fully between engagements).
export function droidsRecovered(squad) {
    return Math.min(squad.assignedDroids || squad.squadSize,
        Math.round(squad.squadSize / (squad.multiplier || 1)));
}

// The available (discovered, unresolved) POI standing on `coord`, or null.
export function poiAtCoord(pois, coord) {
    return Object.values(pois || {}).find(poi =>
        poi.status === POI_STATUS.available && poi.coord[0] === coord[0] && poi.coord[1] === coord[1]
    ) || null;
}

export function squadCrossMs(map, coord, unlocks) {
    return getCrossTime(map[coord[0]][coord[1]].terrain, unlocks) * 1000 * SQUAD_SPEED_FACTOR;
}

/**
 * Advances the squad one tick: battle sim when fighting (movement is locked), otherwise movement along
 * its path. Per tile entered: line-of-sight reveal (getVisibleCoords, so mountains wall off the view; scouts
 * see less, revealing only their 4 orthogonal neighbors, because a crewed squad has better eyes), battery
 * drain off-grid / snap-to-full on-grid, and contact events. Pure; returns the next squad, the coords newly
 * revealed this tick (still-unknown tiles only), and events for the caller to resolve:
 *   { type: 'battleOver', poiId, result, survivors, bugsRemaining, battle, fromCoord }  (live fight ended;
 *       `battle` is the final field state, kept so the result popup can hold the last frame, see
 *       lib/battle.js; `fromCoord` is where a retreat falls back to)
 *   { type: 'enteredPoi', poiId, fromCoord } (stepped onto an available POI: resolve it. fromCoord is the
 *       tile just left, which a nest assault holds onto so a retreat can walk back out)
 *   { type: 'onGrid' }                     (stepped onto powered ground: deliver any cargo)
 *   { type: 'fieldWiped', unitsLost, multiplier, cargoLost } (reserve-power hull burn killed the last
 *       unit; the returned squad is null and the caller settles the loss)
 */
export function advanceSquad(map, pois, squad, moveAmountMs, unlocks) {
    const events = [];

    if (squad.fighting) {
        // The descent. For CONTACT_MS after stepping in, the battle is held at its opening frame while the
        // map plays the squad dropping into the hive and the popup stays shut, so the player sees the cause
        // before the consequence. A save written before this existed has no counter: treat it as landed.
        const contactMs = squad.fighting.contactMs === undefined ? CONTACT_MS :
            Math.min(squad.fighting.contactMs + moveAmountMs, CONTACT_MS);
        if (contactMs < CONTACT_MS) {
            return { squad: {...squad, fighting: {...squad.fighting, contactMs}}, reveals: [], events };
        }

        const { battle, events: battleEvents } = advanceBattle(squad.fighting.battle, moveAmountMs);
        const over = battleEvents.find(event => event.type === 'battleOver');
        if (!over) {
            return { squad: {...squad, fighting: {...squad.fighting, battle, contactMs}}, reveals: [], events };
        }
        events.push({ ...over, poiId: squad.fighting.poiId, battle, fromCoord: squad.fighting.fromCoord });
        return { squad: {...squad, fighting: null}, reveals: [], events };
    }

    let {coord, path, moveProgress, battery, droidHp, equipment, squadSize} = squad;
    path = path ? path.slice() : [];
    moveProgress = (moveProgress || 0) + moveAmountMs;

    const reveals = new Set();
    const reveal = ([r, c]) => {
        if (map[r][c].status === STATUSES.unknown.enum) reveals.add(`${r},${c}`);
    };

    while (path.length > 0) {
        const next = path[0];
        const tileCrossMs = squadCrossMs(map, next, unlocks);
        if (moveProgress < tileCrossMs) break;
        moveProgress -= tileCrossMs;
        const cameFrom = coord; // reported on contact: a failed assault falls back to the tile it came from
        coord = next;
        path = path.slice(1);

        reveal(coord);
        getVisibleCoords(map, coord).forEach(reveal);

        const zone = squadZone(map, coord);
        if (zone !== squadZone(map, cameFrom)) {
            events.push({ type: 'enteredZone', zone });
        }

        if (isOnGrid(map, coord)) {
            battery = squadBatteryCapacity(squad);
            // Powered ground repairs battle wounds and reloads equipment charges the same way it refills
            // the battery (everyone heals at home, gear reloads at home)
            const maxHp = (squad.droidStats || DROID_BASE_STATS).hp;
            if (droidHp && droidHp.some(hp => hp < maxHp)) {
                droidHp = fullDroidHp(droidHp.length, maxHp);
            }
            if (equipment && Object.entries(equipment).some(([id, n]) => n < EQUIPMENT_DEFS[id].charges)) {
                equipment = Object.fromEntries(
                    Object.keys(equipment).map(id => [id, EQUIPMENT_DEFS[id].charges]));
            }
            events.push({ type: 'onGrid' });
        }
        else if (battery <= 0) {
            // Reserve power: the battery is spent, so the tile is paid in hull instead. Every unit burns
            // RESERVE_HP_PER_TILE (wounded units go dark first); if the last one dies, the squad is lost
            // where it stands and the caller settles the loss (see resolveSquadEvent's fieldWiped).
            droidHp = (droidHp || fullDroidHp(squadSize, (squad.droidStats || DROID_BASE_STATS).hp))
                .map(hp => hp - RESERVE_HP_PER_TILE).filter(hp => hp > 0);
            if (droidHp.length === 0) {
                events.push({ type: 'fieldWiped', unitsLost: squadSize,
                    multiplier: squad.multiplier || 1, cargoLost: squad.cargo });
                return { squad: null, reveals: [...reveals].map(key => key.split(',').map(Number)), events };
            }
            squadSize = droidHp.length;
        }
        else {
            battery = Math.max(0, battery - squadDrainPerTile(squad));
        }

        const poi = poiAtCoord(pois, coord);
        if (poi) {
            // Contact interrupts: stop here and let the caller raise the interaction prompt (any remaining
            // route is abandoned -- the world just got more interesting than the destination)
            events.push({ type: 'enteredPoi', poiId: poi.id, fromCoord: cameFrom });
            path = [];
            break;
        }
    }

    if (path.length === 0) moveProgress = 0;

    return {
        squad: {...squad, coord, path, moveProgress, battery, droidHp, equipment, squadSize},
        reveals: [...reveals].map(key => key.split(',').map(Number)),
        events
    };
}

/**
 * Keyboard step target: pure coordinate arithmetic on the uniform grid. Up/down move one row (null at the
 * poles -- the world doesn't wrap north-south), left/right move one column with east-west wrap. dirVec is a
 * screen-space unit vector (up = [0,-1]); on the uniform grid screen space IS coordinate space, at any camera
 * rotation, which is what makes movement reversible and camera-independent. Ignores passability -- the caller
 * decides whether a blocked target means "reveal the wall" or "bump".
 */
export function stepInDirection(coord, dirVec) {
    const [dx, dy] = dirVec;

    if (dy !== 0) {
        const row = coord[0] + dy;
        if (row < 0 || row >= NUM_PLANET_ROWS) return null;
        return [row, coord[1]];
    }

    return [coord[0], mod(coord[1] + dx, PLANET_COLS)];
}
