import update from 'immutability-helper';
import {getBatteryCapacity, getDroidStats, getReplicationMultiplier, ownedEquipment, recalculateState, withRecalculation} from "../reducer";
import {getVisibleCoords, isPassable} from "../../lib/planet/map";
import {STATUSES, TERRAINS, TERRAIN_BLURBS, TERRAIN_BLURB_REPEAT_MS, type SquadZone} from "../../database/planet/terrain";
import {getApproxDistance, getCoordsWithinHops} from "../../lib/planet/geometry";
import {typedEntries} from "../../lib/helpers";
import {formatResourceList, isGarrisoned, levelPayout, poiLevels, resultBehaviorFor, type Poi} from "../../lib/planet/pois";
import {applyEquipment, createBattle, fullDroidHp, startWithdrawal, type Battle} from "../../lib/battle/sim";
import {advanceSquad, createSquad, droidsRecovered, isOnGrid, restoredOnGrid, squadBatteryCapacity, squadDrainPerTile, type Squad, type SquadEvent} from "../../lib/planet/squad";
import {logInline} from "./log";
import {zoneColor} from "../../database/planet/colors";
import {CONTACT_MS} from "../../database/squad/tuning";
import {CAPABILITY_LABELS, type Capability, type PoiReward} from "../../database/planet/poi_types";
import type {StoryId} from "../../database/planet/story_sites";
import {TELEMETRY, unitNoun} from "../../database/planet/telemetry";
import {DROID_BASE_STATS, type DroidStats} from "../../database/battle/units";
import type {EquipmentCharges, EquipmentId} from "../../database/squad/equipment";
import {addRevealUpdates, setRotationMode, unlockTerrain, type PlanetState} from "./planet";

/**
 * The driven squad: its slice of the planet state (planet.squad, planet.prompt, the POIs it resolves), the
 * actions and reducer cases that change it, and the thunks the planet component and the encounter popup
 * dispatch (deploy, drive, contact, the encounter flow, the fight). The planet module owns the state shape
 * and the map, scouts and development; its reducer hands every squad action here, and its tick calls
 * advanceSquadTick before the scouts run.
 */

/**
 * What the encounter popup narrates in its result phase. Fight outcomes carry the roster numbers and the final
 * battle frame; site outcomes (caches, story sites) carry what was found. Display strings are composed at
 * render time so the stored shape stays serializable.
 */
export interface EncounterResult {
    wiped?: boolean;
    losses?: number;
    squadSize?: number;
    multiplier?: number;
    landCredit?: number;
    cargoLost?: ResourceAmounts | null;
    finalBattle?: Battle;
    storyId?: StoryId | null;
    capability?: Capability | null;
    loaded?: ResourceAmounts | null;
    /** field event answers: battery gained or spent, units added to the roster */
    battery?: number;
    unitsGained?: number;
    /** fights in a multi-level settlement: the level just won (0 = surface), and the site's level count when it is known
     * (announced up front, or learned by reaching the bottom) */
    level?: number;
    levelsTotal?: number | null;
    /** set while the site has more beneath: the result phase becomes the descend-or-withdraw choice */
    nextLevel?: number;
}

export interface EncounterPrompt {
    poiId: string;
    /** offer: a site's take-it choice; approach: a garrisoned site's card before the fight; result: what happened */
    phase: 'offer' | 'approach' | 'result';
    result?: EncounterResult | null;
    /** approach, and between a settlement's levels: the tile the squad entered from, where leaving walks back to */
    fromCoord?: Coord;
    /** approach on a concealed site: elapsed game time it was sprung; the card holds for the contact beat while
     * the map plays the squad's glyph blinking on the tile */
    sprungAt?: number;
}

/** planet.overallStatus: the state of scout exploration of the map */
// Terrain notes: elapsed game time each zone was last noted (session-only; not worth persisting)
const lastBlurbAt: Partial<Record<SquadZone, number>> = {};

// Actions
export const SQUAD_ASSIGN_DROID = 'planet/SQUAD_ASSIGN_DROID' as const;
export const SQUAD_REMOVE_DROID = 'planet/SQUAD_REMOVE_DROID' as const;
export const DEPLOY_SQUAD = 'planet/DEPLOY_SQUAD' as const;
export const DISBAND_SQUAD = 'planet/DISBAND_SQUAD' as const;
export const SQUAD_SET_PATH = 'planet/SQUAD_SET_PATH' as const;
export const SQUAD_FACE = 'planet/SQUAD_FACE' as const;
export const ADVANCE_SQUAD = 'planet/ADVANCE_SQUAD' as const;
export const SQUAD_START_FIGHT = 'planet/SQUAD_START_FIGHT' as const;
export const SQUAD_FIGHT_WON = 'planet/SQUAD_FIGHT_WON' as const;
export const SQUAD_LEVEL_WON = 'planet/SQUAD_LEVEL_WON' as const;
export const SQUAD_WIPED = 'planet/SQUAD_WIPED' as const;
export const SQUAD_RETREATED = 'planet/SQUAD_RETREATED' as const;
export const SQUAD_RETREAT_ORDERED = 'planet/SQUAD_RETREAT_ORDERED' as const;
export const SQUAD_USE_EQUIPMENT = 'planet/SQUAD_USE_EQUIPMENT' as const;
export const SQUAD_PROMPT = 'planet/SQUAD_PROMPT' as const;
export const SQUAD_LEAVE_PROMPT = 'planet/SQUAD_LEAVE_PROMPT' as const;
export const SQUAD_RESOLVE_POI = 'planet/SQUAD_RESOLVE_POI' as const;
export const REVEAL_POI = 'planet/REVEAL_POI' as const;
export const SQUAD_CROSS_TUNNEL = 'planet/SQUAD_CROSS_TUNNEL' as const;
export const SQUAD_DELIVER_CARGO = 'planet/SQUAD_DELIVER_CARGO' as const;

