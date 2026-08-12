/**
 * Consumable item manifest: the battle-usable items a squad can carry in its pouch. WHAT each item does
 * mechanically lives in the `effect` block (interpreted by lib/battle.js); everything else is presentation
 * data for the deploy picker, the mid-fight action row, and the droid factory craft buttons. Item ids double
 * as resource ids (stock at base is tracked by the ordinary resource system).
 */

export const CONSUMABLE_DEFS = {
    demoCharge: {
        name: 'Demo Charge',
        description: 'Detonates over the densest knot of hostiles.',
        effect: { kind: 'aoe', damage: 6, radius: 10 }
    },
    repairKit: {
        name: 'Repair Kit',
        description: 'Field-patches every damaged droid. Does not rebuild the destroyed.',
        effect: { kind: 'heal', amount: 3 }
    },
    overchargeCell: {
        name: 'Overcharge Cell',
        description: 'Overdrives droid weapons for a short burst.',
        effect: { kind: 'overcharge', durationMs: 6000, rateMultiplier: 2 }
    }
};

// Display/hotkey order (mid-fight buttons are 1..N in this order)
export const CONSUMABLE_ORDER = ['demoCharge', 'repairKit', 'overchargeCell'];
