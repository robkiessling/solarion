/**
 * Catch-up for time the tab spent hidden (the frame loop pauses in a background tab, so on return the whole absence
 * arrives as one frame delta).
 *
 * A short absence is replayed tick by tick with the live code. A long one would take a second of CPU per ten
 * minutes away, so instead it is measured and extrapolated, on the principle that the catch-up may never credit
 * more than a live tab would have:
 *
 *   1. Prelude: replay, with standing orders suspended, until nothing is casting, so the probe sees no ability
 *      activity: no buff skewing the rates, no cast's output masquerading as a rate.
 *   2. Probe: replay PROBE_DAYS game days with the live loop and measure each resource's net change. Every stall,
 *      cooldown and capacity effect is in the number because the live code produced it. A resource that stalled
 *      and still trended over the probe means the pattern is shifting, so it is not extrapolated; probe again (up
 *      to a limit).
 *   3. Jump: the day's pattern repeats while nothing changes who stalls, so apply the measured rates linearly up to
 *      the first boundary: a draining resource nearing its stall zone, a research finishing, or the end of the
 *      absence. Standing orders (autocast) fire inside the jump at the moment they become affordable, each at its
 *      own price.
 *   4. Repeat from 2 (the pattern may have changed at the boundary) while more than a probe and a day remain.
 *   5. Remainder: replay the rest exactly, so the transient state (casts, cooldowns) is live when the player looks.
 *
 * One approximation remains. Wind runs on its own cycle (182 s, see modules/clock.ts), deliberately not a whole
 * number of days so it never falls into step with the sun, so the true period of the economy is their lowest
 * common multiple, 91 days, and a lull that lands on a night can stall a bank the probe saw survive. The probe
 * covers two days to see more of the beat, and jumps take a small haircut on production (JUMP_HAIRCUT) to stay on
 * the conservative side of what it missed.
 *
 * The whole thing is a generator, yielding after every tick, so the frame loop can spread it over frames behind
 * an overlay instead of freezing.
 */
import * as fromResources from "../redux/modules/resources";
import * as fromAbilities from "../redux/modules/abilities";
import * as fromClock from "../redux/modules/clock";
import {RUNNING_COOLDOWN, structuresTick} from "../redux/modules/structures";
import {upgradesTick, upgradesTickSlow} from "../redux/modules/upgrades";
import {panelsTick} from "../redux/modules/panels";
import {getStructureStatistic} from "../redux/reducer";
import {SLOW_TICK_MS, TICK_MS, tickGame} from "./game_tick";
import {setSuppressed as suppressSfx} from "../singletons/audio";
import {mapObject, typedEntries} from "./helpers";
import type {Ability} from "../database/abilities";

export interface StoreLike { dispatch: Dispatch; getState: GetState }

/** A catch-up in progress. The frame loop tops up remainingMs (and totalMs) with real time that passes while it runs. */
export interface CatchUpJob { totalMs: number; remainingMs: number }

export interface CatchUpSummary {
    totalMs: number;
    /** net change per resource over the catch-up */
    deltas: ResourceAmounts;
    probes: number;
    jumps: number;
}

/** Below this, replaying every tick is quick enough that nothing needs approximating */
export const SHORT_ABSENCE_MS = 5 * 60 * 1000;
/** Longest the prelude waits for casts to end (the longest cast is 30 s; this only guards a future longer one) */
const MAX_PRELUDE_MS = 60 * 1000;
/** A jump shorter than this isn't worth its bookkeeping; probe again instead (each probe still spends its days) */
const MIN_JUMP_MS = 1000;
/** Game days a probe replays (see the wind note above) */
const PROBE_DAYS = 2;
/** Fraction of measured production withheld during a jump, covering the wind-day beat the probe can't see */
const JUMP_HAIRCUT = 0.01;
/**
 * A bank below its consumers' demand over this many seconds is in the stall-and-refill stutter: a stalled
 * structure sits out RUNNING_COOLDOWN, during which the bank refills by up to that long of production (which is
 * less than demand, or it wouldn't have stalled), then runs it back down.
 */
