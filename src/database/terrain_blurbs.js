// One-line terminal notes as the squad crosses into new ground, keyed by squadZone (lib/squad.js): the
// terrain underfoot, or 'infested' inside hive territory, or 'grid' back on powered ground. Printed once per
// zone change, in the zone's map color, so the terminal carries the sense of place the ASCII map can't.
// PLACEHOLDER copy until the content pass.
export const TERRAIN_BLURBS = {
    grid: 'Powered ground. Cells topping up.',
    flatland: 'Open flatland. Dust and a long horizon.',
    mountain: 'Into the mountains. Slow going; the ridges hide what lies beyond.',
    acid: 'Acid flats. The ground hisses under the treads.',
    ice: 'Ice sheet. Wind, glare, and nothing else.',
    infested: 'Hive territory. The ground is warm, and something in it is breathing.'
};
