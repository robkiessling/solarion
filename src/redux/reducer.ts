import { combineReducers } from 'redux'
import {batch} from "react-redux";
import reduceReducers from "reduce-reducers";
import update from 'immutability-helper';

import game, * as fromGame from './modules/game';
import triggers, * as fromTriggers from "./modules/triggers";
import clock, * as fromClock from './modules/clock';
import log, * as fromLog from './modules/log';
import structures, * as fromStructures from "./modules/structures";
import upgrades, * as fromUpgrades from "./modules/upgrades";
import resources, * as fromResources from './modules/resources';
import abilities, * as fromAbilities from "./modules/abilities";
import planet, * as fromPlanet from "./modules/planet";
import star, * as fromStar from "./modules/star";
import panels, * as fromPanels from "./modules/panels";
import {mapObject, roundToDecimal} from "../lib/helpers";
import {STATUSES} from "../database/structures";
import {getQuantity, getResource} from "./modules/resources";
import {aimMirrors, isTargetingPlanet, startEnergyBeam, TARGETS} from "./modules/star";
import {HYPER_BEAM_CHARGE_TIME} from "../lib/star";
import {getStructure} from "./modules/structures";
import {DROID_BASE_STATS} from "../lib/battle";
import {SQUAD_BATTERY_CAPACITY} from "../lib/squad";
import {EQUIPMENT_DEFS, EQUIPMENT_ORDER} from "../database/equipment";
import {applyOperationsToVariables, initOperations, mergeEffectIntoOperations} from "../lib/effect";

// Actions
export const RECALCULATE = 'reducer/RECALCULATE';

// Reducers
export default reduceReducers(
    combineReducers({
        game,
        triggers,
        clock,
        log,
        resources,
        structures,
        upgrades,
        abilities,
        planet,
        star,
        panels
    }),

    // cross-cutting entire state
    (state: RootState, action: GameAction) => {
        switch (action.type) {
            case RECALCULATE:
                return recalculateReducer(state, action.payload.onlySlice, action.payload.onlyId);
            default:
                return state;
        }
    }
);


// Action Creators
export function recalculateState(onlySlice?: string, onlyId?: string) {
    return { type: RECALCULATE, payload: { onlySlice, onlyId } };
}

// Helper method - wrapping this around another action will cause the full state to be recalculated once the action completes
export function withRecalculation(action: GameAction | Thunk) {
    return function(dispatch: Dispatch, getState: GetState) {
        batch(() => {
            dispatch(action);
            dispatch(recalculateState())
        });
    }
}



/**
 * Recalculates various components of the state.
 * Many values, such as production values or consumption values, change over time (e.g. when upgrades are researched).
 * Whenever this happens we call recalculateState, which will use the database `calculators` to snapshot the new values.
 *
 * @param state Refers to the full state
 * @param onlySlice (optional) If onlySlice is specified, ONLY that slice (e.g. 'structures') will be recalculated
 * @param onlyId (optional) If onlyId is specified, ONLY that id (e.g. 'solarPanel') will be recalculated
 * @returns Overrides to update various structure values
 */
function recalculateReducer(state, onlySlice, onlyId) {
    if (onlySlice === undefined || onlySlice === 'structures') {
        state = update(state, {
            structures: {
                byId: recalculateSlice(state, 'structures', fromStructures.calculators, onlyId)
            }
        });
    }

    if (onlySlice === undefined || onlySlice === 'abilities') {
        state = update(state, {
            abilities: {
                byId: recalculateSlice(state, 'abilities', fromAbilities.calculators, onlyId)
            }
        });
    }

    if (onlySlice === undefined || onlySlice === 'resources') {
        state = update(state, {
            resources: {
                byId: recalculateSlice(state, 'resources', fromResources.calculators, onlyId)
            }
        });
    }

    return state;
}

/**
 * @param state Refers to the full state
 * @param sliceKey The key for the slice to recalculate (e.g. 'structures')
 * @param calculators Reference to the calculators object to use. The calculators object can have a special key 'variables'
 *                    which will always be calculated first and provided to the rest of the calculators as a third parameter
 * @param onlyId (optional) If onlyId is specified, ONLY that id will be recalculated
 * @returns Overrides to update various structure values
 */
function recalculateSlice(state, sliceKey, calculators, onlyId) {
    if (onlyId === undefined) {
        return mapObject(state[sliceKey].byId, (id, record) => {
            return recalculateRecord(state, calculators, id, record)
        });
    }
    else {
        const record = state[sliceKey].byId[onlyId];
        return record ? { [onlyId]: recalculateRecord(state, calculators, onlyId, record) } : {};
    }

}

