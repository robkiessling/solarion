// Dev bootstrap harness. GAME_MODE controls what a fresh game (no save) boots into; NORMAL_BOOTUP
// is the real campaign start, the rest are dev skips that grant mid/late-game state directly.
// Only index.jsx calls into this module, and only on a fresh start.
//
// Each skip logs an inline marker line first: fresh-start detection (hasStartedGame) keys off the
// log having entries, so the marker is what prevents the bootstrap re-running on reload.
import * as fromStructures from '../redux/modules/structures';
import * as fromResources from '../redux/modules/resources';
import * as fromUpgrades from '../redux/modules/upgrades';
import * as fromAbilities from '../redux/modules/abilities';
import * as fromGame from '../redux/modules/game';
import * as fromPlanet from '../redux/modules/planet';
import * as fromStar from '../redux/modules/star';
import * as fromLog from '../redux/modules/log';
import {addTrigger} from '../redux/modules/triggers';
import {kickoffDoomsday} from '../redux/reducer';
import type {UpgradeId} from '../database/upgrades';

const NORMAL_BOOTUP = 'normalBootup'; // Standard campaign start
const SKIP_START = 'skipStart';
const SKIP_TO_GLOBE = 'skipToGlobe';
const SKIP_TO_STAR = 'skipToStar';
const SKIP_TO_DOOMSDAY = 'skipToDoomsday';

const GAME_MODE: string = NORMAL_BOOTUP; /* Controls overall game mode */

// Energy per manual charge click, overriding the ability's normal value (0 = no override; the real value is 1 plus
// coil upgrades). 20 lands on the Boot-Up card in one click. Read by the charge ability's calculator, at call time,
// so the import cycle through the redux modules is harmless.
export const CLICK_ENERGY_OVERRIDE = 0;

// Terminal sequence speed: line delays and typing are divided by this (1 = real pacing, 10 = ten times faster).
// Read by components/log.jsx.
export const LOG_SPEED = 1;

export function runGameMode(dispatch: Dispatch) {
    switch (GAME_MODE) {
        case NORMAL_BOOTUP:
            dispatch(fromLog.startLogSequence('normalBootup'));
            break;
        case SKIP_START:
            skipStart(dispatch);
            break;
        case SKIP_TO_GLOBE:
            skipToGlobe(dispatch);
            break;
        case SKIP_TO_STAR:
        case SKIP_TO_DOOMSDAY:
            skipToStar(dispatch);
            break;
    }
}

// The state the intro cards leave behind, set directly (the cards are marked researched silently, so none of the
// boot / shutter / mission-start sequences play): terminal and bars on, shutters open, one harvester, ore known,
// and the harvester-start and energy-cap triggers armed as mission start would arm them.
function skipStart(dispatch: Dispatch) {
    dispatch(fromLog.logInline('Skipping start'));

    dispatch(fromResources.learn('energy'));
    dispatch(fromResources.learn('ore'));
    dispatch(fromStructures.learn('commandCenter'));
    dispatch(fromStructures.buildForFree('commandCenter', 1));
    dispatch(fromAbilities.learn('commandCenter_charge'));

    for (const id of ['commandCenter_showTerminal', 'commandCenter_showResourceBar', 'commandCenter_showPlanetStatus',
                      'commandCenter_showResourceRates', 'commandCenter_openShutters'] as const) {
        dispatch(fromUpgrades.researchForFree(id, true));
    }
    dispatch(fromGame.updateSetting('showTerminal', true));
    dispatch(fromGame.updateSetting('showResourceBar', true));
    dispatch(fromGame.updateSetting('showPlanetStatus', true));
    dispatch(fromGame.updateSetting('showResourceRates', true));
    dispatch(fromGame.updateSetting('shuttersOpen', true));
    dispatch(fromGame.updateSetting('showStructuresList', true));

    dispatch(fromStructures.learn('harvester'));
    dispatch(fromStructures.buildForFree('harvester', 1));

    dispatch(addTrigger('harvesterStarted'));
    dispatch(addTrigger('manualChargeInsufficient'));
    dispatch(addTrigger('energyAtCapacity'));
}

