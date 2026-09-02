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

/** What an upgrade's or ability's effect applies to (see lib/effect.ts) */
type EffectTarget =
    | 'structure'  // the entire structure (all of its variables)
    | 'ability'    // one specific ability (all of its variables)
    | 'misc';      // a one-off, applied by hand wherever it is needed
interface EffectAffects { type: EffectTarget; id?: string }

/** Recursively optional: the shape of a database override merged over a `base` record */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends (...args: any[]) => any ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * Every action the reducers handle: the union of each module's action type (the `XxxAction` exports next to the
 * action constants in redux/modules). Reducers switch on `action.type`, which narrows `action.payload` to that
 * action's shape; dispatch sites are checked against the same shapes.
 */
type GameAction =
    | import('./redux/reducer').RecalculateAction
    | import('./redux/modules/game').GameSliceAction
    | import('./redux/modules/clock').ClockAction
    | import('./redux/modules/log').LogAction
    | import('./redux/modules/triggers').TriggersAction
    | import('./redux/modules/resources').ResourcesAction
    | import('./redux/modules/structures').StructuresAction
    | import('./redux/modules/upgrades').UpgradesAction
    | import('./redux/modules/abilities').AbilitiesAction
    | import('./redux/modules/planet').PlanetAction
    | import('./redux/modules/star').StarAction
    | import('./redux/modules/panels').PanelsAction;

type GetState = () => RootState;
type Thunk<R = void> = (dispatch: Dispatch, getState: GetState) => R;
/**
 * Thunk middleware: dispatching a thunk runs it and returns its result; dispatching an action returns the action.
 * The plain-action signature is what redux's own Store type expects, so the store still satisfies react-redux's Provider.
 */
interface Dispatch {
    <R>(thunk: Thunk<R>): R;
    <A extends GameAction>(action: A): A;
    (action: GameAction | Thunk<unknown>): unknown;
}

// ---------------------------------------------------------------------------------------------------------------
// Structures (database/structures.js)
// ---------------------------------------------------------------------------------------------------------------

/** Whether a structure could afford its last tick's consumption */
type StructureStatus = 'normal' | 'insufficient';
/** Which structure tab a structure is listed under */
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

/** An upgrade's research lifecycle, in order */
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

/** An ability's cast lifecycle (cooldown starts after the cast finishes) */
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

type Calculator<R> = (state: RootState, record: R, variables: Variables) => any;

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

/** Bug unit types: the keys of BUG_TYPES (database/battle.ts). Listed by hand so the table must stay complete. */
type BugType = 'bug' | 'hive';
type UnitType = 'droid' | BugType;

/** Spawn layouts: the keys of FORMATIONS in lib/battle.ts */
type FormationId = keyof typeof import('./lib/battle').FORMATIONS;
/** The formations a nest may declare; squadron and center are droid-side layouts the engine picks itself */
type NestFormation = Exclude<FormationId, 'squadron' | 'center'>;
/** Arena obstacle layouts: the keys of TERRAIN_LAYOUTS in lib/battle.ts */
type TerrainLayoutId = keyof typeof import('./lib/battle').TERRAIN_LAYOUTS;
/** Obstacle art pieces: the keys of TERRAIN_PIECES in database/battle_terrain.ts */
type TerrainPieceId = keyof typeof import('./database/battle_terrain').TERRAIN_PIECES;

interface UnitStats extends DroidStats {
    /** spawner-type bugs only */
    spawns?: BugType;
    spawnEveryMs?: number;
    spawnBatch?: number;
    spawnCap?: number;
}

type BattleSide = 'droid' | 'bug';

interface BattleUnit {
    id: string;
    side: BattleSide;
    type: UnitType;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    cooldownMs: number;
    seed: number;
    wobbleMs: number;
    spawnMs?: number;
    withdrawing?: boolean;
    /** cosmetic strike cue for the renderer: lunge direction and when it started */
    strike?: { dx: number, dy: number, t: number };
}

interface BattleFx { type: 'hit' | 'death' | 'heal' | 'bomb' | 'spawn'; x: number; y: number; t: number }

/** A placed obstacle: `art` names a TERRAIN_PIECES entry (database/battle_terrain.ts) */
interface BattleTerrainPiece { art: TerrainPieceId; col: number; row: number }

type BattlePhase = 'active' | 'withdrawing';

interface Battle {
    phase: BattlePhase;
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
    terrain: { id: TerrainLayoutId; pieces: BattleTerrainPiece[] } | null;
    fx: BattleFx[];
    units: BattleUnit[];
}

// ---------------------------------------------------------------------------------------------------------------
// Planet map (lib/planet_map.js)
// ---------------------------------------------------------------------------------------------------------------

/** TERRAINS[x].key (the debug meridians add `meridian_<n>` keys at runtime; they never reach a save) */
type TerrainKey = 'home' | 'flatland' | 'developing' | 'developed' | 'mountain' | 'ice' | 'acid' | 'water';
/** How much of a tile the player has seen (the keys of STATUSES in lib/planet_map.ts) */
type SectorStatus = 'unknown' | 'exploring' | 'explored';
/** The barrier a gate tile is: a cave rockfall (opened with the drill) or a sealed door (the override module) */
type GateKind = 'cave' | 'door';
/** The three story regions of the map: the home bowl, the mid-world belt, and the far-side antipode */
type Region = 'bowl' | 'belt' | 'antipode';

