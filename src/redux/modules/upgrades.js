import update from 'immutability-helper';
import _ from 'lodash';
import database from '../../database/upgrades'
import {getModifiedTotal, mapObject} from "../../lib/helpers";

// Actions
export const LEARN = 'upgrades/LEARN';
export const RESEARCH = 'upgrades/RESEARCH';

// Initial State
const initialState = {
    byId: {}
}

// Reducers
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case LEARN:
            return update(state, {
                byId: {
                    [payload.id]: {
                        $set: _.merge({}, database[payload.id], { id: payload.id })
                    }
                }
            });
        case RESEARCH:
            // TODO increment upgrade level
            return state;
        default:
            return state;
    }
}

// Action Creators
export function learn(structureId, id) { // Note: `id` refers to the upgrade id (implied because this is upgrades.js)
    return { type: LEARN, payload: { structureId, id } };
}

export function researchUnsafe(structureId, upgrade) {
    return { type: RESEARCH, payload: { structureId, upgrade } };
}


// Standard Functions
export function getUpgrade(state, id) {
    return state.byId[id];
}
export function getResearchCost(upgrade) {
    return mapObject(upgrade.cost, (resourceId, cost) => getModifiedTotal(cost));
}