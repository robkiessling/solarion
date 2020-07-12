
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
    produces: {}
}

export default {
    mineralHarvester: _.merge({}, base, {
        name: "Mineral Harvester",
        runnable: true,
        consumes: {
            energy: {
                base: 20
            }
        },
        produces: {
            minerals: {
                base: 2
            }
        }
    }),
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
                base: 5
            }
        },
        consumeString: 'sunlight'
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
        capacity: {
            energy: {
                add: 100
            }
        }
    }),
};