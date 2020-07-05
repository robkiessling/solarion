import update from 'immutability-helper';
import {canConsume, consume, consumeUnsafe} from "./resources";
import _ from 'lodash';
import database from '../../database/structures'

// Actions
export const LEARN = 'structures/LEARN';
export const BUILD = 'structures/BUILD';

// Initial State
const initialState = {
    byId: {},
    visibleIds: []
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case LEARN:
            return update(state, {
                byId: {
                    [payload.id]: {
                        $set: _.merge({}, database[payload.id], { count: 0 })
                    }
                },
                visibleIds: { $push: [payload.id] }
            });
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
export function learn(id) {
    return { type: LEARN, payload: { id } };
}
export function build(id, amount) {
    return function(dispatch, getState) {
        const structure = getStructure(getState(), id);
        if (canBuild(getState(), structure)) {
            const cost = getBuildCost(structure);

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
export function getBuildCost(structure) {
    return Math.floor(structure.cost.minerals.base * (structure.cost.minerals.increment)**(structure.count));
}
export function canBuild(state, structure) {
    return canConsume(state, 'minerals', getBuildCost(structure));
}
export function getProduction(structure) {
    return structure.produces.minerals.base * structure.count;
}
export function getTotalProduction(state) {
    let total = 0;
    iterateVisible(state, structure => {
        total += getProduction(structure);
    });
    return total;
}
function iterateVisible(state, callback) {
    state.structures.visibleIds.forEach(id => {
        callback(getStructure(state, id));
    });
}