/**
 * Squad equipment manifest: battle gear the squad carries automatically once acquired. Each piece is a
 * ONE-TIME acquisition (its droid-factory upgrade, `upgradeId`; story salvage can researchForFree it
 * later), never a recurring purchase -- one-time costs coexist with the exponential economy the way
 * structures and upgrades already do. In the field each piece holds `charges` uses; charges spend in
 * battle and reload when the squad touches the powered grid (everyone heals at home, gear reloads at
 * home). WHAT each piece does mechanically lives in the `effect` block (interpreted by lib/battle.ts).
 */

import type {UpgradeId} from "./upgrades";

export type EquipmentEffect =
    { kind: 'aoe'; damage: number; radius: number } |
    { kind: 'heal'; amount: number } |
    { kind: 'overcharge'; durationMs: number; rateMultiplier: number };

export interface EquipmentDef {
    name: string;
    description: string;
    upgradeId: UpgradeId;
    charges: number;
    effect: EquipmentEffect;
}

/** { itemId: chargesLeft } */
export type EquipmentCharges = Partial<Record<EquipmentId, number>>;

export const EQUIPMENT_DEFS = {
    demoCharge: {
        name: 'Demo Launcher',
        description: 'Lobs a demolition charge onto the densest knot of hostiles.',
        upgradeId: 'droidFactory_demoLauncher',
        charges: 1,
        effect: { kind: 'aoe', damage: 6, radius: 10 }
    },
    repairKit: {
        name: 'Repair Rig',
        description: 'Field-patches every damaged droid. Does not rebuild the destroyed.',
        upgradeId: 'droidFactory_repairRig',
        charges: 1,
        effect: { kind: 'heal', amount: 3 }
    },
    overchargeCell: {
        name: 'Overcharge Cell',
        description: 'Overdrives droid weapons for a short burst.',
        upgradeId: 'droidFactory_overchargeCell',
        charges: 1,
        effect: { kind: 'overcharge', durationMs: 6000, rateMultiplier: 2 }
    }
} satisfies Record<string, EquipmentDef>;

/** The equipment ids: the keys of the manifest above */
export type EquipmentId = keyof typeof EQUIPMENT_DEFS;

// Display/hotkey order (mid-fight buttons are 1..N in this order)
export const EQUIPMENT_ORDER: EquipmentId[] = ['demoCharge', 'repairKit', 'overchargeCell'];