function recalculateRecord(state: RootState, calculators: Record<string, CalculatorSet<any>>, id: string, record: any) {
    if (!calculators[id]) { return {}; }

    const result: Record<string, { $set: any }> = {};

    // Always calculate `variables` first; other calculated attributes may depend on these
    if (calculators[id].variables) {
        result.variables = { $set: calculators[id].variables(state, record) };
    }
    for (const [attr, calculator] of Object.entries(calculators[id]) as [string, Calculator<any>][]) {
        if (attr === 'variables') { continue; }
        result[attr] = { $set: calculator(state, record, result.variables ? result.variables.$set : undefined) };
    }

    return result;
}





// Standard Functions
// Note: Functions are put here (instead of in a respective slice) because they need to access multiple slices of the state.
// Parameter `state` for these functions will refer to the full state


// Returns ids of available upgrades for a structure
export function getStructureUpgradeIds(state: RootState, structure: Structure) {
    return fromUpgrades.visibleIds(state.upgrades).filter(upgradeId => {
        const upgrade = fromUpgrades.getUpgrade(state.upgrades, upgradeId);
        return upgrade.structure === structure.id;
    })
}

// Expedition-only upgrades (`squad: true` in database/upgrades.js, no structure): equipment, combat stats,
// battery. Offered in the Expedition panel's Outfitting section, not on any structure's card.
export function getSquadUpgradeIds(state: RootState) {
    return fromUpgrades.visibleIds(state.upgrades).filter(upgradeId =>
        fromUpgrades.getUpgrade(state.upgrades, upgradeId).squad);
}

export function canResearchUpgrade(state: RootState, upgrade: Upgrade) {
    if (!fromUpgrades.isResearchable(upgrade)) {
        return false;
    }
    return fromResources.canConsume(state.resources, fromUpgrades.getResearchCost(upgrade));
}

export function researchUpgrade(upgradeId) {
    return function(dispatch: Dispatch, getState: GetState) {
        const upgrade = fromUpgrades.getUpgrade(getState().upgrades, upgradeId);
        if (canResearchUpgrade(getState(), upgrade)) {
            dispatch(fromUpgrades.researchUnsafe(upgrade));
        }
    }
}

// Returns ids of available abilities for a structure
// Droid combat upgrades (EFFECT_TARGETS.misc, applied manually here): each researched entry's effect
// modifies the expedition droids' unit stats. New combat upgrades just join this list.
const DROID_COMBAT_UPGRADE_IDS = ['droidFactory_reinforcedPlating', 'droidFactory_weaponCalibration'];

// Squad battery upgrades (squad-level, not per-droid: capacity scaling with team size would erase the
// big-team-short-legs range tradeoff).
const BATTERY_UPGRADE_IDS = ['droidFactory_extendedCells'];

// Folds every researched upgrade's effect from `upgradeIds` into the `variables` object, in place.
function applyResearchedUpgradeEffects(state, upgradeIds, variables) {
    const operations = initOperations();
    upgradeIds.forEach(upgradeId => {
        const upgrade = fromUpgrades.getUpgrade(state.upgrades, upgradeId);
        if (upgrade && fromUpgrades.isResearched(upgrade) && upgrade.effect) {
            mergeEffectIntoOperations(upgrade.effect, operations);
        }
    });
    applyOperationsToVariables(operations, variables);
}

// The effective expedition-droid stat block: DROID_BASE_STATS plus every researched combat upgrade
// plus the authorized chassis spec (the schematic index panel; fleet-wide, no per-droid variants).
// Snapshotted onto the squad at deploy (see deploySquad), so refits apply to the NEXT deployment --
// the squad in the field fights with the stats it left base with.
export function getDroidStats(state: RootState): DroidStats {
    const stats = { ...DROID_BASE_STATS };
    applyResearchedUpgradeEffects(state, DROID_COMBAT_UPGRADE_IDS, stats);
    fromPanels.applyChassisEffects(state.panels, stats);
    return stats;
}

// The deployable squad's battery capacity: the base plus every researched battery upgrade plus the
// authorized chassis spec. Snapshotted onto the squad at deploy under the same refit rule as getDroidStats.
export function getBatteryCapacity(state: RootState): number {
    const stats = { batteryCapacity: SQUAD_BATTERY_CAPACITY };
    applyResearchedUpgradeEffects(state, BATTERY_UPGRADE_IDS, stats);
    fromPanels.applyChassisEffects(state.panels, stats);
    return stats.batteryCapacity;
}

