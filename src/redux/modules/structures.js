import update from 'immutability-helper';
import {canConsume, consumeUnsafe} from "./resources";
import _ from 'lodash';
import database from '../../database/structures'
import {mapObject} from "../../lib/helpers";

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
            dispatch(consumeUnsafe(cost));
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
    return mapObject(structure.cost, (k, v) => v.base * (v.increment)**(structure.count));
}
export function canBuild(state, structure) {
    return canConsume(state, getBuildCost(structure));
}
export function getProduction(structure) {
    return mapObject(structure.produces, (k, v) => v.base * structure.count);
}
export function getTotalProduction(state) {
    let result = {};
    iterateVisible(state, structure => {
        for (const [key, value] of Object.entries(getProduction(structure))) {
            if (result[key] === undefined) { result[key] = 0; }
            result[key] += value;
        }
    });
    return result;
}
function iterateVisible(state, callback) {
    state.structures.visibleIds.forEach(id => {
        callback(getStructure(state, id));
    });
}