function skipToGlobe(dispatch: Dispatch) {
    dispatch(fromLog.logInline('Skipping to globe'));

    dispatch(fromGame.updateSetting('shuttersOpen', true));
    dispatch(fromGame.updateSetting('showPlanetStatus', true));
    dispatch(fromGame.updateSetting('showResourceBar', true));
    dispatch(fromGame.updateSetting('showResourceRates', true));
    dispatch(fromGame.updateSetting('showTerminal', true));
    dispatch(fromGame.updateSetting('showStructuresList', true));
    dispatch(fromGame.updateSetting('showStructureTabs', true))

    dispatch(fromResources.learn('energy'));
    dispatch(fromResources.learn('ore'));
    dispatch(fromResources.learn('refinedMinerals'));
    dispatch(fromResources.learn('standardDroids'));

    dispatch(fromStructures.learn('commandCenter'));
    dispatch(fromStructures.buildForFree('commandCenter', 1));
    dispatch(fromAbilities.learn('commandCenter_charge'));

    dispatch(fromStructures.learn('harvester'));
    dispatch(fromStructures.learn('solarPanel'));
    dispatch(fromStructures.learn('windTurbine'));
    dispatch(fromStructures.learn('energyBay'));
    dispatch(fromStructures.learn('refinery'));
    dispatch(fromStructures.learn('droidFactory'));
    dispatch(fromAbilities.learn('droidFactory_buildStandardDroid'));

    dispatch(fromStructures.buildForFree('harvester', 7));
    dispatch(fromStructures.buildForFree('solarPanel', 10));
    dispatch(fromStructures.buildForFree('windTurbine', 10));
    dispatch(fromStructures.buildForFree('energyBay', 13));
    dispatch(fromStructures.buildForFree('refinery', 2));
    dispatch(fromStructures.buildForFree('droidFactory', 1));

    dispatch(fromUpgrades.skipResearch('commandCenter_showTerminal'));
    dispatch(fromUpgrades.skipResearch('commandCenter_showResourceBar'));
    dispatch(fromUpgrades.skipResearch('commandCenter_showPlanetStatus'));
    dispatch(fromUpgrades.skipResearch('commandCenter_showResourceRates'));
    dispatch(fromUpgrades.skipResearch('commandCenter_openShutters'));
    dispatch(fromUpgrades.skipResearch('commandCenter_researchSolar'));
    dispatch(fromUpgrades.skipResearch('commandCenter_researchWind'));
    dispatch(fromUpgrades.skipResearch('commandCenter_researchEnergyBay'));
    dispatch(fromUpgrades.skipResearch('commandCenter_researchRefinery'));
    dispatch(fromUpgrades.skipResearch('commandCenter_researchDroidFactory'));

    dispatch(fromUpgrades.researchForFree('commandCenter_improvedCharge'));
    dispatch(fromUpgrades.researchForFree('commandCenter_improvedCharge2'));
    dispatch(fromUpgrades.researchForFree('commandCenter_improvedCharge3'));
    dispatch(fromUpgrades.researchForFree('commandCenter_improvedCharge4'));
    dispatch(fromUpgrades.researchForFree('commandCenter_chargeMineral1'));

    dispatch(fromUpgrades.researchForFree('harvester_ore1'));
    dispatch(fromUpgrades.researchForFree('harvester_ore2'));
    dispatch(fromUpgrades.researchForFree('harvester_eff1'));
    dispatch(fromUpgrades.researchForFree('harvester_overclock'));
    dispatch(fromUpgrades.researchForFree('solarPanel_production1'));
    dispatch(fromUpgrades.researchForFree('solarPanel_ambientLight'));
    dispatch(fromUpgrades.researchForFree('solarPanel_production2'));
    dispatch(fromUpgrades.researchForFree('energyBay_largerCapacity'));
    dispatch(fromUpgrades.researchForFree('energyBay_largerCapacity2'));
    dispatch(fromUpgrades.researchForFree('energyBay_production1'));
    dispatch(fromUpgrades.researchForFree('energyBay_production2'));
    dispatch(fromUpgrades.researchForFree('windTurbine_largerBlades'));
    dispatch(fromUpgrades.researchForFree('windTurbine_reduceCutIn'));
    dispatch(fromUpgrades.researchForFree('windTurbine_increaseCutOut'));
    dispatch(fromUpgrades.researchForFree('windTurbine_yawDrive'));
    dispatch(fromUpgrades.researchForFree('refinery_improveProduction'));
    dispatch(fromUpgrades.researchForFree('refinery_cooling'));
    dispatch(fromUpgrades.researchForFree('droidFactory_fasterBuild'));
    dispatch(fromUpgrades.researchForFree('droidFactory_longerComm'));

    dispatch(fromGame.updateSetting('currentNavTab', 'planet'))

    dispatch(fromResources.produce({
        energy: 9999999,
        ore: 999999999,
        refinedMinerals: 999999999,
        // refinedMinerals: 1000,
        standardDroids: 10
    }));

    dispatch(addTrigger('startExploringMap'))
}

function skipToStar(dispatch: Dispatch) {
    dispatch(fromLog.logInline('Skipping to star'));

    dispatch(fromGame.updateSetting('shuttersOpen', true));
    dispatch(fromGame.updateSetting('showPlanetStatus', true));
    dispatch(fromGame.updateSetting('showResourceBar', true));
    dispatch(fromGame.updateSetting('showResourceRates', true));
    dispatch(fromGame.updateSetting('showTerminal', true));
    dispatch(fromGame.updateSetting('showStructuresList', true));
    dispatch(fromGame.updateSetting('showStructureTabs', true))

    dispatch(fromResources.learn('energy'));
    dispatch(fromResources.learn('ore'));
    // dispatch(fromResources.learn('vents'));
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
    ([
        'harvester_ore1', 'harvester_ore2', 'harvester_ore3', 'harvester_ore4',
        'harvester_eff1', 'harvester_eff2', 'harvester_overclock', 'harvester_overclockUpgrade1',
        'solarPanel_production1', 'solarPanel_ambientLight', 'solarPanel_production2', 'solarPanel_global',
        'energyBay_largerCapacity', 'energyBay_production1', 'energyBay_production2', 'energyBay_largerCapacity2',
        'energyBay_largerCapacity3',
        'windTurbine_largerBlades', 'windTurbine_reduceCutIn', 'windTurbine_increaseCutOut', 'windTurbine_yawDrive',
        'windTurbine_global', 'refinery_improveProduction', 'refinery_cooling', 'refinery_improveProduction2',
        'droidFactory_improvedMaintenance', 'droidFactory_longerComm', 'droidFactory_fasterBuild',
        'droidFactory_fasterExplore'
    ] satisfies UpgradeId[]).forEach(upgrade => dispatch(fromUpgrades.researchForFree(upgrade)));

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

    if (GAME_MODE === SKIP_TO_DOOMSDAY) {
        dispatch(fromUpgrades.researchForFree('solarPanel_sunShield'))
        dispatch(fromUpgrades.researchForFree('solarPanel_sunShield'))
        dispatch(fromResources.produce({
            probes: 1.8e6
        }));
        dispatch(kickoffDoomsday());
    }
}