// The battle gear squads carry automatically: each piece is owned once its one-time upgrade is
// researched (story salvage can researchForFree the same upgrade ids later). Returns the fresh
// loadout { itemId: maxCharges } a deploying squad walks out with.
export function ownedEquipment(state: RootState): EquipmentCharges {
    const equipment = {};
    EQUIPMENT_ORDER.forEach(itemId => {
        const upgrade = fromUpgrades.getUpgrade(state.upgrades, EQUIPMENT_DEFS[itemId].upgradeId);
        if (upgrade && fromUpgrades.isResearched(upgrade)) {
            equipment[itemId] = EQUIPMENT_DEFS[itemId].charges;
        }
    });
    return equipment;
}

export function getStructureAbilityIds(state: RootState, structure: Structure) {
    return fromAbilities.visibleIds(state.abilities).filter(abilityId => {
        const ability = fromAbilities.getAbility(state.abilities, abilityId);
        return ability.structure === structure.id;
    })
}

export function canCastAbility(state: RootState, ability: Ability) {
    if (!fromAbilities.isReady(ability)) {
        return false;
    }
    return fromResources.canConsume(state.resources, fromAbilities.getAbilityCost(ability));
}

export function castAbility(abilityId) {
    return function(dispatch: Dispatch, getState: GetState) {
        const ability = fromAbilities.getAbility(getState().abilities, abilityId);
        if (canCastAbility(getState(), ability)) {
            dispatch(fromAbilities.startCastUnsafe(ability));
        }
    }
}

export function canBuildStructure(state: RootState, structure: Structure) {
    return fromResources.canConsume(state.resources, fromStructures.getBuildCost(structure));
}

export function buildStructure(id, amount) {
    return function(dispatch: Dispatch, getState: GetState) {
        const structure = fromStructures.getStructure(getState().structures, id);
        if (canBuildStructure(getState(), structure)) {
            dispatch(fromStructures.buildUnsafe(structure, amount));
        }
    }
}

export function getReplicatedStructureCount(structure: Structure, state: RootState): number {
    const developedLand = fromResources.getResource(state.resources, 'developedLand')
    const replicationMultiplier = developedLand ? fromResources.getQuantity(developedLand) : 1;
    return fromStructures.getNumBuilt(structure) * replicationMultiplier;
}

// The squad's replication multiplier: each assigned droid fields this many effective units, snapshotted at
// deploy time (see createSquad). Whole-number version of the structure multiplier above (a squad can't
// field a fractional unit).
export function getReplicationMultiplier(state: RootState): number {
    const developedLand = fromResources.getResource(state.resources, 'developedLand');
    return Math.max(1, Math.floor(developedLand ? fromResources.getQuantity(developedLand) : 1));
}

// Gets structure statistic based on how many of the structures are built. Statistics can be any keys on the structure record.
export function getStructureStatistic(state: RootState, structure: Structure, statistic: string, includeReplications: boolean = true): ResourceAmounts {
    if (structure === undefined || structure[statistic] === undefined) {
        return {};
    }

    const structureCount = includeReplications ?
        getReplicatedStructureCount(structure, state) :
        fromStructures.getNumBuilt(structure);

    return mapObject(structure[statistic], (key, value) => value * structureCount);
}


// Scout sweeps are the Survey Automation unlock; until it's researched the
// player-driven squad is the only exploration. Gates scout assignment, the halo ring, and the growth beacon.
export function surveyAutomationUnlocked(state: RootState) {
    return fromUpgrades.isResearched(fromUpgrades.getUpgrade(state.upgrades, 'droidFactory_surveyAutomation'));
}

export function canAssignDroid(state: RootState, droidData: DroidAssignment) {
    if (droidData.droidAssignmentType === 'planet') {
        if (!surveyAutomationUnlocked(state)) {
            return false;
        }
        // Planet exploration can also "assign" by turning around a scout that's walking home from a recall
        if (state.planet.droids.some(droid => droid.returning)) {
            return true;
        }
    }
    return fromResources.canConsume(state.resources, { standardDroids: 1 });
}
export function canRemoveDroid(state: RootState, droidData: DroidAssignment) {
    return droidData.numDroidsAssigned > 0;
}

