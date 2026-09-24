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
import * as fromClock from '../redux/modules/clock';
import {addTrigger} from '../redux/modules/triggers';
import {kickoffDoomsday} from '../redux/reducer';
import type {UpgradeId} from '../database/base/upgrades';

const NORMAL_BOOTUP = 'normalBootup'; // Standard campaign start
const SKIP_START = 'skipStart';
const SKIP_TO_ROBOTICS = 'skipToRobotics';
const SKIP_TO_GLOBE = 'skipToGlobe';
const SKIP_TO_STAR = 'skipToStar';
const SKIP_TO_DOOMSDAY = 'skipToDoomsday';

const GAME_MODE: string = SKIP_TO_GLOBE; /* Controls overall game mode */

// Energy per manual charge click, overriding the ability's normal value (0 = no override; the real value is 1 plus
// coil upgrades). 20 lands on the Boot-Up card in one click. Read by the charge ability's calculator, at call time,
// so the import cycle through the redux modules is harmless.
export const CLICK_ENERGY_OVERRIDE = 0;

// Terminal sequence speed: line delays and typing are divided by this (1 = real pacing, 10 = ten times faster).
// Read by components/log.jsx.
export const LOG_SPEED = 1;

// A fresh map starts fully revealed (every tile explored, every site visible). Read by the planet module's
// generateMap action, at call time, so the import cycle through the redux modules is harmless.
export const EXPLORE_EVERYTHING = false;

export const INFINITE_CHARGE = false; // testing toggle: the battery never drains off-grid (no reserve power, no field wipes)

// Draws every concealed POI (camps on held ground, field events on open ground) on the map before the squad
// has found it, dimmed. Read by the planet component's overlay pass.
export const SHOW_CONCEALED_POIS = false;

