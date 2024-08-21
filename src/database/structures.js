import {
    getNumBuilt,
    getRunningRate,
    hasInsufficientResources,
    isRunning,
    UNKNOWN_IMAGE_KEY
} from "../redux/modules/structures";
import {getUpgrade} from "../redux/modules/upgrades";
import {daylightPercent, windSpeed} from "../redux/modules/clock";
import {canConsume, getIcon, getIconSpan} from "../redux/modules/resources";
import {round} from "lodash";

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
    runningCooldown: 0,
    count: {
        total: 0
    },
    status: STATUSES.normal,
    cost: {},
    consumes: {},
    produces: {},
    upgrades: [],
    abilities: [],
    type: TYPES.generator,
    productionSuffix: null,
    consumptionSuffix: null,
    usesDroids: false,
    numDroids: 0
}

export default {
    mineralHarvester: _.merge({}, base, {
        name: "Mineral Harvester",
        description: "Drills into the planet's surface to gather minerals." +
            " Less energy efficient at higher harvesting rates.",
        runnable: true,
        type: TYPES.consumer,
        abilities: ['mineralHarvester_manual', 'mineralHarvester_power'],
        usesDroids: true
    }),
    solarPanel: _.merge({}, base, {
        name: "Solar Panel",
        upgrades: ['solarPanel_largerPanels'],
        usesDroids: true
    }),
    windTurbine: _.merge({}, base, {
        name: "Wind Turbine",
        usesDroids: true
    }),
    thermalVent: _.merge({}, base, {
        name: "Geothermal Vent",
        usesDroids: true
    }),
    energyBay: _.merge({}, base, {
        name: "Energy Bay",
        upgrades: ['energyBay_largerCapacity'],
        usesDroids: true
    }),
    sensorTower: _.merge({}, base, {
        name: "Sensor Tower",
        type: TYPES.consumer
    }),
    refinery: _.merge({}, base, {
        name: "Refinery",
        runnable: true,
        type: TYPES.consumer,
        description: "Converts ore into refined ore.",
        usesDroids: true
    }),
    droidFactory: _.merge({}, base, {
        name: "Droid Factory",
        description: "Constructs droids to improve production and explore the planet.",
        type: TYPES.consumer,
        abilities: ['droidFactory_maintenanceDroid', 'droidFactory_reconDroid']
    })

};

const baseCalculator = {
    imageKey: (state, structure) => {
        if (getNumBuilt(structure) === 0) {
            return UNKNOWN_IMAGE_KEY;
        }
        if (hasInsufficientResources(structure)) {
            return 'idle';
        }
        return isRunning(structure) ? 'running' : 'idle';
    }
}

