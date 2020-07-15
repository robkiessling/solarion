
import _ from 'lodash';

const base = {
    name: 'Unknown',
    buildable: false,
    runnable: false,
    count: {
        total: 0,
        running: 0
    },
    cost: {},
    consumes: {},
    produces: {},

    upgrades: [],
    visibleUpgrades: []
}

export default {
    solarPanel: _.merge({}, base, {
        name: "Solar Panel",
        buildable: true,
        cost: {
            minerals: {
                base: 10,
                increment: 1.5
            }
        },
        produces: {
            energy: {
                base: 2
            }
        },
        upgrades: ['solarPanel_largerPanels'],
        consumeString: 'sunlight'
    }),
    mineralHarvester: _.merge({}, base, {
        name: "Mineral Harvester",
        runnable: true,
        buildable: true,
        consumes: {
            energy: {
                base: 5
            }
        },
        produces: {
            minerals: {
                base: 1
            }
        }
    }),
    energyBay: _.merge({}, base, {
        name: "Energy Bay",
        buildable: true,
        cost: {
            minerals: {
                base: 1,
                increment: 1.5
            }
        },
        produces: {

        },
        resourceEffects: {
            energy: {
                capacity: {
                    add: 100
                }
            }
        }
    }),
};