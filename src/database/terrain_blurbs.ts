// One-line terminal notes as the squad crosses into new ground, keyed by squadZone (lib/squad.ts): the
// terrain underfoot, or 'held' inside settlement territory, or 'grid' back on powered ground. Printed once per
// zone change, in the zone's map color, so the terminal carries the sense of place the ASCII map can't.
// PLACEHOLDER copy until the content pass.
// Zones without an entry (replicating land) print nothing.
export const TERRAIN_BLURBS: Partial<Record<SquadZone, string>> = {
    grid: 'Powered ground. Cells topping up.',
    flatland: 'Open flatland. Dust and a long horizon.',
    mountain: 'Into the mountains. Slow going; the ridges hide what lies beyond.',
    acid: 'Acid flats. The ground hisses under the treads.',
    shallows: 'Shallows. Surf over the pontoons; the far shore is a line.',
    water: 'The shore. Dead water to the horizon; the treads stop here.',
    ice: 'Ice sheet. Wind, glare, and nothing else.',
    held: 'Hostile territory. Thermal signatures: multiple, moving.'
};
import type {SquadZone} from '../lib/squad';