const STALL_WINDOW_S = RUNNING_COOLDOWN + 2 * TICK_MS / 1000;
/** A stalled resource whose day-over-day change exceeds this fraction of its daily swing is trending, not settled */
const STALL_TREND_FRACTION = 0.25;
/** Consecutive probes whose pattern was still shifting before the last one is extrapolated anyway (conservatively) */
const MAX_UNSTABLE_PROBES = 6;

export function* catchUp(store: StoreLike, job: CatchUpJob): Generator<void, CatchUpSummary> {
    const {getState} = store;
    const startAmounts = amounts(getState());
    let probes = 0;
    let jumps = 0;

    suppressSfx(true);
    try {
        if (job.totalMs < SHORT_ABSENCE_MS) {
            yield* replayExact(store, job, Infinity);
        }
        else {
            fromAbilities.setAutocastSuspended(true);
            try {
                yield* replayExact(store, job, MAX_PRELUDE_MS, () => !anyCasting(getState()));
            }
            finally {
                fromAbilities.setAutocastSuspended(false);
            }

            const dayMs = fromClock.dayLength(getState().clock) * 1000;
            const probeMs = PROBE_DAYS * dayMs;
            let unstableRun = 0;
            while (job.remainingMs > probeMs + dayMs) {
                probes++;
                fromAbilities.setAutocastSuspended(true);
                let probe: Probe;
                try {
                    probe = yield* probeDays(store, job, probeMs);
                }
                finally {
                    fromAbilities.setAutocastSuspended(false);
                }

                const analysis = analyzeProbe(getState(), probe, probeMs / 1000);
                if (analysis.unstable && ++unstableRun < MAX_UNSTABLE_PROBES) continue;
                unstableRun = 0;

                // Always leave a day for the exact remainder: it finishes any cast the jump started
                const jumpMs = nextBoundaryMs(getState(), analysis, job.remainingMs - dayMs, dayMs);
                if (jumpMs < MIN_JUMP_MS) continue;
                applyJump(store, analysis.rates, jumpMs);
                job.remainingMs -= jumpMs;
                jumps++;
                yield;
            }

            yield* replayExact(store, job, Infinity);
        }
    }
    finally {
        suppressSfx(false);
        fromAbilities.setAutocastSuspended(false);
    }

    const endAmounts = amounts(getState());
    return {
        totalMs: job.totalMs,
        deltas: mapObject(endAmounts, (id, after) => after - (startAmounts[id] ?? 0)),
        probes,
        jumps
    };
}

/** Replays the live loop tick by tick until maxMs of the job is consumed, the job runs out, or stopWhen says so */
function* replayExact(store: StoreLike, job: CatchUpJob, maxMs: number, stopWhen?: () => boolean): Generator<void> {
    let elapsed = 0;
    let sinceSlow = 0;
    while (job.remainingMs > 0 && elapsed < maxMs) {
        if (stopWhen && stopWhen()) break;
        const dt = Math.min(TICK_MS, job.remainingMs, maxMs - elapsed);
        tickGame(store.dispatch, dt);
        job.remainingMs -= dt;
        elapsed += dt;
        sinceSlow += dt;
        if (sinceSlow >= SLOW_TICK_MS) {
            store.dispatch(upgradesTickSlow(SLOW_TICK_MS));
            sinceSlow -= SLOW_TICK_MS;
        }
        yield;
    }
}

function amounts(state: RootState): ResourceAmounts {
    return mapObject(state.resources.byId, (id, resource) => resource.amount);
}

function anyCasting(state: RootState): boolean {
    return Object.values(state.abilities.byId).some(ability => ability.state === 'casting');
}

/** What a probe showed of each resource: where it started and ended, and the lowest it dipped */
interface Probe { start: ResourceAmounts; end: ResourceAmounts; min: ResourceAmounts }

