
import * as fromResources from "../redux/modules/resources";
import * as fromStructures from "../redux/modules/structures";
import * as fromLog from "../redux/modules/log"
import * as fromUpgrades from "../redux/modules/upgrades";
import * as fromAbilities from "../redux/modules/abilities";
import {addTrigger} from "../redux/triggers";
import {EFFECT_TARGETS} from "../lib/effect";
import {getIconSpan} from "../redux/modules/resources";
import * as fromGame from "../redux/modules/game";
import * as fromPlanet from "../redux/modules/planet";
import {generateMap} from "../redux/modules/planet";
import * as fromStar from "../redux/modules/star";
import {probeCapacity} from "../lib/star";

export const STATES = {
    hidden: 0,
    // silhouetted: 1,
    discovered: 2,
    researching: 3,
    paused: 4,
    researched: 5
}

const base = {
    name: 'Unknown',
    description: "",
    researchTime: 0, // if 0, research will occur instantly
    state: STATES.hidden,
    cost: {},

    // Possible options -- discoverWhen: { resources: { x/y/z }, upgrades: [], structures: { x/y/z} }
    // If resources is defined, the upgrade will be automatically discovered once lifetime resource totals pass these values
    // If structures is defined, the upgrade will be automatically discovered once structure build count pass these values
    // If upgrades is defined, those upgrades need to be already researched before this will be discovered
    discoverWhen: undefined,
    
    effect: undefined,
    affects: {
        type: EFFECT_TARGETS.structure
        // No default id necessary; if blank it is assumed to be the upgrade's structure
    }
}

