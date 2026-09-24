import type {LogId} from '../logs';
import type {UpgradeId} from './upgrades';

/**
 * Decisions: the terminal asking the operator something, answered in the decision popup (components/decision_popup.jsx).
 * The machine never takes the screen to ask. A request lands as a marked row on the owning structure's card (yellow
 * until opened, grey once seen and left); the player opens it when they choose, so nothing they were doing is
 * blocked. Close (the last numbered button) or ✕ just closes the popup and the row stays. Picking an option resolves it: the row goes away and
 * the wall's trigger re-arms so it can ask again later with whatever remedies remain.
 *
 * Records are static content; anything that depends on the game state is a function of it, evaluated while the
 * popup is open. Options are numbered 1..N on the keyboard. `hidden` removes an option (a remedy already taken);
 * `available` greys it out but leaves it visible (something the player can see but hasn't earned). A decision whose
 * options are all hidden has nothing to ask and is never requested; see requestDecision.
 *
 * A `research` option is the common case: choosing it starts that research on the spot, paying its cost, so the
 * popup is where the ore is spent and the structure card only shows the progress afterwards. Its cost and time
 * are shown on the button, it's greyed while unaffordable, and it's hidden once the research has been offered.
 */
export interface DecisionOption {
    label: string;
    /** a second, quieter line under the label */
    detail?: string;
    /** an upgrade to discover and start researching when chosen (cost shown on the button, greyed if unaffordable) */
    research?: UpgradeId;
    /** ledger receipt label printed when chosen (see recordAuthorization); short, the terminal is 33 columns wide */
    receipt?: string;
    /** log sequence printed after choosing (the terminal's record of the exchange) */
    log?: LogId;
    action?: (dispatch: Dispatch) => void;
    /** false = visible but greyed out */
    available?: (state: RootState) => boolean;
    /** true = not offered at all */
    hidden?: (state: RootState) => boolean;
}

export interface DecisionRecord {
    /** the card the request row appears on */
    structure: StructureId;
    /** the row's text */
    label: string;
    /** the popup's title */
    title: string;
    /** optional ascii block above the body, one string per line (rendered in a <pre>) */
    image?: string[];
    body: string[] | ((state: RootState) => string[]);
    options: DecisionOption[];
    /**
     * Re-armed when the decision is resolved, so the wall it answers can ask again with whatever remedies remain. A
     * TriggerId, but naming it here would make the tables' types circular (triggers read the decisions state).
     */
    rearm?: string;
}

/** Builds a table entry (typed so the record's contents are checked in place) */
export function decision(record: DecisionRecord): DecisionRecord {
    return record;
}

// No decisions yet. The panel is reserved for true either/or choices (picking one forfeits the other); anything the
// player can eventually have both of is an upgrade on a card, not a decision.
const database = {
} satisfies Record<string, DecisionRecord>;

export type DecisionId = keyof typeof database;
export default database;