interface TerrainDef {
    key: TerrainKey;
    display: string;
    variants?: string[];
    variantShare?: number;
    label?: string;
    /** seconds for a droid to cross one tile of this terrain */
    crossTime: number;
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
    /** [row, col]; cached on the sector by map generation so callers iterating a map can address it */
    coord: Coord;
    /** heuristic distance to home (development ordering); Infinity until cacheDistancesToHome runs at generation */
    distanceHome: number;
    /** BFS hop distance to home (exploration ordering); Infinity until cacheDistancesToHome runs at generation */
    graphDistanceHome: number;
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

/** The ground a squad stands on as the driver feels it (see squadZone in lib/squad.ts): hive territory, the powered
 * grid, or the bare terrain. Keys the terrain notes and the map frame's tint. */
type SquadZone = TerrainKey | 'infested' | 'grid';

/** The set of unlocked crossing capabilities, e.g. { drill: true } */
type Unlocks = { [capability: string]: boolean };

/** Options for the scout lookout searches in lib/planet_pathing.ts */
interface LookoutOptions {
    /** "row,col" keys of lookouts other scouts already own */
    claimed?: Set<string>;
    unlocks?: Unlocks;
    /** the scout's current [dRow, dCol] heading, to break ties along it */
    heading?: [number, number] | null;
    /** "row,col" keys of the grid halo; null = unrestricted */
    halo?: Set<string> | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Expeditions (lib/expeditions.js, database/pois.js, lib/squad.js)
// ---------------------------------------------------------------------------------------------------------------

type PoiType =
    | 'cache'      // a supply drop: take it
    | 'nest'       // a hive: stepping on it starts a fight
    | 'storySite'  // a ruin with a log to read
    | 'gate';      // a physical barrier (cave rockfall, sealed door): impassable until opened with its capability
type PoiStatus =
    | 'hidden'     // its tile has not been revealed by scouting yet
    | 'available'  // discovered, not yet resolved
    | 'cleared';   // resolved
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
    formation?: NestFormation;
    terrain?: TerrainLayoutId;
    blurb?: string;
    bugs?: Partial<Record<BugType, number>>;
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
    formation?: NestFormation;
    terrain?: TerrainLayoutId;
    blurb?: string;
    bugs?: Partial<Record<BugType, number>>;
    storyId?: string;
    promptText?: string;
    actionLabel?: string;
    resultBehavior?: 'auto' | 'narrate';
}

/** How a battle ended, reported by advanceBattle (lib/battle.ts) */
interface BattleOverEvent {
    type: 'battleOver';
    result: 'won' | 'wiped' | 'retreated';
    /** droids still standing (plus escapees on a retreat) */
    survivors: number;
    bugsRemaining: number;
    /** the survivors' hulls */
    droidHp: number[];
}
type BattleEvent = BattleOverEvent;

/** What advanceSquad (lib/squad.ts) reports back to the caller; resolved by resolveSquadEvent in redux/modules/planet.ts */
type SquadEvent =
    | (BattleOverEvent & { poiId: string; battle: Battle; fromCoord?: Coord })
    | { type: 'enteredPoi'; poiId: string; fromCoord: Coord }
    | { type: 'enteredZone'; zone: SquadZone }
    | { type: 'onGrid' }
    | { type: 'fieldWiped'; unitsLost: number; multiplier: number; cargoLost: ResourceAmounts };

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

/** Per-structure animation state the base view renders from (animationData in redux/modules/structures.ts) */
type StructureAnimationData = Partial<Record<StructureId, { numBuilt: number, animationTag?: string }>>;

/** Base-view sprite ids: the keys of the animation tables in database/animations.ts */
type DoodadId = keyof typeof import('./database/animations').doodads;
type StructureAnimationId = keyof typeof import('./database/animations').structures;

/** What a nest's battle grid cell / arena obstacle art is stamped from */
interface DisplayCell { char: string; [attribute: string]: any }

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

/**
 * What the encounter popup narrates in its result phase. Fight outcomes carry the roster numbers and the final
 * battle frame; site outcomes (caches, story sites, gates) carry what was found. Display strings are composed at
 * render time so the stored shape stays serializable.
 */
interface EncounterResult {
    wiped?: boolean;
    losses?: number;
    squadSize?: number;
    multiplier?: number;
    landCredit?: number;
    cargoLost?: ResourceAmounts | null;
    finalBattle?: Battle;
    storyId?: string | null;
    capability?: Capability | null;
    loaded?: ResourceAmounts | null;
}

interface EncounterPrompt {
    poiId: string;
    phase: 'offer' | 'result';
    result?: EncounterResult | null;
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
    /** set by the ending cutscene (not in the initial state) */
    fadeToBlack?: boolean;
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

/** Where the probe swarm's mirrors aim their beam */
type MirrorTarget = 'none' | 'planet';

interface StarState {
    /** the probe swarm's [angle, radius] pairs (see generateRandomProbeDist in lib/star.ts) */
    distribution: import('./lib/star').ProbeDistribution;
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

/** planet.overallStatus: the state of scout exploration of the map */
type MapStatus = 'unstarted' | 'inProgress' | 'finished';
/** Who drives the planet rotation */
type RotationMode =
    | 'manual'  // the longitude slider
    | 'sun'     // the camera locks to the day side
    | 'squad';  // the camera follows the expedition team (or centers home base when no team is deployed)

interface PlanetState {
    map: PlanetMap;
    homeCoord: Coord | null;
    overallStatus: MapStatus;
    rotation: number;
    rotationMode: RotationMode;
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
