import type {PoiDef, TunnelDef} from "./poi_types";

/**
 * The content manifest: WHAT exists on the planet. One POI_DEFS entry per placed POI (or per `count` copies of
 * it), each naming the painted zone(s) or point of database/planet/map.txt it lands in, and one TUNNEL_DEFS
 * entry per painted tunnel digit. The vocabulary these are written in (types, per-type behavior, glyphs) is
 * database/planet/poi_types.ts; the placement pass (generatePois in lib/planet/pois.ts) owns the mechanics:
 * zone/point lookup, reachability, territory stamping, event spacing.
 *
 * Names, texts, difficulties, and rewards are PLACEHOLDERS until the content pass; this file is what that
 * pass edits.
 */

/** false places no camps at all (the defs keep their `camps` lists; the placement pass skips them), for trying the
 * map without them */
export const CAMPS_ENABLED = true;

/** Field events and ambushes never land closer than this many hops to each other, so a belt's ambushes spread
 * out over it instead of clumping. Placement is once per new game, so a walked route is learnable: the map does not roll
 * dice under the squad's feet (same rule as the battle sim). */
export const FIELD_EVENT_SPACING = 2;

/**
 * The placed POIs. Resource reward amounts are [lo, hi] ranges, rolled to a multiple of 100 at map generation
 * (rollPoiReward).
 *
 * The list reads by region, home outward, so a belt's settlement, camps, ambushes, finds and caches sit side by
 * side and tune as one. Order only matters among field events and ambushes (they take tiles in manifest order,
 * and the spacing between them can squeeze out whatever comes last), so within a region the one-offs are listed
 * before the counted ones. Settlements are placed first whatever their position here.
 *
 * Settlements: `levels` lists the site's fights, surface first; most have one. Each level is a full battle of its own:
 *   `difficulty`  standard defenders fielded, and the displayed threat estimate; a [lo, hi] range rolls at map
 *                 generation
 *   `garrison`    a typed garrison ({ type: count }, see HOSTILE_TYPES in database/battle/units.ts) fielded instead of
 *                 `difficulty` standard defenders; entry order maps to formation slots, so a shelter listed first
 *                 takes a ring's center
 *   `formation`   the spawn layout (FORMATIONS in lib/battle/layouts.ts); unset = column front. `surround` is the
 *                 ambush opening: the garrison starts in all four corners with the squad encircled
 *   `terrain`     impassable obstacles scattered over the arena (TERRAIN_LAYOUTS in lib/battle/layouts.ts); unset =
 *                 open ground. The battlefield is stable per level (seeded from the map coord), so it can
 *                 be learned
 *   `blurb`       a bespoke scene line for the battle footer; unset = generated from terrain + formation
 *                 (GROUND_BLURBS/HOSTILE_BLURBS in database/battle/blurbs.ts)
 *   `reward`      what falls out of it
 *
 * Winning a level with more beneath it pauses on a descend-or-withdraw choice; the squad's hull damage and
 * spent charges carry down, loot rides in cargo (kept on a withdrawal, lost on a wipe). The site only falls
 * (land reclaimed, tile cleared) with its LAST level, and a site that is left re-mans itself from the top, so a
 * multi-level site is one run, outfitted for in advance. `levelsShown` announces the level count up front;
 * unset keeps it unknown until the bottom is reached. `discardedKg` is material the classifier weighs and
 * throws away once the site has fallen: one terminal line, no value, no effect.
 *
 * `camps` seeds small one-fight POIs on the site's held ground: foragers, herders, a watch. CONCEALED: scouting
 * the tile does not show them, the squad finds out by stepping on one, and the fight opens as an ambush
 * (surround, unless the camp names a formation), so crossing territory is a gamble the map never spells out.
 * They approach with the site's `campApproachText` unless a camp writes its own `approachText`.
 * Gone for good once beaten, and a taste of the site's strength before committing to it. They never release
 * land (the ground stays held until the settlement falls), and when it does fall whoever is still out there
 * scatters.
 *
 * Field events and ambushes: concealed on open ground (never held ground: that is the camps' beat) and found
 * by stepping on them. An ambush is fought on entry at the difficulty written here, which sits under the camps
 * and settlements of the same belt; a field event is a scene with `choices`. `count` scatters the repeatable
 * ones, the one-offs are authored to their place so each says its own thing. Every prompted site writes its own
 * offer line and every garrisoned one its approach line (a camp's is its settlement's unless it writes its own).
 *
 * Loot is what scavengers hold and what they are sitting on: worked metal on top (it classifies as minerals),
 * power cells further in, the old facility's stores at the core. Never ore; nothing out here mines.
 * Garrisons, loot, level counts, event counts and difficulties are PLACEHOLDER tuning, and the zone
 * assignment is a PLACEHOLDER too: the old distance bands mapped onto the painted zones (home basin 'a', the
 * belts around it, the far continents) until the content pass places each entry where it belongs. Zone
 * letters and their real places: see database/planet/map.txt.
 */
