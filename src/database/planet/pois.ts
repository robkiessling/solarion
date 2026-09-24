import type {PoiDef, TunnelDef} from "./poi_types";

/**
 * The content manifest: WHAT exists on the planet. One POI_DEFS entry per placed POI, each naming the painted
 * zone or point of database/planet/map.txt it lands in, and one TUNNEL_DEFS entry per painted tunnel digit.
 * The vocabulary these are written in (types, per-type behavior, glyphs) is database/planet/poi_types.ts; the
 * placement pass (generatePois in lib/planet/pois.ts) owns the mechanics: zone/point lookup, reachability, territory
 * stamping.
 *
 * Names, texts, difficulties, and rewards are PLACEHOLDERS until the content pass; this file is what that
 * pass edits.
 */

// Resource reward amounts are [lo, hi] ranges, rolled to a multiple of 100 at map generation (rollPoiReward).
//
// Settlements: `levels` lists the site's fights, surface first; most have one. Each level is a full battle of its own:
//   `difficulty`  standard defenders fielded, and the displayed threat estimate
//   `garrison`    a typed garrison ({ type: count }, see HOSTILE_TYPES in database/battle/units.ts) fielded instead of
//                 `difficulty` standard defenders; entry order maps to formation slots, so a shelter listed first
//                 takes a ring's center
//   `formation`   the spawn layout (FORMATIONS in lib/battle/layouts.ts); unset = column front. `surround` is the
//                 ambush opening: the garrison starts in all four corners with the squad encircled
//   `terrain`     impassable obstacles scattered over the arena (TERRAIN_LAYOUTS in lib/battle/layouts.ts); unset =
//                 open ground. The battlefield is stable per level (seeded from the map coord), so it can
//                 be learned
//   `blurb`       a bespoke scene line for the battle footer; unset = generated from terrain + formation
//                 (GROUND_BLURBS/HOSTILE_BLURBS in database/battle/blurbs.ts)
//   `reward`      what falls out of it
//
// Winning a level with more beneath it pauses on a descend-or-withdraw choice; the squad's hull damage and
// spent charges carry down, loot rides in cargo (kept on a withdrawal, lost on a wipe). The site only falls
// (land reclaimed, tile cleared) with its LAST level, and a site that is left re-mans itself from the top, so a
// multi-level site is one run, outfitted for in advance. `levelsShown` announces the level count up front;
// unset keeps it unknown until the bottom is reached. `discardedKg` is material the classifier weighs and
// throws away once the site has fallen: one terminal line, no value, no effect.
//
// CAMPS_ENABLED = false places no camps at all (the defs keep their `camps` lists; the placement pass skips
// them), for trying the map without them.
export const CAMPS_ENABLED = true;
// `camps` seeds small one-fight POIs on the site's held ground: foragers, herders, a watch. CONCEALED: scouting
// the tile does not show them, the squad finds out by stepping on one, and the fight opens as an ambush
// (surround, unless the camp names a formation), so crossing territory is a gamble the map never spells out.
// Gone for good once beaten, and a taste of the site's strength before committing to it. They never release
// land (the ground stays held until the settlement falls), and when it does fall whoever is still out there
// scatters.
//
// Loot is what scavengers hold and what they are sitting on: worked metal on top (it classifies as minerals),
// power cells further in, the old facility's stores at the core. Never ore; nothing out here mines.
// Garrisons, loot, and level counts are PLACEHOLDER tuning.
export const POI_DEFS: PoiDef[] = [
    // PLACEHOLDER zone assignment: the old distance bands mapped onto the painted zones (home basin 'a',
    // the belt around it, the far continents) until the content pass places each entry where it belongs.
    // Zone letters and their real places: see database/planet/map.txt.
    // Home basin (tutorial): one easy nest, two caches, the dead-droid story site
    { type: 'settlement', zone: 'a', territoryRadius: 1,
        levels: [
            { difficulty: 3, reward: { resources: { refinedMinerals: [100, 200] } } }
        ],
        camps: [
            { difficulty: 1, reward: { resources: { refinedMinerals: [100, 100] } } }
        ] },
    { type: 'cache', zone: 'a', reward: { resources: { ore: [500, 1000] } } },
    { type: 'cache', zone: 'a', reward: { resources: { refinedMinerals: [200, 400] } } },
    { type: 'storySite', zone: 'a', storyId: 'deadDroid' },

    // The near belt.
    { type: 'settlement', zone: 'b', territoryRadius: 2,
        levels: [
            { difficulty: 6, terrain: 'rocks', reward: { resources: { refinedMinerals: [300, 600] } } }
        ],
        camps: [
            { difficulty: 2, reward: { resources: { refinedMinerals: [100, 200] } } }
        ] },

    { type: 'settlement', zone: 'c', site: 2, territoryRadius: 0, levelsShown: true,
        levels: [ { difficulty: 20, terrain: 'compound', garrison: { shelter: 1, defender: 14 } } ] },

    // The first two-level site, count announced: it teaches the descend-or-withdraw rule
    { type: 'settlement', zone: 'd', territoryRadius: 2, levelsShown: true, discardedKg: [80, 160],
        levels: [
            { difficulty: 10, formation: 'scatter', terrain: 'rocks',
                reward: { resources: { refinedMinerals: [400, 800] } } },
            { difficulty: 7, formation: 'clusters', terrain: 'ruins',
                reward: { resources: { refinedMinerals: [600, 1000], energy: [1000, 2000] } } }
        ],
        camps: [
            { difficulty: 3, reward: { resources: { refinedMinerals: [100, 300] } } },
            { difficulty: 3, terrain: 'rocks', reward: { resources: { refinedMinerals: [100, 300] } } }
        ] },
    { type: 'settlement', zone: 'e', territoryRadius: 2,
        levels: [
            { difficulty: 14, formation: 'clusters', terrain: 'ruins',
                reward: { resources: { refinedMinerals: [800, 1400] } } }
        ],
        camps: [
            { difficulty: 4, reward: { resources: { refinedMinerals: [200, 400] } } },
            { difficulty: 4, formation: 'scatter', reward: { resources: { refinedMinerals: [200, 400] } } }
        ] },
    { type: 'cache', zone: 'c', reward: { resources: { ore: [2000, 4000] } } },
    { type: 'cache', zone: 'd', reward: { resources: { refinedMinerals: [1000, 2000] } } },
    { type: 'storySite', zone: 'b', storyId: 'scorchedCore' },

    // The far belt: the Override Module salvage; the red-herring wreckage.
    { type: 'settlement', zone: 'g', territoryRadius: 2, discardedKg: [150, 300],
        levels: [
            { difficulty: 18, formation: 'surround',
                reward: { resources: { refinedMinerals: [1200, 2000] } } },
            { difficulty: 12, terrain: 'canyon',
                reward: { resources: { refinedMinerals: [1500, 2500], energy: [3000, 5000] } } }
        ],
        camps: [
            { difficulty: 5, reward: { resources: { refinedMinerals: [300, 600] } } },
            { difficulty: 5, formation: 'surround', reward: { resources: { refinedMinerals: [300, 600] } } }
        ] },
    { type: 'settlement', zone: 'h', site: 2, territoryRadius: 2, levelsShown: true, discardedKg: [200, 400], // PLACEHOLDER site: the real Site 2 goes on a Gobi point
        levels: [
            { difficulty: 24, formation: 'ring', garrison: { shelter: 1, defender: 18 }, terrain: 'canyon',
                reward: { resources: { refinedMinerals: [1500, 2500] } } },
            { difficulty: 16, formation: 'clusters', terrain: 'ruins',
                reward: { resources: { energy: [4000, 7000] } } },
            { difficulty: 14, formation: 'surround',
                reward: { resources: { refinedMinerals: [3000, 5000] } } }
        ],
        camps: [
            { difficulty: 6, reward: { resources: { refinedMinerals: [400, 800] } } },
            { difficulty: 6, terrain: 'rocks', reward: { resources: { refinedMinerals: [400, 800] } } },
            { difficulty: 6, formation: 'clusters', reward: { resources: { refinedMinerals: [400, 800] } } }
        ] },
    // Pre-war stores behind rubble: bump until the drill is held (PLACEHOLDER: which vaults are sealed)
    { type: 'cache', zone: 'k', name: 'Sealed Vault', requires: 'drill', reward: { resources: { ore: [5000, 9000] } } },
    { type: 'cache', zone: 'j', reward: { resources: { refinedMinerals: [2000, 4000] } } },
    { type: 'storySite', zone: 'g', storyId: 'wreckage' },
    { type: 'storySite', zone: 'h', storyId: 'overrideVault', reward: { capability: 'overrideModule' } },

    // The far continents (finale): two hard settlements, one cache, the command ruin + hive heart (story ids are placeholders)
    // The first runs three levels unannounced, and its bottom is barely defended: the largest haul on the
    // planet behind the weakest garrison, and the largest discard.
    { type: 'settlement', zone: 'q', territoryRadius: 2, discardedKg: [2300, 3500],
        levels: [
            { difficulty: 30, formation: 'scatter', terrain: 'ruins',
                reward: { resources: { refinedMinerals: [2000, 3500] } } },
            { difficulty: 22, formation: 'surround', terrain: 'ruins',
                reward: { resources: { refinedMinerals: [2500, 4000], energy: [6000, 10000] } } },
            { difficulty: 4, formation: 'clusters',
                reward: { resources: { refinedMinerals: [8000, 12000] } } }
        ],
        camps: [
            { difficulty: 8, reward: { resources: { refinedMinerals: [600, 1000] } } },
            { difficulty: 8, terrain: 'ruins', reward: { resources: { refinedMinerals: [600, 1000] } } },
            { difficulty: 8, formation: 'scatter', reward: { resources: { refinedMinerals: [600, 1000] } } }
        ] },
    { type: 'settlement', zone: 't', territoryRadius: 2, levelsShown: true, discardedKg: [400, 700],
        levels: [
            { difficulty: 40, formation: 'ring', garrison: { shelter: 2, defender: 32 }, terrain: 'canyon',
                reward: { resources: { refinedMinerals: [3000, 5000] } } },
            { difficulty: 28, formation: 'surround', terrain: 'canyon',
                reward: { resources: { refinedMinerals: [5000, 8000], energy: [10000, 15000] } } }
        ],
        camps: [
            { difficulty: 10, reward: { resources: { refinedMinerals: [800, 1400] } } },
            { difficulty: 10, terrain: 'canyon', reward: { resources: { refinedMinerals: [800, 1400] } } },
            { difficulty: 10, formation: 'surround', reward: { resources: { refinedMinerals: [800, 1400] } } }
        ] },
    { type: 'cache', zone: 'l', name: 'Sealed Vault', requires: 'drill', reward: { resources: { refinedMinerals: [5000, 8000] } } },
    { type: 'storySite', zone: 'q', storyId: 'commandRuin' },
    { type: 'storySite', zone: 't', storyId: 'hiveHeart' }
]

