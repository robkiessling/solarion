import { combineReducers } from 'redux'

import clock from './modules/clock'
import resources, * as fromResources from './modules/resources';
import structures, * as fromStructures from "./modules/structures";

export default combineReducers({
    clock,
    resources,
    structures
});

export function canBuildStructure(state, structure) {
    return fromResources.canConsume(state.resources, fromStructures.getBuildCost(structure));
}