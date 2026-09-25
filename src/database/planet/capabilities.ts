/**
 * Capabilities: the tools the squad can own. Each is permanent once held. Stored as planet.capabilities (a set), read
 * by one gate: a terrain's `requires` (database/planet/terrain.ts) makes the ground impassable until the tool is
 * held. Granted by a base upgrade (its onFinish dispatches grantCapability) or by salvage at a POI (reward.capability).
 * A blocked SITE is never a capability gate: it carries a seal (SealDef in database/planet/poi_types.ts) that squad
 * equipment clears.
 */
export type Capability = 'overrideModule' | 'amphibious';

export type Capabilities = Partial<Record<Capability, true>>;

export const CAPABILITY_LABELS: Record<Capability, string> = {
    overrideModule: 'Override Module',
    amphibious: 'Amphibious Tracks'
};
