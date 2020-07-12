import { combineReducers } from 'redux'
import {batch} from "react-redux";

import clock from './modules/clock'
import resources, * as fromResources from './modules/resources';
import structures, * as fromStructures from "./modules/structures";
import upgrades, * as fromUpgrades from "./modules/upgrades";
import {
    buildUnsafe,
    getConsumption,
    getProduction,
    getStructure,
    iterateVisible,
    toggleRunning
} from "./modules/structures";
import {mapObject} from "../lib/helpers";

export default combineReducers({
    clock,
    resources,
    structures,
    upgrades
});

export function canResearchUpgrade(state, upgrade) {
    return fromResources.canConsume(state.resources, fromUpgrades.getResearchCost(upgrade));
}
export function researchUpgrade(structureId, upgradeId) {
    return function(dispatch, getState) {
        const upgrade = fromUpgrades.getUpgrade(getState().upgrades, upgradeId);
        if (canResearchUpgrade(getState(), upgrade)) {
            dispatch(fromUpgrades.researchUnsafe(structureId, upgrade));
        }
    }
}


export function canBuildStructure(state, structure) {
    return fromResources.canConsume(state.resources, fromStructures.getBuildCost(structure));
}

export function buildStructure(id, amount) {
    return function(dispatch, getState) {
        const structure = getStructure(getState().structures, id);
        if (canBuildStructure(getState(), structure)) {
            dispatch(buildUnsafe(structure, amount));
        }
    }
}

// Note: This can emit a lot of dispatches... it should be surrounded by a batch()
export function applyTime(time) {
    return function(dispatch, getState) {
        iterateVisible(getState().structures, structure => {
            const consumption = mapObject(getConsumption(structure), (resourceId, amount) => amount * time);
            if (fromResources.canConsume(getState().resources, consumption)) {
                dispatch(fromResources.consumeUnsafe(consumption));
                dispatch(fromResources.produce(mapObject(getProduction(structure), (resourceId, amount) => amount * time)));
            }
            else {
                dispatch(toggleRunning(structure.id, false));
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

export function getVisibleUpgrades(state, structure) {
    return structure.visibleUpgrades.map(upgradeId => {
        const upgrade = fromUpgrades.getUpgrade(state.upgrades, upgradeId);
        return {
            id: upgrade.id,
            name: upgrade.name,
            cost: fromUpgrades.getResearchCost(upgrade),
            canResearch: canResearchUpgrade(state, upgrade)
        }
    });
}

