import type {HostileFormation, TerrainLayoutId} from "../../lib/battle";

/**
 * Field events: the concealed encounters seeded across open ground at map generation (placeEvents in
 * lib/pois.ts). They are POIs of type 'fieldEvent' that stay hidden even after their tile is scouted,
 * and go off when the squad steps on them: an ambush raises its approach card and fights on Continue, anything
 * else raises the encounter popup with its choices. Camps are the held-ground counterpart (database/planet/pois.ts); they are the settlement's
 * own people and stay on its manifest.
 *
 * Seeded once per save, so a walked route is learnable: the map does not roll dice under the squad's feet
 * (nothing about the field is random at play time, same rule as the battle sim).
 * Names, texts, weights and rewards are PLACEHOLDERS until the content pass.
 */

export type FieldEventKind = keyof typeof FIELD_EVENT_DEFS;

/** One answer to a non-combat event, as authored: what the popup offers and what taking it does */
export interface FieldEventChoiceDef {
    label: string;
    /** the result phase's narration (FIELD_EVENT_TEXTS key); absent = the popup closes on the choice */
    storyId?: keyof typeof FIELD_EVENT_TEXTS;
    reward?: { resources?: Partial<Record<ResourceId, [number, number]>> };
    /** battery change on the squad, clamped to [0, capacity] */
    battery?: number;
    /** units added to the fielded roster, at full hull */
    units?: number;
    /** flips the nearest concealed POI (camp or event) to available and marks its tile */
    revealNearest?: boolean;
}

export interface FieldEventDef {
    name: string;
    /** relative frequency in the seeding roll */
    weight: number;
    /** the offer line ({loot} expands to the rolled reward of the FIRST choice) */
    promptText?: string;
    choices?: FieldEventChoiceDef[];
    /** an ambush: fought on entry; its difficulty comes from AMBUSH_DIFFICULTY by distance from home, and its
     * loot is `lootPerDefender` (a [lo, hi] range of minerals) times that difficulty */
    fight?: { formation: HostileFormation; terrain?: TerrainLayoutId; lootPerDefender: [number, number] };
    /** an ambush's approach card line (the type default if unset) */
    approachText?: string;
}

// How thick the seeding is: one event per this many candidate tiles (reachable open flatland outside
// territory and the starting vision), and the minimum hops between two events.
export const FIELD_EVENT_SEEDING = { tilesPerEvent: 12, spacing: 3 };

// Ambush strength by graph distance from home: [distance threshold, standard defenders]. The last band whose
// threshold the tile meets applies. Tracks the camp difficulties of the regions at those distances.
export const AMBUSH_DIFFICULTY: [number, number][] = [[0, 1], [6, 2], [12, 3], [20, 5], [30, 7], [45, 10]];

export function ambushDifficulty(distance: number): number {
    let difficulty = AMBUSH_DIFFICULTY[0][1];
    AMBUSH_DIFFICULTY.forEach(([threshold, value]) => { if (distance >= threshold) difficulty = value; });
    return difficulty;
}

export const FIELD_EVENT_TEXTS = {
    ev_wreckSearched: 'Its cells still held a charge. Its log did not. The last heading it recorded points home.',
    ev_signalTraced: 'Bearing fixed. Source marked.',
    ev_sightingObserved: 'Gone over the rise before the optics resolved. No pattern match. Logged.',
    ev_strayRecovered: 'Jump-started off the team\'s cells. It fell into formation without being told.',
    ev_strayStripped: 'Plating and cells recovered. The core was left where it lay.'
};

export const FIELD_EVENT_DEFS = {
    ambush: {
        name: 'Ambush',
        weight: 4,
        fight: { formation: 'surround', lootPerDefender: [50, 100] },
        approachText: 'Nearby sounds detected. Movement closing.'
    },
    salvage: {
        name: 'Debris Field',
        weight: 3,
        promptText: 'Debris field. Pre-war alloys in the scatter{loot}. Load it?',
        choices: [
            { label: 'Load', reward: { resources: { refinedMinerals: [100, 300] } } }
        ]
    },
    wreck: {
        name: 'Wreck',
        weight: 2,
        promptText: 'A chassis in the dust. Your manufacturing line; not your serial.',
        choices: [
            { label: 'Search', storyId: 'ev_wreckSearched', battery: 15 }
        ]
    },
    signal: {
        name: 'Signal',
        weight: 1,
        promptText: 'Faint carrier, repeating. Not yours.',
        choices: [
            { label: 'Trace', storyId: 'ev_signalTraced', revealNearest: true }
        ]
    },
    sighting: {
        name: 'Sighting',
        weight: 2,
        promptText: 'Thermal signatures at range. Multiple. Receding.',
        choices: [
            { label: 'Observe', storyId: 'ev_sightingObserved' }
        ]
    },
    strayDroid: {
        name: 'Dormant Droid',
        weight: 1,
        promptText: 'A dormant droid, half-buried. Same line as yours; an older serial.',
        choices: [
            { label: 'Recover', storyId: 'ev_strayRecovered', units: 1, battery: -10 },
            { label: 'Strip', storyId: 'ev_strayStripped', reward: { resources: { refinedMinerals: [100, 300] } } }
        ]
    }
} satisfies Record<string, FieldEventDef>;
