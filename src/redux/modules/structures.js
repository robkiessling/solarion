import update from 'immutability-helper';
import {canConsume, consume, consumeUnsafe} from "./resources";
import _ from 'lodash';
import database from '../../database/structures'

// Actions
export const BUILD = 'structures/BUILD';

// Initial State
const initialState = {
    byId: {
        harvester: {
            count: 0
        },
        // solarPanel: {
        //     count: 0
        // }
    },
    visibleIds: [
        'harvester',
        // 'solarPanel'
    ]
}
// normally this will happen when you create the new structure
for (const [key, value] of Object.entries(initialState.byId)) {
    _.merge(value, database[key])
}


// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case BUILD:
            return update(state, {
                byId: {
                    [payload.id]: {
                        count: { $apply: function(x) { return x + payload.amount; } }
                    }
                }
            })
        default:
            return state;
    }
}

// Action Creators
export function build(id, amount) {
    return function(dispatch, getState) {
        const cost = getBuildCost(getState(), id);
        if (canConsume(getState(), 'minerals', cost)) {
            // TODO Batch these
            dispatch(buildUnsafe(id, amount));
            dispatch(consumeUnsafe('minerals', cost));
        }
    }
}
export function buildUnsafe(id, amount) {
    return { type: BUILD, payload: { id, amount } };
}

// Standard Functions
export function getStructure(state, id) {
    return state.structures.byId[id];
}
export function getBuildCost(state, id) {
    return getStructure(state, id).cost.minerals.base;
}
export function canBuild(state, id) {
    return canConsume(state, 'minerals', getBuildCost(state, id));
}