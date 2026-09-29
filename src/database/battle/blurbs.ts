/**
 * Battle scene text: the arena footer's one-liner. The opening and terrain ids it is keyed by are those of
 * lib/battle/openings.ts and terrain.ts (Opening, TERRAINS).
 * PLACEHOLDER copy until the content pass.
 */
import type {Opening} from '../../lib/battle/openings';
import type {TerrainId} from '../../lib/battle/terrain';
import type {DrawnTerrainId} from './terrain_art';

// One-line scene descriptions for the battle footer, assembled by battleBlurb (lib/battle/sim.ts): a ground
// clause keyed by the arena terrain layout (open = no layout) plus a hostile clause keyed by the garrison's
// opening. A drawn terrain may go without a line of its own (it reads as open ground until it has one).
// PLACEHOLDER copy until the content pass.
export const GROUND_BLURBS: Record<Exclude<TerrainId, DrawnTerrainId> | 'open', string> & Partial<Record<DrawnTerrainId, string>> = {
    rocks: 'The squad drops into a boulder field',
    ruins: 'The squad drops among shattered ruins',
    rubble: 'The squad drops into a rubble field',
    debris: 'The squad drops among scattered debris',
    canyonSmall: 'The squad drops before a canyon wall',
    tunnelSmall: 'The squad advances into the tunnel',
    compound1a: 'The squad advances on the walls',
    compound1b: 'The squad is inside the walls',
    open: 'The squad drops onto open ground'
};
export const OPENING_BLURBS: Record<Opening, string> = {
    marked: 'hostiles hold their ground',
    front: 'hostiles advance on a broad front',
    groups: 'hostiles mass in scattered pockets',
    surround: 'the ambush closes from all sides'
};

// A group's centre is where a garrison's source stands (see hostileOpening in lib/battle/openings.ts):
// battleBlurb names the objective when it's really there.
export const SOURCE_BLURBS = { one: 'hostiles circle tight around their source', many: 'hostiles circle tight around their sources' };