export type SquadAction =
    { type: typeof SQUAD_ASSIGN_DROID; payload: { amount: number } }
    | { type: typeof SQUAD_REMOVE_DROID; payload: { amount: number } }
    | { type: typeof DEPLOY_SQUAD; payload: { assignedDroids: number; multiplier: number; equipment: EquipmentCharges;
        droidStats: DroidStats; batteryCapacity: number } }
    | { type: typeof DISBAND_SQUAD; payload: { droidsReturned: number; cargo: ResourceAmounts } }
    | { type: typeof SQUAD_SET_PATH; payload: { path: Coord[] } }
    | { type: typeof SQUAD_FACE; payload: { facing: [number, number] } }
    | { type: typeof ADVANCE_SQUAD; payload: { squad: Squad | null; reveals: Coord[]; revealedFlatland: number } }
    | { type: typeof SQUAD_START_FIGHT; payload: { poiId: string; fromCoord: Coord; battle: Battle; level: number } }
    | { type: typeof SQUAD_FIGHT_WON; payload: { poiId: string; survivors: number; droidHp: number[]; reward: PoiReward;
        landCredit: number; result: EncounterResult } }
    /** a level of a multi-level settlement fell with more beneath it: the site stands, the popup offers the descent */
    | { type: typeof SQUAD_LEVEL_WON; payload: { poiId: string; level: number; survivors: number; droidHp: number[];
        reward: PoiReward; fromCoord?: Coord; result: EncounterResult } }
    | { type: typeof SQUAD_WIPED; payload: { poiId: string; result: EncounterResult } }
    | { type: typeof SQUAD_RETREATED; payload: { poiId: string; survivors: number; droidHp: number[] } }
    | { type: typeof SQUAD_RETREAT_ORDERED }
    | { type: typeof SQUAD_USE_EQUIPMENT; payload: { itemId: EquipmentId } }
    | { type: typeof SQUAD_PROMPT; payload: { poiId: string; phase?: 'offer' | 'approach'; fromCoord?: Coord; sprungAt?: number } }
    | { type: typeof SQUAD_LEAVE_PROMPT }
    /** battery is a delta on the squad (clamped to capacity); units join the roster at full hull */
    | { type: typeof SQUAD_RESOLVE_POI; payload: { poiId: string; reward: PoiReward; result: EncounterResult | null;
        battery?: number; units?: number } }
    /** a concealed POI found (stepped on, or traced by a signal): it shows from here on, its tile marked */
    | { type: typeof REVEAL_POI; payload: { poiId: string } }
    /** an open tunnel crossed: the squad reappears at the far mouth, the battery lighter by `cost` */
    | { type: typeof SQUAD_CROSS_TUNNEL; payload: { poiId: string; exitCoord: Coord; cost: number } }
    | { type: typeof SQUAD_DELIVER_CARGO; payload: { cargo: ResourceAmounts } };

