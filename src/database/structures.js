import {
    getNumBuilt,
    getRunningRate,
    hasInsufficientResources,
    isRunning
} from "../redux/modules/structures";
import {getUpgrade, isResearched} from "../redux/modules/upgrades";
import {daylightPercent, windSpeed} from "../redux/modules/clock";
import {canConsume, getIconSpan, getQuantity, getResource} from "../redux/modules/resources";
import {round} from "lodash";
import {getAbility, isCasting} from "../redux/modules/abilities";
import {redText} from "../lib/helpers";
import {upgradesAffectingStructure} from "./upgrades";
import {abilitiesAffectingStructure} from "./abilities";
import {applyOperationsToVariables, applySingleEffect, initOperations, mergeEffectIntoOperations} from "../lib/effect";

export const STATUSES = {
    normal: 0,
    insufficient: 1,
}
export const TYPES = {
    generator: 0,
    consumer: 1
}

const INSUFFICIENT_RESOURCES = redText('Insufficient Resources')

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
            ore: 150 * (1.4)**(getNumBuilt(structure))
        }),
        consumes: (state, structure, variables) => ({
            energy: variables.energy
        }),
        produces: (state, structure, variables) => ({
            ore: variables.ore
        }),
        statusMessage: (state, structure, variables) => {
            if (!isRunning(structure)) {
                return 'Idle'
            }
            else {
                if (hasInsufficientResources(structure)) {
                    return INSUFFICIENT_RESOURCES;
                }
                return `${round(variables.efficiency * 100)}% efficiency`
            }
        },
    }),
    solarPanel: _.merge({}, baseCalculator, {
        variables: (state, structure) => {
            const variables = {
                daylight: daylightPercent(state.clock),
                peakEnergy: 5, // amount of energy generated in peak daylight
                actualEnergy: undefined // amount of energy actually generated
            }

            applyAllEffects(state, variables, structure);

            variables.peakEnergy *= netDroidPerformanceBoost(state, structure);
            variables.actualEnergy = variables.peakEnergy * variables.daylight;
            return variables;
        },
        cost: (state, structure) => ({
            ore: 10 * (1.5)**(getNumBuilt(structure))
        }),
        produces: (state, structure, variables) => ({
            energy: variables.actualEnergy
        }),
        statusMessage: (state, structure, variables) => {
            if (variables.daylight === 0) {
                return redText(`${daylightPercent(state.clock) * 100}% daylight`);
            }
            return `${daylightPercent(state.clock) * 100}% daylight`;
        },
        description: (state, structure, variables) => {
            return `Produces ${variables.peakEnergy}${getIconSpan('energy', true)} per second in peak sunlight.`;
        },
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

            applyAllEffects(state, variables, structure);

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
            return `Produces up to ${variables.ratedPower}${getIconSpan('energy', true)} per second ` +
                `when wind speed is between ${variables.cutInSpeed} and ${variables.cutOutSpeed} mph.`;
        },
        animationTag: (state, structure, variables) => {
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

            applyAllEffects(state, variables, structure);

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
            energy: 21000000 * getRunningRate(structure),
            ore: 21000000 * getRunningRate(structure)
        }),
        statusMessage: (state, structure, variables) => {
            if (!isRunning(structure)) {
                return 'Idle'
            }
            else {
                if (hasInsufficientResources(structure)) {
                    return INSUFFICIENT_RESOURCES;
                }
                return 'Running'
            }
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
        statusMessage: (state, structure, variables) => {
            if (!isRunning(structure)) {
                return 'Idle'
            }
            else {
                if (hasInsufficientResources(structure)) {
                    return INSUFFICIENT_RESOURCES;
                }
                return 'Running'
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
    const variables = {
        boost: 0.2
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