export function assignDroid(droidData, targetId) {
    return function(dispatch: Dispatch, getState: GetState) {
        if (canAssignDroid(getState(), droidData)) {
            switch(droidData.droidAssignmentType) {
                case 'structure':
                    dispatch(fromStructures.assignDroidUnsafe(targetId));
                    break;
                case 'planet':
                    dispatch(fromPlanet.assignDroidUnsafe());
                    break;
                default:
                    console.error(`Unknown droidAssignmentType: ${droidData.droidAssignmentType}`);
            }
        }
    }
}

export function assignAllDroids(droidData, targetId) {
    return function(dispatch: Dispatch, getState: GetState) {
        let numDroids = fromResources.getQuantity(fromResources.getResource(getState().resources, 'standardDroids'));

        switch(droidData.droidAssignmentType) {
            case 'structure':
                if (numDroids > 0) {
                    dispatch(fromStructures.assignDroidUnsafe(targetId, numDroids));
                }
                break;
            case 'planet':
                if (!surveyAutomationUnlocked(getState())) {
                    break;
                }
                // Returning scouts count too: assigning turns them around in place before spending idle droids
                numDroids += getState().planet.droids.filter(droid => droid.returning).length;
                if (numDroids > 0) {
                    dispatch(fromPlanet.assignDroidUnsafe(numDroids));
                }
                break;
            default:
                console.error(`Unknown droidAssignmentType: ${droidData.droidAssignmentType}`);
        }
    }
}

export function removeDroid(droidData, targetId) {
    return function(dispatch: Dispatch, getState: GetState) {
        if (canRemoveDroid(getState(), droidData)) {
            switch(droidData.droidAssignmentType) {
                case 'structure':
                    dispatch(fromStructures.removeDroidUnsafe(targetId));
                    break;
                case 'planet':
                    dispatch(fromPlanet.removeDroidUnsafe());
                    break;
                default:
                    console.error(`Unknown droidAssignmentType: ${droidData.droidAssignmentType}`);
            }
        }
    }
}

export function removeAllDroids(droidData, targetId) {
    return function(dispatch: Dispatch, getState: GetState) {
        const numDroids = droidData.numDroidsAssigned;

        if (numDroids > 0) {
            switch(droidData.droidAssignmentType) {
                case 'structure':
                    dispatch(fromStructures.removeDroidUnsafe(targetId, numDroids));
                    break;
                case 'planet':
                    dispatch(fromPlanet.removeDroidUnsafe(numDroids));
                    break;
                default:
                    console.error(`Unknown droidAssignmentType: ${droidData.droidAssignmentType}`);
            }
        }
    }
}

export function showDroidsUI(state: RootState) {
    return fromResources.getLifetimeQuantity(fromResources.getResource(state.resources, 'standardDroids')) > 0;
}

export function showDroidsForStructure(state: RootState, structure: Structure) {
    return showDroidsUI(state) && structure.droidData.usesDroids;
}

export function numStandardDroids(state: RootState): number {
    let total = 0;

    // Add in all droids assigned to structures
    fromStructures.iterateVisible(state.structures, structure => {
        total += structure.droidData.numDroidsAssigned;
    });

    // Add in all droids assigned to planet (exploration)
    total += state.planet.droidData.numDroidsAssigned;

    // Add in recalled scouts still walking home (removed from the assigned count, not yet back in the pool)
    total += state.planet.droids.filter(droid => droid.returning).length;

    // Add in droids away with the squad (the assigned droids, not their replicated units)
    if (state.planet.squad) {
        total += state.planet.squad.assignedDroids || state.planet.squad.squadSize;
    }

    // Add in unused droids
    total += fromResources.getQuantity(fromResources.getResource(state.resources, 'standardDroids'));

    return total;
}


// Note: This can emit a lot of dispatches... it should be surrounded by a batch()
// For each structure:
//      1) try to consume. if CAN -> consume it AND produce what those structures can
//      2) if cannot consume -> DON'T produce and DON'T consume
export function resourcesTick(time) {
    return function(dispatch: Dispatch, getState: GetState) {
        fromStructures.iterateVisible(getState().structures, structure => {
            if (structure.runningCooldown && structure.runningCooldown > 0) { return; }

            const consumption = mapObject(getStructureStatistic(getState(), structure, 'consumes'), (resourceId, amount) => amount * time);
            if (fromResources.canConsume(getState().resources, consumption)) {
                dispatch(fromResources.consumeUnsafe(consumption));
                dispatch(fromResources.produce(mapObject(getStructureStatistic(getState(), structure, 'produces'), (resourceId, amount) => amount * time)));
                fromStructures.setStatus(dispatch, structure, STATUSES.normal);
            }
            else {
                fromStructures.setStatus(dispatch, structure, STATUSES.insufficient);
                // dispatch(fromStructures.turnOff(structure.id)); // todo we are not turning off anymore; too jarring
            }
        });

        if (getState().game.rapidlyRecalcEnergy) {
            // Need to rapidly recalculate energy variables because it is changing with every new probe added
            dispatch(recalculateState('resources', 'energy'));
        }
    }
}

