import { combineReducers } from 'redux'
import {batch} from "react-redux";
import reduceReducers from "reduce-reducers";
import update from 'immutability-helper';

import clock from './modules/clock';
import log, * as fromLog from './modules/log';
import resources, * as fromResources from './modules/resources';
import structures, * as fromStructures from "./modules/structures";
import upgrades, * as fromUpgrades from "./modules/upgrades";
import {mapObject} from "../lib/helpers";

// Actions
export const RECALCULATE = 'reducer/RECALCULATE';

// Reducers
export default reduceReducers(
    combineReducers({
        clock,
        log,
        resources,
        structures,
        upgrades
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

function recalculateReducer(state) {
    state = update(state, {
        structures: {
            byId: fromStructures.calculations(state)
        }
    });

    // Store totals? nah not yet

    // Update resource capacities
    return update(state, {
        resources: {
            byId: fromResources.calculations(state)
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

export function canResearchUpgrade(state, upgrade) {
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

export function canRunStructure(state, structure) {
    // Can run if have non-zero amounts for all required resources. We multiply by 0.001 instead of just 1 because
    // we want to let structure run even if it can't do a full second's worth of running.
    return fromResources.canConsume(state.resources, fromStructures.getConsumption(structure, 0.001));
}

// Note: This can emit a lot of dispatches... it should be surrounded by a batch()
export function applyTime(time) {
    return function(dispatch, getState) {
        fromStructures.iterateVisible(getState().structures, structure => {
            const consumption = mapObject(fromStructures.getConsumption(structure), (resourceId, amount) => amount * time);
            if (fromResources.canConsume(getState().resources, consumption)) {
                dispatch(fromResources.consumeUnsafe(consumption));
                dispatch(fromResources.produce(mapObject(fromStructures.getProduction(structure), (resourceId, amount) => amount * time)));
            }
            else {
                dispatch(fromStructures.toggleRunning(structure.id, false));
            }
        })
    }
}

export function getNetResourceRates(state) {
    let result = Object.fromEntries(Object.keys(state.resources.byId).map((resourceId) => [resourceId, 0]));

    fromStructures.iterateVisible(state.structures, structure => {
        for (const [key, value] of Object.entries(fromStructures.getConsumption(structure))) {
            result[key] -= value;
        }
        for (const [key, value] of Object.entries(fromStructures.getProduction(structure))) {
            result[key] += value;
        }
    });
    return result;
}

export function getVisibleUpgrades(state, structure) {
    return structure.visibleUpgrades.map(upgradeId => {
        const upgrade = fromUpgrades.getUpgrade(state.upgrades, upgradeId);
        return {
            id: upgrade.id,
            name: upgrade.name,
            description: upgrade.description,
            cost: fromUpgrades.getResearchCost(upgrade),
            canResearch: canResearchUpgrade(state, upgrade)
        }
    });
}

