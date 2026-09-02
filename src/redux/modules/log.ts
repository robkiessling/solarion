import update from 'immutability-helper';
import { v4 } from 'uuid';

export interface LogEntry {
    /** database id, or null for inline entries */
    id: string | null;
    sequence: string;
    status: 'in_progress' | 'completed';
    vars?: { [placeholder: string]: string | number } | null;
    entryType?: 'inline';
    text?: string;
    className?: string;
    style?: { [property: string]: string | number } | null;
}

export interface LogState {
    bySequenceId: { [sequenceId: string]: LogEntry };
    visibleSequenceIds: string[];
}

// Actions
export const LOG = 'log/LOG' as const;
export const START_LOG_SEQUENCE = 'log/START_LOG_SEQUENCE' as const;
export const END_LOG_SEQUENCE = 'log/END_LOG_SEQUENCE' as const;

export type LogAction =
    | { type: typeof LOG; payload: { sequence: string; id: string | null; vars?: LogEntry['vars']; entryType?: 'inline';
        text?: string; className?: string; style?: LogEntry['style'] } }
    | { type: typeof START_LOG_SEQUENCE; payload: { sequence: string; id: string; vars: LogEntry['vars'] } }
    | { type: typeof END_LOG_SEQUENCE; payload: { sequence: string } };

// Initial State
const initialState: LogState = {
    bySequenceId: {},
    visibleSequenceIds: []
}

// Reducers
export default function reducer(state: LogState = initialState, action: GameAction): LogState {
    switch (action.type) {
        case LOG:
            return update(state, {
                bySequenceId: {
                    [action.payload.sequence]: {
                        $set: {
                            id: action.payload.id,
                            sequence: action.payload.sequence,
                            status: 'completed',
                            vars: action.payload.vars,
                            // Inline entries (see logInline) carry their own text instead of a database id
                            entryType: action.payload.entryType,
                            text: action.payload.text,
                            className: action.payload.className,
                            style: action.payload.style
                        }
                    }
                },
                visibleSequenceIds: { $push: [action.payload.sequence] }
            });
        case START_LOG_SEQUENCE:
            return update(state, {
                bySequenceId: {
                    [action.payload.sequence]: {
                        $set: { id: action.payload.id, sequence: action.payload.sequence, vars: action.payload.vars, status: 'in_progress' }
                    }
                },
                visibleSequenceIds: { $push: [action.payload.sequence] }
            });
        case END_LOG_SEQUENCE:
            return update(state, {
                bySequenceId: {
                    [action.payload.sequence]: {
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
export function logMessage(id: string, vars: LogEntry['vars'] = null): LogAction {
    return { type: LOG, payload: { id: id, vars: vars, sequence: v4() } };
}

// Logs a one-off line of dynamic text. Unlike logMessage, the text lives on the entry itself rather than in
// the logs database, so it can contain runtime values. The text is stored in the save -- terminal history is
// a record, so old lines keeping their old copy is correct. (Used for ambient expedition telemetry: cargo
// banked, sealed sites, disband summaries, squad wipes.)
// style: optional inline CSS properties for the entry (e.g. a colour taken from the map palette)
export function logInline(text: string, className = '', style: { [property: string]: string | number } | null = null): LogAction {
    return { type: LOG, payload: { id: null, entryType: 'inline', text, className, style, sequence: v4() } };
}

// Starts a log sequence (outputs the text over time). vars: see logMessage.
export function startLogSequence(id: string, vars: LogEntry['vars'] = null): LogAction {
    return { type: START_LOG_SEQUENCE, payload: { id: id, vars: vars, sequence: v4() } };
}
export function endLogSequence(sequence: string): LogAction {
    return { type: END_LOG_SEQUENCE, payload: { sequence } };
}


// Standard Functions
export function getLogData(state: LogState, sequenceId: string) {
    return state.bySequenceId[sequenceId];
}

export function hasStartedGame(state: LogState) {
    return state && state.visibleSequenceIds && state.visibleSequenceIds.length;
}