// Tunnels: each digit painted on the map (two mouths per digit) is one passage. Stepping into a mouth the
// first time is the fight inside, on corridor ground (several `levels` = a long tunnel held in stages, with
// the same descend-or-withdraw choice between them as a settlement); win the last and the squad emerges at
// the far mouth, fall back and it returns the way it came. After that, stepping into either mouth crosses
// at once, for `crossTiles` of battery. A digit without an entry here gets TUNNEL_DEFAULT. PLACEHOLDER
// garrisons.
export const TUNNEL_DEFAULT: TunnelDef = { levels: [{ difficulty: 12, terrain: 'corridor' }], crossTiles: 4 };
export const TUNNEL_DEFS: Partial<Record<string, TunnelDef>> = {
    '1': { levels: [{ difficulty: 8, terrain: 'corridor', reward: { resources: { refinedMinerals: [200, 400] } } }], crossTiles: 3 },
    // '2' and '3' are rubble-sealed: both mouths bump until the drill is held, then they are fought through
    // like any other. '1' stays open as the first crossing the squad meets (PLACEHOLDER: which tunnels are sealed).
    // '2' runs under the strait between Iberia and Morocco: the tunnel garrison, then the fortified far mouth
    '2': { requires: 'drill', levels: [
        { difficulty: 16, terrain: 'corridor', reward: { resources: { refinedMinerals: [600, 1000] } } },
        { difficulty: 20, terrain: 'corridor', formation: 'surround',
            reward: { resources: { refinedMinerals: [800, 1400] } } }
    ], crossTiles: 4 },
    '3': { requires: 'drill', levels: [{ difficulty: 20, terrain: 'corridor', reward: { resources: { refinedMinerals: [800, 1400] } } }], crossTiles: 4 },
    '4': { levels: [
        { difficulty: 14, terrain: 'corridor', reward: { resources: { refinedMinerals: [500, 900] } } },
        { difficulty: 18, terrain: 'corridor', formation: 'surround',
            reward: { resources: { refinedMinerals: [1000, 1800] } } }
    ], crossTiles: 4 }
};
