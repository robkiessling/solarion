import {getQuantity, getResource} from "../redux/modules/resources";
import {numStandardDroids} from "../redux/reducer";
import * as fromAbilities from "../redux/modules/abilities";
import * as fromPlanet from "../redux/modules/planet";

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
    cooldown: 0 // Note: cooldown starts after cast FINISHES (not at start of cast)
}

export default {
    harvester_manual: _.merge({}, base, {
        name: 'Manual Harvest',
        structure: 'harvester',
        description: "Manually dig up some ore. Seems slow to do this manually...",
        cost: {},
        produces: {
            ore: 10
        },
        castTime: 10
    }),
    harvester_power: _.merge({}, base, {
        name: 'Power Drill',
        structure: 'harvester',
        cost: {
            energy: 20
        },
        produces: {
            ore: 30
        },
        castTime: 20
    }),
    harvester_overclock: _.merge({}, base, {
        name: 'Overclock',
        structure: 'harvester',
        description: "Overworks the harvester, increasing production by 100% but also increasing energy consumption by 50%.",
        castTime: 10,
        cooldown: 30,
        effect: {
            ore: { multiply: 2 },
            energy: { multiply: 1.5 }
        }
    }),

    droidFactory_buildStandardDroid: _.merge({}, base, {
        name: 'Build Droid',
        structure: 'droidFactory',
        description: "Droids can be assigned to structures, improving their performance.",
        cost: {
            ore: 100,
            refinedMinerals: 10
        },
        produces: {
            standardDroids: 1
        },
        castTime: 1
    }),

    replicate: _.merge({}, base, {
        name: 'Replicate',
        description: "Replicates your entire base onto new land, permanently increasing all production and consumption rates by 200%.",
        castTime: 2
    })
};

// These are not part of the stored state because they contain functions
export const calculators = {
    droidFactory_buildStandardDroid: {
        cost: (state, ability) => ({
            ore: 100 * (1.4)**(numStandardDroids(state)),
            refinedMinerals: 10 * (1.4)**(numStandardDroids(state))
        }),
        displayInfo: (state, ability) => {
            const total = numStandardDroids(state);
            const remaining = getResource(state.resources, 'standardDroids').amount;

            if (total === 0) {
                return `0 droid(s)`;
            }
            return `${total - remaining} / ${total} deployed`;
        }
    },
    replicate: {
        variables: (state, ability) => {
            const developedLand = getQuantity(getResource(state.resources, 'developedLand'))
            const remainingDevelopments = state.planet.maxDevelopedLand - developedLand;
            const nextDevelopmentSize = Math.min(developedLand, remainingDevelopments)
            return {
                nextDevelopmentSize: nextDevelopmentSize
            }
        },
        cost: (state, ability, variables) => {
            return {
                ore: 1,
                buildableLand: variables.nextDevelopmentSize
            }
        },
        produces: (state, ability, variables) => {
            return {
                developedLand: variables.nextDevelopmentSize
            }
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