/**
 * The squad's upgrades: spread into the main upgrade table (database/base/upgrades.ts), so they research,
 * save and trigger like any other upgrade; `squad: true` puts them on the Expedition panel's Outfitting
 * section instead of a structure card. Ids keep the droidFactory_ prefix (saves and equipment.ts reference
 * them).
 */
import {upgrade, type UpgradeRecord} from "../base/upgrade_record";

export const SQUAD_UPGRADES = {
    // Squad equipment: one-time acquisitions (see database/squad/equipment.ts). Researching one permanently
    // outfits every future squad with the piece; its charges spend in battle and reload on the grid.
    // Story salvage can grant these later by researchForFree-ing the same ids.
    // No discoverWhen on the first tier: each is discovered by the planet-tab trigger that matches the moment the
    // player first wants it (battery half spent, settlement sighted, first fight over; see database/triggers.ts).
    // `squad: true` (here and on the combat/battery upgrades below) instead of a `structure`: these only
    // affect expeditions, so they're offered in the Expedition panel's Outfitting section, not on any
    // structure's card. (Ids keep the droidFactory_ prefix; saves and equipment.ts reference them.)
    droidFactory_demoLauncher: upgrade({
        squad: true,
        name: "Demo Launcher",
        description: 'Squad equipment: lobs a demolition charge onto the densest knot of hostiles. ' +
            'One shot per grid visit; reloads on powered ground.',
        cost: {
            ore: 4000,
            refinedMinerals: 800
        },
        affects: {
            type: 'misc'
        },
    }),
    droidFactory_repairRig: upgrade({
        squad: true,
        name: "Repair Rig",
        description: 'Squad equipment: field-patches every damaged droid (does not rebuild the destroyed). ' +
            'One use per grid visit; reloads on powered ground.',
        cost: {
            ore: 2500,
            refinedMinerals: 500
        },
        affects: {
            type: 'misc'
        },
    }),
    droidFactory_overchargeCell: upgrade({
        squad: true,
        name: "Overcharge Cell",
        description: 'Squad equipment: overdrives droid weapons for a short burst. ' +
            'One discharge per grid visit; recharges on powered ground.',
        cost: {
            ore: 3000,
            refinedMinerals: 600
        },
        affects: {
            type: 'misc'
        },
    }),

    // Droid combat upgrades: 'misc' effects on the expedition droids' unit stats
    // (hp/damage/attackMs/speed), applied by getDroidStats in redux/reducer.ts and snapshotted onto the
    // squad at deploy. Refits apply to the next deployment, not squads already in the field.
    droidFactory_reinforcedPlating: upgrade({
        squad: true,
        name: "Reinforced Plating",
        description: 'Thicker hull plating for expedition droids: +3 max health each. Refits apply to the next deployed squad.',
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
        description: 'Recalibrated arc cutters: expedition droids hit 50% harder. Refits apply to the next deployed squad.',
        discoverWhen: {
            upgrades: ['droidFactory_reinforcedPlating'],
            resources: {
                refinedMinerals: 1000
            }
        },
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
        description: 'Higher-density battery cells for the expedition squad: +50 battery capacity. ' +
            'Refits apply to the next deployed squad.',
        cost: {
            ore: 5000,
            refinedMinerals: 1000
        },
        affects: {
            type: 'misc'
        },
        effect: {
            batteryCapacity: { add: 50 }
        }
    }),
} satisfies Record<string, UpgradeRecord>;
