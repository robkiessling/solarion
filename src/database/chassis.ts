/**
 * The droid factory's SCHEMATIC INDEX: the chassis design corpus, shown as a special panel
 * (components/panels/schematic_index.jsx, state in redux/modules/panels.ts).
 *
 * The panel renders every row below, in order, as the AI's index printout. Locked rows show as
 * corrupted entries (the "shell": the player sees how deep the corpus goes before knowing what's
 * in it). All content here is PLACEHOLDER until the real upgrade pass.
 *
 * ── Authoring a row ─────────────────────────────────────────────────────────────
 * {
 *   id: 'mk2Chassis',        // unique; referenced by save state and unlockChassisRow()
 *   name: 'Mk.2 CHASSIS',    // row title once readable
 *   author: 'R. Okafor',     // optional; provenance line under the row (late rows omit = the reveal)
 *   blurb: 'base chassis',   // optional; small sub-line text
 *   kind: 'single' | 'fork', // one option (pure upgrade) or an exclusive pair
 *   unlock: 'start' | 'grant', // 'start': open from the beginning. 'grant': locked/corrupted until
 *                            //   something calls unlockChassisRow(id) (site fragments, story, dev).
 *   preAuthorized: 311,      // instead of unlock: already signed pre-war (Mk.1). Value = its auth #.
 *   corrupted: '████ █████', // the bars shown while locked (draw them; widths vary per row)
 *   sourceHint: 'ARCHIVED AT: SITE 2 · SITE 2 LOCATION: UNKNOWN', // truthful hint while locked
 *   postIndex: true,         // renders BELOW "── END OF INDEX ──", unnumbered, only once unlocked
 *                            //   (the AI's own late-game designs; never shown corrupted)
 *   options: [ ... ],        // 1 (single) or 2 (fork) options, see below
 * }
 *
 * ── Authoring an option ─────────────────────────────────────────────────────────
 * {
 *   id: 'mk2a',
 *   name: 'Mk.2A "DRAYHORSE"',
 *   note: { author: 'R. Okafor', text: "it's a shovel, not a sword." }, // margin squabble
 *   effect: { speed: { add: 2 }, damage: { multiply: 1.5 } },  // standard effect format
 *   cost: { ore: 5000, refinedMinerals: 800 },
 *   downtime: 30,            // factory retool time in SECONDS (0 = instant). While retooling,
 *                            //   no other authorization can start.
 * }
 *
 * Wired effect variables (applied fleet-wide; snapshotted onto the squad at deploy, so refits
 * hit the NEXT deployment — same rule as existing combat upgrades):
 *   hp, damage, attackMs, speed  -> expedition droid stat block (getDroidStats)
 *   batteryCapacity              -> squad battery (getBatteryCapacity)
 * Other variables (build time, harvest, etc.) are NOT wired yet; add the key here in STAT_LABELS
 * and fold panels into the relevant calculator when the time comes.
 *
 * Choosing/switching: authorizing one side of a fork greys the other with a RETOOL affordance;
 * retooling re-pays that option's cost and runs its downtime again. No per-droid chassis: the
 * fleet always runs the currently authorized spec.
 */

// Display labels + formatting for effect stat lines on option cards. `invert: true` marks stats
// where a LOWER number is better (shown so a reduction reads as an improvement, e.g. swing time).
export const STAT_LABELS = {
    hp: { label: 'hull' },
    damage: { label: 'attack' },
    attackMs: { label: 'swing', invert: true },
    speed: { label: 'speed' },
    batteryCapacity: { label: 'battery' },
};

export const CHASSIS_PANEL = {
    id: 'chassis',
    title: 'DROID FACTORY — SCHEMATIC INDEX',
    corpusHeader: 'SOLARION PROGRAM — CHASSIS DESIGN CORPUS',
};

