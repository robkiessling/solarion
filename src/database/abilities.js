import {getQuantity, getResource} from "../redux/modules/resources";
import {numStandardDroids} from "../redux/reducer";
import * as fromAbilities from "../redux/modules/abilities";
import * as fromPlanet from "../redux/modules/planet";
import {upgradesAffectingAbility, upgradesAffectingStructure} from "./upgrades";
import {applyOperationsToVariables, EFFECT_TARGETS, initOperations, mergeEffectIntoOperations} from "../lib/effect";
import {getUpgrade, isResearched} from "../redux/modules/upgrades";
import {STANDARD_COST_EXP} from "./structures";
import {countAllStructuresBuilt} from "../redux/modules/structures";

export const STATES = {
    ready: 0,
    casting: 1,
    cooldown: 2
}

const base = {
    name: 'Unknown',
    description: "Description N/A",
    cost: {},
    produces: {},
    castTime: 5,
    state: STATES.ready,
    effect: undefined, // Any effects will be applied for the duration of the CAST
    affects: {
        type: EFFECT_TARGETS.structure
        // No default id necessary; if blank it is assumed to be the ability's structure
    },

    cooldown: 0 // Note: cooldown starts after cast FINISHES (not at start of cast)
}

const database = {
    commandCenter_charge: _.merge({}, base, {
        name: "Manual Charge",
        structure: "commandCenter",
        description: "The device has a hand crank to generate emergency power.",
        cost: {},
        effect: {
            charging: { add: 1 }
        }
    }),
    harvester_overclock: _.merge({}, base, {
        name: 'Overclock',
        structure: 'harvester',
    }),

    droidFactory_buildStandardDroid: _.merge({}, base, {
        name: 'Build Droid',
        structure: 'droidFactory',
        description: "Droids can be assigned to structures, improving their performance.",
        produces: {
            standardDroids: 1
        },
    }),

    replicate: _.merge({}, base, {
        name: 'Replicate',
    })
};

export default database;

/**
 * These ability values vary depending on the rest of the state. We define them as functions here, and the RESULT
 * of these function calls will be stored in the state. The results are recalculated often; see recalculateSlice method.
 * 
 * Note: `variables` is a special object that is calculated first; its result is provided to the rest of the functions as a
 * third parameter (that way many functions can be built off the same variables)
 */
export const calculators = {
    commandCenter_charge: {
        variables: (state, ability) => {
            const variables = {
                castTime: 5
            }

            applyAllEffects(state, variables, ability)

            return variables;
        },
        castTime: (state, ability, variables) => {
            return variables.castTime;
        }
    },
    harvester_overclock: {
        variables: (state, ability) => {
            const variables = {
                castTime: 10,
                cooldown: 30,
                oreMultiplication: 2,
                energyMultiplication: 1.5
            }

            applyAllEffects(state, variables, ability)

            return variables;
        },
        castTime: (state, ability, variables) => {
            return variables.castTime;
        },
        cooldown: (state, ability, variables) => {
            return variables.cooldown;
        },
        description: (state, ability, variables) => {
            const formattedOre = `${((variables.oreMultiplication - 1)*100).toFixed(0)}%`;
            const formattedEnergy = `${((variables.energyMultiplication - 1)*100).toFixed(0)}%`;
            return `Overworks the harvester, increasing production by ${formattedOre} but also increasing energy consumption by ${formattedEnergy}.`
        },
        effect: (state, ability, variables) => {
            return {
                ore: { multiply: variables.oreMultiplication },
                energy: { multiply: variables.energyMultiplication }
            }
        }
    },
    droidFactory_buildStandardDroid: {
        variables: (state, ability) => {
            const variables = {
                castTime: 30
            }
            
            applyAllEffects(state, variables, ability)
            
            return variables;
        },
        cost: (state, ability) => ({
            ore: 100 * (STANDARD_COST_EXP)**(numStandardDroids(state)),
            refinedMinerals: 25 * (STANDARD_COST_EXP)**(numStandardDroids(state))
        }),
        displayInfo: (state, ability) => {
            const total = numStandardDroids(state);
            const remaining = getResource(state.resources, 'standardDroids').amount;

            if (total === 0) {
                return `0 droid(s)`;
            }
            return `${total - remaining} / ${total} deployed`;
        },
        castTime: (state, ability, variables) => {
            return variables.castTime;
        }
    },
    replicate: {
        variables: (state, ability) => {
            const developedLand = getQuantity(getResource(state.resources, 'developedLand'))
            const remainingDevelopments = state.planet.maxDevelopedLand - developedLand;
            const nextDevelopmentSize = Math.min(developedLand, remainingDevelopments)
            return {
                nextDevelopmentSize: nextDevelopmentSize,
                numStructures: countAllStructuresBuilt(state.structures),
                productionIncrease: `${Math.floor(((nextDevelopmentSize / developedLand) + 1) * 100)}%`
            }
        },
        description: (state, ability, variables) => {
            return `Replicates your entire base onto new land, permanently increasing all production and consumption rates by ${variables.productionIncrease}.`
        },
        cost: (state, ability, variables) => {
            return {
                energy: variables.numStructures * 200 * variables.nextDevelopmentSize,
                ore: variables.numStructures * 1000 * variables.nextDevelopmentSize,
                refinedMinerals: variables.numStructures * 10 * variables.nextDevelopmentSize,
                buildableLand: variables.nextDevelopmentSize
            }
        },
        produces: (state, ability, variables) => {
            return {
                developedLand: variables.nextDevelopmentSize
            }
        },
        castTime: (state, ability, variables) => {
            return 15 // todo scale this with structures?
            // return variables.numStructures * 10
        }
    }
}


// Functions can't be stored in the state so storing them in this const
// TODO Should all callbacks be in reducers??
export const callbacks = {
    replicate: {
        onStart: (dispatch, getState, ability) => {
            fromPlanet.startDevelopment(dispatch, getState, ability.produces.developedLand)
        },
        onFinish: (dispatch, getState) => {
            fromPlanet.finishDevelopment(dispatch, getState);
        }
    }
}


// A lookup of abilities that AFFECT a structure
// Format: { structureId => [ability1, ability2, ...], ... }
export const abilitiesAffectingStructure = {}

for (const [abilityId, abilityDbRecord] of Object.entries(database)) {
    switch(abilityDbRecord.affects.type) {
        case EFFECT_TARGETS.structure:
            // If `affects` obj has no id we default to affecting the ability's structure
            const structureId = abilityDbRecord.affects.id || abilityDbRecord.structure;
            if (abilitiesAffectingStructure[structureId] === undefined) {
                abilitiesAffectingStructure[structureId] = []
            }
            abilitiesAffectingStructure[structureId].push(abilityId);
            break;
        case EFFECT_TARGETS.ability:
            console.warn("It is not currently possible for an ability to affect another ability")
            break;
    }
}



// Applies all applicable upgrades for an ability
// Note: order of application matters (we always add before multiplying).
function applyAllEffects(state, variables, ability) {
    const operations = initOperations();

    const upgradeIds = upgradesAffectingAbility[ability.id];
    if (upgradeIds) {
        upgradeIds.forEach(upgradeId => {
            const upgrade = getUpgrade(state.upgrades, upgradeId);
            if (isResearched(upgrade) && upgrade.effect) {
                mergeEffectIntoOperations(upgrade.effect, operations);
            }
        })
    }

    applyOperationsToVariables(operations, variables);
}