// Reducer: the squad's cases of the planet reducer (called from its default branch)
export function squadReducer(state: PlanetState, action: GameAction): PlanetState {
    let updates: Record<string, any>;

    switch (action.type) {
        case SQUAD_ASSIGN_DROID:
            return update(state, {
                squadDroidData: { numDroidsAssigned: { $apply: (x: number) => x + action.payload.amount } }
            });
        case SQUAD_REMOVE_DROID:
            return update(state, {
                squadDroidData: { numDroidsAssigned: { $apply: (x: number) => x - action.payload.amount } }
            });
        case DEPLOY_SQUAD:
            if (!state.homeCoord) return state; // no map generated yet
            return update(state, {
                squadDroidData: { numDroidsAssigned: { $set: 0 } }, // the team is on the squad now
                squad: { $set: createSquad(state.homeCoord, action.payload.assignedDroids, action.payload.multiplier,
                    action.payload.equipment, action.payload.droidStats, action.payload.batteryCapacity) }
            });
        case DISBAND_SQUAD:
            return update(state, {
                squadDroidData: { numDroidsAssigned: { $set: action.payload.droidsReturned } },
                squad: { $set: null },
                prompt: { $set: null },
                squadsReturned: { $set: (state.squadsReturned || 0) + 1 }
            });
        case SQUAD_FACE:
            // The way the driver is looking (screen-space [dx, dy]); drives the Expedition panel's vista.
            // Set on every attempted step, so bumping into a ridge turns the team to face it.
            if (!state.squad) return state;
            return update(state, { squad: { facing: { $set: action.payload.facing } } });
        case SQUAD_SET_PATH:
            // Safety net: any new path clears a lingering prompt (the input layer blocks movement while one
            // is open, so this shouldn't fire in practice)
            return update(state, {
                squad: {
                    path: { $set: action.payload.path },
                    moveProgress: { $set: 0 }
                },
                prompt: { $set: null }
            });
        case SQUAD_START_FIGHT:
            // Standing on the settlement: the live battle sim starts NOW (see lib/battle/sim.ts) and plays out in the
            // encounter popup. Movement locks until it resolves. Watching the field reveals the true strength.
            // fromCoord rides along so a retreat can fall back to the tile the squad came in from.
            return update(state, {
                squad: {
                    path: { $set: [] },
                    moveProgress: { $set: 0 },
                    // The contact beat (the squad dropping into the settlement on the map) only plays for the surface
                    // fight of a site the squad chose to enter; a descent starts its battle at once, the squad is
                    // already inside, and a concealed site (a camp, an ambush) had its beat before the approach card
                    // (the glyph blinking where it was sprung), so its fight opens the moment the card is answered.
                    fighting: { $set: { poiId: action.payload.poiId, battle: action.payload.battle,
                        fromCoord: action.payload.fromCoord, level: action.payload.level,
                        contactMs: action.payload.level > 0 || state.pois[action.payload.poiId]?.concealed ? CONTACT_MS : 0 } }
                },
                pois: { [action.payload.poiId]: { difficultyKnown: { $set: true } } },
                prompt: { $set: null }
            });
        case SQUAD_PROMPT:
            // Standing on a cache/story tile (offer) or a garrisoned site (approach): movement locks until the
            // player answers
            return update(state, {
                squad: {
                    path: { $set: [] },
                    moveProgress: { $set: 0 }
                },
                prompt: { $set: { poiId: action.payload.poiId, phase: action.payload.phase || 'offer',
                    ...(action.payload.fromCoord ? { fromCoord: action.payload.fromCoord } : {}),
                    ...(action.payload.sprungAt != null ? { sprungAt: action.payload.sprungAt } : {}) } }
            });
        case SQUAD_LEAVE_PROMPT:
            return update(state, {
                prompt: { $set: null }
            });
        case SQUAD_FIGHT_WON: {
            // The battle's outcome shows in the encounter popup's result phase (losses, reclaimed land, loot)
            const won = state.pois[action.payload.poiId];
            updates = {
                pois: { [action.payload.poiId]: { status: { $set: 'cleared' } } },
                squad: {
                    squadSize: { $set: action.payload.survivors },
                    droidHp: { $set: action.payload.droidHp },
                    cargo: { $apply: (cargo: ResourceAmounts) => mergeCargo(cargo, action.payload.reward) }
                },
                prompt: { $set: { poiId: action.payload.poiId, phase: 'result', result: action.payload.result } },
                battlesFought: { $set: state.battlesFought + 1 }
            };

            // The settlement is dead: its territory stamp retracts (the land becomes sweepable and developable
            // again, so any 'finished' exploration status is cleared too)
            const settlement = state.pois[action.payload.poiId];
            if (settlement && settlement.territoryRadius != null) {
                updates.map = {};
                [settlement.coord, ...getCoordsWithinHops(settlement.coord, settlement.territoryRadius)].forEach(([r, c]) => {
                    if (state.map[r][c].heldBy === action.payload.poiId) {
                        if (updates.map[r] === undefined) updates.map[r] = {};
                        updates.map[r][c] = { heldBy: { $set: null } };
                    }
                });
                updates.overallStatus = { $set: 'inProgress' };
            }

            // Its camps go with it: whoever was still out on the held ground scatters (no fight, no loot),
            // so nothing is left standing on land that is about to be developed
            Object.values(state.pois).forEach(poi => {
                if (poi.parentId === action.payload.poiId && poi.status !== 'cleared') {
                    updates.pois[poi.id] = { status: { $set: 'cleared' } };
                }
            });

            // A network site secured: its tile becomes an outpost, powered ground of the player's own (see
            // TERRAINS.outpost). The cleared marker goes; the terrain carries the glyph from here on.
            if (won && won.type === 'settlement' && won.site != null) {
                updates.map = updates.map || {};
                updates.map[won.coord[0]] = updates.map[won.coord[0]] || {};
                updates.map[won.coord[0]][won.coord[1]] = { ...(updates.map[won.coord[0]][won.coord[1]] || {}),
                    terrain: { $set: TERRAINS.outpost.key } };
            }

            // A tunnel fought through: the squad comes out the far mouth, and both mouths stay on the map as
            // an open passage (never 'cleared', which would hide them) offering the crossing from now on
            if (won && won.type === 'tunnel') {
                updates.pois[won.id] = { open: { $set: true } };
                Object.values(state.pois).forEach(poi => {
                    if (poi.type === 'tunnel' && poi.tunnel === won.tunnel) updates.pois[poi.id] = { open: { $set: true } };
                });
                if (won.exitCoord) updates.squad.coord = { $set: won.exitCoord };
            }

            return update(state, updates);
        }
        case SQUAD_LEVEL_WON: {
            // A level fell but the site has more beneath it: loot loads, wounds carry, and the popup holds on
            // the descend-or-withdraw choice. The settlement stays 'available' (it only falls with its last level);
            // the win is counted against the level so a later assault finds it poorer (see levelPayout).
            const { poiId, level } = action.payload;
            return update(state, {
                pois: { [poiId]: { levels: { [level]: { timesCleared: { $apply: (times: number) => times + 1 } } } } },
                squad: {
                    squadSize: { $set: action.payload.survivors },
                    droidHp: { $set: action.payload.droidHp },
                    cargo: { $apply: (cargo: ResourceAmounts) => mergeCargo(cargo, action.payload.reward) }
                },
                prompt: { $set: { poiId, phase: 'result', result: action.payload.result,
                    fromCoord: action.payload.fromCoord } },
                battlesFought: { $set: state.battlesFought + 1 }
            });
        }
        case SQUAD_WIPED:
            // Failed assault: squad and cargo are gone. The ending narrates in the popup
            // (planet-level prompt, so it survives the squad's deletion). The settlement resets to full
            // strength (each side heals at home), so the next assault must be decisive too.
            return update(state, {
                squad: { $set: null },
                prompt: { $set: { poiId: action.payload.poiId, phase: 'result', result: action.payload.result } },
                battlesFought: { $set: state.battlesFought + 1 }
            });
        case SQUAD_RETREATED:
            // Withdrawal complete: the escapees keep driving (no popup to dismiss mid-flight), carrying
            // their wounds; the settlement restores itself to full strength behind them.
            return update(state, {
                squad: {
                    squadSize: { $set: action.payload.survivors },
                    droidHp: { $set: action.payload.droidHp }
                },
                battlesFought: { $set: state.battlesFought + 1 }
            });
        case SQUAD_RETREAT_ORDERED:
            return update(state, {
                squad: { fighting: { battle: { $apply: startWithdrawal } } }
            });
        case SQUAD_USE_EQUIPMENT:
            return update(state, {
                squad: {
                    equipment: { [action.payload.itemId]: { $apply: (charges: number) => charges - 1 } },
                    fighting: { battle: { $apply: (battle) => applyEquipment(battle, action.payload.itemId) } }
                }
            });
        case SQUAD_RESOLVE_POI: {
            // Player chose to take/explore/open the site: clear it and load any reward as cargo. A 'narrate'
            // POI holds the popup open on its result phase (story text, salvage); 'auto' closes it here.
            updates = {
                pois: { [action.payload.poiId]: { status: { $set: 'cleared' } } },
                squad: {
                    cargo: { $apply: (cargo: ResourceAmounts) => mergeCargo(cargo, action.payload.reward) }
                },
                prompt: { $set: action.payload.result ?
                    { poiId: action.payload.poiId, phase: 'result', result: action.payload.result } : null }
            };
            // A field event's answer can touch the squad itself: cells found (or spent), a droid recovered
            if (action.payload.battery && state.squad) {
                const capacity = squadBatteryCapacity(state.squad);
                updates.squad.battery = { $apply: (battery: number) =>
                    Math.max(0, Math.min(capacity, battery + action.payload.battery!)) };
            }
            if (action.payload.units && state.squad) {
                const maxHp = (state.squad.droidStats || DROID_BASE_STATS).hp;
                updates.squad.squadSize = { $apply: (size: number) => size + action.payload.units! };
                updates.squad.droidHp = { $apply: (droidHp: number[]) =>
                    [...(droidHp || fullDroidHp(state.squad!.squadSize, maxHp)), ...fullDroidHp(action.payload.units!, maxHp)] };
            }
            return update(state, updates);
        }
        case REVEAL_POI: {
            // A concealed POI found: it shows on the map from here on (its tile marked explored if it wasn't)
            const found = state.pois[action.payload.poiId];
            if (!found) return state;
            updates = { pois: { [found.id]: { status: { $set: 'available' } } } };
            if (state.map[found.coord[0]][found.coord[1]].status === STATUSES.unknown.key) {
                addRevealUpdates(state, updates, [found.coord]);
                updates.pois[found.id] = { status: { $set: 'available' } }; // over the reveal pass's (concealed skip)
            }
            return update(state, updates);
        }
        case SQUAD_CROSS_TUNNEL:
            return update(state, {
                squad: {
                    coord: { $set: action.payload.exitCoord },
                    path: { $set: [] },
                    moveProgress: { $set: 0 },
                    battery: { $apply: (battery: number) => Math.max(0, battery - action.payload.cost) }
                },
                prompt: { $set: null }
            });
        case SQUAD_DELIVER_CARGO:
            return update(state, {
                squad: { cargo: { $set: {} } }
            });
        case ADVANCE_SQUAD:
            // Wholesale snapshot from the pure advanceSquad, plus its line-of-sight reveals (same treatment
            // as scout reveals on PROGRESS: mark explored, discover POIs; resources credits land off this action).
            updates = {
                squad: { $set: action.payload.squad }
            };
            addRevealUpdates(state, updates, action.payload.reveals);
            return update(state, updates);        default:
            return state;
    }
}

