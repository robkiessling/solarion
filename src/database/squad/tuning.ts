/**
 * Squad tuning: the driven team's range, pace and glyph. The movement sim (lib/planet/squad.ts) reads these.
 */

export const SQUAD_GLYPH = '@';

// Movement pace. crossTime is seconds-per-tile for scouts; the squad multiplies it down so driving feels
// snappy (flatland 0.5s * 0.8 = 400ms/tile, ~2.5 tiles/sec).
export const SQUAD_SPEED_FACTOR = 0.8;

// The contact beat after committing to a fight: the squad shrinks into the settlement (components/planet/globe.jsx
// draws it) and the battle sim holds its opening frame, both under the encounter popup, which opens at once.
// Doubles as the climb-back-out duration when the fight ends.
export const CONTACT_MS = 400;

// How long a freshly opened popup phase (an offer, an approach card, a result, a fight) ignores its number keys
// and buttons. The same number answers consecutive phases (Continue on the approach card is 1, so is the first
// equipment slot; Descend is 1 right after the last kill), so a press aimed at the phase just closed must not
// land on the next. Esc (a fight's Retreat) is never locked: leaving early is never the costly mistake.
export const POPUP_INPUT_LOCK_MS = 250;

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
