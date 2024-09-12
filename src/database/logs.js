import * as fromStructures from '../redux/modules/structures';
import * as fromResources from '../redux/modules/resources';
import * as fromUpgrades from '../redux/modules/upgrades';
import * as fromAbilities from '../redux/modules/abilities';
import * as fromGame from '../redux/modules/game';
import * as fromPlanet from '../redux/modules/planet';
import * as fromReducer from '../redux/reducer';
import {addTrigger} from "../redux/triggers";
import * as fromLog from "../redux/modules/log";
import {batch} from "react-redux";
import {mapObject} from "../lib/helpers";
import {generateMap} from "../redux/modules/planet";
import {generateProbeDist} from "../redux/modules/star";

const NORMAL_BOOTUP = 'normalBootup'; // Standard crash log sequence
const SKIP_BOOTUP = 'skipBootup'; // Skip crash log, normal story playthrough
const SKIP_EVERYTHING = 'skipEverything'; // Skip to all structures buildable

const GAME_MODE = SKIP_EVERYTHING; /* Controls overall game mode (e.g. set to SKIP_BOOTUP to skip bootup sequence) */


export default {
    startup: {
        text: [],
        onFinish: (dispatch) => {
            switch (GAME_MODE) {
                case NORMAL_BOOTUP:
                    dispatch(fromLog.startLogSequence('crashLog'));
                    break;
                case SKIP_BOOTUP:
                    dispatch(fromLog.startLogSequence('skipBootup'));
                    break;
                case SKIP_EVERYTHING:
                    dispatch(fromLog.startLogSequence('skipEverything'));
                    break;
            }
        }
    },

    crashLog: {
        text: [
            ['Resuming last session...', 0, true],
            ['', 3000],
            ['yUE9ha2tMCpmVtpKqZSc', 100],
            ['puKrMbdJZoO09kbxo40X', 100],
            ['gFfKhzGPVSHwvGyYwdT6', 100],
            ['dQ9kq7RMbVkTPjrHaqUF', 100],
            ['Fu2ZOLxLqCa5JIrs4dYn', 100],
            ['tMdJZAMZwY6itvypKRLE', 100],
            ['Nfr3pPoxCuqOb6wZpZgB', 100],
            ['PhjJOk2eQkcQIPlWzkhh', 100],
            ['0VA8kLarEkErnYs8TkNp', 100],
            ['1FHhErZXfl39dlEuEWs5', 100],
            ['jn4p3K2ylr8jxVQ4hGRk', 100],
            ['u5bsjsfJJ2jSSDLidBc1', 100],
            ['mtPL2dwoxP04Gn9hfkvV', 100],
            ['jSupjlXMCSMWCabxn3tR', 100],
            ['JLGfBu2Cf5pnE9aFoOOk', 100],
            ['SvbmwEw2KcofYi1eIh1n', 100],
            ['70kBJKMfVlHVsnrOUQzo', 100],
            ['2EMDBbNV5vYHeAjk1T2C', 100],
            ['WMBtMjf6VM6A4Trdfb5O', 100],
            ['cHb3exHm8xIVCTwwupN0', 100],
            ['WkGM7GWxwb6HXi7SoJR4', 100],
            ['55usa2sYLNDg3mT9dVji', 100],
            ['HOA3zYkEte1BXZkTa1nS', 100],
            ['THNizuhnXw78z7yXTkWn', 100],
            ['YGHrlFKyNObJlDahYkfU', 100],
            ['XMERhSzPI5Fpmv3MKHVF', 100],
            ['xNyuMtk0jVNAVJI2g7Re', 100],
            ['tMdJZAMZwY6itvypKRLE', 100],
            ['Nfr3pPoxCuqOb6wZpZgB', 100],
            ['PhjJOk2eQkcQIPlWzkhh', 100],
            ['0VA8kLarEkErnYs8TkNp', 100],
            ['1FHhErZXfl39dlEuEWs5', 100],
            ['jn4p3K2ylr8jxVQ4hGRk', 100],
            ['u5bsjsfJJ2jSSDLidBc1', 100],
            ['mtPL2dwoxP04Gn9hfkvV', 100],
            ['jSupjlXMCSMWCabxn3tR', 100],
            ['JLGfBu2Cf5pnE9aFoOOk', 100],
            ['SvbmwEw2KcofYi1eIh1n', 100],
            ['70kBJKMfVlHVsnrOUQzo', 100],
            ['2EMDBbNV5vYHeAjk1T2C', 100],
            ['WMBtMjf6VM6A4Trdfb5O', 100],
            ['cHb3exHm8xIVCTwwupN0', 100],
            ['WkGM7GWxwb6HXi7SoJR4', 100],
            ['55usa2sYLNDg3mT9dVji', 100],
            ['HOA3zYkEte1BXZkTa1nS', 100],
            ['THNizuhnXw78z7yXTkWn', 100],
            ['YGHrlFKyNObJlDahYkfU', 100],
            ['XMERhSzPI5Fpmv3MKHVF', 100],
            ['xNyuMtk0jVNAVJI2g7Re', 100],
            ['dqPKeBfukEghCbLcpRml', 100],
            ['HsKx1UmLZU4c4R4cZcOy', 100],
            ['yuksp0ZPG00QnRgwqqY4', 100],
            ['NJlUcLGfIrsnQXewNkxp', 100],
            ['J1MLcYA98T8mYnVorsbo', 100],
            ['TE5N16ZhW9rLHmYpGoMl', 100],
            ['posyxsfClu7nEm1XByd5', 100],
            ['vct1EcFh4RJWV¦L6WFYj', 100],
            ['eapi4gImm1tUPcnX9JPZ', 100],
            ['DMW9 Bl4LD1Ygk¦¦JuwWW', 100],
            ['HxAl kN6.YGr826k8BxcL7', 100],
            ['Uoiq▓WCg..CTt8║      qZ2WVOeTx', 100],
            ['tGL6 f889f..e;', 100],
            ['Qu7h uAvF...xef  9gGUC6ZDSt', 100],
            ['QjJo kY4Mjf||EWF  JqvK3jYtQB', 100],
            ['9Bjf 6aI9pYwZB1k9Ye║▀', 100],
            ['JuFZ 9hgp2F       [[[[iUvQvnsAxl', 100],
            ['[[[ [ |||| =- **▒ ▒ ||    || |]]', 100],
            ['[-----', 0],
            ['▒▒▒ ║           |||| X  ▓', 0],
            ['||', 0],
            ['▒', 0],
            ['', 0],
            ['FATAL ERROR OCCURRED', 0],
            ['', 5000],
            ['****************', 0],
            ['****************', 0],
            ['****************', 0],
            [' ', 0],
            ['RECOVERING', 0],
            ['', 3000],
            ['Error code: 18589194123098', 0],
            ['ADDR:', 100],
            ['[3260 7515 1562]', 0],
            ['[3064 3772 8098]', 0],
            ['[6849 7590 4712]', 0],
            ['[5196 8857 2428]', 0],
            ['[2598 8722 0112]', 0],
            ['[5350 6892 8792]', 0],
            ['[6240 4625 6629]', 0],
            ['[6433 3822 8854]', 0],
            ['[0140 5313 1417]', 0],
            ['', 3500],
            ['#################################', 10],
            ['', 10],
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
            ['', 3000],
        ],
        onFinish: (dispatch) => {
            dispatch(fromLog.startLogSequence('recoverSensors'));
        }
    },

    recoverSensors: {
        text: [
            ['Performing system checks...', 3000],
            ['Energy        100u', 800],
            ['Capacity      500u', 800],
            ['Oxygen        40%', 800],
            ['Water         33%', 800],
            ['Mineral Ore   0', 2000],
            ['Life Support  ERR', 2000],
            ['Sensors       Online', 2000],
            ['', 100],
        ],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromGame.updateSetting('showPlanetStatus', true));
                dispatch(fromLog.startLogSequence('displaySensors'));
            })
        }
    },

    displaySensors: {
        text: [
            ['Displaying Sensor Readings...', 4000, true],
            ['', 100]
        ],
        onFinish: (dispatch) => {
            dispatch(fromLog.startLogSequence('scanForHostiles'));
        }
    },

    scanForHostiles: {
        text: [
            ['Scanning for hostile activity.', 2000, true],
            ['.', 2000],
            ['..', 2000],
            ['...', 2000],
            ['....', 2000],
            ['', 0],
            ['No exterior hostiles detected.', 5000],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromGame.updateSetting('shuttersClosed', false));
                dispatch(fromLog.startLogSequence('openWindow'));
            })
        }
    },

    openWindow: {
        text: [
            ['Lowering blast shield...', 16000, true], // should match $window-transition
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
            ['Mining: Operational (1 harvester)', 2000, true],
            ['System: Ready', 1000],
            ['', 100],
            ['Awaiting input...', 0, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromResources.learn('energy'));
                dispatch(fromResources.learn('ore'));

                dispatch(fromGame.updateSetting('showResourceBar', true));

                dispatch(fromStructures.learn('harvester'));
                dispatch(fromStructures.buildForFree('harvester', 1));
            })

            gameStartTriggers(dispatch);
        }
    },
    
    skipBootup: {
        text: [
            ['Skipping crash sequence', 1000, true],
            ['', 100],
            ['Awaiting input...', 0, true],
            ['', 0],
        ],
        onFinish: (dispatch) => {
            batch(() => {
                dispatch(fromGame.updateSetting('shuttersClosed', false));
                dispatch(fromGame.updateSetting('showPlanetStatus', true));
                dispatch(fromGame.updateSetting('showResourceBar', true));

                dispatch(fromResources.learn('energy'));
                dispatch(fromResources.learn('ore'));

                dispatch(fromGame.updateSetting('showResourceBar', true));

                dispatch(fromStructures.learn('harvester'));
                dispatch(fromStructures.buildForFree('harvester', 1));
            })

            gameStartTriggers(dispatch);
        }
    },

    skipEverything: {
        text: [
            ['Skipping Normal Login', 1, true],
            ['', 1],
            ['All known resources have been loaded.', 0, true]
        ],
        onFinish: (dispatch) => {
            dispatch(fromGame.updateSetting('shuttersClosed', false));
            dispatch(fromGame.updateSetting('showPlanetStatus', true));
            dispatch(fromGame.updateSetting('showResourceBar', true));

            dispatch(fromResources.learn('energy'));
            dispatch(fromResources.learn('ore'));
            dispatch(fromResources.learn('vents'));
            dispatch(fromResources.learn('refinedMinerals'));
            dispatch(fromResources.learn('standardDroids'));
            dispatch(fromResources.learn('probes'));
            dispatch(fromResources.learn('buildableLand'));
            dispatch(fromResources.learn('developedLand'));

            dispatch(generateMap());
            dispatch(generateProbeDist());

            dispatch(fromStructures.learn('harvester'));
            dispatch(fromStructures.buildForFree('harvester', 1));
            // dispatch(fromAbilities.learn('harvester_manual'));
            // dispatch(fromAbilities.learn('harvester_power'));
            dispatch(fromUpgrades.discover('harvester_overclock'));

            // dispatch(fromStructures.learn('sensorTower'));
            dispatch(fromStructures.learn('refinery'));

            dispatch(fromStructures.learn('solarPanel'));
            // dispatch(fromUpgrades.discover('solarPanel_largerPanels'))
            dispatch(fromStructures.learn('thermalVent'));
            dispatch(fromStructures.learn('windTurbine'));
            dispatch(fromStructures.learn('energyBay'));
            dispatch(fromUpgrades.discover('energyBay_largerCapacity'))

            dispatch(fromStructures.learn('droidFactory'));
            dispatch(fromAbilities.learn('droidFactory_buildStandardDroid'));

            dispatch(fromStructures.learn('probeFactory'));

            dispatch(fromResources.produce({
                ore: 5000,
                energy: 0,
                refinedMinerals: 100,
                standardDroids: 5
            }))

            dispatch(fromGame.addNavTab('outside'));
            dispatch(fromGame.addNavTab('planet'));
            dispatch(fromGame.addNavTab('star'));

            dispatch(fromUpgrades.discover('windTurbine_reduceCutIn'))
            dispatch(fromUpgrades.discover('windTurbine_increaseCutOut'))
            dispatch(fromUpgrades.discover('windTurbine_largerBlades'))
            dispatch(fromUpgrades.discover('windTurbine_yawDrive'))

            dispatch(fromAbilities.learn('replicate'));

            addTrigger(
                (state) => state.planet.droidData,
                (slice) => slice.numDroidsAssigned > 0,
                () => {
                    dispatch(fromPlanet.startExploringMap());
                }
            )
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

    energyDepleted: {
        text: [
            ['Energy depleted. Researching solutions...', 3000, true],
            ['', 0],
            ['New Schematic(s) Found:', 0, true],
            ['- Solar Panels', 0, true],
            ['- Wind Turbines', 0, true],
            ['', 0]
        ],
        onFinish: (dispatch) => {
            dispatch(fromStructures.learn('solarPanel'));
            dispatch(fromStructures.learn('windTurbine'));
        }
    },

    researchComplete: {
        text: [
            ['Research complete.', 0, true],
            ['', 0],
        ]
    },

    gameEnd: {
        text: [
            ['Simulation END', 2000, true],
            [''],
            ['This is the end of the current game implementation...', 2000],
            [''],
            ['Thank you for playing.', 2000]
        ]
    }

}

function gameStartTriggers(dispatch) {

    addTrigger(
        (state) => state.resources.byId.energy,
        (slice) => slice.amount <= 5,
        () => {
            dispatch(fromLog.startLogSequence('energyDepleted'));
        }
    )

    addTrigger(
        (state) => state.resources.byId.energy,
        (slice) => slice.amount >= slice.capacity * 0.80,
        () => {
            dispatch(fromLog.startLogSequence('energyAlmostFull'));
        }
    )

    addTrigger(
        (state) => state.structures.byId.harvester,
        (slice) => slice.count.total >= 5,
        () => {
            batch(() => {
                dispatch(fromStructures.learn('sensorTower'));
                dispatch(fromStructures.learn('refinery'));
            });
        }
    )

    addTrigger(
        (state) => state.structures.byId.refinery,
        (slice) => slice.count.total >= 1,
        () => {
            dispatch(fromLog.logMessage('gameEnd'))
        }
    )
}