// TODO don't hardcode values into description, e.g. "Increase energy production by {{ multiplier * 100 }}% ..."
// Note: 'effect' keys correspond to structure calculated variables
const database = {
    commandCenter_showTerminal: _.merge({}, base, {
        name: "Boot-Up Computer",
        structure: 'commandCenter',
        description: "You manage to find the power switch for a computer terminal behind a mess of wire.",
        discoverWhen: {
            resources: {
                energy: 10,
            }
        },
        cost: {
            energy: 15
        }
    }),
    commandCenter_showPlanetStatus: _.merge({}, base, {
        name: "Activate Weather Sensors",
        structure: 'commandCenter',
        description: "Gathers information about the planet.",
        discoverWhen: {
            upgrades: ['commandCenter_showTerminal'],
            resources: {
                energy: 20
            }
        },
        cost: {
            energy: 10
        }
    }),
    commandCenter_showResourceRates: _.merge({}, base, {
        name: "Turn on Advanced Stats",
        structure: 'commandCenter',
        description: "Allows you to monitor resources collection rates.",
        discoverWhen: {
            upgrades: ['commandCenter_showPlanetStatus'],
            resources: {
                energy: 30,
            }
        },
        cost: {
            energy: 10
        }
    }),
    commandCenter_openShutters: _.merge({}, base, {
        name: "Lower Blast Shield",
        structure: 'commandCenter',
        description: "The shutters are rusty but appear functional.",
        discoverWhen: {
            upgrades: ['commandCenter_showResourceRates'],
            resources: {
                energy: 40
            }
        },
        cost: {
            energy: 15
        }
    }),
    commandCenter_improvedSolenoid: _.merge({}, base, {
        name: "Replace Coils",
        structure: 'commandCenter',
        description: "Increases solenoid energy per second to 2.",
        discoverWhen: {
            resources: {
                ore: 10
            }
        },
        cost: {
            ore: 40
        },
        effect: {
            energy: { add: 1 }
        }
    }),
    commandCenter_improvedSolenoid2: _.merge({}, base, {
        name: "Superconductive Coils",
        structure: 'commandCenter',
        description: "Increases solenoid energy per second to 5.",
        discoverWhen: {
            upgrades: ['commandCenter_improvedSolenoid'],
            resources: {
                ore: 50
            }
        },
        cost: {
            ore: 100
        },
        effect: {
            energy: { add: 3 }
        }
    }),
    commandCenter_improvedSolenoid3: _.merge({}, base, {
        name: "Fused Wiring",
        structure: 'commandCenter',
        description: "Solenoid charging time increased to 10s.",
        discoverWhen: {
            upgrades: ['commandCenter_improvedSolenoid2'],
            resources: {
                ore: 300
            }
        },
        cost: {
            ore: 300,
            energy: 150
        },
        affects: {
            type: EFFECT_TARGETS.ability,
            id: 'commandCenter_charge'
        },
        effect: {
            castTime: { add: 5 }
        }
    }),
    commandCenter_improvedSolenoid4: _.merge({}, base, {
        name: "Gold Wiring",
        structure: 'commandCenter',
        description: "Increases solenoid energy per second to 30.",
        discoverWhen: {
            upgrades: ['commandCenter_improvedSolenoid3'],
            resources: {
                ore: 1000
            }
        },
        cost: {
            ore: 500,
            refinedMinerals: 25
        },
        effect: {
            energy: { add: 25 }
        }
    }),
    commandCenter_improvedSolenoid5: _.merge({}, base, {
        name: "Platinum Wiring",
        structure: 'commandCenter',
        description: "Increases solenoid energy per second to 100.",
        discoverWhen: {
            upgrades: ['commandCenter_improvedSolenoid4'],
            resources: {
                refinedMinerals: 250
            }
        },
        cost: {
            ore: 1200,
            refinedMinerals: 125
        },
        effect: {
            energy: { add: 70 }
        }
    }),
    commandCenter_improvedSolenoid6: _.merge({}, base, {
        name: "Plasma Inductor",
        structure: 'commandCenter',
        description: "Solenoid charging time increased to 30s.",
        discoverWhen: {
            upgrades: ['commandCenter_improvedSolenoid5'],
            resources: {
                refinedMinerals: 1000
            }
        },
        cost: {
            refinedMinerals: 3000
        },
        affects: {
            type: EFFECT_TARGETS.ability,
            id: 'commandCenter_charge'
        },
        effect: {
            castTime: { add: 20 }
        }
    }),
    commandCenter_improvedSolenoid7: _.merge({}, base, {
        name: "Quantum Induction",
        structure: 'commandCenter',
        description: "Increases solenoid energy per second to 1000.",
        discoverWhen: {
            upgrades: ['commandCenter_improvedSolenoid6'],
            resources: {
                refinedMinerals: 15000
            }
        },
        cost: {
            refinedMinerals: 35000
        },
        effect: {
            energy: { add: 900 }
        }
    }),


    harvester_ore1: _.merge({}, base, {
        name: "Iron Drillbit",
        structure: 'harvester',
        description: "Increases harvester ore production by 20%.",
        discoverWhen: {
            resources: {
                ore: 300
            }
        },
        cost: {
            ore: 500
        },
        effect: {
            ore: { multiply: 1.2 },
        }
    }),
    harvester_ore2: _.merge({}, base, {
        name: "Steel Drillbit",
        structure: 'harvester',
        description: "Increases harvester ore production by 30%.",
        discoverWhen: {
            resources: {
                ore: 500
            },
            upgrades: ['harvester_ore1']
        },
        cost: {
            ore: 600,
            refinedMinerals: 10
        },
        effect: {
            ore: { multiply: 1.3 },
        }
    }),
    harvester_ore3: _.merge({}, base, {
        name: "Superheated Engines",
        structure: 'harvester',
        description: "Increases harvester ore production by 50%, but also increases energy cost by 30%.",
        discoverWhen: {
            resources: {
                ore: 3000,
                refinedMinerals: 40
            },
            upgrades: ['harvester_ore2']
        },
        cost: {
            ore: 1200,
            refinedMinerals: 100
        },
        effect: {
            ore: { multiply: 1.5 },
            energy: { multiply: 1.3 }
        }
    }),
    harvester_ore4: _.merge({}, base, {
        name: "Hyper-kinetic Engines",
        structure: 'harvester',
        description: "Increases harvester ore production by 200%, but also increases energy cost by 200%.",
        discoverWhen: {
            resources: {
                refinedMinerals: 5000
            },
            upgrades: ['harvester_ore3']
        },
        cost: {
            refinedMinerals: 10000
        },
        effect: {
            ore: { multiply: 3 },
            energy: { multiply: 3 }
        }
    }),
    harvester_eff1: _.merge({}, base, {
        name: "Heat Guards",
        structure: 'harvester',
        description: "Improves energy efficiency when running at max speed from 25% to 50%.",
        discoverWhen: {
            resources: {
                ore: 2000
            },
        },
        cost: {
            ore: 1200,
            refinedMinerals: 10
        },
        effect: {
            topEndEfficiency: { add: 0.25 },
        }
    }),
    harvester_eff2: _.merge({}, base, {
        name: "Nanocarbon Threading",
        structure: 'harvester',
        description: "Allows the harvester to run at 100% energy efficiency even when running at max speed.",
        discoverWhen: {
            upgrades: ['harvester_eff1'],
            resources: {
                ore: 10000
            }
        },
        cost: {
            ore: 12000,
            refinedMinerals: 700
        },
        effect: {
            topEndEfficiency: { add: 0.5 },
        }
    }),



    harvester_overclock: _.merge({}, base, {
        name: "Research: Overclock",
        structure: 'harvester',
        description: "Learn the <span class='underline'>Overclock</span> ability, allowing you to briefly run the " +
            "Harvester at a higher rate.",
        discoverWhen: {
            // resources: {
            //     refinedMinerals: 500
            // },
            upgrades: ['harvester_ore1', 'harvester_eff1']
        },
        cost: {
            ore: 1000,
            refinedMinerals: 50
        }
    }),
    harvester_overclockUpgrade1: _.merge({}, base, {
        name: "Feedback Loop",
        structure: 'harvester',
        description: "Increase the Overclock ability duration to 30 seconds",
        discoverWhen: {
            upgrades: ['harvester_overclock'],
            resources: {
                refinedMinerals: 3000
            }
        },
        cost: {
            refinedMinerals: 5000
        },
        affects: {
            type: EFFECT_TARGETS.ability,
            id: 'harvester_overclock'
        },
        effect: {
            castTime: { add: 20 }
        }
    }),
    harvester_overclockUpgrade2: _.merge({}, base, {
        name: "Hyper-clock",
        structure: 'harvester',
        description: "Overclock increases ore production by 1000% at the cost of 500% increased energy.",
        discoverWhen: {
            upgrades: ['harvester_overclockUpgrade1'],
            resources: {
                refinedMinerals: 30000
            }
        },
        cost: {
            refinedMinerals: 50000
        },
        affects: {
            type: EFFECT_TARGETS.ability,
            id: 'harvester_overclock'
        },
        effect: {
            oreMultiplication: { add: 9 },
            energyMultiplication: { add: 4.5 },
        }
    }),

    solarPanel_largerPanels: _.merge({}, base, {
        name: "Larger Panels",
        structure: 'solarPanel',

        description: "Increase solar panel energy production by 50%.",
        discoverWhen: {
            structures: {
                solarPanel: 3
            },
            resources: {
                energy: 1000
            }
        },
        cost: {
            ore: 500
        },
        effect: {
            peakEnergy: { multiply: 1.5 }
        },
    }),
    solarPanel_ambientLight: _.merge({}, base, {
        name: "Ambient Light Receptors",
        structure: 'solarPanel',
        description: "Produce energy at 25% effectiveness at night.",
        discoverWhen: {
            resources: {
                energy: 1000,
                refinedMinerals: 10
            },
            upgrades: ['solarPanel_largerPanels']
        },
        cost: {
            ore: 2100,
            refinedMinerals: 20
        },
        effect: {
            minDaylight: { add: 0.25 }
        },
    }),
    solarPanel_sunTracking: _.merge({}, base, {
        name: "Even Larger Panels",
        structure: 'solarPanel',
        description: "Increase solar panel energy production by 200%.",
        discoverWhen: {
            resources: {
                energy: 1000,
                refinedMinerals: 100
            },
            upgrades: ['solarPanel_largerPanels']
        },
        cost: {
            ore: 5500,
            refinedMinerals: 150
        },
        effect: {
            peakEnergy: { multiply: 3 }
        },
    }),
    solarPanel_global: _.merge({}, base, {
        name: "Global Infrastructure",
        structure: 'solarPanel',
        description: "Averages the output of all Solar Farms across the globe, allowing energy to be produced at a constant rate.",
        effect: {
            globalAverageRate: { add: 1 }
        }
    }),
    solarPanel_sunShield: _.merge({}, base, {
        name: "Radiation Shielding",
        structure: 'solarPanel',
        description: "Upgrades Solar Farms to be able to receive focused beams of light from space probes.",
        discoverWhen: {
            upgrades: ['solarPanel_global'],
            resources: {
                probes: 15e3, // out of 1800e3
            }
        },
        cost: {
            ore: 1.3e8,
            refinedMinerals: 5.1e7
        }
    }),


    energyBay_largerCapacity: _.merge({}, base, {
        name: "Flux Capacitors",
        structure: 'energyBay',
        description: "Multiplies energy bay capacity by 300%.",
        discoverWhen: {
            structures: {
                energyBay: 4
            }
        },
        cost: {
            ore: 1500
        },
        effect: {
            capacity: { multiply: 3 }
        }
    }),
    energyBay_production1: _.merge({}, base, {
        name: "Power Linking (I)",
        structure: 'energyBay',
        // description: `Increases overall ${getIconSpan('energy', true)} production by 3% per Energy Bay`,
        description: `Increases overall energy production by 3% per Energy Bay`,
        discoverWhen: {
            structures: {
                energyBay: 5
            }
        },
        cost: {
            ore: 2000,
            refinedMinerals: 50
        },
        effect: {
            energyBoost: { add: 0.03 }
        }
    }),
    energyBay_production2: _.merge({}, base, {
        name: "Power Linking (II)",
        structure: 'energyBay',
        // description: `Increases ${getIconSpan('energy', true)} production boost to 5%`,
        description: `Increases energy production boost to 5% per Energy Bay`,
        discoverWhen: {
            upgrades: ['energyBay_production1']
        },
        cost: {
            ore: 5000,
            refinedMinerals: 200
        },
        effect: {
            energyBoost: { add: 0.02 } // going from 3% to 5%
        }
    }),
    energyBay_production3: _.merge({}, base, {
        name: "Power Linking (III)",
        structure: 'energyBay',
        // description: `Increases ${getIconSpan('energy', true)} production boost to 5%`,
        description: `Increases energy production boost to 10% per Energy Bay`,
        discoverWhen: {
            upgrades: ['energyBay_production2'],
            resources: {
                refinedMinerals: 1e5
            }
        },
        cost: {
            refinedMinerals: 1.7e6
        },
        effect: {
            energyBoost: { add: 0.05 } // going from 5% to 10%
        }
    }),
    energyBay_production4: _.merge({}, base, { // todo if you copy this to make another level, update the constant in energyBayBoost function
        name: "Power Linking (IV)",
        structure: 'energyBay',
        // description: `Increases ${getIconSpan('energy', true)} production boost to 5%`,
        description: `Increases energy production boost to 20% per Energy Bay`,
        discoverWhen: {
            upgrades: ['energyBay_production2'],
            resources: {
                refinedMinerals: 1e7
            }
        },
        cost: {
            refinedMinerals: 2.3e8
        },
        effect: {
            energyBoost: { add: 0.1 } // going from 10% to 20%
        }
    }),


    energyBay_largerCapacity2: _.merge({}, base, {
        name: "Lithium Ions",
        structure: 'energyBay',
        description: "Multiplies energy bay capacity by 500%.",
        discoverWhen: {
            upgrades: ['energyBay_largerCapacity'],
            resources: {
                refinedMinerals: 200
            }
        },
        cost: {
            ore: 4000,
            refinedMinerals: 300
        },
        effect: {
            capacity: { multiply: 5 }
        }
    }),
    energyBay_largerCapacity3: _.merge({}, base, {
        name: "Ultra-dense Matrix",
        structure: 'energyBay',
        description: "Multiplies energy bay capacity by 500%.",
        discoverWhen: {
            upgrades: ['energyBay_largerCapacity2'],
            resources: {
                refinedMinerals: 5e5
            }
        },
        cost: {
            refinedMinerals: 5.8e6
        },
        effect: {
            capacity: { multiply: 5 }
        }
    }),

    windTurbine_largerBlades: _.merge({}, base, {
        name: "Larger Blades",
        structure: 'windTurbine',
        description: "Increase energy production by 25%",
        discoverWhen: {
            resources: {
                ore: 1500
            }
        },
        cost: {
            ore: 1500
        },
        effect: {
            ratedPower: { multiply: 1.25 }
        }
    }),
    windTurbine_reduceCutIn: _.merge({}, base, {
        name: "Advanced Blades",
        structure: 'windTurbine',
        description: "Improves the turbine's power output at low wind speeds.",
        discoverWhen: {
            resources: {
                ore: 1500,
                refinedMinerals: 10
            }
        },
        cost: {
            ore: 1000,
            refinedMinerals: 25
        },
        effect: {
            cutInSpeed: { add: -5 }
        }
    }),
    windTurbine_increaseCutOut: _.merge({}, base, {
        name: "Hyper Motor",
        structure: 'windTurbine',
        description: "Increases the turbine's max wind speed tolerance by 20 kph",
        discoverWhen: {
            resources: {
                ore: 1500,
                refinedMinerals: 10
            }
        },
        cost: {
            ore: 1000,
            refinedMinerals: 25
        },
        effect: {
            cutOutSpeed: { add: 20 }
        }
    }),
    windTurbine_yawDrive: _.merge({}, base, {
        name: "Yaw Drive",
        structure: 'windTurbine',
        description: "Allows the wind turbine to rotate towards the wind's direction, increasing energy production by 50%",
        discoverWhen: {
            resources: {
                // ore: 1500,
                refinedMinerals: 50
            }
        },
        cost: {
            ore: 3500,
            refinedMinerals: 100
        },
        effect: {
            ratedPower: { multiply: 1.3 }
        }
    }),
    windTurbine_global: _.merge({}, base, {
        name: "Global Infrastructure",
        structure: 'windTurbine',
        description: "Averages the output of all Wind Turbines across the globe, allowing energy to be produced at a constant rate.",
        effect: {
            globalAverageRate: { add: 1 }
        }
    }),

    refinery_improveProduction: _.merge({}, base, {
        name: "Higher Yields",
        structure: 'refinery',
        description: 'Increase amount of minerals produced by 25%',
        discoverWhen: {
            resources: {
                refinedMinerals: 10
            }
        },
        cost: {
            ore: 4500,
            refinedMinerals: 50
        },
        effect: {
            refinedMinerals: { multiply: 1.25 }
        }
    }),
    refinery_cooling: _.merge({}, base, {
        name: "Surface Cooling",
        structure: 'refinery',
        description: 'Reduce energy cost by 50% at night',
        discoverWhen: {
            resources: {
                refinedMinerals: 100
            }
        },
        cost: {
            ore: 10000,
            refinedMinerals: 200,
        },
        effect: {
            nightReduction: { add: 0.5 }
        }
    }),
    refinery_improveProduction2: _.merge({}, base, {
        name: "Hyper-Alloy Synthesizer",
        structure: 'refinery',
        description: 'Increase amount of minerals produced by 100%',
        discoverWhen: {
            upgrades: ['refinery_improveProduction'],
            resources: {
                refinedMinerals: 600
            }
        },
        cost: {
            ore: 12000,
            refinedMinerals: 1000
        },
        effect: {
            refinedMinerals: { multiply: 2 }
        }
    }),
    refinery_improveProduction3: _.merge({}, base, {
        name: "Plasma Furnace",
        structure: 'refinery',
        description: 'Increase amount of minerals produced by 100%, but also increases energy cost by 50%',
        discoverWhen: {
            upgrades: ['refinery_improveProduction2'],
            resources: {
                refinedMinerals: 10000
            }
        },
        cost: {
            ore: 30000,
            refinedMinerals: 16000
        },
        effect: {
            refinedMinerals: { multiply: 2 },
            energy: { multiply: 1.5 }
        }
    }),
    refinery_improveProduction4: _.merge({}, base, {
        name: "Plasma Furnace",
        structure: 'refinery',
        description: 'Increase amount of minerals produced by 500%, but also increases energy cost by 300%',
        discoverWhen: {
            upgrades: ['refinery_improveProduction3'],
            resources: {
                refinedMinerals: 100000
            }
        },
        cost: {
            refinedMinerals: 350000
        },
        effect: {
            refinedMinerals: { multiply: 6 },
            energy: { multiply: 4 }
        }
    }),

    droidFactory_improvedMaintenance: _.merge({}, base, {
        name: "Advanced Hyperchips",
        structure: 'droidFactory',
        description: 'Doubles the effectiveness of droids assigned to structures',
        discoverWhen: {
            resources: {
                standardDroids: 5
            }
        },
        cost: {
            refinedMinerals: 200,
        },
        affects: {
            type: EFFECT_TARGETS.misc
        },
        effect: {
            boost: { multiply: 2 }
        }
    }),
    droidFactory_longerComm: _.merge({}, base, {
        name: "Long-range Communication",
        structure: 'droidFactory',
        description: 'Allows droids to explore the planet',
        discoverWhen: {
            resources: {
                standardDroids: 5,
                refinedMinerals: 250
            }
        },
        cost: {
            refinedMinerals: 500,
        },
        affects: {
            type: EFFECT_TARGETS.misc
        },
    }),
    droidFactory_fasterBuild: _.merge({}, base, {
        name: "Faster Builds",
        structure: 'droidFactory',
        description: 'Reduces build time by 15s',
        discoverWhen: {
            resources: {
                standardDroids: 2
            }
        },
        cost: {
            ore: 500,
            energy: 500
        },
        affects: {
            type: EFFECT_TARGETS.ability,
            id: 'droidFactory_buildStandardDroid'
        },
        effect: {
            castTime: { add: -15 }
        }
    }),
    droidFactory_fasterExplore: _.merge({}, base, {
        name: "Jetpack Tech",
        structure: 'droidFactory',
        description: 'Equips droids with jetpacks, allowing them to explore the planet 5 times faster.',
        discoverWhen: {
            resources: {
                standardDroids: 10,
                refinedMinerals: 1e5
            }
        },
        cost: {
            ore: 1e6,
            refinedMinerals: 1e6
        }
    }),

    probeFactory_exponentialGrowth: _.merge({}, base, {
        name: "Exponential Growth",
        structure: 'probeFactory',
        description: `Use the massive energy output of Solarion to boost all production proportional to your probe count.`,
        discoverWhen: {
            upgrades: ['solarPanel_sunShield'],
            resources: {
                energy: 1.5e13,
            }
        },
        cost: {
            energy: 3.0e13
        }
    }),
    probeFactory_finalSequence: _.merge({}, base, {
        name: "Transcend",
        structure: 'probeFactory',
        description: `Unleash the swarm's full potential.`,
        cost: {
            energy: 10
        }
    })
};

