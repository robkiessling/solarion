import {FIELD_EVENT_TEXTS} from "./field_events";

// Story text lives here (not in the log database) because reports are dynamic; POIs store the key only.
// Field event narration (FIELD_EVENT_TEXTS, database/planet/field_events.ts) is folded in so one key space
// covers every popup. PLACEHOLDER texts: the real ~12-log mystery is authored in the content pass.
export type StoryId = keyof typeof STORY_TEXTS;
export const STORY_TEXTS = {
    ...FIELD_EVENT_TEXTS,
    r1_deadDroid: 'A droid chassis, half-buried. The model number matches your own manufacturing line. You did not build it.',
    r2_scorchedCore: 'A collapsed structure of familiar design. Its data core is scorched from the inside.',
    r2_wreckage: 'Wreckage strewn across a kilometer. The blast patterns came from above. Something attacked them.',
    r2_overrideVault: 'A command vault. Inside, an override module -- its authorization codes are older than your directive.',
    r3_commandRuin: 'The ruined command center of the first swarm. The final log is intact.',
    r3_hiveHeart: 'A vast organic chamber, pulsing faintly. The hive is not from this planet either.'
}
