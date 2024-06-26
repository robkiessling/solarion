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

// Many values such as production values or consumption values change over time, such as when upgrades are researched.
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
 * @param calculators Reference to the calculators object to use
 * @returns {*} Overrides to update various structure values
 */
export function recalculateSlice(state, sliceKey, calculators) {
    return mapObject(state[sliceKey].byId, (id, record) => {
        if (!calculators[id]) { return {}; }

        return mapObject(calculators[id], (attr, calculator) => {
            return { $set: calculator(state, record) };
        });
    });
}

export function canResearchUpgrade(state, upgrade) {
    if (!fromUpgrades.isResearchableState(upgrade)) {
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

export function getStructureUpgrades(state, structure) {
    return structure.upgrades.filter(upgradeId => {
        return !!fromUpgrades.getUpgrade(state.upgrades, upgradeId);
    }).map(upgradeId => {
        const upgrade = fromUpgrades.getUpgrade(state.upgrades, upgradeId);

        return _.merge({}, upgrade, {
            cost: fromUpgrades.getResearchCost(upgrade),
            canResearch: canResearchUpgrade(state, upgrade),
            name: fromUpgrades.getName(upgrade)
        });
    })
}

export function canCastAbility(state, ability) {
    if (!fromAbilities.isCastable(ability)) {
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
export function getStructureAbilities(state, structure) {
    return structure.abilities.filter(abilityId => {
        return !!fromAbilities.getAbility(state.abilities, abilityId);
    }).map(abilityId => {
        const ability = fromAbilities.getAbility(state.abilities, abilityId);

        return _.merge({}, ability, {
            cost: fromAbilities.getAbilityCost(ability),
            canCast: canCastAbility(state, ability),
            progress: fromAbilities.getProgress(ability, true)
        });
    })

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

// Note: This can emit a lot of dispatches... it should be surrounded by a batch()
// For each structure:
//      1) try to consume. if CAN -> consume it AND produce what those structures can
//      2) if cannot consume -> DON'T produce and DON'T consume
export function resourcesTick(time) {
    return function(dispatch, getState) {
        fromStructures.iterateVisible(getState().structures, structure => {
            const consumption = mapObject(fromStructures.getStatistic(structure, 'consumes'), (resourceId, amount) => amount * time);
            if (fromResources.canConsume(getState().resources, consumption)) {
                dispatch(fromResources.consumeUnsafe(consumption));
                dispatch(fromResources.produce(mapObject(fromStructures.getStatistic(structure, 'produces'), (resourceId, amount) => amount * time)));
                // fromStructures.setNormalStatus(dispatch, structure);
            }
            else {
                // fromStructures.setInsufficientStatus(dispatch, structure);
                dispatch(fromStructures.turnOff(structure.id));
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