function* probeDays(store: StoreLike, job: CatchUpJob, probeMs: number): Generator<void, Probe> {
    const start = amounts(store.getState());
    const min = { ...start };
    for (const _ of replayExact(store, job, probeMs)) {
        for (const [id, amount] of typedEntries(amounts(store.getState()))) {
            if (amount < (min[id] ?? Infinity)) min[id] = amount;
        }
        yield;
    }
    return { start, end: amounts(store.getState()), min };
}

/** Which of the probe's patterns each resource followed, and whether any was still shifting */
interface ProbeAnalysis {
    /** net per second, with the haircut already taken off production */
    rates: ResourceAmounts;
    /** the amount below which a resource's consumers are in the stall-and-refill stutter */
    stallLine: ResourceAmounts;
    /** never dipped into its stall zone: the pattern is purely time of day */
    free: Partial<Record<ResourceId, boolean>>;
    /** the deepest dip below the day's starting amount (free resources only) */
    drawdown: ResourceAmounts;
    /** some resource stalled and still trended over the day, so tomorrow's stalls differ from today's */
    unstable: boolean;
}

function analyzeProbe(state: RootState, probe: Probe, probeS: number): ProbeAnalysis {
    const stallLine = mapObject(demandPerSecond(state), (id, rate) => rate * STALL_WINDOW_S);
    const analysis: ProbeAnalysis = { rates: {}, stallLine, free: {}, drawdown: {}, unstable: false };

    for (const [id, start] of typedEntries(probe.start)) {
        const end = probe.end[id] ?? 0;
        const min = probe.min[id] ?? 0;
        const line = stallLine[id] ?? 0;
        const rate = (end - start) / probeS;
        analysis.rates[id] = rate > 0 ? rate * (1 - JUMP_HAIRCUT) : rate;

        const stalled = line > 0 && min < line;
        if (!stalled) {
            analysis.free[id] = true;
            analysis.drawdown[id] = start - min;
        }
        else if (Math.abs(end - start) > STALL_TREND_FRACTION * Math.max(start - min, line)) {
            // Filling past its nightly deficit a little more each day, or ran dry partway through: the probe
            // blends patterns. Its rate is kept, for the case where this probe gets extrapolated anyway.
            analysis.unstable = true;
        }
        else {
            // Settled in the stutter, or emptying and refilling the same way each day: that repeats. The measured
            // change is the stutter's phase, not a trend.
            analysis.rates[id] = 0;
        }
    }
    return analysis;
}

/**
 * How far the measured rates can be trusted, in ms, capped at maxMs. A draining free resource is trusted while
 * the coming days' dips stay clear of its stall line; if it is already too close for that, down to the line itself
 * (a stall could then start within a day, and the next probe will show it). A resource in the stutter is
 * skipped: its measured rate is the stutter's. When extrapolating an unstable day anyway, a trending resource
 * bounds the jump at doubling or halving, so the drift gets re-measured. A research finishing changes rates, so
 * it bounds the jump too.
 */
function nextBoundaryMs(state: RootState, analysis: ProbeAnalysis, maxMs: number, dayMs: number): number {
    let jump = maxMs;

    for (const [id, rate] of typedEntries(analysis.rates)) {
        const amount = fromResources.getQuantity(fromResources.getResource(state.resources, id));
        const line = analysis.stallLine[id] ?? 0;
        if (analysis.free[id]) {
            if (rate >= 0) continue;
            const clear = (amount - (analysis.drawdown[id] ?? 0) - line) / -rate * 1000;
            const toLine = (amount - line) / -rate * 1000;
            const bound = clear > 0 ? clear : toLine;
            if (bound > 0) jump = Math.min(jump, bound);
        }
        else if (analysis.unstable && amount > line && rate !== 0) {
            jump = Math.min(jump, Math.max(dayMs, Math.abs(amount / rate) * 1000 * (rate > 0 ? 1 : 0.5)));
        }
    }

    for (const upgrade of Object.values(state.upgrades.byId)) {
        if (upgrade.state === 'researching') {
            jump = Math.min(jump, upgrade.researchTime * 1000 - (upgrade.researchProgress ?? 0));
        }
    }

    return Math.max(jump, 0);
}