// Folds a POI reward's resources into the squad's cargo (pure).
function mergeCargo(cargo: ResourceAmounts, reward: PoiReward) {
    if (!(reward && reward.resources)) return cargo || {};
    const next: ResourceAmounts = { ...(cargo || {}) };
    typedEntries(reward.resources).forEach(([id, amount]) => {
        next[id] = (next[id] || 0) + amount;
    });
    return next;
}

// Advances the driven squad one tick (movement or the fight, line-of-sight reveals, battery) and resolves
// whatever it ran into. Returns the planet state afterwards: the scouts run next and must see the squad's
// reveals as already applied, or a tile revealed by both in the same tick would double-count numExplored.
export function advanceSquadTick(dispatch: Dispatch, getState: GetState, state: PlanetState, timeDelta: number): PlanetState {
    if (!state.squad || !(state.squad.path.length > 0 || state.squad.fighting)) return state;
    const { squad, reveals, events } = advanceSquad(state.map, state.pois, state.squad, timeDelta, state.unlockedTerrains);
    const revealedFlatland = reveals.filter(
        ([r, c]) => state.map[r][c].terrain === TERRAINS.flatland.key && !state.map[r][c].heldBy
    ).length;
    dispatch({ type: ADVANCE_SQUAD, payload: { squad, reveals, revealedFlatland } });
    if (revealedFlatland > 0) {
        dispatch(recalculateState());
    }
    events.forEach(event => resolveSquadEvent(dispatch, getState, squad, event));
    return getState().planet;
}

/**
 * --- Squad thunks ---
 * Thunks validate; reducers apply. All squad/POI state is serializable, so mid-flight saves resume cleanly.
 * Movement thunks return booleans so the planet component can distinguish "order accepted" from "blocked"
 * (which it renders as a bump).
 */

// Ambient expedition telemetry (cargo banked, sealed sites, disband summaries) goes to the main terminal as
// inline lines; anything the player is standing in front of narrates through the encounter popup instead.

function sealedText(poi: Poi) {
    const tool = poi.requires ? (CAPABILITY_LABELS[poi.requires] || poi.requires) : 'an unknown tool';
    return TELEMETRY.sealed(poi.name, tool);
}

// Assigning to / removing from the team standing by at base (see squadDroidData). The reducer.ts wrappers check
// the idle pool and that no squad is fielded.
export function squadAssignDroidUnsafe(amount = 1): SquadAction {
    return { type: SQUAD_ASSIGN_DROID, payload: { amount } };
}
export function squadRemoveDroidUnsafe(amount = 1): SquadAction {
    return { type: SQUAD_REMOVE_DROID, payload: { amount } };
}

