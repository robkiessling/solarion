import update from 'immutability-helper';
import { v4 } from 'uuid';

// Actions
export const LOG = 'log/LOG';
export const START_LOG_SEQUENCE = 'log/START_LOG_SEQUENCE';
export const END_LOG_SEQUENCE = 'log/END_LOG_SEQUENCE';

// Initial State
const initialState: LogState = {
    bySequenceId: {},
    visibleSequenceIds: []
}

// Reducers
export default function reducer(state: LogState = initialState, action: GameAction): LogState {
    const payload = action.payload;

    switch (action.type) {
        case LOG:
            return update(state, {
                bySequenceId: {
                    [payload.sequence]: {
                        $set: {
                            id: payload.id,
                            sequence: payload.sequence,
                            status: 'completed',
                            vars: payload.vars,
                            // Inline entries (see logInline) carry their own text instead of a database id
                            entryType: payload.entryType,
                            text: payload.text,
                            className: payload.className,
                            style: payload.style
                        }
                    }
                },
                visibleSequenceIds: { $push: [payload.sequence] }
            });
        case START_LOG_SEQUENCE:
            return update(state, {
                bySequenceId: {
                    [payload.sequence]: {
                        $set: { id: payload.id, sequence: payload.sequence, vars: payload.vars, status: 'in_progress' }
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
// vars: optional {placeholder: value} map for {placeholders} in the database text. Values are captured
// here at dispatch time and stored on the entry, so backfilled history re-renders the original text.
export function logMessage(id, vars = null) {
    return { type: LOG, payload: { id: id, vars: vars, sequence: v4() } };
}

// Logs a one-off line of dynamic text. Unlike logMessage, the text lives on the entry itself rather than in
// the logs database, so it can contain runtime values. The text is stored in the save -- terminal history is
// a record, so old lines keeping their old copy is correct. (Used for ambient expedition telemetry: cargo
// banked, sealed sites, disband summaries, squad wipes.)
// style: optional inline CSS properties for the entry (e.g. a colour taken from the map palette)
export function logInline(text, className = '', style = null) {
    return { type: LOG, payload: { id: null, entryType: 'inline', text, className, style, sequence: v4() } };
}

// Starts a log sequence (outputs the text over time). vars: see logMessage.
export function startLogSequence(id, vars = null) {
    return { type: START_LOG_SEQUENCE, payload: { id: id, vars: vars, sequence: v4() } };
}
export function endLogSequence(sequence) {
    return { type: END_LOG_SEQUENCE, payload: { sequence } };
}


// Standard Functions
export function getLogData(state: LogState, sequenceId: string) {
    return state.bySequenceId[sequenceId];
}

export function hasStartedGame(state: LogState) {
    return state && state.visibleSequenceIds && state.visibleSequenceIds.length;
}
