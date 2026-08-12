import _ from 'lodash';
import update from 'immutability-helper';
import {compareNumbers, INFINITY, mapObject, roundToDecimal} from "../../lib/helpers";
import database, {calculators} from '../../database/resources';
import * as fromStructures from "./structures";
import * as fromUpgrades from "./upgrades";
import * as fromAbilities from "./abilities";
import * as fromPlanet from "./planet";
import {withRecalculation} from "../reducer";
import {STATUSES, TERRAINS} from "../../lib/planet_map";

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
            // If already learned, do nothing (prevents potential error state w/ duplicate visibleIds)
            if (state.byId[payload.id]) return state;

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
            // Do not want assigning/removing droids to affect lifetimeTotal
            return produceReducer(state, { standardDroids: payload.amount }, false)
        case fromPlanet.REMOVE_DROID:
            // Recalled scouts walk home and credit on arrival (see PROGRESS numArrivedHome below); only droids that
            // despawned immediately (unplaced/already home) credit now
            return payload.instantIndices.length > 0
                ? produceReducer(state, { standardDroids: payload.instantIndices.length }, false)
                : state;
        case fromPlanet.DEPLOY_SQUAD:
            // The squad walks out with its droids and its consumable pouch; both leave base stock now
            return consumeReducer(state, { ...(payload.pouch || {}), standardDroids: payload.squadSize })
        case fromPlanet.DISBAND_SQUAD: {
            // Only survivors return to the idle pool; combat losses are permanent (never re-credited).
            // Any undelivered cargo banks here too, and unused pouch items go back on the shelf. Rewards must
            // be already-LEARNed resources (unlearned ids are dropped silently by produceReducer).
            let next = state;
            if (payload.survivors > 0) {
                next = produceReducer(next, { standardDroids: payload.survivors }, false);
            }
            if (payload.cargo && Object.keys(payload.cargo).length > 0) {
                next = produceReducer(next, payload.cargo);
            }
            if (payload.pouch && Object.keys(payload.pouch).length > 0) {
                next = produceReducer(next, payload.pouch, false);
            }
            return next;
        }
        case fromPlanet.SQUAD_DELIVER_CARGO:
            // The squad touched the powered grid: cargo banks (lost on a wipe, so this is the payoff moment)
            return produceReducer(state, payload.cargo)
        case fromPlanet.GENERATE_MAP: {
            // Starting land: the already-explored flatland around home. Infested flatland never counts until
            // its nest is cleared (see SQUAD_FIGHT_WON below).
            let startingLand = 0;
            payload.map.forEach(row => row.forEach(sector => {
                if (sector.status === STATUSES.explored.enum &&
                    sector.terrain === TERRAINS.flatland.enum && !sector.infestedBy) {
                    startingLand++;
                }
            }));
            return produceReducer(state, { buildableLand: startingLand });
        }
        case fromPlanet.SQUAD_FIGHT_WON:
            // A cleared nest retracts its infestation; the revealed flatland under it credits as one chunk
            return payload.landCredit > 0
                ? produceReducer(state, { buildableLand: payload.landCredit })
                : state;
        case fromPlanet.ADVANCE_SQUAD:
            // The driven squad reveals tiles just like scouts do; same land credit.
            return payload.revealedFlatland > 0
                ? produceReducer(state, { buildableLand: payload.revealedFlatland })
                : state;
        case fromPlanet.PROGRESS: {
            // Droids reveal tiles as they explore; each newly-revealed flatland tile adds buildable land.
            let next = state;
            if (payload.revealedFlatland > 0) {
                next = produceReducer(next, { buildableLand: payload.revealedFlatland });
            }
            // Recalled scouts rejoin the idle pool as they arrive home
            if (payload.numArrivedHome > 0) {
                next = produceReducer(next, { standardDroids: payload.numArrivedHome }, false);
            }
            return next;
        }
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