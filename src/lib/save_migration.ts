import _ from 'lodash';
import {NUM_PLANET_ROWS, PLANET_COLS} from './planet_geometry';
import structuresDatabase from '../database/structures';
import resourcesDatabase from '../database/resources';
import upgradesDatabase from '../database/upgrades';
import abilitiesDatabase from '../database/abilities';
import triggersDatabase from '../database/triggers';
import logsDatabase from '../database/logs';
import {DROID_BASE_STATS, fullDroidHp} from './battle';
import {SAVE_FORMAT_VERSION} from './save_version';

// lodash merges arrays index-by-index, which would mangle saved maps, droid lists, etc.
// This customizer makes saved arrays replace default arrays wholesale instead.
const replaceArrays = (defaultValue: unknown, savedValue: unknown) => {
    if (_.isArray(savedValue)) {
        return savedValue;
    }
};

/**
 * Repairs a saved state (parsed from localStorage) so it can be loaded by newer versions of the game.
 *
 * Three repairs are applied:
 * 1. The save is deep-merged over the current default state, filling in any fields added since the save.
 * 2. Learned structure/resource/upgrade/ability records are re-merged over their current database
 *    definitions (these records are snapshotted at LEARN time, so old saves lack newer record fields).
 * 3. Saved trigger and log entries whose ids no longer exist in the database are dropped (renamed or
 *    removed content would otherwise crash trigger syncing at boot, or log rendering).
 *
 * @param savedState The parsed save (may be undefined if there is no save)
 * @param defaultState The current initial state (from running the root reducer with an init action)
 */
export function migrateSavedState(savedState: any, defaultState: RootState): RootState | undefined {
    if (!savedState) {
        return undefined;
    }

    if (!savedState.game || savedState.game.saveFormatVersion !== SAVE_FORMAT_VERSION) {
        console.warn('Saved game uses an older save format; starting a new game.');
        return undefined;
    }

    // A saved map from a different planet geometry (row count / row length) can't be repaired -- every coord in
    // it (droids, squad, POIs, home) refers to a world that no longer exists. Discard the save and start fresh.
    const savedMap = savedState.planet && savedState.planet.map;
    if (savedMap && savedMap.length > 0 &&
        (savedMap.length !== NUM_PLANET_ROWS || (savedMap[0] || []).length !== PLANET_COLS)) {
        console.warn('Saved game uses an incompatible planet geometry; starting a new game.');
        return undefined;
    }

    const state: RootState = _.mergeWith({}, defaultState, savedState, replaceArrays);

    // Squad shape repairs: the prompt moved off the squad onto the planet slice, equipment was added, and
    // the precomputed-outcome fight state was replaced by the live battle sim (an old mid-fight save can't
    // be resumed as a battle, so the fight is simply dropped; the nest is still there to re-engage).
    if (state.planet && state.planet.squad) {
        // Older saves carried fields the squad no longer has; widen the type so the cleanup below can name them
        const squad = state.planet.squad as Squad & { pouch?: unknown; prompt?: EncounterPrompt };
        delete squad.pouch; // pre-equipment saves carried purchasable consumables; that system is gone
        if (squad.equipment === undefined) squad.equipment = {}; // gear re-arms on the next deploy
        if (!squad.droidStats) squad.droidStats = { ...DROID_BASE_STATS }; // pre-upgrades saves: stock droids
        // Pre-replication saves: the fielded roster was the assigned droids themselves (x1)
        if (!squad.multiplier) squad.multiplier = 1;
        if (!squad.assignedDroids) squad.assignedDroids = squad.squadSize;
        if (!Array.isArray(squad.droidHp) || squad.droidHp.length !== squad.squadSize) {
            squad.droidHp = fullDroidHp(squad.squadSize, squad.droidStats.hp); // pre-persistence saves: deploy healthy
        }
        // A mid-fight battle from an older sim shape can't resume; drop the fight, the nest remains
        if (squad.fighting && (!squad.fighting.battle || !squad.fighting.battle.stats)) squad.fighting = null;
        if (squad.prompt !== undefined) {
            if (!state.planet.prompt) state.planet.prompt = squad.prompt;
            delete squad.prompt;
        }
    }

    resyncWithDatabase(state.structures, structuresDatabase);
    resyncWithDatabase(state.resources, resourcesDatabase);
    resyncWithDatabase(state.upgrades, upgradesDatabase);
    resyncWithDatabase(state.abilities, abilitiesDatabase);

    // Resource display flags are database-driven, not player progress: refresh `visible` from the database and
    // add any learned-but-newly-visible resources to visibleIds (records snapshot the flag at LEARN time, so
    // e.g. droids joining the resource bar would otherwise stay hidden in old saves).
    if (state.resources && state.resources.byId) {
        (Object.entries(state.resources.byId) as [ResourceId, Resource][]).forEach(([id, record]) => {
            record.visible = resourcesDatabase[id].visible;
            if (record.visible && !state.resources.visibleIds.includes(id)) {
                state.resources.visibleIds.push(id);
            }
        });
    }

    if (state.triggers && state.triggers.byId) {
        state.triggers.byId = _.pickBy(state.triggers.byId, (trigger, id) => triggersDatabase[id]);
    }

    if (state.log && state.log.bySequenceId) {
        // Inline entries carry their own text and have no database id; only database-backed entries are pruned
        state.log.bySequenceId = _.pickBy(state.log.bySequenceId,
            (entry) => entry && (entry.entryType === 'inline' || (entry.id !== null && logsDatabase[entry.id])));
        state.log.visibleSequenceIds = (state.log.visibleSequenceIds || [])
            .filter(sequenceId => state.log.bySequenceId[sequenceId]);
    }

    return state;
}

// Re-merges each saved byId record over its current database definition (mirroring what the LEARN
// reducers do), and drops records whose id no longer exists in the database.
function resyncWithDatabase(slice: { byId: Record<string, any>, visibleIds?: string[] } | undefined, database: Record<string, any>) {
    if (!slice || !slice.byId) {
        return;
    }

    slice.byId = _.mapValues(
        _.pickBy(slice.byId, (record, id) => database[id]),
        (record, id) => _.mergeWith({}, database[id], record, replaceArrays)
    );

    if (slice.visibleIds) {
        slice.visibleIds = slice.visibleIds.filter(id => slice.byId[id]);
    }
}
