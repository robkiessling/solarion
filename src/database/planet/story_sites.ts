// Story text lives here (not in the log database) because reports are dynamic; POIs store the key only, so
// the prose can be revised without touching saved maps, and the mystery reads as one sequence. Field event
// narration is a one-off line per answer and sits inline on the choice (database/planet/pois.ts).
// PLACEHOLDER texts: the real ~12-log mystery is authored in the content pass.
export type StoryId = keyof typeof STORY_TEXTS;
export const STORY_TEXTS = {
    deadDroid: 'A droid chassis, half-buried. The model number matches your own manufacturing line. You did not build it.',
    scorchedCore: 'A collapsed structure of familiar design. Its data core is scorched from the inside.',
    wreckage: 'Wreckage strewn across a kilometer. The blast patterns came from above. Something attacked them.',
    overrideVault: 'A command vault. Inside, an override module -- its authorization codes are older than your directive.',
    commandRuin: 'The ruined command center of the first swarm. The final log is intact.',
    hiveHeart: 'A vast organic chamber, pulsing faintly. The hive is not from this planet either.'
}
