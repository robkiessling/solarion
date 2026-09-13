import update from 'immutability-helper';
import type {LogId} from '../../database/logs';

// The terminal keeps a flat list of printed lines plus a queue of what is still to print. Lines are stored as
// resolved text (placeholders filled, database id forgotten): terminal history is a record of what was shown,
// and a flat list is what lets old lines be dropped past MAX_LINES without breaking anything.
//
// The queue is played by the Log component (components/log.jsx), one entry at a time in order, so a trigger
// firing mid-boot prints after the boot rather than interleaved with it. The head entry is the one playing;
// `progress` counts its lines already printed, so a reload resumes it from there without reprinting (its
// onFinish side effect still runs exactly once, at the end). One-off text entries print instantly.

/** how many printed lines are kept, on screen and in the save; the oldest are dropped past this */
export const MAX_LINES = 400;

export interface PrintedLine {
    /** unique, increasing; React keys and "newer than" comparisons rely on it */
    id: number;
    text: string;
    className?: string;
    style?: LineStyle | null;
    /** landed with a background flash (a landing effect; restored history never replays it) */
    flash?: boolean;
}

export type LineStyle = { [property: string]: string | number };
export type LogVars = { [placeholder: string]: string | number } | null;

export type QueueEntry =
    | { id: number; sequence: LogId; vars?: LogVars; progress: number }
    | { id: number; text: string; className?: string; style?: LineStyle | null };

export interface LogState {
    lines: PrintedLine[];
    queue: QueueEntry[];
    /** next id for a line or queue entry */
    nextId: number;
    /** set once anything has been queued; the app uses it to tell a new game from a restored one */
    started: boolean;
}

// Actions
export const PRINT_LINE = 'log/PRINT_LINE' as const;
export const ENQUEUE = 'log/ENQUEUE' as const;
export const FINISH_HEAD = 'log/FINISH_HEAD' as const;

export type LogAction =
    | { type: typeof PRINT_LINE; payload: { text: string; className?: string; style?: LineStyle | null; flash?: boolean } }
    | { type: typeof ENQUEUE; payload: { sequence: LogId; vars?: LogVars } | { text: string; className?: string; style?: LineStyle | null } }
    | { type: typeof FINISH_HEAD; payload: { id: number } };

// Initial State
const initialState: LogState = {
    lines: [],
    queue: [],
    nextId: 0,
    started: false
}

// Reducers
export default function reducer(state: LogState = initialState, action: GameAction): LogState {
    switch (action.type) {
        case PRINT_LINE: {
            const line: PrintedLine = { id: state.nextId, text: action.payload.text };
            if (action.payload.className) { line.className = action.payload.className; }
            if (action.payload.style) { line.style = action.payload.style; }
            if (action.payload.flash) { line.flash = true; }

            const lines = state.lines.length >= MAX_LINES
                ? [...state.lines.slice(state.lines.length - MAX_LINES + 1), line]
                : [...state.lines, line];

            const head = state.queue[0];
            const queue = head && 'sequence' in head
                ? [{ ...head, progress: head.progress + 1 }, ...state.queue.slice(1)]
                : state.queue;

            return { ...state, lines, queue, nextId: state.nextId + 1 };
        }
        case ENQUEUE: {
            const entry: QueueEntry = 'sequence' in action.payload
                ? { id: state.nextId, sequence: action.payload.sequence, vars: action.payload.vars, progress: 0 }
                : { id: state.nextId, ...action.payload };
            return update(state, {
                queue: { $push: [entry] },
                nextId: { $set: state.nextId + 1 },
                started: { $set: true }
            });
        }
        case FINISH_HEAD: {
            // Guarded by id so a stale finish (a timer outliving its entry) can't drop the wrong entry
            const head = state.queue[0];
            if (!head || head.id !== action.payload.id) { return state; }
            return update(state, { queue: { $splice: [[0, 1]] } });
        }
        default:
            return state;
    }
}

// Action Creators

// Queues a database sequence: its lines print over time, then its onFinish runs.
// vars: optional {placeholder: value} map for {placeholders} in the sequence's text, filled as each line prints.
export function startLogSequence(sequence: LogId, vars: LogVars = null): LogAction {
    return { type: ENQUEUE, payload: { sequence, vars } };
}

// Queues a one-off line of dynamic text (expedition telemetry, dev skips): printed instantly once whatever is
// ahead of it has finished. style: optional inline CSS (e.g. a colour taken from the map palette).
export function logInline(text: string, className = '', style: LineStyle | null = null): LogAction {
    return { type: ENQUEUE, payload: { text, className, style } };
}

// Used by the player only: commits a line to history (and counts it towards the head sequence's progress).
// Returns the new line's id, read back from the store so it is right even before the component's props catch up.
export function printLine(text: string, options: { className?: string; style?: LineStyle | null; flash?: boolean } = {}): Thunk<number> {
    return (dispatch, getState) => {
        dispatch({ type: PRINT_LINE, payload: { text, ...options } });
        return getState().log.nextId - 1;
    };
}
export function finishHead(id: number): LogAction {
    return { type: FINISH_HEAD, payload: { id } };
}


// Standard Functions
export function hasStartedGame(state: LogState) {
    return !!(state && state.started);
}
