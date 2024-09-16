import {
    getNumBuilt,
    getRunningRate, getStructure,
    hasInsufficientResources,
    isRunning
} from "../redux/modules/structures";
import {getUpgrade, isResearched} from "../redux/modules/upgrades";
import {daylightPercent, windSpeed} from "../redux/modules/clock";
import {canConsume, getIconSpan, getQuantity, getResource} from "../redux/modules/resources";
import {round} from "lodash";
import {getAbility, isCasting} from "../redux/modules/abilities";
import {formatInteger, redText} from "../lib/helpers";
import {upgradesAffectingStructure} from "./upgrades";
import {abilitiesAffectingStructure} from "./abilities";
import {applyOperationsToVariables, applySingleEffect, initOperations, mergeEffectIntoOperations} from "../lib/effect";
import {getStructureStatistic} from "../redux/reducer";

export const STATUSES = {
    normal: 0,
    insufficient: 1,
}
export const TYPES = {
    generator: 0,
    consumer: 1
}

const IDLE_LABEL = 'Idle';
const RUNNING_LABEL = 'Running';
const INSUFFICIENT_LABEL = redText('Insufficient Resources')

export const STANDARD_COST_EXP = 1.5; // Default exponential growth of structure costs

const base = {
    name: 'Unknown',
    description: '',
    runnable: false,
    runningRate: 0,
    runningCooldown: 0,
    count: {
        total: 0 // todo why is this an object? maybe for total/broken/etc.?
    },
    status: STATUSES.normal,
    statusMessage: '',
    cost: {},
    consumes: {},
    produces: {},
    type: TYPES.generator,

    droidData: {
        usesDroids: true,
        numDroidsAssigned: 0,
        droidAssignmentType: 'structure'
    },
}

export default {
    harvester: _.merge({}, base, {
        name: "Harvester",
        description: "Drills into the planet's surface to gather ore." +
            " Less energy efficient as production rate increases.",
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
        description: "Filters rare metals out of ore.",
    }),
    droidFactory: _.merge({}, base, {
        name: "Droid Factory",
        description: "Constructs droids assist with production.",
        type: TYPES.consumer,
        droidData: {
            usesDroids: false
        }
    }),
    probeFactory: _.merge({}, base, {
        name: "Orbital Launcher",
        description: "Manufactures and launches probes towards Solarion V.",
        runnable: true,
        type: TYPES.consumer,
    }),

};

const baseCalculator = {
    animationTag: (state, structure) => { // todo rename animationKey?
        if (hasInsufficientResources(structure)) {
            return 'idle';
        }
        return isRunning(structure) ? 'running' : 'idle';
    }
}

/**
 * These structure values vary depending on the rest of the state. We define them as functions here, and the RESULT
 * of these function calls will be stored in the state. The results are recalculated often; see recalculateSlice method.
 * 
 * Note: `variables` is a special object that is calculated first; its result is provided to the rest of the functions as a
 * third parameter (that way many functions can be built off the same variables)
 */
