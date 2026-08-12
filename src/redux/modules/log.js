import update from 'immutability-helper';
import { v4 } from 'uuid';

// Actions
export const LOG = 'log/LOG';
export const START_LOG_SEQUENCE = 'log/START_LOG_SEQUENCE';
export const END_LOG_SEQUENCE = 'log/END_LOG_SEQUENCE';

// Initial State
const initialState = {
    bySequenceId: {},
    visibleSequenceIds: []
}

// Reducers
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case LOG:
            if (state.bySequenceId[payload.sequence]) { return state; } // already logged (e.g. previous save state)

            return update(state, {
                bySequenceId: {
                    [payload.sequence]: {
                        $set: {
                            id: payload.id,
                            sequence: payload.sequence,
                            timestamp: payload.timestamp,
                            status: 'completed',
                            // Inline entries (see logInline) carry their own text instead of a database id
                            entryType: payload.entryType,
                            text: payload.text,
                            className: payload.className
                        }
                    }
                },
                visibleSequenceIds: { $push: [payload.sequence] }
            });
        case START_LOG_SEQUENCE:
            if (state.bySequenceId[payload.sequence]) { return state; } // already logged (e.g. previous save state)

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

// Logs a message in the 'completed' state (instantly rendering it)
// sequence is a random uuid, just has to be unique: https://egghead.io/lessons/javascript-redux-persisting-the-state-to-the-local-storage
export function logMessage(id) {
    return { type: LOG, payload: { id: id, sequence: v4(), timestamp: null } };
}

// Logs a one-off line of dynamic text. Unlike logMessage, the text lives on the entry itself rather than in
// the logs database, so it can contain runtime values. The text is stored in the save -- terminal history is
// a record, so old lines keeping their old copy is correct. (Used for ambient expedition telemetry: cargo
// banked, sealed sites, disband summaries, squad wipes.)
export function logInline(text, className = '') {
    return { type: LOG, payload: { id: null, entryType: 'inline', text, className, sequence: v4(), timestamp: null } };
}

// Starts a log sequence (outputs the text over time)
export function startLogSequence(id) {
    return { type: START_LOG_SEQUENCE, payload: { id: id, sequence: v4(), timestamp: null } };
}
export function endLogSequence(sequence) {
    return { type: END_LOG_SEQUENCE, payload: { sequence } };
}


// Standard Functions
export function getLogData(state, sequenceId) {
    return state.bySequenceId[sequenceId];
}

export function hasStartedGame(state) {
    return state && state.visibleSequenceIds && state.visibleSequenceIds.length;
}