// These are not part of the stored state because they contain functions
export const calculators = {
    mineralHarvester: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            minerals: 150 * (1.4)**(getNumBuilt(structure))
        }),
        consumes: (state, structure) => ({
            energy: 20 * getRunningRate(structure)
        }),
        produces: (state, structure, variables) => {
            return {
                minerals: 10 * getRunningRate(structure) * variables.efficiency * netDroidPerformanceBoost(state, structure)
            }
        },
        consumptionSuffix: (state, structure, variables) => {
            // if (hasInsufficientResources(structure)) {
            //     return '(Insufficient)';
            // }
            if (variables.efficiency !== undefined && isRunning(structure)) {
                return `(${round(variables.efficiency * 100)}% efficiency)`;
            }
        },
        canRun: (state, structure) => {
            return canConsume(state.resources, { energy: 1 });
        },
        variables: (state, structure) => {
            // Efficiency: 100% efficiency at 25% rate, 50% efficiency at 100% rate
            const rate = getRunningRate(structure);
            const cutoffRate = 0.05; // Running at this rate or lower will result in 100% efficiency
            const minEfficiency = 0.25; // Running at 100% will result in this efficiency
            let efficiency;

            if (rate <= cutoffRate) {
                efficiency = 1.0;
            }
            else {
                // Linear efficiency: efficiency = m(rate) + b
                const m = (minEfficiency - 1.0) / (1.0 - cutoffRate);
                const b = minEfficiency - m;
                efficiency = m * rate + b;
            }

            return {
                // cutoffRate: cutoffRate,
                // minEfficiency: minEfficiency,
                efficiency: efficiency
            }
        }
    }),
    solarPanel: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            minerals: 10 * (1.5)**(getNumBuilt(structure))
        }),
        produces: (state, structure, variables) => ({
            energy: variables.actualEnergy
        }),
        productionSuffix: (state, structure, variables) => {
            return `(${daylightPercent(state.clock) * 100}% daylight)`
        },
        description: (state, structure, variables) => {
            return `Produces ${variables.peakEnergy}${getIconSpan('energy', true)} per second in peak sunlight.`;
        },
        variables: (state, structure) => {
            let peakEnergy = 5;

            const largerPanels = getUpgrade(state.upgrades, 'solarPanel_largerPanels');
            peakEnergy *= largerPanels && largerPanels.level ? largerPanels.multiplier : 1;

            peakEnergy *= netDroidPerformanceBoost(state, structure);

            const actualEnergy = peakEnergy * daylightPercent(state.clock);

            return {
                peakEnergy: peakEnergy,
                actualEnergy: actualEnergy
            }
        }
    }),
    windTurbine: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            minerals: 100 * (1.5)**(getNumBuilt(structure))
        }),
        produces: (state, structure, variables) => {
            // O < CUT_IN_SPEED < linear < RATED_SPEED < flatline < CUT_OUT_SPEED < 0
            // console.log(state, structure, variables);

            const wind = windSpeed(state.clock);

            let energy;

            if (wind < variables.cutInSpeed || wind > variables.cutOutSpeed) {
                // cutoff
                energy = 0;
            }
            else if (wind < variables.ratedSpeed) {
                // linear
                const percent = (wind - variables.cutInSpeed) / (variables.ratedSpeed - variables.cutInSpeed);
                energy = percent * variables.ratedPower;
            }
            else {
                // flatline
                energy = variables.ratedPower;
            }

            return { energy: energy };
        },
        productionSuffix: (state, structure, variables) => {
            // return `(${daylightPercent(state.clock) * 100}% daylight)`
            const wind = windSpeed(state.clock);

            if (wind < variables.cutInSpeed) {
                return '(Not enough wind)';
            }
            if (wind > variables.cutOutSpeed) {
                return '(Dangerous winds)';
            }

            if (wind < variables.ratedSpeed) {
                const percent = (wind - variables.cutInSpeed) / (variables.ratedSpeed - variables.cutInSpeed);
                return `(${round(percent * 100)}% of rated speed)`;
            }

            return '(Rated speed)'
        },
        description: (state, structure, variables) => {
            return `Produces up to ${variables.ratedPower}${getIconSpan('energy', true)} per second when wind speed is between` +
                ` ${variables.cutInSpeed} and ${variables.cutOutSpeed} mph`;
        },
        variables: (state, structure) => {
            return {
                cutInSpeed: 7,
                ratedSpeed: 28,
                cutOutSpeed: 47,
                ratedPower: 50 * netDroidPerformanceBoost(state, structure)
            }
        },
        imageKey: (state, structure, variables) => {
            if (getNumBuilt(structure) === 0) {
                return UNKNOWN_IMAGE_KEY;
            }

            const wind = windSpeed(state.clock);
            return wind < variables.cutInSpeed || wind > variables.cutOutSpeed ? 'idle' : 'running';
        }
    }),
    thermalVent: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            minerals: 50 * (1.5)**(getNumBuilt(structure)),
            vents: 1
        }),
        produces: (state, structure, variables) => {
            return {
                energy: variables.energy
            }
        },
        description: (state, structure, variables) => {
            return `Produces ${variables.energy}${getIconSpan('energy', true)} per second with occasional bursts of energy. `
        },
        variables: (state, structure) => {
            return {
                energy: 20 * netDroidPerformanceBoost(state, structure)
            }
        }
    }),
    energyBay: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            minerals: 100 * (1.4)**(getNumBuilt(structure))
        }),
        capacity: (state, structure, variables) => {
            return { energy: variables.capacity };
        },
        description: (state, structure, variables) => {
            return `Provides ${variables.capacity}${getIconSpan('energy', true)} storage capacity.`;
        },
        variables: (state, structure) => {
            let capacity = 200;

            const largerCapacity = getUpgrade(state.upgrades, 'energyBay_largerCapacity');
            capacity *= (largerCapacity && largerCapacity.level ? largerCapacity.multiplier : 1);

            capacity *= netDroidPerformanceBoost(state, structure);

            return {
                capacity: capacity
            }
        }
    }),
    sensorTower: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            minerals: 1
        }),
        description: (state, structure) => {
            return `TODO`;
        }
    }),
    refinery: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            minerals: 1,
            energy: 10
        }),
        consumes: (state, structure) => ({
            energy: 50 * getRunningRate(structure),
            minerals: 20 * getRunningRate(structure)
        }),
        produces: (state, structure) => {
            const minEfficiency = 0.75;
            const efficiency = 1 - (getRunningRate(structure) * (1 - minEfficiency))
            return {
                refinedMinerals: 1 * getRunningRate(structure) * efficiency * netDroidPerformanceBoost(state, structure)
            }
        },
        canRun: (state, structure) => {
            return canConsume(state.resources, { energy: 1, minerals: 1 });
        }
    }),
    droidFactory: _.merge({}, baseCalculator, {

    }),
}

export function droidPerformanceBoost(state) {
    let boost = 0.20;

    const improvedMaintenance = getUpgrade(state.upgrades, 'droidFactory_improvedMaintenance');
    boost *= (improvedMaintenance && improvedMaintenance.level ? improvedMaintenance.multiplier : 1);

    return boost;
}

function netDroidPerformanceBoost(state, structure) {
    return 1 + (droidPerformanceBoost(state) * structure.numDroids);
}