export const calculators = {
    harvester: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            const variables = {
                lowEndRate: 0.25, // Running at this rate or lower will result in 100% efficiency
                topEndEfficiency: 0.25, // Running at 100% rate will result in this efficiency
                ore: 20, // how much ore is being produced
                energy: 10, // how much energy is being consumed
                efficiency: undefined, // resulting efficiency (defined later based on running rate)
            }

            applyAllEffects(state, variables, structure);

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

            return variables;
        },
        cost: (state, structure) => ({
            ore: 350 * (STANDARD_COST_EXP)**(getNumBuilt(structure))
        }),
        consumes: (state, structure, variables) => ({
            energy: variables.energy
        }),
        produces: (state, structure, variables) => ({
            ore: variables.ore
        }),
        statusMessage: (state, structure, variables) => {
            if (!isRunning(structure)) {
                return IDLE_LABEL
            }
            else {
                if (hasInsufficientResources(structure)) {
                    return INSUFFICIENT_LABEL;
                }
                return `${round(variables.efficiency * 100)}% efficiency`
            }
        },
    }),
    solarPanel: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            const variables = {
                daylight: daylightPercent(state.clock),
                minDaylight: 0, // minimum daylight percentage
                peakEnergy: 5, // amount of energy generated in peak daylight
                actualEnergy: undefined // amount of energy actually generated (defined later based on sunlight)
            }

            applyAllEffects(state, variables, structure);

            variables.peakEnergy *= netDroidPerformanceBoost(state, structure);
            variables.peakEnergy *= netEnergyBayBoost(state);
            variables.daylight = Math.max(variables.daylight, variables.minDaylight);
            variables.actualEnergy = variables.peakEnergy * variables.daylight;
            return variables;
        },
        cost: (state, structure) => ({
            ore: 100 * (STANDARD_COST_EXP)**(getNumBuilt(structure))
        }),
        produces: (state, structure, variables) => ({
            energy: variables.actualEnergy
        }),
        statusMessage: (state, structure, variables) => {
            if (variables.daylight === 0) {
                return redText(`${daylightPercent(state.clock) * 100}% sunlight`);
            }
            return `${daylightPercent(state.clock) * 100}% sunlight`;
        },
        description: (state, structure, variables) => {
            return `Produces up to ${formatInteger(variables.peakEnergy, true)}${getIconSpan('energy', true)} per second depending on sunlight.`;
        },
    }),
    windTurbine: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            const variables = {
                cutInSpeed: 15,
                ratedSpeed: 28,
                cutOutSpeed: 47,
                cutInPower: 0,
                ratedPower: 15
            }

            applyAllEffects(state, variables, structure);

            variables.ratedPower *= netDroidPerformanceBoost(state, structure);
            variables.ratedPower *= netEnergyBayBoost(state);

            return variables;
        },
        cost: (state, structure) => ({
            ore: 300 * (STANDARD_COST_EXP)**(getNumBuilt(structure))
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
        statusMessage: (state, structure, variables) => {
            const wind = windSpeed(state.clock);

            if (wind < variables.cutInSpeed) {
                return redText('Not enough wind');
            }
            if (wind > variables.cutOutSpeed) {
                return redText('Dangerous winds');
            }

            if (wind < variables.ratedSpeed) {
                const percent = (wind - variables.cutInSpeed) / (variables.ratedSpeed - variables.cutInSpeed);
                return `${round(percent * 100)}% of rated speed`;
            }

            return '100% rated speed';
        },
        description: (state, structure, variables) => {
            return `Produces up to ${formatInteger(variables.ratedPower, true)}${getIconSpan('energy', true)} per second ` +
                `when wind speed is between ${variables.cutInSpeed} and ${variables.cutOutSpeed} mph.`;
        },
        animationTag: (state, structure, variables) => {
            const wind = windSpeed(state.clock);
            return wind < variables.cutInSpeed || wind > variables.cutOutSpeed ? 'idle' : 'running'; // todo these should be a animation constant
        }
    }),
    thermalVent: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            return {
                energy: 20 * netDroidPerformanceBoost(state, structure) * netEnergyBayBoost(state)
            }
        },
        cost: (state, structure) => ({
            ore: 50 * (STANDARD_COST_EXP)**(getNumBuilt(structure)),
            vents: 1
        }),
        produces: (state, structure, variables) => {
            return {
                energy: variables.energy
            }
        },
        description: (state, structure, variables) => {
            return `Produces ${formatInteger(variables.energy, true)}${getIconSpan('energy', true)} per second with occasional bursts of energy. `
        }
    }),
    energyBay: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            const variables = {
                capacity: 200,
                energyBoost: 0
            }

            applyAllEffects(state, variables, structure);

            variables.capacity *= netDroidPerformanceBoost(state, structure);

            return variables;
        },
        cost: (state, structure) => ({
            ore: 100 * (STANDARD_COST_EXP)**(getNumBuilt(structure)),
            energy: 50 * (STANDARD_COST_EXP)**(getNumBuilt(structure)),
        }),
        capacity: (state, structure, variables) => {
            return { energy: variables.capacity };
        },
        boost: (state, structure, variables) => {
            return { energy: variables.energyBoost }
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
        variables: (state, structure) => {
            const variables = {
                energy: 50,
                ore: 50,
                refinedMinerals: 1,

                nightReduction: 0
            }

            applyAllEffects(state, variables, structure);

            variables.refinedMinerals *= netDroidPerformanceBoost(state, structure);
            if (daylightPercent(state.clock) === 0) {
                variables.energy *= (1 - variables.nightReduction);
            }
            return variables;

        },
        cost: (state, structure) => ({
            ore: 2000 * (STANDARD_COST_EXP)**(getNumBuilt(structure)),
            energy: 1400 * (STANDARD_COST_EXP)**(getNumBuilt(structure)),
        }),
        consumes: (state, structure, variables) => ({
            energy: variables.energy * getRunningRate(structure),
            ore: variables.ore * getRunningRate(structure)
        }),
        produces: (state, structure, variables) => {
            return {
                refinedMinerals: variables.refinedMinerals * getRunningRate(structure)
            }
        },
        statusMessage: (state, structure, variables) => {
            if (!isRunning(structure)) {
                return IDLE_LABEL
            }
            else {
                if (hasInsufficientResources(structure)) {
                    return INSUFFICIENT_LABEL;
                }
                return RUNNING_LABEL
            }
        },
    }),
    droidFactory: _.merge({}, baseCalculator, {
        cost: (state, structure) => ({
            ore: 5000 * (STANDARD_COST_EXP)**(getNumBuilt(structure)),
            refinedMinerals: 100 * (STANDARD_COST_EXP)**(getNumBuilt(structure)),
            energy: 5000 * (STANDARD_COST_EXP)**(getNumBuilt(structure)),
        }),
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
        statusMessage: (state, structure, variables) => {
            if (!isRunning(structure)) {
                return IDLE_LABEL
            }
            else {
                if (hasInsufficientResources(structure)) {
                    return INSUFFICIENT_LABEL;
                }
                return RUNNING_LABEL
            }
        },
        produces: (state, structure) => {
            return {
                probes: 1 * getRunningRate(structure) * netDroidPerformanceBoost(state, structure)
            }
        },
    })

}

