
import _ from 'lodash';
import {getNumBuilt, getRunningRate} from "../redux/modules/structures";
import {getUpgrade} from "../redux/modules/upgrades";
import {daylightPercent} from "../redux/modules/clock";
import {canConsume} from "../redux/modules/resources";

export const STATUSES = {
    normal: 0,
    insufficient: 1,
}

const base = {
    name: 'Unknown',
    description: '',
    buildable: false,
    runnable: false,
    runningRate: 0,
    count: {
        total: 0
    },
    status: STATUSES.normal,
    cost: {},
    consumes: {},
    produces: {},
    upgrades: [],
    type: 'generator'
}

export default {
    mineralHarvester: _.merge({}, base, {
        name: "Mineral Harvester",
        description: "Drills into the planet's surface to gather minerals.",
        runnable: true,
        buildable: true,
        type: 'consumer'
    }),
    solarPanel: _.merge({}, base, {
        name: "Solar Panel",
        buildable: true,
        upgrades: ['solarPanel_largerPanels']
    }),
    thermalVent: _.merge({}, base, {
        name: "Geothermal Vent",
        buildable: true
    }),
    energyBay: _.merge({}, base, {
        name: "Energy Bay",
        buildable: true
    }),
};

// These are not part of the stored state because they contain functions
export const calculators = {
    mineralHarvester: {
        cost: (state, structure) => ({
            minerals: 1000 * (1.5)**(getNumBuilt(structure))
        }),
        consumes: (state, structure) => ({
            energy: 20 * getRunningRate(structure)
        }),
        produces: (state, structure) => {
            const minEfficiency = 0.75;
            const efficiency = 1 - (getRunningRate(structure) * (1 - minEfficiency))
            return {
                minerals: 10 * getRunningRate(structure) * efficiency
            }
        },
        canRun: (state, structure) => {
            return canConsume(state.resources, { energy: 1 });
        }
    },
    solarPanel: {
        cost: (state, structure) => ({
            minerals: 10 * (1.5)**(getNumBuilt(structure))
        }),
        produces: (state, structure) => ({
            energy: baseSolarProduction(state) * daylightPercent(state.clock)
            // energy: baseSolarProduction(state)
        }),
        description: (state, structure) => {
            return `Converts sunlight into energy. Each panel produces ${baseSolarProduction(state)} energy/s in peak sunlight.`;
        }
    },
    thermalVent: {
        cost: (state, structure) => ({
            minerals: 50 * (1.5)**(getNumBuilt(structure)),
            vents: 1
        }),
        produces: (state, structure) => ({
            energy: ventProduction(state)
        }),
        description: (state, structure) => {
            return `Harvests ${ventProduction(state)} energy from a geothermal vent. `
        }
    },
    energyBay: {
        cost: (state, structure) => ({
            minerals: 10 * (1.5)**(getNumBuilt(structure))
        }),
        capacity: (state, structure) => {
            return { energy: energyBayCapacity(state) };
        },
        description: (state, structure) => {
            return `Provides ${energyBayCapacity(state)}e storage and has optimization upgrades.`;
        }
    }
}

// Does not include time-of-day (TOD) multiplier
function baseSolarProduction(state) {
    const largerPanels = getUpgrade(state.upgrades, 'solarPanel_largerPanels');
    const upgradeMult = largerPanels && largerPanels.level ? largerPanels.multiplier : 1;
    return 5 * upgradeMult;
}

function ventProduction(state) {
    return 10;
}

function energyBayCapacity(state) {
    const largerCapacity = getUpgrade(state.upgrades, 'energyBay_largerCapacity');
    return 50 * (largerCapacity && largerCapacity.level ? largerCapacity.multiplier : 1);
}