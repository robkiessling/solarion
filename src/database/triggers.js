import * as fromPlanet from "../redux/modules/planet";
import * as fromLog from "../redux/modules/log";
import * as fromUpgrades from "../redux/modules/upgrades";
import store from "../redux/store";
import {probeCapacity} from "../lib/star";


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
export default {
    discoverSolar: {
        selector: (state) => state.resources.byId.ore,
        condition: (slice) => slice.lifetimeTotal >= 40,
        action: () => store.dispatch(fromLog.startLogSequence('discoverSolar'))
    },
    discoverWindPower: {
        selector: (state) => state.resources.byId.ore,
        condition: (slice) => slice.lifetimeTotal >= 200,
        action: () => store.dispatch(fromLog.startLogSequence('discoverWindPower'))
    },
    energyAlmostFull: {
        selector: (state) => state.resources.byId.energy,
        condition: (slice) => slice.amount >= slice.capacity * 0.9,
        action: () => store.dispatch(fromLog.startLogSequence('energyAlmostFull'))
    },
    unlockRefinery: {
        selector: (state) => state.resources.byId.ore,
        condition: (slice) => slice.lifetimeTotal >= 1000,
        action: () => store.dispatch(fromLog.startLogSequence('unlockRefinery'))
    },
    unlockDroidFactory: {
        selector: (state) => state.resources.byId.refinedMinerals,
        condition: (slice) => slice.lifetimeTotal >= 100,
        action: () => store.dispatch(fromLog.startLogSequence('unlockDroidFactory'))
    },
    startExploringMap: {
        selector: (state) => state.planet.droidData,
        condition: (slice) => slice.numDroidsAssigned > 0,
        action: () => store.dispatch(fromLog.startLogSequence('startExploringMap'))
    },
    windTurbine_global: {
        selector: (state) => state.resources.byId.developedLand,
        condition: (slice) => slice.amount >= 100,
        action: () => store.dispatch(fromUpgrades.discover('windTurbine_global'))
    },
    solarPanel_global: {
        selector: (state) => state.resources.byId.developedLand,
        condition: (slice) => slice.amount >= 500,
        action: () => store.dispatch(fromUpgrades.discover('solarPanel_global'))
    },
    unlockProbeFactory: {
        selector: (state) => state.resources.byId.refinedMinerals,
        condition: (slice) => slice.amount >= 5e6,
        action: () => store.dispatch(fromLog.startLogSequence('unlockProbeFactory'))
    },
    probeFactoryBuilt: {
        selector: (state) => state.structures.byId.probeFactory,
        condition: (slice) => slice.count.total >= 0,
        action: () => store.dispatch(fromLog.startLogSequence('probeFactoryBuilt'))
    },
    swarm50Pct: {
        selector: (state) => state.resources.byId.probes,
        condition: (slice) => slice.amount >= (probeCapacity() * 0.5),
        action: () => store.dispatch(fromLog.startLogSequence('swarm50Pct'))
    },
    swarm75Pct: {
        selector: (state) => state.resources.byId.probes,
        condition: (slice) => slice.amount >= (probeCapacity() * 0.75),
        action: () => store.dispatch(fromLog.startLogSequence('swarm75Pct'))
    },
    swarmComplete: {
        selector: (state) => state.resources.byId.probes,
        condition: (slice) => slice.amount >= probeCapacity(),
        action: () => store.dispatch(fromLog.startLogSequence('swarmComplete'))
    },


}