// Deploying fields the team assigned at base (already out of the idle pool, so deploying itself costs
// nothing more). Replication multiplies them: the fielded roster is
// assignedDroids x multiplier effective units, snapshotted at deploy (replicating afterward doesn't grow a
// fielded squad). The squad automatically carries every owned equipment piece at full charges, and its
// unit stats (base + researched combat upgrades) are snapshotted here: refit at base.
export function deploySquad() {
    return function(dispatch: Dispatch, getState: GetState) {
        const state = getState();
        const planet = state.planet;
        if (planet.squad || !planet.homeCoord) return;
        const assignedDroids = planet.squadDroidData.numDroidsAssigned;
        if (assignedDroids < 1) return;

        dispatch(withRecalculation({ type: DEPLOY_SQUAD,
            payload: { assignedDroids, multiplier: getReplicationMultiplier(state),
                equipment: ownedEquipment(state), droidStats: getDroidStats(state),
                batteryCapacity: getBatteryCapacity(state) } }));
        dispatch(setRotationMode('squad')); // follow-cam makes driving feel right immediately
    }
}

// Disbanding requires standing on the powered grid (walk home first); cargo credits there and the recovered
// droids go back to standing by at base (still assigned to the team, not the idle pool).
// Surviving units settle back into whole droids to the nearest (droidsRecovered): partial losses
// re-replicate at home.
export function disbandSquad() {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || squad.fighting) return;
        if (!isOnGrid(planet.map, squad.coord)) return;

        const droidsReturned = droidsRecovered(squad);
        dispatch(withRecalculation({
            type: DISBAND_SQUAD,
            payload: { droidsReturned, cargo: squad.cargo || {} }
        }));
        const delivered = squad.cargo && Object.keys(squad.cargo).length > 0 ? formatResourceList(squad.cargo) : null;
        const mult = squad.multiplier || 1;
        const roster = mult > 1 ?
            TELEMETRY.rosterMultiplied(squad.squadSize, (squad.assignedDroids || squad.squadSize) * mult, droidsReturned, squad.assignedDroids) :
            TELEMETRY.rosterPlain(droidsReturned);
        dispatch(logInline(TELEMETRY.teamReturned(roster, delivered)));
    }
}

// Keyboard step onto an adjacent tile. Stepping into an unknown impassable tile reveals it (you probed the
// wall and learned something) but does not move -- the caller shows a bump either way on `false`.
// POI blocking (settlements, sealed sites) is the component's concern: it decides bump-vs-attack per input rules.
// Turn the squad to look along dir ([dx, dy] in screen space, see KEY_DIRS in the planet component)
export function squadFace(dir: [number, number]): SquadAction {
    return { type: SQUAD_FACE, payload: { facing: dir } };
}

export function squadStep(coord: Coord) {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || squad.fighting) return false;

        if (!isPassable(planet.map, coord, planet.unlockedTerrains)) {
            if (planet.map[coord[0]][coord[1]].status === STATUSES.unknown.key) {
                // Reveal the wall: same action shape as movement, with the squad itself unchanged
                dispatch({ type: ADVANCE_SQUAD, payload: { squad, reveals: [coord], revealedFlatland: 0 } });
            }
            return false;
        }

        dispatch({ type: SQUAD_SET_PATH, payload: { path: [coord] } });
        return true;
    }
}

/**
 * The single keyboard entry point: attempt to step onto `coord`. Returns what happened so the component can
 * render it: 'moved' | 'blocked' (bump) | 'busy' (no squad / mid-fight: ignore silently).
 *
 * Contact rules: an available settlement is walked ONTO -- tapped or held (running headlong into a settlement is a
 * fight, Pokemon-grass style; the posted difficulty was your warning) -- and the fight starts on arrival,
 * the same way a cache raises its prompt on arrival. Sealed sites bump (with a report on deliberate taps
 * only, so held keys don't spam it). Hidden blocking POIs reveal on the bump, same as probing an unknown
 * wall -- you discover the danger, and the NEXT step in commits.
 */
export function squadStepInto(coord: Coord, tap: boolean) {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || squad.fighting) return 'busy';

        // A concealed POI still hidden is never a wall: the step onto it is how it is found (see advanceSquad)
        const blockingPoi = Object.values(planet.pois).find(poi =>
            poi.status !== 'cleared' && !(poi.status === 'hidden' && poi.concealed) &&
            poi.coord[0] === coord[0] && poi.coord[1] === coord[1] &&
            (isGarrisoned(poi) || (poi.requires && !planet.unlockedTerrains[poi.requires]))
        );

        if (blockingPoi) {
            if (blockingPoi.status === 'hidden') {
                // Probing the dark found something: reveal it (tile reveal flips the POI to available).
                // Defensive: the squad's own line of sight reveals every tile it can step into, so this
                // shouldn't be reachable unless vision shrinks below one hop.
                dispatch({ type: ADVANCE_SQUAD, payload: { squad, reveals: [coord], revealedFlatland: 0 } });
                return 'blocked';
            }
            if (blockingPoi.requires && !planet.unlockedTerrains[blockingPoi.requires]) {
                if (tap) dispatch(logInline(sealedText(blockingPoi)));
                return 'blocked';
            }
            // An available settlement or camp falls through: it is walkable, and arriving on it starts the fight
        }

        return dispatch(squadStep(coord)) ? 'moved' : 'blocked';
    }
}

