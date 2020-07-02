import update from 'immutability-helper';
import {consume} from "./resources";

// Actions
export const BUILD = 'structures/BUILD';

// Initial State
const initialState = {
    order: [
        'harvester',
        'solarPanel'
    ],
    byId: {
        harvester: {
            count: 0
        },
        solarPanel: {
            count: 0
        }
    }
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case BUILD:
            return update(state, {
                byId: {
                    [payload.structureKey]: {
                        count: { $apply: function(x) { return x + payload.amount; } }
                    }
                }
            })
        default:
            return state;
    }
}

// Action Creators
export function build(structureKey, amount, cost) {
    return { type: BUILD, payload: { structureKey, amount, cost } };
}
