/**
 * Ambient type declarations for the game's data model: the database records, the redux state slices they are
 * snapshotted into, and the planet/expedition shapes. This file has no imports or exports, so every type here is
 * global and can be referenced from JSDoc in any .js file without an import, e.g.
 *
 *     /** @param {RootState} state  @param {Structure} structure *\/
 *     function foo(state, structure) { ... }
 *
 * Nothing here runs; `npx tsc` reads it (see tsconfig.json). The database files remain the source of truth for
 * VALUES; this file is the source of truth for SHAPES. When a record gains a field, add it here.
 */

// ---------------------------------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------------------------------

/** [row, col] on the planet map */
type Coord = [number, number];

type ResourceId = 'ore' | 'energy' | 'vents' | 'refinedMinerals' | 'standardDroids' | 'buildableLand' |
    'developedLand' | 'probes';

type StructureId = 'commandCenter' | 'harvester' | 'solarPanel' | 'windTurbine' | 'thermalVent' | 'energyBay' |
    'refinery' | 'droidFactory' | 'probeFactory';

/** { resourceId: amount }, used for costs, consumption, production, capacity */
type ResourceAmounts = Partial<Record<ResourceId, number>>;

/** Calculated per-record numbers (see `calculators` in the database files). Keys are the variable names. */
type Variables = { [variable: string]: number };

/**
 * Effects modify a record's `variables` (see lib/effect.js):
 *     { ratedPower: { multiply: 1.25 }, energy: { add: 1 } }
 */
type Effect = { [variable: string]: { add?: number; multiply?: number } };

interface EffectOperation { variable: string; value: number }
interface EffectOperations { add: EffectOperation[]; multiply: EffectOperation[] }

/** EFFECT_TARGETS in lib/effect.ts */
type EffectTarget = 'structure' | 'ability' | 'misc';
interface EffectAffects { type: EffectTarget; id?: string }

/** Recursively optional: the shape of a database override merged over a `base` record */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends (...args: any[]) => any ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Redux plumbing, loosely typed: actions are checked by their string type, payloads are free-form */
interface GameAction { type: string; payload?: any }
type Dispatch = (action: any) => any;
type GetState = () => RootState;
type Thunk = (dispatch: Dispatch, getState: GetState) => void;

// ---------------------------------------------------------------------------------------------------------------
// Structures (database/structures.js)
// ---------------------------------------------------------------------------------------------------------------

/** STATUSES in database/structures.ts */
type StructureStatus = 'normal' | 'insufficient';
/** TYPES in database/structures.ts */
type StructureType = 'generator' | 'consumer';

interface DroidData {
    usesDroids: boolean;
    numDroidsAssigned: number;
    droidAssignmentType: 'structure' | 'planet';
    assignTooltipPrefix?: string;
}
/** The part of DroidData the droid assign/remove actions read; the planet slice carries only this much */
type DroidAssignment = Pick<DroidData, 'numDroidsAssigned' | 'droidAssignmentType'>;

/** A structure as authored in the database (before LEARN copies it into state) */
interface StructureRecord {
    name: string;
    description: string;
    runnable: boolean;
    runningRate: number;
    runningCooldown: number;
    disabled: boolean;
    count: { total: number; max: number };
    status: StructureStatus;
    statusMessage: string;
    cost: ResourceAmounts;
    consumes: ResourceAmounts;
    produces: ResourceAmounts;
    type: StructureType;
    droidData: DroidData;
}

