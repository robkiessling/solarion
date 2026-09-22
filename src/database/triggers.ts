import * as fromLog from "../redux/modules/log";
import * as fromUpgrades from "../redux/modules/upgrades";
import store from "../redux/store";
import {probeCapacity} from "../lib/star";
import {getCapacity} from "../redux/modules/resources";
import {daylightPercent} from "../redux/modules/clock";
import {hasLifetimeQuantities} from "../redux/modules/resources";
import {formatInteger} from "../lib/helpers";

export interface TriggerRecord<S = any> {
    /** the part of the state to listen to (as specific as possible) */
    selector: (state: RootState) => S;
    condition: (slice: S) => boolean;
    action: () => void;
    /** fire on the nth distinct time the condition holds (default 1); e.g. the second night, not the first */
    fireAfter?: number;
}

/**
 * Builds a table entry, inferring the slice type from the selector so the condition is checked against it (a
 * selected record may not be learned or built yet, so most conditions start with a presence check). The S = any
 * default above is only for code that handles an arbitrary trigger, e.g. syncTriggers; TypeScript has no way to
 * say "a TriggerRecord of some S" for the union of table entries.
 */
function trigger<S>(record: TriggerRecord<S>): TriggerRecord<S> {
    return record;
}

/**
 *
 * Triggers provide a way to perform actions when a specific state change occurs (and attempts to do so in the most
 * efficient way possible).
 *
 * Triggers currently will only be fired once (they are unsubscribed after firing).
 *
 * @param selector  Function that accepts one parameter `state` and returns the part of the state to listen to.
 *                  It should be as specific as possible (only listen to what you have to)
 * @param condition Function that accepts one parameter `slice` and should return true when the `action` is to be performed.
 *                  Note: `slice` is the piece of the state specified by `selector`.
 * @param action    Function to call when triggered.
 */

