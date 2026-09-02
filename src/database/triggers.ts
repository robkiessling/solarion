import * as fromLog from "../redux/modules/log";
import * as fromUpgrades from "../redux/modules/upgrades";
import store from "../redux/store";
import {probeCapacity} from "../lib/star";

export interface TriggerRecord<S = any> {
    /** the part of the state to listen to (as specific as possible) */
    selector: (state: RootState) => S;
    condition: (slice: S) => boolean;
    action: () => void;
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
    energyAlmostFull: trigger({
        selector: (state) => state.resources.byId.energy,
        condition: (slice) => !!slice && slice.amount >= slice.capacity * 0.9,
        action: () => store.dispatch(fromLog.startLogSequence('energyAlmostFull'))
    }),
    // "Exploration begins": fires on the first squad deployment (scouts arrive much later, with Survey Automation)
    startExploringMap: trigger({
        selector: (state) => state.planet.squad,
        condition: (slice) => !!slice,
        action: () => store.dispatch(fromLog.startLogSequence('startExploringMap'))
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

export type TriggerId = keyof typeof database;
export default database;