export const CHASSIS_ROWS: ChassisRow[] = [
    {
        id: 'mk1Frame',
        name: 'Mk.1 FRAME',
        author: 'R. Okafor, rev. 12',
        blurb: 'base chassis',
        kind: 'single',
        preAuthorized: 311,
        options: [
            { id: 'mk1', name: 'Mk.1 FRAME', effect: null, cost: null, downtime: 0 },
        ],
    },
    {
        id: 'mk2Chassis',
        name: 'Mk.2 CHASSIS',
        kind: 'fork',
        unlock: 'start',
        options: [
            {
                id: 'mk2a',
                name: 'Mk.2A "DRAYHORSE"',
                note: { author: 'R. Okafor', text: "it's a shovel, not a sword." },
                effect: { speed: { add: 2 }, batteryCapacity: { multiply: 1.25 } },
                cost: { ore: 5000, refinedMinerals: 800 },
                downtime: 30,
            },
            {
                id: 'mk2b',
                name: 'Mk.2B "LANCER"',
                note: { author: 'H. Aldis', text: 'hope we never need these.' },
                effect: { damage: { multiply: 1.5 }, hp: { add: 3 } },
                cost: { ore: 5000, refinedMinerals: 800 },
                downtime: 30,
            },
        ],
    },
    {
        id: 'servoPackage',
        name: 'SERVO RECALIBRATION',
        author: 'H. Aldis',
        blurb: 'field maintenance bulletin 44-C',
        kind: 'single',
        unlock: 'start',
        options: [
            {
                id: 'servo',
                name: 'SERVO RECALIBRATION',
                effect: { attackMs: { multiply: 0.85 } },
                cost: { ore: 2500, refinedMinerals: 400 },
                downtime: 15,
            },
        ],
    },
    // ── Locked shell rows: visible as corruption bars from day one. Fill in options when the
    // real upgrade pass happens; a row can ship optionless until something can unlock it.
    {
        id: 'mk3Chassis',
        name: 'Mk.3 CHASSIS',
        kind: 'fork',
        unlock: 'grant',
        corrupted: '████████ █████',
        sourceHint: 'ARCHIVED AT: SITE 2 · SITE 2 LOCATION: UNKNOWN',
        // Placeholder options so the grant flow is testable end to end:
        options: [
            {
                id: 'mk3a',
                name: 'Mk.3A "PACKMULE"',
                note: { author: 'R. Okafor', text: 'the field teams asked for legs, not guns.' },
                effect: { batteryCapacity: { multiply: 1.5 }, hp: { add: 2 } },
                cost: { ore: 20000, refinedMinerals: 3000 },
                downtime: 45,
            },
            {
                id: 'mk3b',
                name: 'Mk.3B "BULWARK"',
                note: { author: 'H. Aldis', text: 'read the contact reports. build it.' },
                effect: { hp: { add: 6 }, speed: { add: -1 } },
                cost: { ore: 20000, refinedMinerals: 3000 },
                downtime: 45,
            },
        ],
    },
    {
        id: 'indexRow5',
        name: '',
        kind: 'single',
        unlock: 'grant',
        corrupted: '██ ██████████',
        sourceHint: 'ARCHIVED AT: [CORRUPTED]',
        options: [],
    },
    {
        id: 'indexRow6',
        name: '',
        kind: 'single',
        unlock: 'grant',
        corrupted: '███████',
        sourceHint: 'ARCHIVED AT: [CORRUPTED]',
        options: [],
    },
    {
        id: 'indexRow7',
        name: '',
        kind: 'fork',
        unlock: 'grant',
        corrupted: '█████ ████ ███',
        sourceHint: 'ARCHIVED AT: SITE 4 · SITE 4 LOCATION: UNKNOWN',
        options: [],
    },
    {
        id: 'indexRow8',
        name: '',
        kind: 'single',
        unlock: 'grant',
        corrupted: '██████ ██',
        sourceHint: 'ARCHIVED AT: CENTRAL ARCHIVE',
        options: [],
    },
    // ── Past the end of the index: the AI's own designs. Hidden entirely until granted, then
    // appear BELOW the END OF INDEX line, unnumbered, no author. (Reveal #5 plumbing.)
    {
        id: 'uplinkLattice',
        name: 'UPLINK LATTICE',
        kind: 'single',
        unlock: 'grant',
        postIndex: true,
        options: [],
    },
];

export const CHASSIS_ROWS_BY_ID: Record<string, ChassisRow> = {};
CHASSIS_ROWS.forEach(row => { CHASSIS_ROWS_BY_ID[row.id] = row; });

export function getChassisOption(rowId: string, optionId: string): ChassisOption | null {
    const row = CHASSIS_ROWS_BY_ID[rowId];
    if (!row) return null;
    return row.options.find(option => option.id === optionId) || null;
}