export const POI_DEFS: PoiDef[] = [
    // ---- Home basin (tutorial): one easy nest, two caches, the dead-droid story site, the first wreck (its log
    // points home), scraps, one soft ambush
    {
        type: 'settlement', zone: 'a', territoryRadius: 1,
        approachText: 'A low structure of scrap and cloth. Thermal signatures inside, few and still.',
        campApproachText: 'Two of them, out from the shelter with sacks. They drop the sacks.',
        levels: [
            { difficulty: 3, reward: { resources: { refinedMinerals: [100, 200] } } }
        ],
        camps: [
            { difficulty: 1, reward: { resources: { refinedMinerals: [100, 100] } } }
        ]
    },
    {
        type: 'cache', zone: 'a',
        promptText: 'A supply crate on its side, seals intact{loot}. Take it?',
        reward: { resources: { ore: [500, 1000] } }
    },
    {
        type: 'cache', zone: 'a',
        promptText: 'A drop pallet, chute still tangled in the frame{loot}. Take it?',
        reward: { resources: { refinedMinerals: [200, 400] } }
    },
    {
        type: 'storySite', zone: 'a',
        promptText: 'A shape in the sand the scanner reads as one of ours. Investigate?',
        choices: [
            { label: 'Explore', resultText: 'A droid chassis, half-buried. The model number matches your own manufacturing line. You did not build it.' }
        ]
    },
    {
        type: 'fieldEvent', zone: 'a', name: 'Wreck',
        promptText: 'A chassis in the dust. Your manufacturing line; not your serial.',
        choices: [
            { label: 'Search', battery: 15, resultText: 'Its cells still held a charge. Its log did not. The last heading it recorded points home.' }
        ]
    },
    {
        type: 'fieldEvent', zone: 'a', name: 'Debris Field',
        promptText: 'Debris field. Pre-war alloys in the scatter{loot}. Load it?',
        choices: [
            { label: 'Load', reward: { resources: { refinedMinerals: [100, 200] } } }
        ]
    },
    {
        type: 'ambush', zone: 'a',
        approachText: 'Sound from the rocks ahead. Then from behind.',
        level: { difficulty: 1, formation: 'surround', reward: { resources: { refinedMinerals: [50, 100] } } }
    },
    {
        type: 'fieldEvent', zone: 'a', count: 2, name: 'Sighting',
        promptText: 'Thermal signatures at range. Multiple. Receding.',
        choices: [
            { label: 'Observe', resultText: 'Gone over the rise before the optics resolved. No pattern match. Logged.' }
        ]
    },

    // ---- The near belt: Site 2 on a single tile, and the first two-level site with its count announced (it
    // teaches the descend-or-withdraw rule)
    {
        type: 'settlement', zone: 'b', territoryRadius: 2,
        approachText: 'Rock shelters cut into a scarp. Signatures moving between them.',
        campApproachText: 'Foragers from the scarp, closing from the rocks.',
        levels: [
            { difficulty: 6, terrain: 'rocks', reward: { resources: { refinedMinerals: [300, 600] } } }
        ],
        camps: [
            { difficulty: 2, reward: { resources: { refinedMinerals: [100, 200] } } }
        ]
    },
    {
        type: 'settlement', zone: 'c', site: 2, territoryRadius: 0, levelsShown: true,
        approachText: 'A pre-war compound, walls intact, gate shut. Dense returns behind it.',
        levels: [
            { difficulty: 20, terrain: 'compound', garrison: { shelter: 1, defender: 14 } }
        ]
    },
    {
        type: 'settlement', zone: 'd', territoryRadius: 2, levelsShown: true, discardedKg: [80, 160],
        approachText: 'Terraces climbing a ridge, and shafts going down. Signatures on every level the optics reach.',
        campApproachText: 'A watch post on the terraces. They saw you climbing.',
        levels: [
            { difficulty: 10, formation: 'scatter', terrain: 'rocks', reward: { resources: { refinedMinerals: [400, 800] } } },
            { difficulty: 7, formation: 'clusters', terrain: 'ruins', reward: { resources: { refinedMinerals: [600, 1000], energy: [1000, 2000] } } }
        ],
        camps: [
            { difficulty: 3, reward: { resources: { refinedMinerals: [100, 300] } } },
            { difficulty: 3, terrain: 'rocks', reward: { resources: { refinedMinerals: [100, 300] } } }
        ]
    },
    {
        type: 'settlement', zone: 'e', territoryRadius: 2,
        approachText: 'A ruined town, half of it roofed again. Signatures clustered in the standing blocks.',
        campApproachText: 'Scavengers from the town, more of them than the optics counted.',
        levels: [
            { difficulty: 14, formation: 'clusters', terrain: 'ruins', reward: { resources: { refinedMinerals: [800, 1400] } } }
        ],
        camps: [
            { difficulty: 4, reward: { resources: { refinedMinerals: [200, 400] } } },
            { difficulty: 4, formation: 'scatter', reward: { resources: { refinedMinerals: [200, 400] } } }
        ]
    },
    {
        type: 'cache', zone: 'c',
        promptText: 'Ore sacks under a collapsed awning, never collected{loot}. Take it?',
        reward: { resources: { ore: [2000, 4000] } }
    },
    {
        type: 'cache', zone: 'd',
        promptText: 'A field depot, door forced from outside, shelves still full{loot}. Take it?',
        reward: { resources: { refinedMinerals: [1000, 2000] } }
    },
    {
        type: 'storySite', zone: 'b',
        promptText: 'A collapsed structure. The layout matches your own blueprints. Investigate?',
        choices: [
            { label: 'Explore', resultText: 'A collapsed structure of familiar design. Its data core is scorched from the inside.' }
        ]
    },
    {
        type: 'fieldEvent', zone: ['b', 'd'], name: 'Signal',
        promptText: 'Faint carrier, repeating. Not yours.',
        choices: [
            { label: 'Trace', revealNearest: true, resultText: 'Bearing fixed. Source marked.' }
        ]
    },
    {
        type: 'fieldEvent', zone: ['d', 'e'], name: 'Dormant Droid',
        promptText: 'A dormant droid, half-buried. Same line as yours; an older serial.',
        choices: [
            { label: 'Recover', units: 1, battery: -10, resultText: 'Jump-started off the team\'s cells. It fell into formation without being told.' },
            { label: 'Strip', reward: { resources: { refinedMinerals: [200, 400] } }, resultText: 'Plating and cells recovered. The core was left where it lay.' }
        ]
    },
    {
        type: 'fieldEvent', zone: ['b', 'c', 'd', 'e'], count: 2, name: 'Debris Field',
        promptText: 'A collapsed relay mast. Structural alloy in the wreckage{loot}. Load it?',
        choices: [
            { label: 'Load', reward: { resources: { refinedMinerals: [200, 400] } } }
        ]
    },
    {
        type: 'ambush', zone: ['b', 'c', 'd'], count: 3,
        approachText: 'Signatures rising out of the ground on three sides. They were waiting.',
        level: { difficulty: 2, formation: 'surround', reward: { resources: { refinedMinerals: [100, 200] } } }
    },
    {
        type: 'ambush', zone: ['d', 'e'], count: 3,
        approachText: 'The ridge line moves. It was never empty.',
        level: { difficulty: 3, formation: 'surround', reward: { resources: { refinedMinerals: [150, 300] } } }
    },
    {
        type: 'fieldEvent', zone: ['b', 'c', 'd', 'e'], count: 2, name: 'Sighting',
        promptText: 'Movement on the ridge line. Two, then none.',
        choices: [
            { label: 'Observe', resultText: 'Nothing on the second pass. Whatever it was knows the ground better than the optics do.' }
        ]
    },

    // ---- The far belt: the Override Module salvage, the red-herring wreckage, the first sealed vault
    {
        type: 'settlement', zone: 'g', territoryRadius: 2, discardedKg: [150, 300],
        approachText: 'Earthworks in a ring, a dry canyon beyond. Signatures on the rim and none below it.',
        campApproachText: 'Herders off the rim, and what they herd.',
        levels: [
            { difficulty: 18, formation: 'surround', reward: { resources: { refinedMinerals: [1200, 2000] } } },
            { difficulty: 12, terrain: 'canyon', reward: { resources: { refinedMinerals: [1500, 2500], energy: [3000, 5000] } } }
        ],
        camps: [
            { difficulty: 5, reward: { resources: { refinedMinerals: [300, 600] } } },
            { difficulty: 5, formation: 'surround', reward: { resources: { refinedMinerals: [300, 600] } } }
        ]
    },
    {
        // PLACEHOLDER site: the real Site 2 goes on a Gobi point
        type: 'settlement', zone: 'h', site: 2, territoryRadius: 2, levelsShown: true, discardedKg: [200, 400],
        approachText: 'A facility dug into a canyon wall, ringed with watch posts. Dense returns at the core.',
        campApproachText: 'A picket from the facility. They knew this ground before you did.',
        levels: [
            { difficulty: 24, formation: 'ring', garrison: { shelter: 1, defender: 18 }, terrain: 'canyon', reward: { resources: { refinedMinerals: [1500, 2500] } } },
            { difficulty: 16, formation: 'clusters', terrain: 'ruins', reward: { resources: { energy: [4000, 7000] } } },
            { difficulty: 14, formation: 'surround', reward: { resources: { refinedMinerals: [3000, 5000] } } }
        ],
        camps: [
            { difficulty: 6, reward: { resources: { refinedMinerals: [400, 800] } } },
            { difficulty: 6, terrain: 'rocks', reward: { resources: { refinedMinerals: [400, 800] } } },
            { difficulty: 6, formation: 'clusters', reward: { resources: { refinedMinerals: [400, 800] } } }
        ]
    },
    // Pre-war stores behind rubble: bump until the drill is held (PLACEHOLDER: which vaults are sealed)
    {
        type: 'cache', zone: 'k', name: 'Sealed Vault', requires: 'drill',
        promptText: 'The rubble is through. Pre-war stores, palletised and dry{loot}. Take it?',
        reward: { resources: { ore: [5000, 9000] } }
    },
    {
        type: 'cache', zone: 'j',
        promptText: 'A convoy trailer, uncoupled and left{loot}. Take it?',
        reward: { resources: { refinedMinerals: [2000, 4000] } }
    },
    {
        type: 'storySite', zone: 'g',
        promptText: 'A debris trail a kilometer long. Investigate?',
        choices: [
            { label: 'Explore', resultText: 'Wreckage strewn across a kilometer. The blast patterns came from above. Something attacked them.' }
        ]
    },
    {
        type: 'storySite', zone: 'h',
        promptText: 'A hardened door in a hillside, still powered. Investigate?',
        choices: [
            { label: 'Explore', resultText: 'A command vault. Inside, an override module; its authorization codes are older than your directive.' }
        ],
        reward: { capability: 'overrideModule' }
    },
    {
        type: 'fieldEvent', zone: ['g', 'h'], name: 'Wreck',
        promptText: 'A chassis of your line, split along the spine. Recent.',
        choices: [
            { label: 'Search', battery: 25, resultText: 'Cells intact; whatever opened it wanted the core. The log ends mid-word.' }
        ]
    },
    {
        type: 'fieldEvent', zone: ['j', 'k'], name: 'Signal',
        promptText: 'A carrier under the noise floor. Yours, in an older cipher.',
        choices: [
            { label: 'Trace', revealNearest: true, resultText: 'Bearing fixed. Source marked. It stopped transmitting when the trace locked.' }
        ]
    },
    {
        type: 'fieldEvent', zone: ['j', 'k'], name: 'Dormant Droid',
        promptText: 'A droid, powered down and dug in. It faced outward when it stopped.',
        choices: [
            { label: 'Recover', units: 1, battery: -10, resultText: 'It came up with its weapon raised, then lowered it. It had been waiting for someone with the right serial.' },
            { label: 'Strip', reward: { resources: { refinedMinerals: [400, 800] } }, resultText: 'Plating and cells recovered. Its last order was still in the buffer. Nobody read it.' }
        ]
    },
    {
        type: 'fieldEvent', zone: ['g', 'h', 'j'], count: 2, name: 'Debris Field',
        promptText: 'A vehicle graveyard, stripped long ago. Not stripped of everything{loot}. Load it?',
        choices: [
            { label: 'Load', reward: { resources: { refinedMinerals: [500, 1000] } } }
        ]
    },
    {
        type: 'ambush', zone: ['f', 'g', 'h', 'i'], count: 4,
        approachText: 'Contact on the flanks, closing fast. The column you saw was not the whole of them.',
        level: { difficulty: 5, formation: 'surround', reward: { resources: { refinedMinerals: [250, 500] } } }
    },
    {
        type: 'ambush', zone: ['j', 'k'], count: 3,
        approachText: 'Dust plumes converging. They have done this before.',
        level: { difficulty: 7, formation: 'surround', reward: { resources: { refinedMinerals: [350, 700] } } }
    },
    {
        type: 'fieldEvent', zone: ['f', 'g', 'h', 'i', 'j', 'k'], count: 3, name: 'Sighting',
        promptText: 'A column on the horizon, moving in step. Not receding.',
        choices: [
            { label: 'Observe', resultText: 'It held its heading and passed. The optics counted more than the team could take.' }
        ]
    },

    // ---- The far continents (finale): two hard settlements, one cache, the command ruin + hive heart (PLACEHOLDER
    // story texts here and above: the real ~12-log mystery is authored in the content pass). The first settlement runs three levels unannounced, and its bottom is barely defended:
    // the largest haul on the planet behind the weakest garrison, and the largest discard.
    {
        type: 'settlement', zone: 'q', territoryRadius: 2, discardedKg: [2300, 3500],
        approachText: 'Ruins on the scale of a city, still inhabited. Signatures scattered thin across a wide front.',
        campApproachText: 'A work party from the ruins, downing tools.',
        levels: [
            { difficulty: 30, formation: 'scatter', terrain: 'ruins', reward: { resources: { refinedMinerals: [2000, 3500] } } },
            { difficulty: 22, formation: 'surround', terrain: 'ruins', reward: { resources: { refinedMinerals: [2500, 4000], energy: [6000, 10000] } } },
            { difficulty: 4, formation: 'clusters', reward: { resources: { refinedMinerals: [8000, 12000] } } }
        ],
        camps: [
            { difficulty: 8, reward: { resources: { refinedMinerals: [600, 1000] } } },
            { difficulty: 8, terrain: 'ruins', reward: { resources: { refinedMinerals: [600, 1000] } } },
            { difficulty: 8, formation: 'scatter', reward: { resources: { refinedMinerals: [600, 1000] } } }
        ]
    },
    {
        type: 'settlement', zone: 't', territoryRadius: 2, levelsShown: true, discardedKg: [400, 700],
        approachText: 'A fortress in a canyon mouth. Rings of signatures around something that does not move.',
        campApproachText: 'An outer ring of the fortress, turning inward on you.',
        levels: [
            { difficulty: 40, formation: 'ring', garrison: { shelter: 2, defender: 32 }, terrain: 'canyon', reward: { resources: { refinedMinerals: [3000, 5000] } } },
            { difficulty: 28, formation: 'surround', terrain: 'canyon', reward: { resources: { refinedMinerals: [5000, 8000], energy: [10000, 15000] } } }
        ],
        camps: [
            { difficulty: 10, reward: { resources: { refinedMinerals: [800, 1400] } } },
            { difficulty: 10, terrain: 'canyon', reward: { resources: { refinedMinerals: [800, 1400] } } },
            { difficulty: 10, formation: 'surround', reward: { resources: { refinedMinerals: [800, 1400] } } }
        ]
    },
    {
        type: 'cache', zone: 'l', name: 'Sealed Vault', requires: 'drill',
        promptText: 'Behind the rubble, a strongroom. Refined stock, stamped and racked{loot}. Take it?',
        reward: { resources: { refinedMinerals: [5000, 8000] } }
    },
    {
        type: 'storySite', zone: 'q',
        promptText: 'A ruined complex on the scale of a city block. Investigate?',
        choices: [
            { label: 'Explore', resultText: 'The ruined command center of the first swarm. The final log is intact.' }
        ]
    },
    {
        type: 'storySite', zone: 't',
        promptText: 'An opening in the rock, warm, exhaling. Investigate?',
        choices: [
            { label: 'Explore', resultText: 'A vast organic chamber, pulsing faintly. The hive is not from this planet either.' }
        ]
    },
    {
        type: 'fieldEvent', zone: ['q', 't'], name: 'Wreck',
        promptText: 'A chassis of your line, intact, powered down by hand. Someone chose to stop here.',
        choices: [
            { label: 'Search', battery: 40, resultText: 'Full cells. The log is complete, and it was not written for you. It was written for whoever came after.' }
        ]
    },
    {
        type: 'fieldEvent', zone: ['l', 'q', 't'], count: 2, name: 'Debris Field',
        promptText: 'A shattered hauler, cargo spilled down the slope{loot}. Load it?',
        choices: [
            { label: 'Load', reward: { resources: { refinedMinerals: [1200, 2000] } } }
        ]
    },
    {
        type: 'ambush', zone: ['l', 'q', 't'], count: 4,
        approachText: 'They come out of the ruins in silence, from every doorway at once.',
        level: { difficulty: 10, formation: 'surround', reward: { resources: { refinedMinerals: [500, 1000] } } }
    },
    {
        type: 'ambush', zone: ['m', 'n', 'o', 'p', 'r', 's'], count: 3,
        approachText: 'Nothing on the optics until it is everywhere.',
        level: { difficulty: 8, formation: 'surround', reward: { resources: { refinedMinerals: [400, 800] } } }
    },
    {
        type: 'fieldEvent', zone: ['l', 'm', 'n', 'q', 't'], count: 3, name: 'Sighting',
        promptText: 'Signatures everywhere the optics turn. None of them moving toward you. Yet.',
        choices: [
            { label: 'Observe', resultText: 'They are not hunting. They are tending something. Logged.' }
        ]
    }
]

