import { combineReducers } from 'redux'
import {batch} from "react-redux";

import clock from './modules/clock'
import resources, * as fromResources from './modules/resources';
import structures, * as fromStructures from "./modules/structures";
import {
    buildUnsafe,
    getBuildCost,
    getConsumption,
    getProduction,
    getStructure,
    iterateVisible,
    toggleRunning
} from "./modules/structures";
import {mapObject} from "../lib/helpers";
import {canConsume, consumeUnsafe, produce} from "./modules/resources";

export default combineReducers({
    clock,
    resources,
    structures
});

export function canBuildStructure(state, structure) {
    return fromResources.canConsume(state.resources, fromStructures.getBuildCost(structure));
}

export function buildStructure(id, amount) {
    return function(dispatch, getState) {
        const structure = getStructure(getState().structures, id);
        if (canBuildStructure(getState(), structure)) {
            const cost = getBuildCost(structure);

            batch(() => {
                dispatch(buildUnsafe(id, amount));
                dispatch(consumeUnsafe(cost));
            })
        }
    }
}

// Note: This can emit a lot of dispatches... it should be surrounded by a batch()
export function applyTime(time) {
    return function(dispatch, getState) {
        iterateVisible(getState().structures, (structure, id) => {
            const consumption = mapObject(getConsumption(structure), (k, v) => v * time);
            if (canConsume(getState().resources, consumption)) {
                dispatch(consumeUnsafe(consumption));
                dispatch(produce(mapObject(getProduction(structure), (k, v) => v * time)));
            }
            else {
                dispatch(toggleRunning(id, false));
            }
        })
    }
}

export function getNetResourceRates(state) {
    let result = Object.fromEntries(Object.keys(state.resources.byId).map((resourceId) => [resourceId, 0]));

    iterateVisible(state.structures, structure => {
        for (const [key, value] of Object.entries(getConsumption(structure))) {
            result[key] -= value;
        }
        for (const [key, value] of Object.entries(getProduction(structure))) {
            result[key] += value;
        }
    });
    return result;
}
