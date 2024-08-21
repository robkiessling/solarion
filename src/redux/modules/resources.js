import update from 'immutability-helper';
import {mapObject} from "../../lib/helpers";
import database, {calculators} from '../../database/resources';
import * as fromStructures from "./structures";
import * as fromUpgrades from "./upgrades";
import * as fromAbilities from "./abilities";
import {withRecalculation} from "../reducer";

export { calculators };

// Actions
export const LEARN = 'resources/LEARN';
export const CONSUME = 'resources/CONSUME';
export const PRODUCE = 'resources/PRODUCE';

// Initial State
const initialState = {
    byId: {},
    visibleIds: []
}

// Reducer
export default function reducer(state = initialState, action) {
    const payload = action.payload;

    switch (action.type) {
        case LEARN:
            return update(state, {
                byId: {
                    [payload.id]: {
                        $set: _.merge({}, database[payload.id], { id: payload.id, lifetimeTotal: database[payload.id].amount })
                    }
                },

                // Only resources with the visible:true attribute get added to visibleIds
                visibleIds: { $push: database[payload.id].visible ? [payload.id] : [] }
            });
        case CONSUME:
            return consumeReducer(state, payload.amounts);
        case PRODUCE:
            return produceReducer(state, payload.amounts);
        case fromStructures.BUILD:
            return consumeReducer(state, fromStructures.getBuildCost(payload.structure));
        case fromUpgrades.RESEARCH:
            return consumeReducer(state, fromUpgrades.getResearchCost(payload.upgrade));
        case fromAbilities.START_CAST:
            return consumeReducer(state, fromAbilities.getAbilityCost(payload.ability));
        case fromAbilities.END_CAST:
            return produceReducer(state, fromAbilities.getAbilityProduction(payload.ability));
        case fromStructures.ASSIGN_DROID:
            return consumeReducer(state, { maintenanceDroids: 1 })
        case fromStructures.REMOVE_DROID:
            return produceReducer(state, { maintenanceDroids: 1 })

        default:
            return state;
    }
}
function consumeReducer(state, amounts) {
    return update(state, {
        byId: mapObject(amounts, (resourceId, amount) => (
            { amount: { $apply: function(x) { return x - amount; } } }
        ))
    });
}
function produceReducer(state, amounts) {
    return update(state, {
        byId: mapObject(amounts, (resourceId, amount) => {
            const resource = getResource(state, resourceId);
            const capacity = getCapacity(resource);
            const oldAmount = getQuantity(resource);
            const newAmount = Math.min(oldAmount + amount, capacity);
            const gain = capacity === Infinity ? amount : (newAmount - oldAmount);
            return {
                amount: { $set: newAmount },
                lifetimeTotal: { $apply: function(x) { return x + gain; } }
            }
        })
    });
}

// Action Creators
export function learn(id) {
    return withRecalculation({ type: LEARN, payload: { id } });
}

export function consume(amounts) {
    return function(dispatch, getState) {
        if (canConsume(getState().resources, amounts)) {
            dispatch(consumeUnsafe(amounts));
        }
    }
}
export function consumeUnsafe(amounts) {
    return { type: CONSUME, payload: { amounts } };
}

export function produce(amounts) {
    return { type: PRODUCE, payload: { amounts } };
}


// Standard Functions
export function getResource(state, id) {
    return state.byId[id];
}
export function canConsume(state, amounts) {
    return Object.entries(amounts).every(([k,v]) => getQuantity(getResource(state, k)) >= v);
}
export function getQuantity(resource) {
    if (!resource) {
        return 0;
    }
    return resource.amount;
}
export function getLifetimeQuantity(resource) {
    if (!resource) {
        return 0;
    }
    return resource.lifetimeTotal;
}
export function getCapacity(resource) {
    return resource.capacity;
}
export function getIcon(id) {
    return database[id].icon;
}
export function getIconSpan(id, skinny = false, colorless = true) {
    return `<span class="${getIcon(id)} ${skinny ? 'skinny-icon' : ''} ${colorless ? 'colorless-icon' : ''}"></span>`;
}