/**
 * Some structure variables depend on OTHER structure variables (e.g. solarPanel production depends on energyBay boost).
 * In these cases we have to make custom functions that both structures can use INDEPENDENTLY.
 *
 * In an ideal word, we'd have the structures recalculating their variables constantly, but this is costly performance-wise.
 * Here is an example of the problem:
 *
 * 1. energyBay is built -> state is recalculated:
 *     1a. solarPanel is recalculated using old energyBay:boost variable // this is the problem; energyBay hasn't been updated yet
 *     1b. energyBay variable 'boost' is updated to reflect
 * 2. on the NEXT state recalculation, solarPanel finally gets the updated energyBay:boost variable
 *
 * As you can see it takes up to TWO recalculations for the changes to propagate (when one structure depends on another).
 *
 * So instead of doing that, we implement custom functions here.
 */
export function droidPerformanceBoost(state) {
    const variables = {
        boost: 0.15
    }

    const improvedMaintenance = getUpgrade(state.upgrades, 'droidFactory_improvedMaintenance');
    if (isResearched(improvedMaintenance)) {
        applySingleEffect(improvedMaintenance.effect, variables);
    }

    return variables.boost;
}

function netDroidPerformanceBoost(state, structure) {
    return 1 + (droidPerformanceBoost(state) * structure.droidData.numDroidsAssigned);
}


export function energyBayBoost(state) {
    const variables = {
        energyBoost: 0
    };

    ['energyBay_production1', 'energyBay_production2'].forEach(upgradeId => {
        const upgrade = getUpgrade(state.upgrades, upgradeId);
        if (isResearched(upgrade)) {
            applySingleEffect(upgrade.effect, variables);
        }
    })

    return variables.energyBoost;
}

function netEnergyBayBoost(state) {
    return 1 + energyBayBoost(state) * getNumBuilt(getStructure(state.structures, 'energyBay'))
    // return 1 + getStructureStatistic(state, getStructure(state.structures, 'energyBay'), 'boost', false).energy;
}




// Applies all applicable upgrades and abilities for a structure
// Note: order of application matters (we always add before multiplying).
// Therefore this should always be called before applying droid bonus (which is a multiplication)
// Probably best to always call this right after instantiating variables
function applyAllEffects(state, variables, structure) {
    const operations = initOperations();

    const upgradeIds = upgradesAffectingStructure[structure.id];
    if (upgradeIds) {
        upgradeIds.forEach(upgradeId => {
            const upgrade = getUpgrade(state.upgrades, upgradeId);
            if (isResearched(upgrade) && upgrade.effect) {
                mergeEffectIntoOperations(upgrade.effect, operations);
            }
        })
    }

    const abilityIds = abilitiesAffectingStructure[structure.id];
    if (abilityIds) {
        abilityIds.forEach(abilityId => {
            const ability = getAbility(state.abilities, abilityId);
            if (ability && isCasting(ability) && ability.effect) {
                mergeEffectIntoOperations(ability.effect, operations);
            }
        })
    }

    applyOperationsToVariables(operations, variables);
}