// Player accepts the open interaction prompt (take the cache / explore the site, or one of a field event's
// answers by index): resolve the POI, load any reward as cargo, file the report.
export function squadInteract(choiceIndex = 0) {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const squad = planet.squad;
        if (!squad || !planet.prompt || planet.prompt.phase !== 'offer') return false;

        const poi = planet.pois[planet.prompt.poiId];
        if (!poi || poi.status !== 'available') {
            dispatch({ type: SQUAD_LEAVE_PROMPT });
            return false;
        }

        // A field event's answer carries its own reward and narration; every other POI has one answer, the POI's
        const choice = poi.choices ? poi.choices[choiceIndex] : null;
        if (poi.choices && !choice) return false;
        const reward: PoiReward = choice ? (choice.reward || {}) : poi.reward;
        const storyId = choice ? choice.storyId : poi.storyId;
        const narrate = choice ? !!choice.storyId : resultBehaviorFor(poi) === 'narrate';

        // A 'narrate' POI's outcome shows in the popup's result phase; the fields stay serializable and the
        // display strings are composed at render time (story text lookup, capability label, loot list)
        const result: EncounterResult | null = narrate ? {
            storyId: storyId || null,
            capability: (reward && reward.capability) || null,
            loaded: (reward && reward.resources) || null,
            ...(choice && choice.battery ? { battery: choice.battery } : {}),
            ...(choice && choice.units ? { unitsGained: choice.units } : {})
        } : null;

        dispatch({ type: SQUAD_RESOLVE_POI, payload: { poiId: poi.id, reward, result,
            ...(choice && choice.battery ? { battery: choice.battery } : {}),
            ...(choice && choice.units ? { units: choice.units } : {}) } });
        if (reward && reward.capability) {
            dispatch(unlockTerrain(reward.capability)); // salvaged tool: permanent, instant (not cargo)
        }
        if (choice && choice.revealNearest) revealNearestConcealed(dispatch, getState, poi);
        if (choice && choice.units) dispatch(recalculateState());
        return true;
    }
}

// A traced signal: the nearest concealed POI still hidden (a camp or a field event) shows on the map, and its
// tile is marked so there is something to look at. Nothing to find = the terminal says so.
function revealNearestConcealed(dispatch: Dispatch, getState: GetState, from: Poi) {
    const pois = getState().planet.pois;
    let nearest: Poi | null = null;
    let nearestDistance = Infinity;
    Object.values(pois).forEach(poi => {
        if (poi.id === from.id || poi.status !== 'hidden' || !poi.concealed) return;
        const distance = getApproxDistance(from.coord, poi.coord);
        if (distance < nearestDistance) { nearest = poi; nearestDistance = distance; }
    });
    if (!nearest) {
        dispatch(logInline(TELEMETRY.signalTracedNone()));
        return;
    }
    dispatch({ type: REVEAL_POI, payload: { poiId: (nearest as Poi).id } });
    dispatch(logInline(TELEMETRY.signalTraced((nearest as Poi).name)));
}

// Player declines the offer (or continues past a result); the popup's only exits besides accepting.
export function squadLeavePrompt(): SquadAction {
    return { type: SQUAD_LEAVE_PROMPT };
}

// The approach card's Continue: commit to the fight on the tile the squad is standing on. The card closes and
// the assault starts exactly as stepping in used to start it (contact beat, then the arena).
export function squadEngage() {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const prompt = planet.prompt;
        if (!planet.squad || !prompt || prompt.phase !== 'approach') return false;
        dispatch({ type: SQUAD_LEAVE_PROMPT });
        return dispatch(squadAttack(prompt.poiId, prompt.fromCoord || planet.squad.coord));
    }
}

// The approach card's Leave: think better of it and step back off the site the way the squad came. Not offered
// on a concealed site (the fight is already sprung), so the thunk refuses too.
export function squadLeaveApproach() {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const prompt = planet.prompt;
        if (!planet.squad || !prompt || prompt.phase !== 'approach') return false;
        const poi = planet.pois[prompt.poiId];
        if (poi && poi.concealed) return false;
        dispatch({ type: SQUAD_LEAVE_PROMPT });
        if (prompt.fromCoord) dispatch(squadStep(prompt.fromCoord));
        return true;
    }
}

// Walking onto an uncleared settlement starts the fight: a live per-unit battle (lib/battle/sim.ts) against the settlement's
// current garrison, played out in the encounter popup. `fromCoord` is the tile the squad stepped in from,
// held for the duration so a retreat can walk back out the way it came. `level` picks which of the settlement's
// fights this is: 0 on entry, deeper via squadDescend.
export function squadAttack(poiId: string, fromCoord: Coord, level = 0) {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const squad = planet.squad;
        const poi = planet.pois[poiId];

        if (!squad || squad.fighting) return false;
        if (!poi || poi.status === 'cleared') return false;
        if (poi.requires && !planet.unlockedTerrains[poi.requires]) {
            dispatch(logInline(sealedText(poi)));
            return false;
        }
        // Must be standing ON it -- this fires from the arrival event, not from an adjacent tile
        if (squad.coord[0] !== poi.coord[0] || squad.coord[1] !== poi.coord[1]) return false;

        const poiLevel = poiLevels(poi)[level];
        if (!poiLevel) return false;

        // Garrison composition: a level may declare a typed mix (garrison), a spawn formation, and an
        // obstacle layout (terrain); plain levels field `difficulty` standard defenders in a column front on open
        // ground. The squad fights with its deploy-time stat snapshot. The terrain salt derives from the
        // settlement's map coord and the level, so every assault on this level fights on the same ground.
        dispatch({ type: SQUAD_START_FIGHT,
            payload: { poiId, fromCoord, level, battle: createBattle(
                squad.droidHp || squad.squadSize,
                poiLevel.garrison || poiLevel.difficulty || 0,
                squad.droidStats || undefined,
                poiLevel.formation || undefined,
                poiLevel.terrain || undefined,
                poi.coord[0] * 337 + poi.coord[1] + level * 7919) } });
        return true;
    }
}

// Between a settlement's levels (the result phase offering the descent): go down. The next fight starts on the spot
// with whatever hull and charges the last one left.
export function squadDescend() {
    return function(dispatch: Dispatch, getState: GetState) {
        const prompt = getState().planet.prompt;
        if (!prompt || prompt.phase !== 'result' || !prompt.result || prompt.result.nextLevel == null) return false;
        const squad = getState().planet.squad;
        if (!squad) return false;

        return dispatch(squadAttack(prompt.poiId, prompt.fromCoord || squad.coord, prompt.result.nextLevel));
    }
}

