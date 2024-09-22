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
import {mapObject, roundToDecimal} from "../lib/helpers";
import {STATUSES} from "../database/structures";
import {generateImage} from "../lib/planet_map";
import {getQuantity, getResource} from "./modules/resources";
import {aimMirrors, isTargetingPlanet, startEnergyBeam, TARGETS} from "./modules/star";
import {HYPER_BEAM_CHARGE_TIME} from "../lib/star";
import {getStructure} from "./modules/structures";

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
        star
    }),

    // cross-cutting entire state
    (state, action) => {
        switch (action.type) {
            case RECALCULATE:
                return recalculateReducer(state, action.payload.onlySlice, action.payload.onlyId);
            default:
                return state;
        }
    }
);


// Action Creators
export function recalculateState(onlySlice, onlyId) {
    return { type: RECALCULATE, payload: { onlySlice, onlyId } };
}

// Helper method - wrapping this around another action will cause the full state to be recalculated once the action completes
export function withRecalculation(action) {
    return function(dispatch, getState) {
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
 * @returns {*} Overrides to update various structure values
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
 * @returns {*} Overrides to update various structure values
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

function recalculateRecord(state, calculators, id, record) {
    if (!calculators[id]) { return {}; }

    let result = {};

    // Always calculate `variables` first; other calculated attributes may depend on these
    if (calculators[id].variables) {
        result.variables = { $set: calculators[id].variables(state, record) };
    }
    for (const [attr, calculator] of Object.entries(calculators[id])) {
        if (attr === 'variables') { continue; }
        result[attr] = { $set: calculator(state, record, result.variables ? result.variables.$set : undefined) };
    }

    return result;
}





// Standard Functions
// Note: Functions are put here (instead of in a respective slice) because they need to access multiple slices of the state.
// Parameter `state` for these functions will refer to the full state


// Returns ids of available upgrades for a structure
export function getStructureUpgradeIds(state, structure) {
    return fromUpgrades.visibleIds(state.upgrades).filter(upgradeId => {
        const upgrade = fromUpgrades.getUpgrade(state.upgrades, upgradeId);
        return upgrade.structure === structure.id;
    })
}

export function canResearchUpgrade(state, upgrade) {
    if (!fromUpgrades.isResearchable(upgrade)) {
        return false;
    }
    return fromResources.canConsume(state.resources, fromUpgrades.getResearchCost(upgrade));
}

export function researchUpgrade(upgradeId) {
    return function(dispatch, getState) {
        const upgrade = fromUpgrades.getUpgrade(getState().upgrades, upgradeId);
        if (canResearchUpgrade(getState(), upgrade)) {
            dispatch(fromUpgrades.researchUnsafe(upgrade));
        }
    }
}

// Returns ids of available abilities for a structure
export function getStructureAbilityIds(state, structure) {
    return fromAbilities.visibleIds(state.abilities).filter(abilityId => {
        const ability = fromAbilities.getAbility(state.abilities, abilityId);
        return ability.structure === structure.id;
    })
}

export function canCastAbility(state, ability) {
    if (!fromAbilities.isReady(ability)) {
        return false;
    }
    return fromResources.canConsume(state.resources, fromAbilities.getAbilityCost(ability));
}

export function castAbility(abilityId) {
    return function(dispatch, getState) {
        const ability = fromAbilities.getAbility(getState().abilities, abilityId);
        if (canCastAbility(getState(), ability)) {
            dispatch(fromAbilities.startCastUnsafe(ability));
        }
    }
}

export function canBuildStructure(state, structure) {
    return fromResources.canConsume(state.resources, fromStructures.getBuildCost(structure));
}

export function buildStructure(id, amount) {
    return function(dispatch, getState) {
        const structure = fromStructures.getStructure(getState().structures, id);
        if (canBuildStructure(getState(), structure)) {
            dispatch(fromStructures.buildUnsafe(structure, amount));
        }
    }
}

export function getReplicatedStructureCount(structure, state) {
    const developedLand = fromResources.getResource(state.resources, 'developedLand')
    const replicationMultiplier = developedLand ? fromResources.getQuantity(developedLand) : 1;
    return fromStructures.getNumBuilt(structure) * replicationMultiplier;
}

// Gets structure statistic based on how many of the structures are built. Statistics can be any keys on the structure record.
export function getStructureStatistic(state, structure, statistic, includeReplications = true) {
    if (structure === undefined || structure[statistic] === undefined) {
        return {};
    }

    const structureCount = includeReplications ?
        getReplicatedStructureCount(structure, state) :
        fromStructures.getNumBuilt(structure);

    return mapObject(structure[statistic], (key, value) => value * structureCount);
}


export function canAssignDroid(state, droidData) {
    return fromResources.canConsume(state.resources, { standardDroids: 1 });
}
export function canRemoveDroid(state, droidData) {
    return droidData.numDroidsAssigned > 0;
}

export function assignDroid(droidData, targetId) {
    return function(dispatch, getState) {
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
    return function(dispatch, getState) {
        const numDroids = fromResources.getQuantity(fromResources.getResource(getState().resources, 'standardDroids'));

        if (numDroids > 0) {
            switch(droidData.droidAssignmentType) {
                case 'structure':
                    dispatch(fromStructures.assignDroidUnsafe(targetId, numDroids));
                    break;
                case 'planet':
                    dispatch(fromPlanet.assignDroidUnsafe(numDroids));
                    break;
                default:
                    console.error(`Unknown droidAssignmentType: ${droidData.droidAssignmentType}`);
            }
        }
    }
}

export function removeDroid(droidData, targetId) {
    return function(dispatch, getState) {
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
    return function(dispatch, getState) {
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

export function showDroidsUI(state) {
    return fromResources.getLifetimeQuantity(fromResources.getResource(state.resources, 'standardDroids')) > 0;
}

export function showDroidsForStructure(state, structure) {
    return showDroidsUI(state) && structure.droidData.usesDroids;
}

export function numStandardDroids(state) {
    let total = 0;

    // Add in all droids assigned to structures
    fromStructures.iterateVisible(state.structures, structure => {
        total += structure.droidData.numDroidsAssigned;
    });

    // Add in all droids assigned to planet (exploration)
    total += state.planet.droidData.numDroidsAssigned;

    // Add in unused droids
    total += fromResources.getQuantity(fromResources.getResource(state.resources, 'standardDroids'));

    return total;
}


// Note: This can emit a lot of dispatches... it should be surrounded by a batch()
// For each structure:
//      1) try to consume. if CAN -> consume it AND produce what those structures can
//      2) if cannot consume -> DON'T produce and DON'T consume
export function resourcesTick(time) {
    return function(dispatch, getState) {
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

export function getNetResourceRates(state) {
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

export function planetDevelopmentProgress(state) {
    const developedLand = getQuantity(getResource(state.resources, 'developedLand'));
    const maxDevelopedLand = state.planet.maxDevelopedLand;
    return roundToDecimal(developedLand / maxDevelopedLand, 5);
}


export function energyBeamStrengthPct(state) {
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

export function energyBeamStrengthEnergy(state) {
    const numProbes = getQuantity(getResource(state.resources, 'probes'));

    // We divide by the number of solar panels so that the number of solar panels built is irrelevant
    const numSolarPanels = getReplicatedStructureCount(getStructure(state.structures, 'solarPanel'), state);

    return energyBeamStrengthPct(state) * 100 * ENERGY_BEAM_BASE_VALUE / numSolarPanels * numProbes / 50000;
}

export function kickoffDoomsday() {
    return function(dispatch, getState) {
        dispatch(aimMirrors(TARGETS.PLANET));
        dispatch(startEnergyBeam(getState().clock.elapsedTime));
        dispatch(fromLog.startLogSequence('finalSequence_planet1'))
    }

}