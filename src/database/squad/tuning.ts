/**
 * Squad tuning: the driven team's range, pace and glyph. The movement sim (lib/planet/squad.ts) reads these.
 */

export const SQUAD_GLYPH = '@';

// Movement pace. crossTime is seconds-per-tile for scouts; the squad multiplies it down so driving feels
// snappy (flatland 0.5s * 0.8 = 400ms/tile, ~2.5 tiles/sec).
export const SQUAD_SPEED_FACTOR = 0.8;

// The contact beat between stepping onto a settlement and the fight being shown: the squad shrinks into the
// settlement (planet.jsx draws it), the battle sim holds its opening frame, and the encounter popup waits.
// Doubles as the climb-back-out duration when the fight ends.
export const CONTACT_MS = 400;

// Battery model: drains per tile entered while off the powered grid, snaps to full capacity on the
// grid. At zero the squad runs on reserve power: every unit burns hull each tile, so hull is the
// overdraft on range; overextend far enough and the squad dies in the field (cargo and all). Speed is
// unaffected (the bleed is per tile, so slowness would only stretch the dying in real time, not raise
// the stakes).
// Drain is flat per tile, whatever the team size: range is a property of the rig (cells plus upgrades), not
// of who rides it, so a lone scout and a full army have the same legs. Force sizing costs droids pulled off
// the base, not range.
export const SQUAD_BATTERY_CAPACITY = 100;
export const SQUAD_DRAIN_PER_TILE = 2;    // battery per tile entered off the grid, any team size
export const RESERVE_HP_PER_TILE = 1;     // hull every unit burns per tile on reserve power
