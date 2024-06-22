import {getNumBuilt, getRunningRate} from "../redux/modules/structures";
import {getUpgrade} from "../redux/modules/upgrades";
import {daylightPercent, windSpeed} from "../redux/modules/clock";
import {canConsume} from "../redux/modules/resources";

export const STATUSES = {
    normal: 0,
    insufficient: 1,
}
export const TYPES = {
    generator: 0,
    consumer: 1
}

const base = {
    name: 'Unknown',
    description: '',
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
    abilities: [],
    type: TYPES.generator
}

export default {
    mineralHarvester: _.merge({}, base, {
        name: "Mineral Harvester",
        description: "Drills into the planet's surface to gather minerals.",
        runnable: true,
        type: TYPES.consumer,
        abilities: ['mineralHarvester_manual', 'mineralHarvester_power']
    }),
    solarPanel: _.merge({}, base, {
        name: "Solar Panel",
        upgrades: ['solarPanel_largerPanels']
    }),
    windTurbine: _.merge({}, base, {
        name: "Wind Turbine",
    }),
    thermalVent: _.merge({}, base, {
        name: "Geothermal Vent",
    }),
    energyBay: _.merge({}, base, {
        name: "Energy Bay",
        upgrades: ['energyBay_largerCapacity']
    }),
    sensorTower: _.merge({}, base, {
        name: "Sensor Tower",
        type: TYPES.consumer
    }),
    refinery: _.merge({}, base, {
        name: "Refinery",
        runnable: true,
        type: TYPES.consumer
    }),

};

// These are not part of the stored state because they contain functions
export const calculators = {
    mineralHarvester: {
        cost: (state, structure) => ({
            minerals: 100 * (1.4)**(getNumBuilt(structure))
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
    windTurbine: {
        cost: (state, structure) => ({
            minerals: 100 * (1.5)**(getNumBuilt(structure))
        }),
        produces: (state, structure) => {
            // O < CUT_IN_SPEED < linear < RATED_SPEED < flatline < CUT_OUT_SPEED < 0
            const CUT_IN_SPEED = 7;
            const RATED_SPEED = 28;
            const CUT_OUT_SPEED = 47;
            const RATED_POWER = 50 // 3MW?

            const wind = windSpeed(state.clock);

            if (wind < CUT_IN_SPEED || wind > CUT_OUT_SPEED) {
                return { energy: 0 };
            }

            if (wind < RATED_SPEED) {
                // linear
                const percent = (wind - CUT_IN_SPEED) / (RATED_SPEED - CUT_IN_SPEED);
                return { energy: percent * RATED_POWER }
            }

            // flatline
            return { energy: RATED_POWER }
        },
        description: (state, structure) => {
            return `TODO`
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
            minerals: 100 * (1.4)**(getNumBuilt(structure))
        }),
        capacity: (state, structure) => {
            return { energy: energyBayCapacity(state) };
        },
        description: (state, structure) => {
            return `Provides ${energyBayCapacity(state)}e storage and has optimization upgrades.`;
        }
    },
    sensorTower: {
        cost: (state, structure) => ({
            minerals: 1
        }),
        description: (state, structure) => {
            return `TODO`;
        }
    },
    refinery: {
        cost: (state, structure) => ({
            minerals: 1
        }),
        description: (state, structure) => {
            return `TODO`;
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