// Between a settlement's levels: take what was won and go. Unlike a retreat nobody is shooting, so it costs nothing
// but the step back out; the site re-mans itself from the top behind the squad.
export function squadWithdraw() {
    return function(dispatch: Dispatch, getState: GetState) {
        const planet = getState().planet;
        const prompt = planet.prompt;
        if (!prompt || prompt.phase !== 'result' || !prompt.result || prompt.result.nextLevel == null) return false;

        const poi = planet.pois[prompt.poiId];
        dispatch({ type: SQUAD_LEAVE_PROMPT });
        if (poi) dispatch(logInline(TELEMETRY.teamWithdrew(poi.name, prompt.result.nextLevel)));
        if (prompt.fromCoord) dispatch(squadStep(prompt.fromCoord));
        return true;
    }
}

// Emerging from a tunnel (fought through, or crossed): the far mouth is a tile arrived at, so the squad
// looks around from it the way any step reveals ground (advanceSquad does this per tile walked; a teleport
// skips that, and the far side would otherwise sit unexplored around the squad).
function revealFromSquad(dispatch: Dispatch, getState: GetState) {
    const planet = getState().planet;
    const squad = planet.squad;
    if (!squad) return;
    const reveals = getVisibleCoords(planet.map, squad.coord)
        .filter(([r, c]) => planet.map[r][c].status === STATUSES.unknown.key);
    if (reveals.length === 0) return;
    const revealedFlatland = reveals.filter(
        ([r, c]) => planet.map[r][c].terrain === TERRAINS.flatland.key && !planet.map[r][c].heldBy
    ).length;
    dispatch({ type: ADVANCE_SQUAD, payload: { squad, reveals, revealedFlatland } });
    if (revealedFlatland > 0) dispatch(recalculateState());
}

// Fires a carried equipment piece into the live battle (the popup's action row / number hotkeys).
export function useEquipment(itemId: EquipmentId) {
    return function(dispatch: Dispatch, getState: GetState) {
        const squad = getState().planet.squad;
        if (!squad || !squad.fighting) return false;
        if (!squad.equipment || !((squad.equipment[itemId] ?? 0) > 0)) return false;

        dispatch({ type: SQUAD_USE_EQUIPMENT, payload: { itemId } });
        return true;
    }
}

// Orders a fighting squad to fall back (Esc). Droids stop attacking and run for the field edge while hostiles
// keep swinging, so the cost is emergent: fleeing at first contact is nearly free, mid-rout is not.
export function retreatFromFight() {
    return function(dispatch: Dispatch, getState: GetState) {
        const squad = getState().planet.squad;
        if (!squad || !squad.fighting) return false;
        if (squad.fighting.battle.phase === 'withdrawing') return false;

        dispatch({ type: SQUAD_RETREAT_ORDERED });
        return true;
    }
}