/** A learned structure in state. Calculated fields are written by the calculators on every recalculation. */
interface Structure extends StructureRecord {
    id: StructureId;
    variables?: Variables;
    capacity?: ResourceAmounts;
    boost?: ResourceAmounts;
    animationTag?: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Upgrades (database/upgrades.js)
// ---------------------------------------------------------------------------------------------------------------

/** STATES in database/upgrades.ts */
type UpgradeState = 'hidden' | 'discovered' | 'researching' | 'paused' | 'researched';

interface DiscoverWhen {
    /** lifetime resource totals that must be reached */
    resources?: ResourceAmounts;
    /** upgrade ids that must already be researched */
    upgrades?: string[];
    /** structure build counts that must be reached */
    structures?: Partial<Record<StructureId, number>>;
}

interface UpgradeRecord {
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
}

interface Upgrade extends UpgradeRecord {
    id: string;
    /** ms of research done so far */
    researchProgress?: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Abilities (database/abilities.js)
// ---------------------------------------------------------------------------------------------------------------

/** STATES in database/abilities.ts */
type AbilityState = 'ready' | 'casting' | 'cooldown';

interface AbilityRecord {
    name: string;
    description: string;
    cost: ResourceAmounts;
    produces: ResourceAmounts;
    /** seconds */
    castTime: number;
    state: AbilityState;
    /** applied for the duration of the cast */
    effect?: Effect;
    affects: EffectAffects;
    /** if truthy, no ability button is shown even after learning */
    hidden: boolean | string;
    /** seconds; starts after the cast finishes */
    cooldown: number;
    structure?: StructureId;
    /** animation counters (commandCenter_charge) */
    animations?: { [key: string]: number };
}

interface Ability extends AbilityRecord {
    id: string;
    castProgress?: number;
    cooldownProgress?: number;
    variables?: Variables;
    displayInfo?: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Resources (database/resources.js)
// ---------------------------------------------------------------------------------------------------------------

interface ResourceRecord {
    name: string;
    amount: number;
    lifetimeTotal: number;
    capacity: number;
    /** whether the resource shows up in the resource bar */
    visible: boolean;
    /** whether the resource bar shows a rate (only relevant if visible) */
    showRate: boolean;
    icon?: string;
}

interface Resource extends ResourceRecord {
    id: ResourceId;
}

// ---------------------------------------------------------------------------------------------------------------
// Calculators: per-record functions whose RESULTS are stored on the state record (see recalculateSlice)
// ---------------------------------------------------------------------------------------------------------------

type Calculator<R> = (state: RootState, record: R, variables?: Variables) => any;

type CalculatorSet<R> = {
    /** always calculated first; its result is the third argument to the other calculators */
    variables?: (state: RootState, record: R) => Variables;
} & { [attribute: string]: Calculator<R> };

// ---------------------------------------------------------------------------------------------------------------
// Logs (database/logs)
// ---------------------------------------------------------------------------------------------------------------

/** [text, delayAfterMs, flash?] */
type LogLineTuple = [string, number, boolean?];
interface LogLineOptions {
    text: string;
    delay?: number;
    flash?: boolean;
    className?: string;
    style?: { [property: string]: string | number };
    /** 'chars' types the line out character by character */
    mode?: 'chars';
    charDelay?: number;
}
type LogLine = LogLineTuple | LogLineOptions;

interface LogRecord {
    text: LogLine[];
    /** runs once, when the last line lands */
    onFinish?: (dispatch: Dispatch) => void;
}

interface LogEntry {
    /** database id, or null for inline entries */
    id: string | null;
    sequence: string;
    status: 'in_progress' | 'completed';
    vars?: { [placeholder: string]: string | number } | null;
    entryType?: 'inline';
    text?: string;
    className?: string;
    style?: { [property: string]: string | number } | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Triggers (database/triggers.js)
// ---------------------------------------------------------------------------------------------------------------

interface TriggerRecord<S = any> {
    /** the part of the state to listen to (as specific as possible) */
    selector: (state: RootState) => S;
    condition: (slice: S) => boolean;
    action: () => void;
}

// ---------------------------------------------------------------------------------------------------------------
// Chassis (database/chassis.js) and equipment (database/equipment.js)
// ---------------------------------------------------------------------------------------------------------------

interface ChassisOption {
    id: string;
    name: string;
    note?: { author: string; text: string };
    effect: Effect | null;
    cost: ResourceAmounts | null;
    /** factory retool time in seconds (0 = instant) */
    downtime: number;
}

interface ChassisRow {
    id: string;
    name: string;
    author?: string;
    blurb?: string;
    kind: 'single' | 'fork';
    unlock?: 'start' | 'grant';
    /** already signed pre-war; the value is its authorization number */
    preAuthorized?: number;
    corrupted?: string;
    sourceHint?: string;
    postIndex?: boolean;
    options: ChassisOption[];
}

type EquipmentId = 'demoCharge' | 'repairKit' | 'overchargeCell';

type EquipmentEffect =
    { kind: 'aoe'; damage: number; radius: number } |
    { kind: 'heal'; amount: number } |
    { kind: 'overcharge'; durationMs: number; rateMultiplier: number };

interface EquipmentDef {
    name: string;
    description: string;
    upgradeId: string;
    charges: number;
    effect: EquipmentEffect;
}

/** { itemId: chargesLeft } */
type EquipmentCharges = Partial<Record<EquipmentId, number>>;

// ---------------------------------------------------------------------------------------------------------------
// Battle (database/battle.js, lib/battle.js)
// ---------------------------------------------------------------------------------------------------------------

/** The expedition droid stat block: DROID_BASE_STATS plus researched combat upgrades and the authorized chassis spec.
 * A type alias (not an interface) so it is assignable to Variables, which the upgrade effects are applied through. */
type DroidStats = { hp: number; damage: number; attackMs: number; speed: number };

interface UnitStats extends DroidStats {
    /** spawner-type bugs only */
    spawns?: string;
    spawnEveryMs?: number;
    spawnBatch?: number;
    spawnCap?: number;
}

type BattleSide = 'droid' | 'bug';

interface BattleUnit {
    id: string;
    side: BattleSide;
    type: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    cooldownMs: number;
    seed: number;
    wobbleMs: number;
    spawnMs?: number;
    withdrawing?: boolean;
}

interface BattleFx { type: 'hit' | 'death' | 'heal' | 'bomb'; x: number; y: number; t: number }

interface BattleTerrainPiece { art: string[]; col: number; row: number }

interface Battle {
    phase: 'active' | 'withdrawing';
    elapsedMs: number;
    /** per-type stat blocks this battle runs on */
    stats: { [unitType: string]: UnitStats };
    arenaW: number;
    arenaH: number;
    startingDroids: number;
    startingBugs: number;
    startingSpawners: number;
    bugsPeak: number;
    spawnCounter: number;
    escaped: number;
    escapedHp: number[];
    buffs: { overchargeMs: number };
    terrain: { id: string; pieces: BattleTerrainPiece[] } | null;
    fx: BattleFx[];
    units: BattleUnit[];
}

// ---------------------------------------------------------------------------------------------------------------
// Planet map (lib/planet_map.js)
// ---------------------------------------------------------------------------------------------------------------

/** TERRAINS[x].key (the debug meridians add `meridian_<n>` keys at runtime; they never reach a save) */
type TerrainKey = 'home' | 'flatland' | 'developing' | 'developed' | 'mountain' | 'ice' | 'acid' | 'water';
/** STATUSES[x].key in lib/planet_map.ts */
type SectorStatus = 'unknown' | 'exploring' | 'explored';
/** GATE_KINDS */
type GateKind = 'cave' | 'door';
/** REGIONS in lib/planet_map.ts */
type Region = 'bowl' | 'belt' | 'antipode';

interface TerrainDef {
    key: TerrainKey;
    display: string;
    variants?: string[];
    variantShare?: number;
    label?: string;
    /** seconds for a droid to cross one tile of this terrain */
    crossTime?: number;
    /** capability required before the terrain can be crossed at all */
    crossUpgrade?: string;
    blocksVision?: boolean;
    exploreLength?: number;
}

interface SectorStatusDef {
    key: SectorStatus;
    display?: string;
    label: string;
}

/** One tile on the planet map */
interface Sector {
    terrain: TerrainKey;
    status: SectorStatus;
    exploreLength?: number;
    /** cached [row, col] */
    coord?: Coord;
    distanceHome?: number;
    graphDistanceHome?: number;
    region?: Region;
    gated?: boolean;
    gateKind?: GateKind;
    /** authored placement zone letter */
    zone?: string;
    /** authored tunnel system digit */
    tunnel?: string;
    /** poiId of the nest whose infestation covers this tile */
    infestedBy?: string | null;
    sectorDividerLeft?: boolean;
    sectorDividerRight?: boolean;
    sectorDividerBottom?: boolean;
}

type PlanetMap = Sector[][];

/** The set of unlocked crossing capabilities, e.g. { drill: true } */
type Unlocks = { [capability: string]: boolean };

// ---------------------------------------------------------------------------------------------------------------
// Expeditions (lib/expeditions.js, database/pois.js, lib/squad.js)
// ---------------------------------------------------------------------------------------------------------------

type PoiType = 'cache' | 'nest' | 'storySite' | 'gate';
type PoiStatus = 'hidden' | 'available' | 'cleared';
type Band = 'r1' | 'r2near' | 'r2far' | 'r3';
type Capability = 'drill' | 'sealedChassis' | 'overrideModule';

interface PoiReward {
    resources?: ResourceAmounts;
    capability?: Capability;
}

/** A POI_DEFS entry: resource rewards are [lo, hi] ranges until rolled at map generation */
interface PoiDef {
    type: PoiType;
    band: Band;
    name?: string;
    difficulty?: number;
    infestRadius?: number;
    formation?: string;
    terrain?: string;
    blurb?: string;
    bugs?: { [bugType: string]: number };
    requires?: Capability;
    storyId?: string;
    promptText?: string;
    actionLabel?: string;
    reward?: { resources?: Partial<Record<ResourceId, [number, number]>>; capability?: Capability };
}

interface GateDef {
    name: string;
    requires: Capability;
    promptText: string;
    actionLabel: string;
}

/** A placed POI in planet.pois */
interface Poi {
    id: string;
    coord: Coord;
    type: PoiType;
    name: string;
    status: PoiStatus;
    distance: number;
    requires: Capability | null;
    difficulty: number | null;
    difficultyKnown: boolean;
    reward: PoiReward;
    infestRadius?: number;
    formation?: string;
    terrain?: string;
    blurb?: string;
    bugs?: { [bugType: string]: number };
    storyId?: string;
    promptText?: string;
    actionLabel?: string;
    resultBehavior?: 'auto' | 'narrate';
}

interface SquadFighting {
    poiId: string;
    battle: Battle;
    fromCoord?: Coord;
    contactMs?: number;
}

/** The player-driven squad (see createSquad in lib/squad.js) */
interface Squad {
    coord: Coord;
    path: Coord[];
    moveProgress: number;
    /** screen-space [dx, dy] the driver last pushed toward */
    facing: [number, number];
    battery: number;
    batteryCapacity: number;
    /** droids consumed from the pool at deploy */
    assignedDroids: number;
    /** replication multiplier snapshotted at deploy */
    multiplier: number;
    /** current roster in effective units */
    squadSize: number;
    cargo: ResourceAmounts;
    equipment: EquipmentCharges;
    droidStats: DroidStats;
    /** per-unit hull */
    droidHp: number[];
    fighting: SquadFighting | null;
}

/** A scout droid (planet.droids) */
interface ScoutDroid {
    coord: Coord | null;
    path: Coord[];
    target: Coord | null;
    moveProgress: number;
    /** [dRow, dCol] the scout last walked toward; equidistant lookouts are picked along it */
    heading: [number, number] | null;
    docked?: boolean;
    docking?: boolean;
    returning?: boolean;
}

interface EncounterPrompt {
    poiId: string;
    phase: 'offer' | 'result';
    result?: any;
}

// ---------------------------------------------------------------------------------------------------------------
// Redux state slices
// ---------------------------------------------------------------------------------------------------------------

interface GameState {
    /** bumped when the save shape changes incompatibly (see lib/save_version.ts); mismatched saves are discarded */
    saveFormatVersion: number;
    gameSpeed: number;
    lastSavedAt: number | null;
    settingsModalOpen: boolean;
    autoSaveEnabled: boolean;
    visibleNavTabs: string[];
    currentNavTab: string;
    showStructureTabs: boolean;
    currentStructureTab: string;
    hoveredPoiId: string | null;
    showTerminal: boolean;
    shuttersOpen: boolean;
    showPlanetStatus: boolean;
    showResourceBar: boolean;
    showResourceRates: boolean;
    showResourceCapacities: boolean;
    showStructuresList: boolean;
    endGameSequenceStarted: boolean;
    rapidlyRecalcEnergy: boolean;
    blockPointerEvents: boolean;
    burnOutside: boolean;
    hideUI: boolean;
    hideCanvas: boolean;
    gameOver: boolean;
}

interface ClockState {
    /** ms */
    elapsedTime: number;
    /** seconds */
    dayLength: number;
}

interface LogState {
    bySequenceId: { [sequenceId: string]: LogEntry };
    visibleSequenceIds: string[];
}

interface TriggersState {
    byId: { [triggerId: string]: { id: string; triggered: boolean } };
}

interface ResourcesState {
    byId: Partial<Record<ResourceId, Resource>>;
    visibleIds: ResourceId[];
}

interface StructuresState {
    byId: Partial<Record<StructureId, Structure>>;
    visibleIds: StructureId[];
}

interface UpgradesState {
    byId: { [upgradeId: string]: Upgrade };
}

interface AbilitiesState {
    byId: { [abilityId: string]: Ability };
    visibleIds: string[];
}

/** TARGETS in redux/modules/star.ts */
type MirrorTarget = 'none' | 'planet';

interface StarState {
    distribution: number[];
    mirrorsOnline: boolean;
    mirrorTarget: MirrorTarget;
    hyperBeamStartedAt: number | null;
}

interface PanelsState {
    openPanelId: string | null;
    authorizationCount: number;
    chassis: {
        unlocked: string[];
        authorized: { [rowId: string]: { optionId: string; authNumber: number } };
        retooling: { rowId: string; optionId: string; remainingMs: number; totalMs: number } | null;
        seenRowIds: string[];
    };
}

/** OVERALL_MAP_STATUS in redux/modules/planet.ts */
type MapStatus = 'unstarted' | 'inProgress' | 'finished';

interface PlanetState {
    map: PlanetMap;
    homeCoord: Coord | null;
    overallStatus: MapStatus;
    rotation: number;
    rotationMode: string;
    droidData: DroidAssignment;
    droids: ScoutDroid[];
    unlockedTerrains: Unlocks;
    haloRadius: number;
    beaconCoord: Coord | null;
    exploreSpeed: number;
    cookedPct: number;
    numExplored: number;
    maxDevelopedLand: number;
    pois: { [poiId: string]: Poi };
    squad: Squad | null;
    prompt: EncounterPrompt | null;
}

interface RootState {
    game: GameState;
    triggers: TriggersState;
    clock: ClockState;
    log: LogState;
    resources: ResourcesState;
    structures: StructuresState;
    upgrades: UpgradesState;
    abilities: AbilitiesState;
    planet: PlanetState;
    star: StarState;
    panels: PanelsState;
}

// Dev-console handles set in redux/store.ts
interface Window {
    solarionStore?: any;
    solarionBattle?: any;
    __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: any;
}
