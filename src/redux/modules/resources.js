import update from 'immutability-helper';
import {mapObject} from "../../lib/helpers";
import _ from 'lodash';

// Actions
export const CONSUME = 'resources/CONSUME';
export const PRODUCE = 'resources/PRODUCE';

// Initial State
const initialState = {
    byId: {
        minerals: {
            name: "Minerals",
            amount: 0
        },
        energy: {
            name: "Energy",
            amount: 50,
            capacity: {
                base: 100
            }
        }
    },
    visibleIds: ['energy', 'minerals']
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case CONSUME:
            return update(state, {
                byId: mapObject(payload.amounts, (k, v) => ({ amount: { $apply: function(x) { return x - v; } } }))
            });
        case PRODUCE:
            return update(state, {
                byId: mapObject(payload.amounts, (k, v) => ({ amount: { $apply: function(x) {
                    return Math.min(x + v, getCapacity(state, k));
                } } }))
            });
        default:
            return state;
    }
}

// Action Creators
export function consume(amounts) {
    return function(dispatch, getState) {
        if (canConsume(getState().resources, amounts)) {
            dispatch(consumeUnsafe(amounts));
        }
    }
}
export function consumeUnsafe(amounts) {
    return { type: CONSUME, payload: { amounts } };
}

export function produce(amounts) {
    return { type: PRODUCE, payload: { amounts } };
}

// Standard Functions
export function getResource(state, id) {
    return state.byId[id];
}
export function canConsume(state, amounts) {
    return Object.entries(amounts).every(([k,v]) => getQuantity(state, k) >= v);
}
export function getQuantity(state, id) {
    return getResource(state, id).amount;
}
export function getCapacity(state, id) {
    if (getResource(state, id).capacity === undefined) { return Infinity; }
    return getResource(state, id).capacity.base;
}

export function toString(amounts) {
    if (Object.keys(amounts).length === 0) { return 'N/A'; }
    return Object.entries(amounts).map(([k,v]) => `${k}: ${_.round(v, 1)}` ).join(', ')
}