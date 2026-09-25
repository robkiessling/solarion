import type {EncounterPrompt} from "../../redux/modules/squad";
import {poiChoices, sealChoices, type Poi, type PoiChoice} from "./pois";
import {EQUIPMENT_DEFS, type EquipmentCharges} from "../../database/squad/equipment";

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
    squadClearSeal: (choiceIndex: number) => unknown;
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

// An answer's button text: its label, and the gear it spends when it spends any (the one place the piece is
// named, and only to a squad that carries it)
function choiceLabel(choice: PoiChoice): string {
    return choice.equipment ? `${choice.label} (${EQUIPMENT_DEFS[choice.equipment].name})` : choice.label;
}

/** `equipment` is the fielded squad's charges: an answer that spends a charge is only listed while one is held */
export function promptActions(poi: Poi, prompt: EncounterPrompt, equipment: EquipmentCharges): PromptAction[] {
    switch (prompt.phase) {
        case 'seal': {
            // A blocked site: the ways through the squad can afford, then Leave (the squad stays at the door)
            return [
                ...sealChoices(poi, equipment).map((choice, i) => ({ label: choiceLabel(choice), run: (via: PromptDispatchers) => { via.squadClearSeal(i); } })),
                { label: 'Leave', run: via => { via.squadLeavePrompt(); } }
            ];
        }
        case 'offer': {
            return [
                ...poiChoices(poi, equipment).map((choice, i) => ({ label: choiceLabel(choice), run: (via: PromptDispatchers) => { via.squadInteract(i); } })),
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
