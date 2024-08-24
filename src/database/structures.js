import {
    getNumBuilt,
    getRunningRate,
    hasInsufficientResources,
    isRunning,
    UNKNOWN_IMAGE_KEY
} from "../redux/modules/structures";
import {getUpgrade, isResearched} from "../redux/modules/upgrades";
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
    type: TYPES.generator,
    productionSuffix: null,
    consumptionSuffix: null,
    usesDroids: false,
    numDroids: 0
}

export default {
    harvester: _.merge({}, base, {
        name: "Harvester",
        description: "Drills into the planet's surface to gather minerals." +
            " Less energy efficient at higher harvesting rates.",
        runnable: true,
        type: TYPES.consumer,
        usesDroids: true
    }),
    solarPanel: _.merge({}, base, {
        name: "Solar Panel",
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
        description: "Converts ore into minerals.",
        usesDroids: true
    }),
    droidFactory: _.merge({}, base, {
        name: "Droid Factory",
        description: "Constructs droids to improve production and explore the planet.",
        type: TYPES.consumer
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
    harvester: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            const variables = {
                // todo rename?
                cutoffRate: 0.05, // Running at this rate or lower will result in 100% efficiency
                minEfficiency: 0.25, // Running at 100% will result in this efficiency
                efficiency: undefined // resulting efficiency
            }

            const rate = getRunningRate(structure);
            if (rate <= variables.cutoffRate) {
                variables.efficiency = 1.0;
            }
            else {
                // Linear efficiency: efficiency = m(rate) + b
                const m = (variables.minEfficiency - 1.0) / (1.0 - variables.cutoffRate);
                const b = variables.minEfficiency - m;
                variables.efficiency = m * rate + b;
            }

            return variables;
        },
        cost: (state, structure) => ({
            ore: 150 * (1.4)**(getNumBuilt(structure))
        }),
        consumes: (state, structure, variables) => ({
            energy: 10 * getRunningRate(structure) / variables.efficiency
        }),
        produces: (state, structure, variables) => {
            return {
                ore: 10 * getRunningRate(structure) * netDroidPerformanceBoost(state, structure)
            }
        },
        consumptionSuffix: (state, structure, variables) => {
            if (hasInsufficientResources(structure)) {
                return '<span class="text-red">(Insufficient)</span>';
            }
            if (variables.efficiency !== undefined && isRunning(structure)) {
                return `(${round(variables.efficiency * 100)}% efficiency)`;
            }
        },
        canRun: (state, structure) => {
            return canConsume(state.resources, { energy: 1 });
        }
    }),
    solarPanel: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            const variables = {
                peakEnergy: 5,
                actualEnergy: undefined
            }
            
            applyUpgrade(state, variables, 'solarPanel_largerPanels');
            variables.peakEnergy *= netDroidPerformanceBoost(state, structure);
            variables.actualEnergy = variables.peakEnergy * daylightPercent(state.clock);
            return variables;
        },
        cost: (state, structure) => ({
            ore: 10 * (1.5)**(getNumBuilt(structure))
        }),
        produces: (state, structure, variables) => ({
            energy: variables.actualEnergy
        }),
        productionSuffix: (state, structure, variables) => {
            return `(${daylightPercent(state.clock) * 100}% daylight)`
        },
        description: (state, structure, variables) => {
            return `Produces ${variables.peakEnergy}${getIconSpan('energy', true)} per second in peak sunlight.`;
        }
    }),
    windTurbine: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            const variables = {
                cutInSpeed: 15,
                ratedSpeed: 28,
                cutOutSpeed: 47,
                cutInPower: 0,
                ratedPower: 50
            }

            applyUpgrade(state, variables, 'windTurbine_reduceCutIn');
            applyUpgrade(state, variables, 'windTurbine_increaseCutOut');
            applyUpgrade(state, variables, 'windTurbine_largerBlades');
            applyUpgrade(state, variables, 'windTurbine_yawDrive');

            variables.ratedPower *= netDroidPerformanceBoost(state, structure);

            return variables;
        },
        cost: (state, structure) => ({
            ore: 100 * (1.5)**(getNumBuilt(structure))
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
                // linear between cutInPower and ratedPower
                const percent = (wind - variables.cutInSpeed) / (variables.ratedSpeed - variables.cutInSpeed);
                energy = percent * (variables.ratedPower - variables.cutInPower) + variables.cutInPower;
            }
            else {
                // flatline at ratedPower
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

            return '(At rated speed)'
        },
        description: (state, structure, variables) => {
            return `Produces up to ${variables.ratedPower}${getIconSpan('energy', true)} per second ` +
                `when wind speed is between ${variables.cutInSpeed} and ${variables.cutOutSpeed} mph.`;
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
        variables: (state, structure) => {
            return {
                energy: 20 * netDroidPerformanceBoost(state, structure)
            }
        },
        cost: (state, structure) => ({
            ore: 50 * (1.5)**(getNumBuilt(structure)),
            vents: 1
        }),
        produces: (state, structure, variables) => {
            return {
                energy: variables.energy
            }
        },
        description: (state, structure, variables) => {
            return `Produces ${variables.energy}${getIconSpan('energy', true)} per second with occasional bursts of energy. `
        }
    }),
    energyBay: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            const variables = {
                capacity: 200
            }

            applyUpgrade(state, variables, 'energyBay_largerCapacity');
            variables.capacity *= netDroidPerformanceBoost(state, structure);

            return variables;
        },
        cost: (state, structure) => ({
            ore: 100 * (1.4)**(getNumBuilt(structure))
        }),
        capacity: (state, structure, variables) => {
            return { energy: variables.capacity };
        },
        description: (state, structure, variables) => {
            return `Provides ${variables.capacity}${getIconSpan('energy', true)} storage capacity.`;
        }
    }),
    sensorTower: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            ore: 1
        }),
        description: (state, structure) => {
            return `TODO`;
        }
    }),
    refinery: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            ore: 1,
            energy: 10
        }),
        consumes: (state, structure) => ({
            energy: 50 * getRunningRate(structure),
            ore: 20 * getRunningRate(structure)
        }),
        consumptionSuffix: (state, structure, variables) => {
            if (hasInsufficientResources(structure)) {
                return '<span class="text-red">(Insufficient)</span>';
            }
            // if (variables.efficiency !== undefined && isRunning(structure)) {
            //     return `(${round(variables.efficiency * 100)}% efficiency)`;
            // }
        },
        produces: (state, structure) => {
            const minEfficiency = 0.75;
            const efficiency = 1 - (getRunningRate(structure) * (1 - minEfficiency))
            return {
                refinedMinerals: 1 * getRunningRate(structure) * efficiency * netDroidPerformanceBoost(state, structure)
            }
        },
        canRun: (state, structure) => {
            return canConsume(state.resources, { energy: 1, ore: 1 });
        }
    }),
    droidFactory: _.merge({}, baseCalculator, {

    }),
}

