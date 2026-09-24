/**
 * Battle scene text: the arena footer's one-liner and the approach card's ground line. The formation and
 * terrain-layout ids these are keyed by are the registries in lib/battle/layouts.ts (FORMATIONS, TERRAIN_LAYOUTS).
 * PLACEHOLDER copy until the content pass.
 */
import type {HostileFormation, TerrainLayoutId} from '../../lib/battle/layouts';

// One-line scene descriptions for the battle footer, assembled by battleBlurb (lib/battle/sim.ts): a ground
// clause keyed by the arena terrain layout (open = no layout) plus a hostile clause keyed by the garrison's
// formation. PLACEHOLDER copy until the content pass.
export const GROUND_BLURBS: Record<TerrainLayoutId | 'open', string> = {
    rocks: 'The squad drops into a boulder field',
    ruins: 'The squad drops among shattered ruins',
    canyon: 'The squad drops before a canyon wall',
    corridor: 'The squad advances into the tunnel',
    compound: 'The squad advances on the walls',
    open: 'The squad drops onto open ground'
};
// The approach card's ground line (what the squad can see of the field from outside, before committing): the
// terrain is landscape, so it is shown; the formation is learned by fighting, so it is not. PLACEHOLDER copy.
export const APPROACH_GROUND: Record<TerrainLayoutId | 'open', string> = {
    rocks: 'Boulder field ahead.',
    ruins: 'Shattered ruins ahead.',
    canyon: 'A canyon wall ahead.',
    corridor: 'The passage runs into the dark.',
    compound: 'Walls ahead.',
    open: 'Open ground ahead.'
};
export const HOSTILE_BLURBS: Record<HostileFormation, string> = {
    column: 'hostiles advance in a broad column',
    ring: 'hostiles draw into a tight ring',
    clusters: 'hostiles mass in scattered pockets',
    scatter: 'startled hostiles rush in from every direction',
    surround: 'the ambush closes from all sides'
};

// The ring's center slot is where a garrison's leading shelter stands (see createBattle in lib/battle/sim.ts):
// battleBlurb names the objective when it's really there.
export const RING_SPAWNER_BLURBS = { one: 'hostiles circle tight around their source', many: 'hostiles circle tight around their sources' };
