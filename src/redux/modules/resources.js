import update from 'immutability-helper';
import {compareNumbers, INFINITY, mapObject, roundToDecimal} from "../../lib/helpers";
import database, {calculators} from '../../database/resources';
import * as fromStructures from "./structures";
import * as fromUpgrades from "./upgrades";
import * as fromAbilities from "./abilities";
import * as fromPlanet from "./planet";
import {withRecalculation} from "../reducer";
import {numSectorsMatching, STATUSES, TERRAINS} from "../../lib/planet_map";

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
        case fromAbilities.CHARGE_RNG:
            return produceReducer(state, payload.resources)
        case fromStructures.ASSIGN_DROID:
        case fromPlanet.ASSIGN_DROID:
            return consumeReducer(state, { standardDroids: payload.amount })
        case fromStructures.REMOVE_DROID:
        case fromPlanet.REMOVE_DROID:
            // Do not want assigning/removing droids to affect lifetimeTotal
            return produceReducer(state, { standardDroids: payload.amount }, false)
        case fromPlanet.GENERATE_MAP:
            return produceReducer(state, { buildableLand: numSectorsMatching(payload.map, STATUSES.explored.enum, TERRAINS.flatland.enum) })
        case fromPlanet.FINISH_EXPLORING_SECTOR:
            const sectorIsFlatland = payload.sector.terrain === TERRAINS.flatland.enum;
            return sectorIsFlatland ? produceReducer(state, { buildableLand: 1 }) : state;
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
function produceReducer(state, amounts, incrementLifetimeTotal = true) {
    return update(state, {
        byId: mapObject(amounts, (resourceId, amount) => {
            const resource = getResource(state, resourceId);
            if (!resource) { return {}; }
            const capacity = getCapacity(resource);
            const oldAmount = getQuantity(resource);
            const newAmount = Math.min(oldAmount + amount, capacity);
            const gain = capacity === INFINITY ? amount : (newAmount - oldAmount);
            return {
                amount: { $set: roundToDecimal(newAmount, 5) },
                lifetimeTotal: { $apply: function(x) { return incrementLifetimeTotal ? roundToDecimal(x + gain, 5) : x; } }
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
export function hasLifetimeQuantities(state, amounts) {
    return Object.entries(amounts).every(([k,v]) => getLifetimeQuantity(getResource(state, k)) >= v);
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
export function highlightCosts(state, amounts) {
    return mapObject(amounts, (resourceId, resourceCost) => {
        return {
            amount: resourceCost,
            hasEnough: getQuantity(getResource(state, resourceId)) >= resourceCost
        }
    });
}