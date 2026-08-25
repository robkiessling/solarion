import system from './system';
import story from './story';
import cutscenes from './cutscenes';

// Merged log database. Entries are keyed by id; ids are stored in saves, so renaming or removing one
// is a save migration concern (see lib/save_migration.js, which drops orphaned ids).
//
// Line format (see log_section.jsx for rendering): each entry's `text` is an array of lines, where a
// line is either the legacy tuple [text, delayAfterMs, flash] or an options object:
//   { text, delay, flash, className, style, mode: 'chars', charDelay }
// `mode: 'chars'` types the line out character by character. Text may contain {placeholders} filled
// from the vars passed to startLogSequence(id, vars); vars are stored on the log entry at dispatch
// time so backfilled history re-renders exactly what was originally printed.
//
// onFinish side effects run once, when the last line lands. Keep side effects at sequence end only:
// a sequence interrupted by a reload replays from scratch, and end-only effects are what makes that
// replay safe (nothing half-applied).
export default {
    ...system,
    ...story,
    ...cutscenes
};
