
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
    produces: {}
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
        buildable: true
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
            minerals: 1000 * (1.5)**(getNumRunning(structure))
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
            minerals: 50 * (1.5)**(getNumRunning(structure)),
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
            minerals: 10 * (1.5)**(getNumRunning(structure))
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