// Droid census for the resource bar. `idle` is the unassigned pool (the raw resource quantity); `total` adds
// every assignment site: structure workers, exploration scouts (including recalled scouts still walking home,
// which are out of the pool until they arrive), and the expedition squad.
export function getDroidCounts(state: RootState) {
    const idle = Math.floor(getQuantity(getResource(state.resources, 'standardDroids')));

    let assigned = 0;
    for (const structure of Object.values(state.structures.byId)) {
        if (structure.droidData) { assigned += structure.droidData.numDroidsAssigned; }
    }
    assigned += (state.planet.droids || []).length;
    if (state.planet.squad) { assigned += state.planet.squad.assignedDroids || state.planet.squad.squadSize; }

    return { total: idle + assigned, idle };
}

export function getNetResourceRates(state: RootState) {
    let result = Object.fromEntries(Object.keys(state.resources.byId).map((resourceId) => [resourceId, 0]));

    fromStructures.iterateVisible(state.structures, structure => {
        if (!fromStructures.hasInsufficientResources(structure)) {
            for (const [key, value] of Object.entries(getStructureStatistic(state, structure, 'consumes'))) {
                result[key] -= value;
            }
            for (const [key, value] of Object.entries(getStructureStatistic(state, structure, 'produces'))) {
                result[key] += value;
            }
        }
    });
    return result;
}

export function planetDevelopmentProgress(state: RootState) {
    const developedLand = getQuantity(getResource(state.resources, 'developedLand'));
    const maxDevelopedLand = state.planet.maxDevelopedLand;
    return roundToDecimal(developedLand / maxDevelopedLand, 5);
}


export function energyBeamStrengthPct(state: RootState): number {
    if (!state.star || !state.star.mirrorTarget || state.star.mirrorTarget === TARGETS.NONE) {
        return 0;
    }

    if (!state.star.hyperBeamStartedAt) {
        return 0.01;
    }

    const timePct = (state.clock.elapsedTime - state.star.hyperBeamStartedAt) / HYPER_BEAM_CHARGE_TIME;
    let beamPct;

    // Animation has two linear increase rates: it starts off with a slow linear increase and then flips to a rapid linear increase
    const SWITCH_AT_PCT = 0.6; // Percent of animation after which it switches to second linear rate
    const BEAM_PCT_AT_SWITCH = 0.1; // What % the beam should be at when it switches to second linear rate.
    if (timePct < SWITCH_AT_PCT) {
        beamPct = (timePct / SWITCH_AT_PCT) * BEAM_PCT_AT_SWITCH;
    }
    else {
        beamPct = ((timePct - SWITCH_AT_PCT) / (1.0 - SWITCH_AT_PCT)) * (1 - BEAM_PCT_AT_SWITCH) + BEAM_PCT_AT_SWITCH
    }

    return Math.max(0.01, Math.min(beamPct, 1.0)); // Lock to 1% / 100% boundaries
}

// Produce this much energy when harvesting 1% of solar output and at 50000 probes
// The value is arbitrarily high, however the probeFactory_exponentialGrowth upgrade discover/cost should be somewhat proportional it.
const ENERGY_BEAM_BASE_VALUE = 1.5e13;

export function energyBeamStrengthEnergy(state: RootState): number {
    const numProbes = getQuantity(getResource(state.resources, 'probes'));

    // We divide by the number of solar panels so that the number of solar panels built is irrelevant
    const numSolarPanels = getReplicatedStructureCount(getStructure(state.structures, 'solarPanel'), state);

    // With no solar panels there is nothing to receive the beam; without this guard the division produces Infinity/NaN
    if (!numSolarPanels) return 0;

    return energyBeamStrengthPct(state) * 100 * ENERGY_BEAM_BASE_VALUE / numSolarPanels * numProbes / 50000;
}

export function kickoffDoomsday() {
    return function(dispatch: Dispatch, getState: GetState) {
        dispatch(aimMirrors(TARGETS.PLANET));
        dispatch(startEnergyBeam(getState().clock.elapsedTime));
        dispatch(fromLog.startLogSequence('finalSequence_planet1'))
    }

}