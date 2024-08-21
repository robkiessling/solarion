
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
        description: "Maintenance droids can be assigned to a structures, improving their performance.",
        cost: {
            minerals: 100,
            refinedMinerals: 10
        },
        produces: {
            maintenanceDroids: 1
        },
        castTime: 10,
        displayInfo: '0 / 2 droids deployed' // TODO
    }),
};

export const calculators = {

}