export function runGameMode(dispatch: Dispatch) {
    switch (GAME_MODE) {
        case NORMAL_BOOTUP:
            dispatch(fromLog.startLogSequence('normalBootup'));
            break;
        case SKIP_START:
            skipStart(dispatch);
            break;
        case SKIP_TO_ROBOTICS:
            skipToRobotics(dispatch);
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

// Advances the planet clock to the given day and hour (0 to 24, fractions allowed; defaults to 06:00, the hour a
// fresh game starts at). The clock has no setter, so this ticks it forward by the difference from its current
// reading; a target in the past is ignored. Goes through clockTick so daylight and wind are recalculated.
function skipClockToDay(day: number, hour = 6) {
    return (dispatch: Dispatch, getState: GetState) => {
        const clock = getState().clock;
        const daysToAdvance = (day + hour / 24) - fromClock.dayNumber(clock, true);
        if (daysToAdvance <= 0) return;
        dispatch(fromClock.clockTick(daysToAdvance * fromClock.dayLength(clock) * 1000));
    };
}

// The state the intro cards leave behind, set directly (the cards are marked researched silently, so none of the
// boot / shutter / mission-start sequences play): terminal and bars on, shutters open, one harvester, ore known,
// and the harvester-start and idle-harvester triggers armed as mission start would arm them.
function skipStart(dispatch: Dispatch) {
    dispatch(fromLog.logInline('Skipping start'));

    dispatch(fromResources.learn('energy'));
    dispatch(fromResources.learn('ore'));
    dispatch(fromStructures.learn('commandCenter'));
    dispatch(fromStructures.buildForFree('commandCenter', 1));
    dispatch(fromAbilities.learn('commandCenter_charge'));

    for (const id of [
        'commandCenter_showTerminal', 'commandCenter_showResourceBar', 'commandCenter_showPlanetStatus',
        'commandCenter_openShutters'
    ] as const) {
        dispatch(fromUpgrades.researchForFree(id, true));
    }
    dispatch(fromGame.updateSetting('showTerminal', true));
    dispatch(fromGame.updateSetting('showResourceBar', true));
    dispatch(fromGame.updateSetting('showPlanetStatus', true));
    dispatch(fromGame.updateSetting('shuttersOpen', true));
    dispatch(fromGame.updateSetting('showStructuresList', true));

    dispatch(fromUpgrades.researchForFree('commandCenter_showResourceRates', true));
    dispatch(fromGame.updateSetting('showResourceRates', true));

    dispatch(fromStructures.learn('harvester'));
    dispatch(fromStructures.buildForFree('harvester', 1));

    dispatch(addTrigger('harvesterStarted'));
    dispatch(addTrigger('manualChargeInsufficient'));
    dispatch(addTrigger('storageFullHarvesterIdle'));
}

// The moment the Robotics research lands (day 17 of a real run): every field structure recovered and upgraded
// through the ore/minerals tiers, the factory schematic just recovered but not yet built, no droids. Resources and
// counts are from that run at that moment. The startExploringMap trigger is armed as researchedDroidFactory arms it.
function skipToRobotics(dispatch: Dispatch) {
    dispatch(fromLog.logInline('Skipping to robotics'));
    dispatch(skipClockToDay(17));

    dispatch(fromGame.updateSetting('shuttersOpen', true));
    dispatch(fromGame.updateSetting('showPlanetStatus', true));
    dispatch(fromGame.updateSetting('showResourceBar', true));
    dispatch(fromGame.updateSetting('showResourceRates', true));
    dispatch(fromGame.updateSetting('showTerminal', true));
    dispatch(fromGame.updateSetting('showStructuresList', true));
    dispatch(fromGame.updateSetting('showStructureTabs', true));

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

    dispatch(fromStructures.buildForFree('harvester', 8));
    dispatch(fromStructures.buildForFree('solarPanel', 7));
    dispatch(fromStructures.buildForFree('windTurbine', 5));
    dispatch(fromStructures.buildForFree('energyBay', 8));
    dispatch(fromStructures.buildForFree('refinery', 2));
    dispatch(fromStructures.setRunningRate('harvester', 0.5));
    dispatch(fromStructures.setRunningRate('refinery', 0.5));

    ([
        'commandCenter_showTerminal', 'commandCenter_showResourceBar', 'commandCenter_showPlanetStatus',
        'commandCenter_showResourceRates', 'commandCenter_openShutters',
        'commandCenter_researchSolar', 'commandCenter_researchWind', 'commandCenter_researchEnergyBay',
        'commandCenter_researchRefinery', 'commandCenter_researchDroidFactory'
    ] satisfies UpgradeId[]).forEach(upgrade => dispatch(fromUpgrades.skipResearch(upgrade)));

    // Everything below the pending tier on each card: Nanocarbon Threading, Even Larger Panels, Lithium Ions,
    // Power Linking (II), Yaw Drive, Surface Cooling and Hyper-Alloy Synthesizer were still on offer
    ([
        'commandCenter_improvedCharge', 'commandCenter_improvedCharge2', 'commandCenter_improvedCharge3',
        'commandCenter_improvedCharge4', 'commandCenter_chargeMineral1',
        'harvester_ore1', 'harvester_ore2', 'harvester_ore3', 'harvester_eff1', 'harvester_overclock',
        'solarPanel_production1', 'solarPanel_ambientLight',
        'energyBay_largerCapacity', 'energyBay_production1',
        'windTurbine_largerBlades', 'windTurbine_reduceCutIn', 'windTurbine_increaseCutOut',
        'refinery_improveProduction'
    ] satisfies UpgradeId[]).forEach(upgrade => dispatch(fromUpgrades.researchForFree(upgrade)));

    dispatch(fromResources.produce({
        energy: 2500,
        ore: 1300,
        refinedMinerals: 142
    }));

    dispatch(addTrigger('startExploringMap'));
}

// Shortly after the planetary map came online (about day 28 of a real run; 11 days past the robotics skip):
// Long-range Communication just researched, ten droids built and all deployed to structures (none scouting yet),
// the map generated but unexplored.
// Counts, upgrades and resources are from that run at that moment; the next tier (Feedback Loop, Kinetic Engines,
// Perovskite Solar Cells, Ultra-Dense Matrices, Hyper-Alloy Synthesizer, Plasma Drill) was still on offer.
export function skipToGlobe(dispatch: Dispatch) {
    dispatch(fromLog.logInline('Skipping to globe'));
    dispatch(skipClockToDay(28, 22));

    dispatch(fromGame.updateSetting('shuttersOpen', true));
    dispatch(fromGame.updateSetting('showPlanetStatus', true));
    dispatch(fromGame.updateSetting('showResourceBar', true));
    dispatch(fromGame.updateSetting('showResourceRates', true));
    dispatch(fromGame.updateSetting('showTerminal', true));
    dispatch(fromGame.updateSetting('showStructuresList', true));
    dispatch(fromGame.updateSetting('showStructureTabs', true));

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

    dispatch(fromStructures.buildForFree('harvester', 9));
    dispatch(fromStructures.buildForFree('solarPanel', 11));
    dispatch(fromStructures.buildForFree('windTurbine', 8));
    dispatch(fromStructures.buildForFree('energyBay', 11));
    dispatch(fromStructures.buildForFree('refinery', 5));
    dispatch(fromStructures.buildForFree('droidFactory', 1));
    dispatch(fromStructures.setRunningRate('harvester', 1));
    dispatch(fromStructures.setRunningRate('refinery', 1));

    ([
        'commandCenter_showTerminal', 'commandCenter_showResourceBar', 'commandCenter_showPlanetStatus',
        'commandCenter_showResourceRates', 'commandCenter_openShutters',
        'commandCenter_researchSolar', 'commandCenter_researchWind', 'commandCenter_researchEnergyBay',
        'commandCenter_researchRefinery', 'commandCenter_researchDroidFactory'
    ] satisfies UpgradeId[]).forEach(upgrade => dispatch(fromUpgrades.skipResearch(upgrade)));

    // droidFactory_longerComm goes last: its onFinish generates the map, adds the Planet tab and plays the
    // globeUnlocked terminal sequence (which arms the planet-tab reveal triggers)
    ([
        'commandCenter_improvedCharge', 'commandCenter_improvedCharge2', 'commandCenter_improvedCharge3',
        'commandCenter_improvedCharge4', 'commandCenter_chargeMineral1',
        'harvester_ore1', 'harvester_ore2', 'harvester_ore3', 'harvester_eff1', 'harvester_eff2', 'harvester_overclock',
        'solarPanel_production1', 'solarPanel_ambientLight', 'solarPanel_production2',
        'energyBay_largerCapacity', 'energyBay_largerCapacity2', 'energyBay_production1', 'energyBay_production2',
        'windTurbine_largerBlades', 'windTurbine_reduceCutIn', 'windTurbine_increaseCutOut', 'windTurbine_yawDrive',
        'windTurbine_zephyr',
        'refinery_improveProduction', 'refinery_cooling',
        'droidFactory_fasterBuild', 'droidFactory_improvedMaintenance', 'droidFactory_longerComm'
    ] satisfies UpgradeId[]).forEach(upgrade => dispatch(fromUpgrades.researchForFree(upgrade)));

    // Ten droids built; assigning debits the idle pool, so all ten end up deployed (10 / 10)
    dispatch(fromResources.produce({
        energy: 13275,
        ore: 31700,
        refinedMinerals: 3560,
        standardDroids: 10
    }));
    dispatch(fromStructures.assignDroidUnsafe('harvester', 3));
    dispatch(fromStructures.assignDroidUnsafe('refinery', 7));

    dispatch(addTrigger('startExploringMap'));
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
    // Normally learned once the first settlement is cleared (the replicationOnline sequence)
    dispatch(fromAbilities.learn('replicate'));
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
