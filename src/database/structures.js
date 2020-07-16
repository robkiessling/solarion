
import _ from 'lodash';

const base = {
    name: 'Unknown',
    description: '',
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
    mineralHarvester: _.merge({}, base, {
        name: "Mineral Harvester",
        description: "Drills into the planet's surface to gather minerals.",
        runnable: true,
        buildable: true,
        cost: {
            minerals: {
                base: 20,
                increment: 1.5
            }
        },
        consumes: {
            energy: {
                base: 5
            }
        },
        produces: {
            minerals: {
                base: 1
            }
        },
        image: {
            ascii: [
                '    T    ',
                '   ´|`   ',
                '   ´|`   ',
                '   ´|`   ',
                '   ´|`   ',
                '_//|||\\\\_',
                '---------'
            ]
        }
    }),
    solarPanel: _.merge({}, base, {
        name: "Solar Panel",
        description: "Converts sunlight into energy. Conversion rate depends on the time of day.",
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
        image: {
            ascii: [
                ' _ _ _ _    ',
                ' \\_\\_\\_\\_\\  ',
                ' /\\_\\_\\_\\_\\ ',
                '/I¯\\_\\_\\_\\_\\',
            ],
            style: {
                paddingBottom: '0.5rem',
                paddingTop: '1rem'
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