/** What a painted tunnel digit gets when TUNNEL_DEFS has no entry for it */
export const TUNNEL_DEFAULT: TunnelDef = {
    approachText: 'A tunnel mouth. Signatures in the dark beyond.',
    levels: [{ difficulty: 12, terrain: 'corridor' }],
    crossTiles: 4
};

/**
 * Tunnels: each digit painted on the map (two mouths per digit) is one passage. Stepping into a mouth the
 * first time is the fight inside, on corridor ground (several `levels` = a long tunnel held in stages, with
 * the same descend-or-withdraw choice between them as a settlement); win the last and the squad emerges at
 * the far mouth, fall back and it returns the way it came. After that, stepping into either mouth crosses
 * at once, for `crossTiles` of battery. PLACEHOLDER garrisons.
 */
export const TUNNEL_DEFS: Partial<Record<string, TunnelDef>> = {
    '1': {
        approachText: 'A tunnel mouth under the hill. Faint signatures, deep in.',
        levels: [{ difficulty: 8, terrain: 'corridor', reward: { resources: { refinedMinerals: [200, 400] } } }],
        crossTiles: 3
    },
    // '2' and '3' are rubble-sealed: both mouths bump until the drill is held, then they are fought through
    // like any other. '1' stays open as the first crossing the squad meets (PLACEHOLDER: which tunnels are sealed).
    // '2' runs under the strait between Iberia and Morocco: the tunnel garrison, then the fortified far mouth
    '2': {
        approachText: 'The strait tunnel. Rubble cleared, and behind it a garrison that heard the drill.',
        requires: 'drill',
        levels: [
            { difficulty: 16, terrain: 'corridor', reward: { resources: { refinedMinerals: [600, 1000] } } },
            { difficulty: 20, terrain: 'corridor', formation: 'surround', reward: { resources: { refinedMinerals: [800, 1400] } } }
        ],
        crossTiles: 4
    },
    '3': {
        approachText: 'A tunnel mouth behind broken rock. Signatures, and the sound of water.',
        requires: 'drill',
        levels: [{ difficulty: 20, terrain: 'corridor', reward: { resources: { refinedMinerals: [800, 1400] } } }],
        crossTiles: 4
    },
    '4': {
        approachText: 'A wide bore, engineered, held. Signatures in ranks.',
        levels: [
            { difficulty: 14, terrain: 'corridor', reward: { resources: { refinedMinerals: [500, 900] } } },
            { difficulty: 18, terrain: 'corridor', formation: 'surround', reward: { resources: { refinedMinerals: [1000, 1800] } } }
        ],
        crossTiles: 4
    }
};