const database = {
    harvesterStarted: trigger({
        selector: (state) => state.structures.byId.harvester,
        condition: (slice) => !!slice && slice.runningRate > 0,
        action: () => {
            store.dispatch(fromLog.startLogSequence('harvesterStarted'));
        }
    }),
    manualChargeInsufficient: trigger({
        selector: (state) => state.resources.byId.energy?.lifetimeTotal,
        condition: () => hasLifetimeQuantities(store.getState().resources, { energy: 200, ore: 50 }),
        action: () => {
            const energy = formatInteger(store.getState().resources.byId.energy?.lifetimeTotal ?? 0, true);
            store.dispatch(fromLog.startLogSequence('manualChargeInsufficient', { energy }));
        }
    }),
    storageFullHarvesterIdle: trigger({
        selector: (state) => state.resources.byId.energy,
        condition: (slice) => !!slice && slice.amount >= getCapacity(slice) && !solarFarmStanding()
            && !(store.getState().structures.byId.harvester?.runningRate),
        action: () => store.dispatch(fromLog.startLogSequence('storageFullHarvesterIdle'))
    }),
    energyAtCapacity: trigger({
        selector: (state) => state.resources.byId.energy,
        condition: (slice) => !!slice && slice.amount >= getCapacity(slice) && solarFarmStanding(),
        action: () => store.dispatch(fromLog.startLogSequence('energyAtCapacity'))
    }),
    firstNight: trigger({
        selector: (state) => daylightPercent(state.clock),
        condition: (daylight) => daylight === 0 && solarFarmStanding(),
        action: () => store.dispatch(fromLog.startLogSequence('firstNight'))
    }),
    secondNight: trigger({
        selector: (state) => daylightPercent(state.clock),
        condition: (daylight) => daylight === 0 && solarFarmStanding(),
        fireAfter: 2,
        action: () => store.dispatch(fromLog.startLogSequence('secondNight'))
    }),
    // "Exploration begins": fires on the first squad deployment (scouts arrive much later, with Survey Automation)
    startExploringMap: trigger({
        selector: (state) => state.planet.squad,
        condition: (slice) => !!slice,
        action: () => store.dispatch(fromLog.startLogSequence('startExploringMap'))
    }),
    // The planet tab opens with only the map and the staging card; everything else arrives at the moment the player
    // has just felt the need for it (armed together by the globeUnlocked sequence).
    // Range: the battery is half gone for the first time.
    squadBatteryHalf: trigger({
        selector: (state) => state.planet.squad?.battery,
        condition: (battery) => battery != null && battery <= (store.getState().planet.squad?.batteryCapacity ?? 0) / 2,
        action: () => store.dispatch(fromUpgrades.discover('droidFactory_extendedCells'))
    }),
    // Offense: a settlement is on the map, so there is something to aim a launcher at.
    settlementSighted: trigger({
        selector: (state) => state.planet.pois,
        condition: (pois) => Object.values(pois).some(poi => poi.type === 'settlement' && poi.status !== 'hidden'),
        action: () => {
            store.dispatch(fromUpgrades.discover('droidFactory_demoLauncher'));
            store.dispatch(fromUpgrades.discover('droidFactory_overchargeCell'));
        }
    }),
    // Survival and the schematic index: the first fight has ended (won, lost or fled), so health, damage and swing
    // now mean something. The index opener on the factory card keys off the same counter.
    firstBattleOver: trigger({
        selector: (state) => state.planet.battlesFought,
        condition: (fought) => fought >= 1,
        action: () => store.dispatch(fromLog.startLogSequence('firstBattleOver'))
    }),
    // Replication: a network SITE has fallen (a settlement def with `site`, the pre-war facility whose
    // foundations and power tap replication needs; ordinary villages don't count) and a squad has come home
    // since. Waiting for the return keeps this beat apart from the battle's own, and Replicate is held while a
    // squad is fielded anyway. A wipe is not a return: firing on "no squad" made a team lost on a later
    // assault read as the site being cleared.
    firstSiteSecured: trigger({
        selector: (state) => state.planet.squadsReturned,
        condition: (returned) => returned > 0 && Object.values(store.getState().planet.pois)
            .some(poi => poi.type === 'settlement' && poi.site != null && poi.status === 'cleared'),
        action: () => store.dispatch(fromLog.startLogSequence('replicationOnline'))
    }),
    windTurbine_global: trigger({
        selector: (state) => state.resources.byId.developedLand,
        condition: (slice) => !!slice && slice.amount >= 100,
        action: () => store.dispatch(fromUpgrades.discover('windTurbine_global'))
    }),
    solarPanel_global: trigger({
        selector: (state) => state.resources.byId.developedLand,
        condition: (slice) => !!slice && slice.amount >= 500,
        action: () => store.dispatch(fromUpgrades.discover('solarPanel_global'))
    }),
    probeFactoryBuilt: trigger({
        selector: (state) => state.structures.byId.probeFactory,
        condition: (slice) => !!slice && slice.count.total >= 1,
        action: () => store.dispatch(fromLog.startLogSequence('probeFactoryBuilt'))
    }),
    probeLaunched: trigger({
        selector: (state) => state.resources.byId.probes,
        condition: (slice) => !!slice && slice.amount >= 1,
        action: () => store.dispatch(fromLog.startLogSequence('probeLaunched'))
    }),
    solarPanelReceivingProbes: trigger({
        selector: (state) => state.star.mirrorTarget,
        condition: (slice) => slice === 'planet',
        action: () => store.dispatch(fromLog.startLogSequence('solarPanelReceivingProbes'))
    }),
    swarm50Pct: trigger({
        selector: (state) => state.resources.byId.probes,
        condition: (slice) => !!slice && slice.amount >= (probeCapacity() * 0.5),
        action: () => store.dispatch(fromLog.startLogSequence('swarm50Pct'))
    }),
    swarm75Pct: trigger({
        selector: (state) => state.resources.byId.probes,
        condition: (slice) => !!slice && slice.amount >= (probeCapacity() * 0.75),
        action: () => store.dispatch(fromLog.startLogSequence('swarm75Pct'))
    }),
    swarmComplete: trigger({
        selector: (state) => state.resources.byId.probes,
        condition: (slice) => !!slice && slice.amount >= probeCapacity(),
        action: () => store.dispatch(fromLog.startLogSequence('swarmComplete'))
    }),


} satisfies Record<string, TriggerRecord>;

function solarFarmStanding() {
    const solar = store.getState().structures.byId.solarPanel;
    return !!solar && solar.count.total >= 1;
}

export type TriggerId = keyof typeof database;
export default database;