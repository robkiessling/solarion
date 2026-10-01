import update from 'immutability-helper';
import * as fromLog from "./log";

export interface AuthorizationsState {
    /** the last authorization number used */
    count: number;
}

/**
 * The authorization ledger: one counter for every operator signature that matters (the intro cards, research,
 * decisions). Each takes the next number and the terminal prints its receipt; the machine quotes these numbers back
 * late-game. Seeded past the pre-war entries.
 */

// Actions
export const RECORD_AUTHORIZATION = 'authorizations/RECORD' as const;

export type AuthorizationsAction =
    | { type: typeof RECORD_AUTHORIZATION };

// Initial State
const initialState: AuthorizationsState = {
    count: 311, // the last pre-war signature
};

// Reducer
export default function reducer(state: AuthorizationsState = initialState, action: GameAction): AuthorizationsState {
    switch (action.type) {
        case RECORD_AUTHORIZATION:
            return update(state, { count: { $set: state.count + 1 } });
        default:
            return state;
    }
}

// Action Creators

/**
 * Takes the next number in the authorization ledger and prints its receipt ("AUTH 0312 BLAST SHIELD: GRANTED").
 * Returns the number. Pass null to count without a receipt (the boot sequence prints its own, with the number as a
 * var). Labels stay short: the terminal is 33 columns wide.
 */
export function recordAuthorization(label: string | null) {
    return (dispatch: Dispatch, getState: GetState): number => {
        dispatch({ type: RECORD_AUTHORIZATION });
        const number = getState().authorizations.count;
        if (label !== null) {
            dispatch(fromLog.startLogSequence('authReceipt', { number: formatAuthNumber(number), label }));
        }
        return number;
    }
}
export function formatAuthNumber(number: number): string {
    return String(number).padStart(4, '0');
}
