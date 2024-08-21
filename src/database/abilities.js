import {getResource} from "../redux/modules/resources";
import {numMaintenanceDroids, numReconDroids} from "../redux/reducer";

export const STATES = {
    ready: 0,
    casting: 1
}

const base = {
    name: 'Unknown',
    description: "Description N/A",
    cost: {},
    produces: {},
    castTime: 5,
    state: STATES.ready
}

// Functions can't be stored in the state so storing them in this const
export const callbacks = {

}

export default {
    mineralHarvester_manual: _.merge({}, base, {
        name: 'Manual Harvest',
        description: "Manually dig up some ore. Seems slow to do this manually...",
        cost: {},
        produces: {
            minerals: 10
        },
        castTime: 10
    }),
    mineralHarvester_power: _.merge({}, base, {
        name: 'Power Drill',
        cost: {
            energy: 20
        },
        produces: {
            minerals: 30
        },
        castTime: 20
    }),

    droidFactory_maintenanceDroid: _.merge({}, base, {
        name: 'Build Maintenance Droid',
        description: "Maintenance droids can be assigned to structures, improving their performance.",
        cost: {
            minerals: 100,
            refinedMinerals: 10
        },
        produces: {
            maintenanceDroids: 1
        },
        castTime: 1
    }),
    droidFactory_reconDroid: _.merge({}, base, {
        name: 'Build Recon Droid',
        description: "Recon droids search the planet's surface for resources.",
        cost: {
            minerals: 100,
            refinedMinerals: 10
        },
        produces: {
            reconDroids: 1
        },
        castTime: 1,
    }),
};

// These are not part of the stored state because they contain functions
export const calculators = {
    droidFactory_maintenanceDroid: {
        cost: (state, ability) => ({
            minerals: 100 * (1.4)**(numMaintenanceDroids(state)),
            refinedMinerals: 10 * (1.4)**(numMaintenanceDroids(state))
        }),
        displayInfo: (state, ability) => {
            const total = numMaintenanceDroids(state);
            const remaining = getResource(state.resources, 'maintenanceDroids').amount;

            if (total === 0) {
                return `0 droid(s)`;
            }
            return `${total - remaining} / ${total} droid(s) deployed`;
        }
    },
    droidFactory_reconDroid: {
        cost: (state, ability) => ({
            minerals: 100 * (1.4)**(numReconDroids(state)),
            refinedMinerals: 10 * (1.4)**(numReconDroids(state))
        }),
        displayInfo: (state, ability) => {
            const droids = numReconDroids(state);
            return `${droids} droid(s)`;
        }
    }
}