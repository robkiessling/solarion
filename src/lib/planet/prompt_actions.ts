import type {EncounterPrompt} from "../../redux/modules/squad";
import {actionLabelFor, type Poi} from "./pois";

/**
 * The encounter popup's answers for each phase of a prompt, in button order. One list feeds both the buttons
 * (components/battle/encounter_popup.jsx) and the number keys (components/planet/globe.jsx), so the printed
 * number and the key that fires it can't drift apart.
 *
 * The keyboard rule, across every popup: buttons are numbered 1..N left to right and the last number is always
 * the way out (Leave, Withdraw, a result's Continue). Numbers pick from a list the game waits on. Esc is a
 * fight's Retreat and nothing else: the fight is the one popup that keeps ticking while the player decides, and
 * Retreat is the one action that aborts a live process rather than answering a menu, so it gets the one key
 * nobody has to look up. Enter and Space do nothing in a popup; no button has a hidden second key.
 */

/** The bound thunks an answer runs through (the connected props of the components above) */
export interface PromptDispatchers {
    squadInteract: (choiceIndex: number) => unknown;
    squadLeavePrompt: () => unknown;
    squadEngage: () => unknown;
    squadLeaveApproach: () => unknown;
    squadDescend: () => unknown;
    squadWithdraw: () => unknown;
}

export interface PromptAction {
    label: string;
    run: (via: PromptDispatchers) => void;
}

export function promptActions(poi: Poi, prompt: EncounterPrompt): PromptAction[] {
    switch (prompt.phase) {
        case 'offer': {
            // A field event offers its own answers; every other site has the one take-it action
            const choices = poi.choices || [{ label: actionLabelFor(poi) }];
            return [
                ...choices.map((choice, i) => ({ label: choice.label, run: (via: PromptDispatchers) => { via.squadInteract(i); } })),
                { label: 'Leave', run: via => { via.squadLeavePrompt(); } }
            ];
        }
        case 'approach':
            // A concealed site (a camp, an ambush) was sprung on the squad, so it offers no Leave
            return [
                { label: 'Continue', run: via => { via.squadEngage(); } },
                ...(poi.concealed ? [] : [{ label: 'Leave', run: (via: PromptDispatchers) => { via.squadLeaveApproach(); } }])
            ];
        case 'result':
            // A level of a deeper site fell: the result doubles as the descend-or-withdraw choice (a tunnel's
            // levels run ahead, not down)
            if (prompt.result && prompt.result.nextLevel != null) {
                return [
                    { label: poi.type === 'tunnel' ? 'Press on' : 'Descend', run: via => { via.squadDescend(); } },
                    { label: 'Withdraw', run: via => { via.squadWithdraw(); } }
                ];
            }
            return [{ label: 'Continue', run: via => { via.squadLeavePrompt(); } }];
    }
    return [];
}
