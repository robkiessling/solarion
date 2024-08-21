import { combineReducers } from 'redux'
import {batch} from "react-redux";
import reduceReducers from "reduce-reducers";
import update from 'immutability-helper';

import game from './modules/game';
import clock from './modules/clock';
import log, * as fromLog from './modules/log';
import resources, * as fromResources from './modules/resources';
import structures, * as fromStructures from "./modules/structures";
import upgrades, * as fromUpgrades from "./modules/upgrades";
import abilities, * as fromAbilities from "./modules/abilities";
import {mapObject} from "../lib/helpers";
import {STATUSES} from "../database/structures";

// Actions
export const RECALCULATE = 'reducer/RECALCULATE';

// Reducers
export default reduceReducers(
    combineReducers({
        game,
        clock,
        log,
        resources,
        structures,
        upgrades,
        abilities
    }),

    // cross-cutting entire state
    (state, action) => {
        switch(action.type) {
            case RECALCULATE:
                return recalculateReducer(state);
            default:
                return state;
        }
    }
);

// Many values, such as production values or consumption values, change over time (e.g. when upgrades are researched).
// Whenever this happens we call recalculateState, which will use the database `calculators` to snapshot the new production
// or consumption values.
function recalculateReducer(state) {
    state = update(state, {
        structures: {
            byId: recalculateSlice(state, 'structures', fromStructures.calculators)
        }
    });

    state = update(state, {
        abilities: {
            byId: recalculateSlice(state, 'abilities', fromAbilities.calculators)
        }
    })

    // Store totals? nah not yet

    // Update resource capacities
    return update(state, {
        resources: {
            byId: recalculateSlice(state, 'resources', fromResources.calculators)
        }
    })
}


// Action Creators
export function recalculateState() {
    return { type: RECALCULATE };
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


// Standard Functions
// Note: Functions are put here (instead of in a respective slice) because they need to access multiple slices of the state.
// Parameter `state` for these functions will refer to the full state

/**
 * @param state Refers to the full state
 * @param sliceKey The key for the slice to recalculate (e.g. 'structures')
 * @param calculators Reference to the calculators object to use. The calculators object can have a special key 'variables'
 *                    which will always be calculated first and provided to the rest of the calculators as a third parameter
 * @returns {*} Overrides to update various structure values
 */
export function recalculateSlice(state, sliceKey, calculators) {
    return mapObject(state[sliceKey].byId, (id, record) => {
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
    });
}


export function getStructureUpgradeIds(state, structure) {
    return structure.upgrades.filter(upgradeId => {
        const upgrade = fromUpgrades.getUpgrade(state.upgrades, upgradeId); // check that it has been discovered
        return upgrade && !fromUpgrades.isResearched(upgrade); // check that it has not been researched already
    });
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

export function getStructureAbilityIds(state, structure) {
    return structure.abilities.filter(abilityId => {
        return !!fromAbilities.getAbility(state.abilities, abilityId); // check that it has been learned
    });
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

export function canAssignDroid(state, structure) {
    return fromResources.canConsume(state.resources, { maintenanceDroids: 1 });
}
export function canRemoveDroid(state, structure) {
    return structure.numDroids > 0;
}

export function assignDroid(structureId) {
    return function(dispatch, getState) {
        const structure = fromStructures.getStructure(getState().structures, structureId);
        if (canAssignDroid(getState(), structure)) {
            dispatch(fromStructures.assignDroidUnsafe(structure));
        }
    }
}
export function removeDroid(structureId) {
    return function(dispatch, getState) {
        const structure = fromStructures.getStructure(getState().structures, structureId);
        if (canRemoveDroid(getState(), structure)) {
            dispatch(fromStructures.removeDroidUnsafe(structure));
        }
    }
}

export function showDroidUI(state, structure) {
    if (fromResources.getLifetimeQuantity(fromResources.getResource(state.resources, 'maintenanceDroids')) === 0) {
        return false;
    }

    return structure.usesDroids;
}

// The maintenance droid resource amount goes up/down when droids are assigned to structures. To get the total
// (deployed & undeployed) we sum the resource amount plus all the structure counts.
export function numMaintenanceDroids(state) {
    let total = 0;

    fromStructures.iterateVisible(state.structures, structure => {
        total += structure.numDroids;
    });

    total += fromResources.getQuantity(fromResources.getResource(state.resources, 'maintenanceDroids'));

    return total;
}
export function numReconDroids(state) {
    return fromResources.getQuantity(fromResources.getResource(state.resources, 'reconDroids'));
}


// Note: This can emit a lot of dispatches... it should be surrounded by a batch()
// For each structure:
//      1) try to consume. if CAN -> consume it AND produce what those structures can
//      2) if cannot consume -> DON'T produce and DON'T consume
export function resourcesTick(time) {
    return function(dispatch, getState) {
        fromStructures.iterateVisible(getState().structures, structure => {
            if (structure.runningCooldown && structure.runningCooldown > 0) { return; }

            const consumption = mapObject(fromStructures.getStatistic(structure, 'consumes'), (resourceId, amount) => amount * time);
            if (fromResources.canConsume(getState().resources, consumption)) {
                dispatch(fromResources.consumeUnsafe(consumption));
                dispatch(fromResources.produce(mapObject(fromStructures.getStatistic(structure, 'produces'), (resourceId, amount) => amount * time)));
                fromStructures.setStatus(dispatch, structure, STATUSES.normal);
            }
            else {
                fromStructures.setStatus(dispatch, structure, STATUSES.insufficient);
                // dispatch(fromStructures.turnOff(structure.id)); // todo we are not turning off anymore; too jarring
            }
        });
    }
}

export function getNetResourceRates(state) {
    let result = Object.fromEntries(Object.keys(state.resources.byId).map((resourceId) => [resourceId, 0]));

    fromStructures.iterateVisible(state.structures, structure => {
        if (!fromStructures.hasInsufficientResources(structure)) {
            for (const [key, value] of Object.entries(fromStructures.getStatistic(structure, 'consumes'))) {
                result[key] -= value;
            }
            for (const [key, value] of Object.entries(fromStructures.getStatistic(structure, 'produces'))) {
                result[key] += value;
            }
        }
    });
    return result;
}