export function droidPerformanceBoost(state) {
    let boost = 0.20;
    // boost = applyUpgrade_OLD(state, 'droidFactory_improvedMaintenance', boost); // todo
    return boost;
}

function netDroidPerformanceBoost(state, structure) {
    return 1 + (droidPerformanceBoost(state) * structure.numDroids);
}

// function applyUpgrade_OLD(state, upgradeId, inputValue) {
//     const upgrade = getUpgrade(state.upgrades, upgradeId);
//     if (isResearched(upgrade)) {
//         if (upgrade.adder) {
//             inputValue += upgrade.adder;
//         }
//         if (upgrade.multiplier) {
//             inputValue *= upgrade.multiplier
//         }
//     }
//
//     return inputValue
// }


function applyUpgrade(state, variables, upgradeId) {
    const upgrade = getUpgrade(state.upgrades, upgradeId);
    if (isResearched(upgrade)) {
        for (const [variable, operations] of Object.entries(upgrade.effect)) {
            for (const [operation, value] of Object.entries(operations)) {
                switch(operation) {
                    case 'add':
                        variables[variable] += value;
                        break;
                    case 'multiply':
                        variables[variable] *= value;
                        break;
                    default:
                        console.error(`Error applying upgrade ${upgrade} to ${variables}`)
                }
            }
        }
    }
}