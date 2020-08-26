
import _ from 'lodash';
import {getNumRunning} from "../redux/modules/structures";
import {getUpgrade} from "../redux/modules/upgrades";
import {daylightPercent} from "../redux/modules/clock";

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
        buildable: true
    }),
    solarPanel: _.merge({}, base, {
        name: "Solar Panel",
        description: "Converts sunlight into energy. Conversion rate depends on the time of day.",
        buildable: true,
        upgrades: ['solarPanel_largerPanels']
    }),
    energyBay: _.merge({}, base, {
        name: "Energy Bay",
        description: "Provides energy storage and optimizations.",
        buildable: true
    }),
};

// These are not part of the stored state because they contain functions
export const calculators = {
    mineralHarvester: {
        cost: (state, structure) => ({
            minerals: 20 * (1.5)**(getNumRunning(structure))
        }),
        consumes: (state, structure) => ({
            energy: 20
        }),
        produces: (state, structure) => ({
            minerals: 10
        })
    },
    solarPanel: {
        cost: (state, structure) => ({
            minerals: 10 * (1.5)**(getNumRunning(structure))
        }),
        produces: (state, structure) => {
            const largerPanels = getUpgrade(state.upgrades, 'solarPanel_largerPanels');
            const upgradeMult = largerPanels && largerPanels.level ? largerPanels.multiplier : 1;
            const todMult = daylightPercent(state.clock);

            return {
                energy: 5 * upgradeMult * todMult
            }
        }
    },
    energyBay: {
        cost: (state, structure) => ({
            minerals: 10 * (1.5)**(getNumRunning(structure))
        }),
        capacity: (state, structure) => {
            const largerCapacity = getUpgrade(state.upgrades, 'energyBay_largerCapacity');
            const capacity = 50 * (largerCapacity && largerCapacity.level ? largerCapacity.multiplier : 1);
            return { energy: capacity };
        }
    }
}

