import _ from 'lodash';
import {NUM_PLANET_ROWS, PLANET_COLS} from './planet_geometry';
import structuresDatabase from '../database/structures';
import resourcesDatabase from '../database/resources';
import upgradesDatabase from '../database/upgrades';
import abilitiesDatabase from '../database/abilities';
import triggersDatabase from '../database/triggers';
import logsDatabase from '../database/logs';

// lodash merges arrays index-by-index, which would mangle saved maps, droid lists, etc.
// This customizer makes saved arrays replace default arrays wholesale instead.
const replaceArrays = (defaultValue, savedValue) => {
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
export function migrateSavedState(savedState, defaultState) {
    if (!savedState) {
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

    const state = _.mergeWith({}, defaultState, savedState, replaceArrays);

    resyncWithDatabase(state.structures, structuresDatabase);
    resyncWithDatabase(state.resources, resourcesDatabase);
    resyncWithDatabase(state.upgrades, upgradesDatabase);
    resyncWithDatabase(state.abilities, abilitiesDatabase);

    // Resource display flags are database-driven, not player progress: refresh `visible` from the database and
    // add any learned-but-newly-visible resources to visibleIds (records snapshot the flag at LEARN time, so
    // e.g. droids joining the resource bar would otherwise stay hidden in old saves).
    if (state.resources && state.resources.byId) {
        Object.entries(state.resources.byId).forEach(([id, record]) => {
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
            (entry) => entry && (entry.entryType === 'inline' || logsDatabase[entry.id]));
        state.log.visibleSequenceIds = (state.log.visibleSequenceIds || [])
            .filter(sequenceId => state.log.bySequenceId[sequenceId]);
    }

    return state;
}

// Re-merges each saved byId record over its current database definition (mirroring what the LEARN
// reducers do), and drops records whose id no longer exists in the database.
function resyncWithDatabase(slice, database) {
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
