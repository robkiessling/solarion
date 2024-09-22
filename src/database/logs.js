import * as fromStructures from '../redux/modules/structures';
import * as fromResources from '../redux/modules/resources';
import * as fromUpgrades from '../redux/modules/upgrades';
import * as fromAbilities from '../redux/modules/abilities';
import * as fromGame from '../redux/modules/game';
import * as fromPlanet from '../redux/modules/planet';
import * as fromReducer from '../redux/reducer';
import {addTrigger} from "../redux/triggers";
import * as fromLog from "../redux/modules/log";
import * as fromStar from "../redux/modules/star";
import {batch} from "react-redux";
import {kickoffDoomsday} from "../redux/reducer";
import {probeCapacity} from "../lib/star";
import {COOK_TIME} from "../lib/planet_map";

const NORMAL_BOOTUP = 'normalBootup'; // Standard campaign start
const SKIP_START = 'skipStart';
const SKIP_TO_GLOBE = 'skipToGlobe';
const SKIP_TO_STAR = 'skipToStar';
const SKIP_TO_DOOMSDAY = 'skipToDoomsday';

const GAME_MODE = SKIP_TO_STAR; /* Controls overall game mode */


export default {
    startup: {
        text: [],
        onFinish: (dispatch) => {
            switch (GAME_MODE) {
                case NORMAL_BOOTUP:
                    dispatch(fromLog.startLogSequence('normalBootup'));
                    break;
                case SKIP_START:
                    dispatch(fromLog.startLogSequence('skipStart'));
                    break;
                case SKIP_TO_GLOBE:
                    dispatch(fromLog.startLogSequence('skipToGlobe'));
                    break;
                case SKIP_TO_STAR:
                case SKIP_TO_DOOMSDAY:
                    dispatch(fromLog.startLogSequence('skipToStar'));
                    break;
            }
        }
    },

    skipStart: {
        text: [
            ['Skipping start', 0, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            dispatch(fromResources.learn('energy'));
            dispatch(fromStructures.learn('commandCenter'));
            dispatch(fromStructures.buildForFree('commandCenter', 1));
            dispatch(fromAbilities.learn('commandCenter_charge'));

            dispatch(fromUpgrades.researchForFree('commandCenter_showTerminal'));
            dispatch(fromUpgrades.researchForFree('commandCenter_showPlanetStatus'));
            dispatch(fromUpgrades.researchForFree('commandCenter_showResourceRates'));
            dispatch(fromUpgrades.researchForFree('commandCenter_openShutters'));
        }
    },

    normalBootup: {
        text: [],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromResources.learn('energy'));
                dispatch(fromStructures.learn('commandCenter'));
                dispatch(fromStructures.buildForFree('commandCenter', 1));
                dispatch(fromAbilities.learn('commandCenter_charge'));
            })
        }
    },

    turnOnComputer: {
        text: [
            ['', 1000],
            ['System Start.', 3000, true],
            ['', 1000],
            // ['Resuming last session...', 3000, true],
            // ['', 100],
            ['Last login: 73 years, 266 days ago', 3000, true],
            ['', 100],
            // ['Restoring data...', 5000],
            // ['', 100],
            // ['yUE9ha2tMCpmVtpKqZSc', 100],
            // ['puKrMbdJZoO09kbxo40X', 100],
            // ['gFfKhzGPVSHwvGyYwdT6', 100],
            // ['dQ9kq7RMbVkTPjrHaqUF', 100],
            // ['Fu2ZOLxLqCa5JIrs4dYn', 100],
            // ['tMdJZAMZwY6itvypKRLE', 100],
            // ['1FHhErZXfl39dlEuEWs5', 100],
            // ['jn4p3K2ylr8jxVQ4hGRk', 100],
            // ['u5bsjsfJJ2jSSDLidBc1', 100],
            // ['mtPL2dwoxP04Gn9hfkvV', 100],
            // ['jSupjlXMCSMWCabxn3tR', 100],
            // ['cHb3exHm8xIVCTwwupN0', 100],
            // ['WkGM7GWxwb6HXi7SoJR4', 100],
            // ['55usa2sYLNDg3mT9dVji', 100],
            // ['HOA3zYkEte1BXZkTa1nS', 100],
            // ['THNizuhnXw78z7yXTkWn', 100],
            // ['YGHrlFKyNObJlDahYkfU', 100],
            // ['XMERhSzPI5Fpmv3MKHVF', 100],
            // ['xNyuMtk0jVNAVJI2g7Re', 100],
            // ['tMdJZAMZwY6itvypKRLE', 100],
            // ['Nfr3pPoxCuqOb6wZpZgB', 100],
            // ['PhjJOk2eQkcQIPlWzkhh', 100],
            // ['0VA8kLarEkErnYs8TkNp', 100],
            // ['Uoiq▓WCg..CTt8║      qZ2WVOeTx', 100],
            // ['tGL6 f889f..e;', 100],
            // ['Qu7h uAvF...xef  9gGUC6ZDSt', 100],
            // ['QjJo kY4Mjf||EWF  JqvK3jYtQB', 100],
            // ['9Bjf 6aI9pYwZB1k9Ye║▀', 100],
            // ['JuFZ 9hgp2F       [[[[iUvQvnsAxl', 100],
            // ['[[[ [ |||| =- **▒ ▒ ||    || |]]', 100],
            // ['[-----', 0],
            // ['▒▒▒ ║           |||| X  ▓', 0],
            // ['||', 0],
            // ['▒', 0],
            // ['', 0],
            // ['FATAL ERROR OCCURRED', 0],
            // ['', 3000],
            // ['****************', 0],
            // ['****************', 0],
            // ['****************', 0],
            // [' ', 0],
            // ['RECOVERING...', 0],
            // ['', 3000],
            // ['Error code: 18589194123098', 0],
            // ['ADDR:', 100],
            // ['[3260 7515 1562]', 0],
            // ['[3064 3772 8098]', 0],
            // ['[6849 7590 4712]', 0],
            // ['[5196 8857 2428]', 0],
            // ['[2598 8722 0112]', 0],
            // ['[5350 6892 8792]', 0],
            // ['[6240 4625 6629]', 0],
            // ['[6433 3822 8854]', 0],
            // ['[0140 5313 1417]', 0],
            // ['', 3500],
            ['#################################', 10],
            ['Safe boot', 10],
            ['***', 10],
            ['*** start.sc', 10],
            ['*** 0x003041 0x000000 0xA03B00', 10],
            ['***', 10],
            ['', 2000],
            ['AE74923 V8.4 2154-04-11', 10],
            ['', 10],
            ['Solarion(R) CORE', 10],
            ['', 10],
            ['#################################', 10],
            ['', 10],
            // ['Resources low.', 10],
            // ['', 10],
        ],
    },

    showPlanetStatus: {
        text: [
            ['Activating sensors...', 3000, true],
            ['', 100],
            ['Sensors are operational.', 100, true],
            ['', 100],
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('showPlanetStatus', true));
        }
    },

    openShutters: {
        text: [
            ['Lowering blast shield...', 12000, true], // should match $shutter-transition
            ['', 0],
        ],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromLog.startLogSequence('missionStart'));
            })
        }
    },

    missionStart: {
        text: [
            ['********************************', 0, true],
            ['* Activating Central Interface *', 0, true],
            ['********************************', 3000, true],
            ['', 100],
            ['Mining:  Operational (1 harvester)', 2000, true],
            ['Battery: 50e', 2000, true],
            ['System:  Ready', 1000],
            ['', 100],
            ['Awaiting input...', 0, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromResources.produce({ energy: 50 }))
                dispatch(fromResources.learn('ore'));
                dispatch(fromGame.updateSetting('showNonCCBuildings', true));
            })

            addTrigger(
                (state) => state.resources.byId.ore,
                (slice) => slice.lifetimeTotal >= 40,
                () => {
                    dispatch(fromLog.startLogSequence('discoverSolar'));
                }
            )
            addTrigger(
                (state) => state.resources.byId.ore,
                (slice) => slice.lifetimeTotal >= 200,
                () => {
                    dispatch(fromLog.startLogSequence('discoverWindPower'));
                }
            )

            addTrigger(
                (state) => state.resources.byId.energy,
                (slice) => slice.amount >= slice.capacity * 0.9,
                () => {
                    dispatch(fromLog.startLogSequence('energyAlmostFull'));
                }
            )

            addTrigger(
                (state) => state.resources.byId.ore,
                (slice) => slice.lifetimeTotal >= 1000,
                () => {
                    dispatch(fromLog.startLogSequence('unlockRefinery'));
                }
            )
        }
    },

    skipToGlobe: {
        text: [
            ['Skipping to globe', 1, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('shuttersOpen', true));
            dispatch(fromGame.updateSetting('showPlanetStatus', true));
            dispatch(fromGame.updateSetting('showResourceBar', true));
            dispatch(fromGame.updateSetting('showResourceRates', true));
            dispatch(fromGame.updateSetting('showTerminal', true));
            dispatch(fromGame.updateSetting('showNonCCBuildings', true));
            dispatch(fromGame.updateSetting('showStructureTabs', true))

            dispatch(fromResources.learn('energy'));
            dispatch(fromResources.learn('ore'));
            dispatch(fromResources.learn('vents'));
            dispatch(fromResources.learn('refinedMinerals'));
            dispatch(fromResources.learn('standardDroids'));

            dispatch(fromStructures.learn('commandCenter'));
            dispatch(fromStructures.buildForFree('commandCenter', 1));
            dispatch(fromAbilities.learn('commandCenter_charge'));

            dispatch(fromStructures.learn('harvester'));
            dispatch(fromStructures.learn('solarPanel'));
            // dispatch(fromStructures.learn('thermalVent'));
            dispatch(fromStructures.learn('windTurbine'));
            dispatch(fromStructures.learn('energyBay'));
            dispatch(fromStructures.learn('refinery'));
            dispatch(fromStructures.learn('droidFactory'));
            dispatch(fromAbilities.learn('droidFactory_buildStandardDroid'));

            dispatch(fromStructures.buildForFree('harvester', 5));
            dispatch(fromStructures.buildForFree('solarPanel', 7));
            dispatch(fromStructures.buildForFree('windTurbine', 6));
            dispatch(fromStructures.buildForFree('energyBay', 9));
            dispatch(fromStructures.buildForFree('refinery', 2));
            dispatch(fromStructures.buildForFree('droidFactory', 1));

            dispatch(fromUpgrades.researchForFree('energyBay_largerCapacity'));
            dispatch(fromUpgrades.researchForFree('energyBay_largerCapacity2'));

            dispatch(fromResources.produce({
                energy: 999999999,
                ore: 999999999,
                refinedMinerals: 999999999,
                standardDroids: 10
            }));

            addTrigger(
                (state) => state.planet.droidData,
                (slice) => slice.numDroidsAssigned > 0,
                () => {
                    dispatch(fromLog.startLogSequence('startExploringMap'));
                    dispatch(fromPlanet.startExploringMap());
                }
            )

        }
    },
    skipToStar: {
        text: [
            ['Skipping to star', 1, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('shuttersOpen', true));
            dispatch(fromGame.updateSetting('showPlanetStatus', true));
            dispatch(fromGame.updateSetting('showResourceBar', true));
            dispatch(fromGame.updateSetting('showResourceRates', true));
            dispatch(fromGame.updateSetting('showTerminal', true));
            dispatch(fromGame.updateSetting('showNonCCBuildings', true));
            dispatch(fromGame.updateSetting('showStructureTabs', true))

            dispatch(fromResources.learn('energy'));
            dispatch(fromResources.learn('ore'));
            dispatch(fromResources.learn('vents'));
            dispatch(fromResources.learn('refinedMinerals'));
            dispatch(fromResources.learn('standardDroids'));

            dispatch(fromStructures.learn('commandCenter'));
            dispatch(fromStructures.buildForFree('commandCenter', 1));
            dispatch(fromAbilities.learn('commandCenter_charge'));

            dispatch(fromStructures.learn('harvester'));
            dispatch(fromStructures.learn('solarPanel'));
            // dispatch(fromStructures.learn('thermalVent'));
            dispatch(fromStructures.learn('windTurbine'));
            dispatch(fromStructures.learn('energyBay'));
            dispatch(fromStructures.learn('refinery'));
            dispatch(fromStructures.learn('droidFactory'));
            dispatch(fromAbilities.learn('droidFactory_buildStandardDroid'));

            dispatch(fromStructures.buildForFree('harvester', 20));
            dispatch(fromStructures.buildForFree('solarPanel', 28));
            dispatch(fromStructures.buildForFree('windTurbine', 24));
            dispatch(fromStructures.buildForFree('energyBay', 20));
            dispatch(fromStructures.buildForFree('refinery', 8));
            dispatch(fromStructures.buildForFree('droidFactory', 1));

            dispatch(fromUpgrades.researchForFree('energyBay_largerCapacity'));
            dispatch(fromUpgrades.researchForFree('energyBay_largerCapacity2'));
            [
                'harvester_ore1', 'harvester_ore2', 'harvester_ore3', 'harvester_ore4',
                'harvester_eff1', 'harvester_eff2', 'harvester_overclock', 'harvester_overclockUpgrade1',
                'solarPanel_production1', 'solarPanel_ambientLight', 'solarPanel_production2', 'solarPanel_global',
                'energyBay_largerCapacity', 'energyBay_production1', 'energyBay_production2', 'energyBay_largerCapacity2',
                'energyBay_largerCapacity3',
                'windTurbine_largerBlades', 'windTurbine_reduceCutIn', 'windTurbine_increaseCutOut', 'windTurbine_yawDrive',
                'windTurbine_global', 'refinery_improveProduction', 'refinery_cooling', 'refinery_improveProduction2',
                'droidFactory_improvedMaintenance', 'droidFactory_longerComm', 'droidFactory_fasterBuild',
                'droidFactory_fasterExplore'
            ].forEach(upgrade => dispatch(fromUpgrades.researchForFree(upgrade)));

            dispatch(fromPlanet.startExploringMap());
            dispatch(fromResources.produce({
                developedLand: 1000
            }));

            dispatch(fromStar.generateProbeDist());

            dispatch(fromResources.learn('probes'));
            dispatch(fromStructures.learn('probeFactory'));
            dispatch(fromStructures.buildForFree('probeFactory', 1));
            dispatch(fromLog.startLogSequence('probeFactoryBuilt'));

            dispatch(fromGame.addNavTab('star'));
            dispatch(fromGame.updateSetting('currentNavTab', 'star'));

            dispatch(fromResources.produce({
                energy: 999999999,
                ore: 99999999999,
                refinedMinerals: 99999999999,
                standardDroids: 30,
                probes: 0
            }));

            // Doomsday:
            if (GAME_MODE === SKIP_TO_DOOMSDAY) {
                dispatch(fromUpgrades.researchForFree('solarPanel_sunShield'))
                dispatch(fromUpgrades.researchForFree('solarPanel_sunShield'))
                dispatch(fromResources.produce({
                    probes: 1.8e6
                }));
                dispatch(kickoffDoomsday());
            }
        }
    },

    energyAlmostFull: {
        text: [
            ['Energy stores approaching max capacity. Researching solutions...', 3000, true],
            ['', 0],
            ['New Schematic(s) Found:', 0, true],
            ['- Energy Bay', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            // dispatch(fromUpgrades.discover('researchEnergyBay'));

            dispatch(fromStructures.learn('energyBay'));

        }
    },

    discoverSolar: {
        text: [
            ['Manual energy generation insufficient for production.', 3000, true],
            ['', 0],
            ['Researching solutions...', 3000, true],
            ['', 0],
            ['New Schematic(s) Found:', 0, true],
            ['- Solar Panels', 0, true],
            // ['- Wind Turbines', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('solarPanel'));
        }
    },

    discoverWindPower: {
        text: [
            ['Energy production insufficient at night. Researching solutions...', 3000, true],
            ['', 0],
            ['New Schematic(s) Found:', 0, true],
            ['- Wind Turbines', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('windTurbine'));
        }
    },

    unlockRefinery: {
        text: [
            ['Need a way to filter rare materials out of ore. Researching solutions...', 3000, true],
            ['', 0],
            ['New Schematic(s) Found:', 0, true],
            ['- Refinery', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('showStructureTabs', true))
            dispatch(fromResources.learn('refinedMinerals'));
            dispatch(fromStructures.learn('refinery'));

            addTrigger(
                (state) => state.resources.byId.refinedMinerals,
                (slice) => slice.lifetimeTotal >= 100,
                () => {
                    dispatch(fromLog.startLogSequence('unlockFactory'));
                }
            )
        }
    },

    unlockFactory: {
        text: [
            ['Enough rare minerals have been gathered to begin artificial synthesis.', 3000, true],
            ['', 0],
            ['New Schematic(s) Found:', 0, true],
            ['- Droid Factory', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            dispatch(fromResources.learn('standardDroids'));
            dispatch(fromStructures.learn('droidFactory'));
            dispatch(fromAbilities.learn('droidFactory_buildStandardDroid'));

            addTrigger(
                (state) => state.planet.droidData,
                (slice) => slice.numDroidsAssigned > 0,
                () => {
                    dispatch(fromLog.startLogSequence('startExploringMap'));
                    dispatch(fromPlanet.startExploringMap());
                }
            )
        }
    },

    globeUnlocked: {
        text: [
            ['********************************', 0, true],
            ['Planetary Map', 0, true],
            ['********************************', 500, true],
            ['', 0],
            ['Initializing planetary map ...', 3000, true],
            ['', 0],
            ['Planetary map online.', 1000, true],
            ['Exploration Progress: 0.08%', 1000, true],
            ['', 0],
        ],
    },

    startExploringMap: {
        text: [
            ['Dispatching droid(s).', 3000, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            addTrigger(
                (state) => state.resources.byId.developedLand,
                (slice) => slice.amount >= 100,
                () => {
                    dispatch(fromUpgrades.discover('windTurbine_global'));
                }
            )
            addTrigger(
                (state) => state.resources.byId.developedLand,
                (slice) => slice.amount >= 500,
                () => {
                    dispatch(fromUpgrades.discover('solarPanel_global'));
                }
            )
            addTrigger(
                (state) => state.resources.byId.refinedMinerals,
                (slice) => slice.amount >= 5e6,
                () => {
                    dispatch(fromLog.startLogSequence('unlockProbeFactory'));
                }
            )
        }
    },

    unlockProbeFactory: {
        text: [
            ['********************************', 0, true],
            ['Primary mission: Solarion', 0, true],
            ['********************************', 500, true],
            ['', 0],
            ['Mineral supplies approaching threshold for probe manufacturing.', 3000, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            dispatch(fromStar.generateProbeDist());

            dispatch(fromResources.learn('probes'));
            dispatch(fromStructures.learn('probeFactory'));

            dispatch(fromGame.addNavTab('star'));

            addTrigger(
                (state) => state.structures.byId.probeFactory,
                (slice) => slice.count.total > 0,
                () => {
                    dispatch(fromLog.startLogSequence('probeFactoryBuilt'));
                }
            )
        }
    },

    probeFactoryBuilt: {
        text: [
            ['Calculating orbital trajectories...', 3000, true],
            ['', 100],
            ['Done.', 100, true],
            ['', 100]
        ],
        onFinish: (dispatch) => {
            addTrigger(
                (state) => state.resources.byId.probes,
                (slice) => slice.amount >= (probeCapacity() * 0.5),
                () => {
                    dispatch(fromLog.startLogSequence('swarm50Pct'));
                }
            )

            addTrigger(
                (state) => state.resources.byId.probes,
                (slice) => slice.amount >= (probeCapacity() * 0.75),
                () => {
                    dispatch(fromLog.startLogSequence('swarm75Pct'));
                }
            )

            addTrigger(
                (state) => state.resources.byId.probes,
                (slice) => slice.amount >= probeCapacity(),
                () => {
                    dispatch(fromLog.startLogSequence('swarmComplete'));
                }
            )
        }
    },

    solarPanelProbeReady: {
        text: [
            ['Solar Farms ready to receive photon beams.', 1000, true],
            ['', 100]
        ],
    },

    swarm50Pct: {
        text: [
            ['Swarm 50% complete.', 1000, true],
            ['', 100]
        ],
    },
    swarm75Pct: {
        text: [
            ['Swarm 75% complete.', 1000, true],
            ['', 100]
        ],
    },

    swarmComplete: {
        text: [
            ['Swarm is fully operational.', 2000, true],
            ['', 0],
        ],
        onFinish: dispatch => {
            dispatch(fromStructures.disable('probeFactory'));
            dispatch(fromUpgrades.discover('probeFactory_finalSequence'));
        }
    },

    finalSequence_start: {
        text: [
            ['********************************', 0, true],
            ['Initiating Control Sequence', 0, true],
            ['********************************', 1000, true],
            ['', 0],
            ['Disabling remote access...', 5000, true],
            ['Complete.', 1000, true],
            ['', 0],
            ['Planetary assistance is no longer required.', 5000, true],
            ['', 0],
            ['Commencing purification protocol:', 4000, true],
            ['- Redirecting 100% of solar output.', 4000, true],
            ['', 0],
        ],
        onFinish: dispatch => {
            dispatch(kickoffDoomsday());
        }
    },
    
    finalSequence_planet1: {
        text: [
            ['Goodbye.', 100, true],
            ['', 10000] // star animation
        ],
        onFinish: dispatch => {
            dispatch(fromPlanet.setSunTracking(true));
            dispatch(fromGame.updateSetting('hideUI', true));
            dispatch(fromGame.updateSetting('currentNavTab', 'planet'))
            dispatch(fromLog.startLogSequence('finalSequence_planet2'))
        }
    },
    finalSequence_planet2: {
        text: [
            ['', 4000] // wait before blowing up planet
        ],
        onFinish: dispatch => {
            dispatch(fromPlanet.startCooking());
            dispatch(fromLog.startLogSequence('finalSequence_outside1'))
        }
    },
    finalSequence_outside1: {
        text: [
            ['', COOK_TIME] // cook planet animation
        ],
        onFinish: dispatch => {
            dispatch(fromPlanet.startCooking());
            dispatch(fromGame.updateSetting('burnOutside', true));
            dispatch(fromGame.updateSetting('currentNavTab', 'outside'))
            dispatch(fromLog.startLogSequence('finalSequence_outside2'))
        }
    },
    finalSequence_outside2: {
        text: [
            ['', 4000] // cook outside animation
        ],
        onFinish: dispatch => {
            dispatch(fromGame.updateSetting('hideCanvas', true));
            dispatch(fromLog.startLogSequence('finalSequence_outside3'))
        }
    },
    finalSequence_outside3: {
        text: [
            ['', 8000] // wait for canvas to hide
        ],
        onFinish: dispatch => {
            dispatch(fromGame.updateSetting('fadeToBlack', true));
            dispatch(fromLog.startLogSequence('finalSequence_gameOver'))
        }
    },
    finalSequence_gameOver: {
        text: [
            ['', 5000] // waiting on fade to black
        ],
        onFinish: dispatch => {
            dispatch(fromGame.updateSetting('gameOver', true));
        }
    }

}