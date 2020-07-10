import update from 'immutability-helper';
import {canConsume, consumeUnsafe, produce} from "./resources";
import _ from 'lodash';
import database from '../../database/structures'
import {mapObject} from "../../lib/helpers";
import {batch} from 'react-redux';
import {canBuildStructure} from "../reducer";

// Actions
export const LEARN = 'structures/LEARN';
export const BUILD = 'structures/BUILD';

// Initial State
const initialState = {
    byId: {},
    visibleIds: []
}

// Reducers
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

// TODO Technically should this be moved into parent reducer? since it is using getState() not just getState().structures
export function build(id, amount) {
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
export function buildUnsafe(id, amount) {
    return { type: BUILD, payload: { id, amount } };
}

// Standard Functions
export function getStructure(state, id) {
    return state.byId[id];
}
export function getBuildCost(structure) {
    return mapObject(structure.cost, (k, v) => v.base * (v.increment)**(structure.count));
}
export function getProduction(structure) {
    if (structure.produces === undefined) { return {}; }
    return mapObject(structure.produces, (k, v) => v.base * structure.count);
}
export function getConsumption(structure) {
    if (structure.consumes === undefined) { return {}; }
    return mapObject(structure.consumes, (k, v) => v.base * structure.count);
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
export function getTotalConsumption(state) {
    let result = {};
    iterateVisible(state, structure => {
        for (const [key, value] of Object.entries(getConsumption(structure))) {
            if (result[key] === undefined) { result[key] = 0; }
            result[key] += value;
        }
    });
    return result;
}

// Note: This will emit a lot of dispatches... it should be surrounded by a batch()
// TODO Technically should this be moved into parent reducer? since it is using getState().resources
export function applyTime(time) {
    return function(dispatch, getState) {
        iterateVisible(getState().structures, structure => {
            const consumption = mapObject(getConsumption(structure), (k, v) => v * time);
            if (canConsume(getState().resources, consumption)) {
                dispatch(consumeUnsafe(consumption));
                dispatch(produce(mapObject(getProduction(structure), (k, v) => v * time)));
            }
        })
    }
}



function iterateVisible(state, callback) {
    state.visibleIds.forEach(id => {
        callback(getStructure(state, id));
    });
}