// Applies advanceSquad's contact/fight events (dispatched from planetTick).
function resolveSquadEvent(dispatch: Dispatch, getState: GetState, squad: Squad | null, event: SquadEvent) {
    const pois = getState().planet.pois;

    switch (event.type) {
        case 'battleOver': {
            if (!squad) break; // a fight can only end with the squad still fielded (see advanceSquad)
            const poi = pois[event.poiId];

            const levels = poiLevels(poi);
            if (event.result === 'won' && event.level < levels.length - 1) {
                // More beneath: the site stands. Loot loads and the popup turns into the descend-or-withdraw
                // choice (see SQUAD_LEVEL_WON); the level count stays unknown unless the site announces it.
                const reward = levelPayout(poi, event.level);
                dispatch({ type: SQUAD_LEVEL_WON, payload: { poiId: event.poiId, level: event.level,
                    survivors: event.survivors, droidHp: event.droidHp, reward,
                    fromCoord: event.fromCoord,
                    result: {
                        losses: squad.squadSize - event.survivors,
                        squadSize: squad.squadSize,
                        multiplier: squad.multiplier || 1,
                        capability: reward.capability || null,
                        loaded: reward.resources || null,
                        level: event.level,
                        levelsTotal: poi.levelsShown ? levels.length : null,
                        nextLevel: event.level + 1,
                        finalBattle: event.battle
                    } } });
                if (reward.capability) {
                    dispatch(unlockTerrain(reward.capability));
                }
            }
            else if (event.result === 'won') {
                const reward = levelPayout(poi, event.level);

                // Reclaimed land: the stamp's already-revealed flatland credits NOW (counted before the reducer
                // retracts the flags); still-unknown stamp tiles credit later through the normal reveal path.
                let landCredit = 0;
                if (poi.territoryRadius != null) {
                    const planetMap = getState().planet.map;
                    [poi.coord, ...getCoordsWithinHops(poi.coord, poi.territoryRadius)].forEach(([r, c]) => {
                        const sector = planetMap[r][c];
                        if (sector.heldBy === event.poiId && sector.status === STATUSES.explored.key &&
                            sector.terrain === TERRAINS.flatland.key) {
                            landCredit++;
                        }
                    });
                }

                // The outcome narrates in the popup's result phase (the squad is standing right there),
                // over the battle's final frame (finalBattle: the popup holds the field instead of
                // snapping down to the small prompt). Counts are effective units; the popup words them
                // "units" once replication multiplies.
                dispatch({ type: SQUAD_FIGHT_WON, payload: { poiId: event.poiId, survivors: event.survivors,
                    droidHp: event.droidHp, reward, landCredit,
                    result: {
                        losses: squad.squadSize - event.survivors,
                        squadSize: squad.squadSize,
                        multiplier: squad.multiplier || 1,
                        landCredit,
                        capability: (reward && reward.capability) || null,
                        loaded: (reward && reward.resources) || null,
                        level: event.level,
                        levelsTotal: levels.length, // the bottom is reached: the count is known now
                        finalBattle: event.battle
                    } } });
                // The site has fallen: the classifier's one line on what else was in there
                if (poi.discardedKg) {
                    dispatch(logInline(TELEMETRY.organicDiscarded(poi.discardedKg)));
                }
                if (reward && reward.capability) {
                    dispatch(unlockTerrain(reward.capability));
                }
                if (poi.type === 'tunnel') revealFromSquad(dispatch, getState); // it came out the far mouth
                if (poi.site != null) {
                    dispatch(logInline(TELEMETRY.siteSecured(poi.site)));
                    // The ground under the squad just became powered: it gets what a step onto the grid gives
                    // (refill, repair, reload, cargo banked) without having to step off and back on
                    const standing = getState().planet.squad;
                    if (standing) {
                        dispatch({ type: ADVANCE_SQUAD, payload: { squad: { ...standing, ...restoredOnGrid(standing) },
                            reveals: [], revealedFlatland: 0 } });
                        resolveSquadEvent(dispatch, getState, standing, { type: 'onGrid' });
                    }
                }
            }
            else if (event.result === 'wiped') {
                // The player watched it happen; the popup holds the ending (planet-level prompt, no squad
                // left to anchor it), and the terminal keeps a line for the record.
                const cargoLost = squad.cargo && Object.keys(squad.cargo).length > 0 ? squad.cargo : null;
                dispatch({ type: SQUAD_WIPED, payload: { poiId: event.poiId,
                    result: { wiped: true, squadSize: squad.squadSize,
                        multiplier: squad.multiplier || 1, cargoLost,
                        finalBattle: event.battle } } });
                dispatch(logInline(TELEMETRY.teamLost(poi.name, poi.type === 'tunnel', cargoLost ? formatResourceList(cargoLost) : null)));
            }
            else { // retreated
                dispatch({ type: SQUAD_RETREATED, payload: { poiId: event.poiId, survivors: event.survivors,
                    droidHp: event.droidHp } });
                dispatch(logInline(TELEMETRY.teamFellBack(poi.name, event.survivors, squad.squadSize, unitNoun(squad.multiplier || 1))));
                // Falling back is a real move off the settlement tile, animated and paid for like any other step
                // (a failed assault costs a tile of battery each way). Saves written before fromCoord existed
                // have none, in which case the squad just holds the ground it took.
                if (event.fromCoord) dispatch(squadStep(event.fromCoord));
            }
            dispatch(recalculateState());
            break;
        }
        case 'enteredPoi': {
            const entered = pois[event.poiId];
            if (entered && entered.status === 'hidden') {
                // Concealed and just stepped on (a camp, a field event): found. It shows from here on, and a
                // fight or prompt follows like any other contact.
                dispatch({ type: REVEAL_POI, payload: { poiId: entered.id } });
            }
            if (entered && isGarrisoned(entered)) {
                // Walked onto a garrisoned site: the approach card comes up (what is ahead, the threat estimate)
                // and the fight starts on Continue, here on the tile; Leave walks back to event.fromCoord. A
                // concealed site was sprung: its card holds through the contact beat while the map plays the
                // glyph blinking on the tile, and offers no Leave.
                dispatch({ type: SQUAD_PROMPT, payload: { poiId: event.poiId, phase: 'approach', fromCoord: event.fromCoord,
                    ...(entered.concealed ? { sprungAt: getState().clock.elapsedTime } : {}) } });
                break;
            }
            if (entered && entered.type === 'tunnel' && entered.exitCoord) {
                // An open tunnel: stepping into the mouth IS the crossing, no prompt. Paid in battery as so many
                // tiles walked (never hull: the passage is the shortcut the squad already fought for); the
                // follow-cam recenters on the far mouth next tick. Arriving there raises nothing (the teleport
                // is not a step), so the squad walks off the far mouth freely.
                const current = getState().planet.squad;
                if (!current) break;
                dispatch({ type: SQUAD_CROSS_TUNNEL, payload: { poiId: entered.id, exitCoord: entered.exitCoord,
                    cost: (entered.crossTiles || 0) * squadDrainPerTile() } });
                revealFromSquad(dispatch, getState);
                dispatch(logInline(TELEMETRY.teamCrossed(entered.name)));
                break;
            }
            // Walked onto a cache/story tile: movement stops and the interaction prompt opens (the player
            // chooses to take/explore via squadInteract, or leaves via squadLeavePrompt)
            dispatch({ type: SQUAD_PROMPT, payload: { poiId: event.poiId } });
            break;
        }
        case 'fieldWiped': {
            // Overextension death: battery spent, then the hull overdraft too. advanceSquad already
            // returned a null squad (applied via ADVANCE_SQUAD), so there's nothing to delete -- no popup
            // either (no site to anchor one; the map showed the squad go dark); the terminal keeps the record.
            const cargoLost = event.cargoLost && Object.keys(event.cargoLost).length > 0 ? event.cargoLost : null;
            dispatch(logInline(TELEMETRY.teamLostInField(event.unitsLost, unitNoun(event.multiplier), cargoLost ? formatResourceList(cargoLost) : null)));
            dispatch(recalculateState());
            break;
        }
        case 'enteredZone': {
            // Crossed into different ground: a one-line note in the zone's color, not repeated for a zone the
            // terminal noted recently (TERRAIN_BLURBS in database/planet/terrain.ts)
            const now = getState().clock.elapsedTime;
            const zone: SquadZone = event.zone;
            const blurb = TERRAIN_BLURBS[zone];
            if (blurb && !(now - (lastBlurbAt[zone] || -Infinity) < TERRAIN_BLURB_REPEAT_MS)) {
                lastBlurbAt[zone] = now;
                dispatch(logInline(blurb, 'terrain-blurb', { color: zoneColor(zone) }));
            }
            break;
        }
        case 'onGrid': {
            // Touched powered ground: bank any cargo
            const current = getState().planet.squad;
            if (current && current.cargo && Object.keys(current.cargo).length > 0) {
                dispatch({ type: SQUAD_DELIVER_CARGO, payload: { cargo: current.cargo } });
                dispatch(logInline(TELEMETRY.cargoBanked(formatResourceList(current.cargo))));
                dispatch(recalculateState());
            }
            break;
        }
    }
}