/** Gross consumption per resource per second, from every visible structure (whether or not it can afford to run) */
function demandPerSecond(state: RootState): ResourceAmounts {
    const demand: ResourceAmounts = {};
    for (const id of state.structures.visibleIds) {
        const structure = state.structures.byId[id];
        if (!structure) continue;
        for (const [resourceId, rate] of typedEntries(getStructureStatistic(state, structure, 'consumes'))) {
            demand[resourceId] = (demand[resourceId] ?? 0) + rate;
        }
    }
    return demand;
}

/**
 * Applies the measured rates over jumpMs. Abilities are stepped event to event within it: a cast or cooldown
 * ending, or a standing order becoming affordable, is a moment at which the live loop would act, so the jump
 * pauses there and lets abilitiesTick act (start the cast at its current price, finish it, chain into the next).
 * The clock, research and cooldowns take the jump in one lump; those only need to land at the right place.
 */
function applyJump(store: StoreLike, rates: ResourceAmounts, jumpMs: number) {
    const {dispatch, getState} = store;
    let left = jumpMs;
    let ordersFire = true; // cleared if a standing order that reads as due doesn't actually start (e.g. cost rose)
    let guard = 0;
    while (left > 0 && guard++ < 10000) {
        const state = getState();
        const dt = Math.min(left, msToNextAbilityEvent(state, rates, ordersFire));
        applyRates(store, rates, dt);
        const before = getState().abilities;
        dispatch(fromAbilities.abilitiesTick(dt));
        left -= dt;
        // If the step was an affordability wait (nothing was casting or cooling down) and no order started, the
        // wait was miscalculated; stop treating the orders as events rather than looping on it
        if (ordersFire && !Number.isFinite(fromAbilities.msToNextBoundary(before)) && getState().abilities === before) {
            ordersFire = false;
        }
    }

    dispatch(fromClock.clockTick(jumpMs));
    dispatch(structuresTick(jumpMs));
    dispatch(upgradesTick(jumpMs));
    dispatch(panelsTick(jumpMs));
    dispatch(upgradesTickSlow(jumpMs));
}

function applyRates(store: StoreLike, rates: ResourceAmounts, dtMs: number) {
    if (dtMs <= 0) return;
    const state = store.getState();
    const produced: ResourceAmounts = {};
    const consumed: ResourceAmounts = {};
    for (const [id, rate] of typedEntries(rates)) {
        const delta = rate * dtMs / 1000;
        if (delta > 0) {
            produced[id] = delta;
        }
        else if (delta < 0) {
            const amount = fromResources.getQuantity(fromResources.getResource(state.resources, id));
            if (amount > 0) consumed[id] = Math.min(-delta, amount);
        }
    }
    if (Object.keys(produced).length > 0) store.dispatch(fromResources.produce(produced));
    if (Object.keys(consumed).length > 0) store.dispatch(fromResources.consumeUnsafe(consumed));
}

function msToNextAbilityEvent(state: RootState, rates: ResourceAmounts, ordersFire: boolean): number {
    let soonest = fromAbilities.msToNextBoundary(state.abilities);
    if (ordersFire) {
        for (const ability of Object.values(state.abilities.byId)) {
            if (ability.state === 'ready' && ability.autocast && ability.autocastable) {
                soonest = Math.min(soonest, msUntilAffordable(state, ability, rates));
            }
        }
    }
    return soonest;
}

/**
 * ms until the resources climbing at `rates` cover the ability's cost; 0 if they already do, Infinity if never.
 * A wait is padded by a tick so rounding can't leave the bank a hair short.
 */
function msUntilAffordable(state: RootState, ability: Ability, rates: ResourceAmounts): number {
    let wait = 0;
    for (const [id, cost] of typedEntries(fromAbilities.getAbilityCost(ability))) {
        const need = cost - fromResources.getQuantity(fromResources.getResource(state.resources, id));
        if (need <= 0) continue;
        const rate = rates[id] ?? 0;
        if (rate <= 0) return Infinity;
        wait = Math.max(wait, Math.ceil(need / rate * 1000) + TICK_MS);
    }
    return wait;
}
