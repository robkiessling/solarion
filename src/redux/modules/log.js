import update from 'immutability-helper';
import _ from 'lodash';
import database from '../../database/logs'
import * as fromStructures from "./structures";

// Actions
export const LOG = 'log/LOG';
export const START_LOG_SEQUENCE = 'log/START_LOG_SEQUENCE';
export const END_LOG_SEQUENCE = 'log/END_LOG_SEQUENCE';

// export const LOG_START = 'log/LOG_START';
// export const LOG_FINISH = 'log/LOG_FINISH';

// Initial State
const initialState = {
    // sections: [
    //     /* { id: 'startup', timestamp: '...', status: 'completed' } */
    // ],
    bySequenceId: {},
    visibleSequenceIds: []
}

// Reducers
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case LOG:
            return update(state, {
                bySequenceId: {
                    [payload.sequence]: {
                        $set: { id: payload.id, sequence: payload.sequence, timestamp: payload.timestamp, status: 'completed' }
                    }
                },
                visibleSequenceIds: { $push: [payload.sequence] }
            });
        case START_LOG_SEQUENCE:
            return update(state, {
                bySequenceId: {
                    [payload.sequence]: {
                        $set: { id: payload.id, sequence: payload.sequence, timestamp: payload.timestamp, status: 'in_progress' }
                    }
                },
                visibleSequenceIds: { $push: [payload.sequence] }
            });
        case END_LOG_SEQUENCE:
            return update(state, {
                bySequenceId: {
                    [payload.sequence]: {
                        $apply: function(x) { return update(x, { status: { $set: 'completed' } }); }
                    }
                }
            });
        default:
            return state;
    }
}

// Action Creators
let currentSequence = 1;

// Logs a message in the 'completed' state (instantly rendering it)
export function logMessage(id) {
    return { type: LOG, payload: { id: id, sequence: currentSequence++, timestamp: null } };
}

// Starts a log sequence (outputs the text over time)
export function startLogSequence(id) {
    return { type: START_LOG_SEQUENCE, payload: { id: id, sequence: currentSequence++, timestamp: null } };
}
export function endLogSequence(sequence) {
    return { type: END_LOG_SEQUENCE, payload: { sequence } };
}


// Standard Functions
export function getLogData(state, sequenceId) {
    return state.bySequenceId[sequenceId];
}