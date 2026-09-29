/**
 * Battle scene text: the arena footer's one-liner. The formation and terrain-layout ids it is keyed by are
 * the registries in lib/battle/layouts.ts (FORMATIONS, TERRAIN_LAYOUTS).
 * PLACEHOLDER copy until the content pass.
 */
import type {HostileFormation, TerrainLayoutId} from '../../lib/battle/layouts';

// One-line scene descriptions for the battle footer, assembled by battleBlurb (lib/battle/sim.ts): a ground
// clause keyed by the arena terrain layout (open = no layout) plus a hostile clause keyed by the garrison's
// formation. PLACEHOLDER copy until the content pass.
export const GROUND_BLURBS: Record<TerrainLayoutId | 'open', string> = {
    rocks: 'The squad drops into a boulder field',
    ruins: 'The squad drops among shattered ruins',
    rubble: 'The squad drops into a rubble field',
    debris: 'The squad drops among scattered debris',
    canyon: 'The squad drops before a canyon wall',
    corridor: 'The squad advances into the tunnel',
    compound: 'The squad advances on the walls',
    open: 'The squad drops onto open ground'
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
