import _ from 'lodash';
import type {Effect, EffectAffects} from "../../lib/effect";
import type {DeepPartial} from "../../lib/helpers";
import type {SfxName} from "../../singletons/audio";

/** An upgrade's research lifecycle, in order */
export type UpgradeState = 'hidden' | 'discovered' | 'researching' | 'paused' | 'researched';

export interface DiscoverWhen {
    /** lifetime resource totals that must be reached */
    resources?: ResourceAmounts;
    /** upgrade ids that must already be researched (UpgradeId, but naming it here would make the table's type circular) */
    upgrades?: string[];
    /** structure build counts that must be reached */
    structures?: Partial<Record<StructureId, number>>;
}

export interface UpgradeRecord {
    name: string;
    description: string;
    /** seconds; 0 researches instantly */
    researchTime: number;
    state: UpgradeState;
    cost: ResourceAmounts;
    discoverWhen?: DiscoverWhen;
    effect?: Effect;
    affects: EffectAffects;
    /** the structure whose card offers this upgrade (absent for squad upgrades) */
    structure?: StructureId;
    /** expedition-only upgrade, offered in the Expedition panel's Outfitting section */
    squad?: boolean;
    standalone?: boolean;
    /**
     * Sounds (clip names from singletons/audio.ts, or false for none). Timed research (researchTime > 0) plays
     * researchStartSound when the player commits and researchFinishSound when the tick completes it. Instant
     * research has no start moment: it plays researchFinishSound on the click and ignores researchStartSound.
     */
    researchStartSound: SfxName | false;
    researchFinishSound: SfxName | false;
}

const base: UpgradeRecord = {
    name: 'Unknown',
    description: "",
    researchTime: 0, // if 0, research will occur instantly
    state: 'hidden',
    cost: {},

    // Possible options -- discoverWhen: { resources: { x/y/z }, upgrades: [], structures: { x/y/z} }
    // If resources is defined, the upgrade will be automatically discovered once lifetime resource totals pass these values
    // If structures is defined, the upgrade will be automatically discovered once structure build count pass these values
    // If upgrades is defined, those upgrades need to be already researched before this will be discovered
    discoverWhen: undefined,
    
    effect: undefined,
    affects: {
        type: 'structure'
        // No default id necessary; if blank it is assumed to be the upgrade's structure
    },

    researchStartSound: 'researchStart',
    researchFinishSound: 'researchFinish',
}

// TODO don't hardcode values into description, e.g. "Increase energy production by {{ multiplier * 100 }}% ..."
// Note: 'effect' keys correspond to structure calculated variables
/** A table entry: the overrides merged over `base` (deep, so a nested field can be overridden on its own) */
export function upgrade(overrides: DeepPartial<UpgradeRecord>): UpgradeRecord {
    return _.merge({}, base, overrides);
}