export default database;


// Functions can't be stored in the state so storing them in this const
export const callbacks = {
    commandCenter_showTerminal: {
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('showTerminal', true));
            dispatch(fromLog.startLogSequence('turnOnComputer'));
        }
    },
    commandCenter_showResourceRates: {
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('showResourceRates', true));
        }
    },
    commandCenter_showPlanetStatus: {
        onFinish: (dispatch) => {
            dispatch(fromLog.startLogSequence('showPlanetStatus'));
        }
    },
    commandCenter_openShutters: {
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('shuttersOpen', true));
            dispatch(fromStructures.learn('harvester'));
            dispatch(fromStructures.buildForFree('harvester', 1));
            dispatch(fromLog.startLogSequence('openShutters'));
        }
    },

    harvester_overclock: {
        onFinish: (dispatch) => {
            dispatch(fromAbilities.learn('harvester_overclock'));
        }
    },

    droidFactory_longerComm: {
        onFinish: (dispatch) => {
            dispatch(fromResources.learn('buildableLand'));
            dispatch(fromResources.learn('developedLand'));

            dispatch(generateMap());

            dispatch(fromGame.addNavTab('outside'));
            dispatch(fromGame.addNavTab('planet'));

            dispatch(fromAbilities.learn('replicate'));

            dispatch(fromLog.startLogSequence('globeUnlocked'));

            addTrigger(
                (state) => state.planet.droidData,
                (slice) => slice.numDroidsAssigned > 0,
                () => {
                    dispatch(fromPlanet.startExploringMap());
                }
            )
        }
    },
    droidFactory_fasterExplore: {
        onFinish: (dispatch) => {
            dispatch(fromPlanet.setExploreSpeed(5));
        }
    },

    solarPanel_sunShield: {
        onFinish: (dispatch) => {
            dispatch(fromStar.updateSetting('mirrorsOnline', true));
            dispatch(fromLog.startLogSequence('solarPanelProbeReady'));
            dispatch(fromGame.updateSetting('rapidlyRecalcEnergy', true));
        }
    },
    probeFactory_finalSequence: {
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('blockPointerEvents', true));
            dispatch(fromLog.startLogSequence('finalSequence_start'));
        }
    }
}


// A lookup of upgrades that AFFECT a structure
// Format: { structureId => [upgrade1, upgrade2, ...], ... }
export const upgradesAffectingStructure = {}

// A lookup of upgrades that AFFECT an ability
// Format: { abilityId => [upgrade1, upgrade2, ...], ... }
export const upgradesAffectingAbility = {}

for (const [upgradeId, upgradeDbRecord] of Object.entries(database)) {
    switch(upgradeDbRecord.affects.type) {
        case EFFECT_TARGETS.structure:
            // If `affects` obj has no id we default to affecting the upgrade's structure
            const structureId = upgradeDbRecord.affects.id || upgradeDbRecord.structure;
            if (upgradesAffectingStructure[structureId] === undefined) {
                upgradesAffectingStructure[structureId] = []
            }
            upgradesAffectingStructure[structureId].push(upgradeId);
            break;
        case EFFECT_TARGETS.ability:
            const abilityId = upgradeDbRecord.affects.id;
            if (upgradesAffectingAbility[abilityId] === undefined) {
                upgradesAffectingAbility[abilityId] = []
            }
            upgradesAffectingAbility[abilityId].push(upgradeId);
            break;
    }
}
