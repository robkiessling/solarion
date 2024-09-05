import {
    getNumBuilt,
    getRunningRate,
    hasInsufficientResources,
    isRunning,
    UNKNOWN_IMAGE_KEY
} from "../redux/modules/structures";
import {getUpgrade, isResearched} from "../redux/modules/upgrades";
import {daylightPercent, windSpeed} from "../redux/modules/clock";
import {canConsume, getIconSpan} from "../redux/modules/resources";
import {round} from "lodash";
import {getAbility, isCasting} from "../redux/modules/abilities";

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
        total: 15 // todo why is this an object?
    },
    status: STATUSES.normal,
    cost: {},
    consumes: {},
    produces: {},
    type: TYPES.generator,
    productionSuffix: null,
    consumptionSuffix: null,

    droidData: {
        usesDroids: true,
        numDroidsAssigned: 0,
        droidAssignmentType: 'structure'
    },
}

export default {
    harvester: _.merge({}, base, {
        name: "Harvester",
        description: "Drills into the planet's surface to gather minerals." +
            " Less energy efficient at higher harvesting rates.",
        runnable: true,
        type: TYPES.consumer,
    }),
    solarPanel: _.merge({}, base, {
        name: "Solar Farm",
    }),
    windTurbine: _.merge({}, base, {
        name: "Wind Turbine",
    }),
    thermalVent: _.merge({}, base, {
        name: "Geothermal Vent",
        // count: {
        //     total: 10
        // },
    }),
    energyBay: _.merge({}, base, {
        name: "Energy Bay",
    }),
    sensorTower: _.merge({}, base, {
        name: "Sensor Tower",
        type: TYPES.consumer,
        droidData: {
            usesDroids: false
        },
    }),
    refinery: _.merge({}, base, {
        name: "Refinery",
        runnable: true,
        type: TYPES.consumer,
        description: "Converts ore into minerals.",
    }),
    droidFactory: _.merge({}, base, {
        name: "Droid Factory",
        description: "Constructs droids to improve production and explore the planet.",
        type: TYPES.generator,
        droidData: {
            usesDroids: false
        }
    }),
    probeFactory: _.merge({}, base, {
        name: "Orbital Command Center",
        description: "Manufactures and launches probes towards Solarion V.",
        runnable: true,
        type: TYPES.consumer,
    }),

};

const baseCalculator = {
    animationTag: (state, structure) => { // todo rename animationKey?
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
                lowEndRate: 0.05, // Running at this rate or lower will result in 100% efficiency
                topEndEfficiency: 0.25, // Running at 100% will result in this efficiency
                efficiency: undefined, // resulting efficiency
                ore: 10, // how much ore is being produced
                energy: 10, // how much energy is being consumed
            }

            const rate = getRunningRate(structure);
            if (rate <= variables.lowEndRate) {
                variables.efficiency = 1.0;
            }
            else {
                // Linear efficiency: efficiency = m(rate) + b
                const m = (variables.topEndEfficiency - 1.0) / (1.0 - variables.lowEndRate);
                const b = variables.topEndEfficiency - m;
                variables.efficiency = m * rate + b;
            }

            variables.energy /= variables.efficiency;
            variables.energy *= rate;

            variables.ore *= netDroidPerformanceBoost(state, structure);
            variables.ore *= rate;

            applyAbilityBuff(state, variables, 'harvester_overclock');

            return variables;
        },
        cost: (state, structure) => ({
            ore: 150 * (1.4)**(getNumBuilt(structure))
        }),
        consumes: (state, structure, variables) => ({
            energy: variables.energy
        }),
        produces: (state, structure, variables) => ({
            ore: variables.ore
        }),
        consumptionSuffix: (state, structure, variables) => {
            if (hasInsufficientResources(structure)) {
                return '<span class="text-red">(Insufficient)</span>';
            }
            if (variables.efficiency !== undefined && isRunning(structure)) {
                return `(${round(variables.efficiency * 100)}% efficiency)`;
            }
        },
    }),
    solarPanel: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            const variables = {
                peakEnergy: 5, // amount of energy generated in peak daylight
                actualEnergy: undefined // amount of energy actually generated
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
            const wind = windSpeed(state.clock);
            let energy;

            // O < CUT_IN_SPEED < linear energy < RATED_SPEED < flatline energy < CUT_OUT_SPEED < 0
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

            return '(100% rated speed)';
        },
        description: (state, structure, variables) => {
            return `Produces up to ${variables.ratedPower}${getIconSpan('energy', true)} per second ` +
                `when wind speed is between ${variables.cutInSpeed} and ${variables.cutOutSpeed} mph.`;
        },
        animationTag: (state, structure, variables) => {
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
            energy: 5 * getRunningRate(structure),
            ore: 2 * getRunningRate(structure)
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
            const topEndEfficiency = 0.75;
            const efficiency = 1 - (getRunningRate(structure) * (1 - topEndEfficiency))
            return {
                refinedMinerals: 2 * getRunningRate(structure) * efficiency * netDroidPerformanceBoost(state, structure)
            }
        },
    }),
    droidFactory: _.merge({}, baseCalculator, {

    }),
    probeFactory: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            ore: 1,
            energy: 10
        }),
        consumes: (state, structure) => ({
            energy: 5 * getRunningRate(structure),
            refinedMinerals: 1 * getRunningRate(structure)
        }),
        consumptionSuffix: (state, structure, variables) => {
            if (hasInsufficientResources(structure)) {
                return '<span class="text-red">(Insufficient)</span>';
            }
        },
        produces: (state, structure) => {
            return {
                probes: 1 * getRunningRate(structure) * netDroidPerformanceBoost(state, structure)
            }
        },
    })

}

export function droidPerformanceBoost(state) {
    let boost = 0.20;
    // boost = applyUpgrade_OLD(state, 'droidFactory_improvedMaintenance', boost); // todo
    return boost;
}

function netDroidPerformanceBoost(state, structure) {
    return 1 + (droidPerformanceBoost(state) * structure.droidData.numDroidsAssigned);
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
        applyEffect(upgrade.effect, variables);
    }
}


// Some abilities have effects while casting
function applyAbilityBuff(state, variables, abilityId) {
    const ability = getAbility(state.abilities, abilityId);
    if (ability && isCasting(ability)) {
        applyEffect(ability.effect, variables);
    }
}

function applyEffect(effect, variables) {
    for (const [variable, operations] of Object.entries(effect)) {
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
