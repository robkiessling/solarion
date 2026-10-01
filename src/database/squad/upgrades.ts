/**
 * The squad's upgrades: spread into the main upgrade table (database/base/upgrades.ts), so they research,
 * save and trigger like any other upgrade; `squad: true` puts them on the Expedition panel's Outfitting
 * section instead of a structure card. Ids keep the droidFactory_ prefix (saves and equipment.ts reference
 * them).
 *
 * Card text is short and mechanical: the number, then the stat row it moves, spelled as the Expedition panel
 * spells it (Droid Health, Droid Damage, Battery), so the player can see which row changes.
 */
import {upgrade, type UpgradeRecord} from "../base/upgrade_record";
import {EQUIPMENT_DEFS, type EquipmentId} from "./equipment";

// An equipment upgrade's card text: the manifest's own line for the piece (the battle popup shows the same one,
// so the two can't drift) and where it recharges (a wording that holds for one charge or several). "Base" covers every powered tile: sites and replicated land are
// copies of the base, and it is the word the terminal already uses for coming home. No charge count: how many
// charges a piece holds is meant to grow with play, so the count is shown live where the piece is listed (its
// dots, its tooltip), never frozen into text.
// `itemId` is an EquipmentId, but naming it in the signature would make the tables' types circular (the manifest's
// `upgradeId` is typed by this table's keys); a wrong id fails here as the module loads.
function equipmentDescription(itemId: string): string {
    return `${EQUIPMENT_DEFS[itemId as EquipmentId].description} Recharges at base.`;
}

export const SQUAD_UPGRADES = {
    // Squad equipment: one-time acquisitions (see database/squad/equipment.ts). Researching one permanently
    // outfits every future squad with the piece; its charges spend in battle and reload on the grid.
    // Each is FOUND, not bought: the prize for beating a particular place (a reward's `grants` in
    // database/planet/pois.ts), researched free on the spot, so it has no cost and never shows as a row. To sell a
    // piece instead, reward it with `offers` and give it a cost here.
    // No discoverWhen anywhere in this table: a squad upgrade only ever arrives as a prize.
    // `squad: true` (here and on everything below) instead of a `structure`: these only
    // affect expeditions, so they're offered in the Expedition panel's Outfitting section, not on any
    // structure's card. (Ids keep the droidFactory_ prefix; saves and equipment.ts reference them.)
    droidFactory_demoLauncher: upgrade({
        squad: true,
        name: "Demo Launcher",
        description: equipmentDescription('demoCharge'),
        affects: {
            type: 'misc'
        },
    }),
    droidFactory_repairRig: upgrade({
        squad: true,
        name: "Repair Rig",
        description: equipmentDescription('repairKit'),
        affects: {
            type: 'misc'
        },
    }),
    droidFactory_overchargeCell: upgrade({
        squad: true,
        name: "Overcharge Cell",
        description: equipmentDescription('overchargeCell'),
        affects: {
            type: 'misc'
        },
    }),

    // Droid combat upgrades: 'misc' effects on the expedition droids' unit stats
    // (hp/damage/attackMs/speed), applied by getDroidStats in redux/reducer.ts and snapshotted onto the
    // squad at deploy. Refits apply to the next deployment, not squads already in the field (the card text
    // doesn't say so: Outfitting is only on screen while no squad is out).
    // These are BOUGHT: beating a place puts the row on offer (a reward's `offers`), at the cost here.
    droidFactory_reinforcedPlating: upgrade({
        squad: true,
        name: "Reinforced Plating",
        description: '+3 Droid Health.',
        cost: {
            ore: 3000,
            refinedMinerals: 600
        },
        affects: {
            type: 'misc'
        },
        effect: {
            hp: { add: 3 }
        }
    }),
    droidFactory_weaponCalibration: upgrade({
        squad: true,
        name: "Weapon Calibration",
        description: '+50% Droid Damage.',
        cost: {
            ore: 6000,
            refinedMinerals: 1500
        },
        affects: {
            type: 'misc'
        },
        effect: {
            damage: { multiply: 1.5 }
        }
    }),
    // Squad battery upgrade: applied by getBatteryCapacity in redux/reducer.ts (squad-level, not per-droid)
    // and snapshotted at deploy like the combat stats above.
    droidFactory_extendedCells: upgrade({
        squad: true,
        name: "Extended Cells",
        description: '+25 Battery (25 more tiles off the grid).',
        cost: {
            ore: 5000,
            refinedMinerals: 1000
        },
        affects: {
            type: 'misc'
        },
        effect: {
            batteryCapacity: { add: 25 }
        }
    }),
    // Where the squad can drive: its research grants the capability the shallows require (the callback in
    // database/base/upgrades.ts). Found like the equipment above (a reward's `grants`), so no cost.
    droidFactory_amphibiousTracks: upgrade({
        squad: true,
        name: "Amphibious Tracks",
        description: 'Sealed drivetrain and flotation skirts. The squad drives through shallows it could not cross before.',
        affects: {
            type: 'misc'
        },
    }),

    // The two droid revisions recovered from the cape archive: the sides of the one permanent either/or asked in
    // Outfitting (capeArchive in database/base/decisions.ts). Never discovered on their own: the decision starts the
    // chosen one and the other stays hidden for good. Free and instant, since the choice is the cost. Applied like
    // the upgrades above (getDroidStats / getBatteryCapacity in redux/reducer.ts).
    droidFactory_cutterRevision: upgrade({
        squad: true,
        name: "Cutter Revision",
        description: '+20% Droid Damage.',
        affects: {
            type: 'misc'
        },
        effect: {
            damage: { multiply: 1.2 }
        }
    }),
    droidFactory_cellRevision: upgrade({
        squad: true,
        name: "Cell Revision",
        description: '+20% Battery.',
        affects: {
            type: 'misc'
        },
        effect: {
            batteryCapacity: { multiply: 1.2 }
        }
    }),
} satisfies Record<string, UpgradeRecord>;
