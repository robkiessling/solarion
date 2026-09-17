import system from './system';
import story from './story';
import cutscenes from './cutscenes';
import type {SfxName} from '../../singletons/audio';

/** [text, delayAfterMs, flash?] */
export type LogLineTuple = [string, number, boolean?];

export interface LogLineOptions {
    /** the line's final text; may contain {placeholders} */
    text: string;
    /** ms to pause after this line finishes, before the next line prints */
    delay?: number;
    /** briefly highlight the line when it lands; a flashed line also plays the logFlash sound unless `sound` says otherwise */
    flash?: boolean;
    /**
     * A clip from the sound table (singletons/audio.ts) played when the line lands. Defaults to logFlash for a
     * flashed line and nothing otherwise; false makes a flashed line silent.
     */
    sound?: SfxName | false;
    /** CSS class for the line's <p> */
    className?: string;
    /** inline CSS properties for the line's <p> */
    style?: { [property: string]: string | number };
    /** 'chars' types the line out character by character; 'frames' cycles through `frames` before settling on `text` */
    mode?: 'chars' | 'frames';
    /** ms between characters in 'chars' mode (default 30) */
    charDelay?: number;
    /** intermediate states shown in order in 'frames' mode; the line then rests on `text` */
    frames?: string[];
    /** ms between one frame and the next in 'frames' mode (default 200) */
    frameDelay?: number;
}

export type LogLine = LogLineTuple | LogLineOptions;

export interface LogRecord {
    text: LogLine[];
    /** runs once, when the last line lands */
    onFinish?: (dispatch: Dispatch) => void;
}

// Merged log database. Entries are keyed by id. Printed lines are saved as text, so renaming an entry only
// affects saves with that sequence still queued (lib/save_migration.ts drops orphaned queue entries).
//
// Line format (see components/log.jsx for playback): each entry's `text` is an array of lines, where a
// line is either the legacy tuple [text, delayAfterMs, flash] or an options object:
//   { text, delay, flash, sound, className, style, mode: 'chars', charDelay }
// `mode: 'chars'` types the line out character by character. `mode: 'frames'` shows each string in `frames`
// in turn (frameDelay ms apart), then replaces the line with `text`; history shows `text` only.
// progressBar() in helpers.ts builds a frames line for a simple [XXXX  ] fill. Text may contain {placeholders}
// filled from the vars passed to startLogSequence(id, vars) as each line prints.
//
// onFinish side effects run once, when the last line lands. Keep side effects at sequence end only:
// a sequence interrupted by a reload resumes from the line it reached, and end-only effects are what
// makes that safe (nothing half-applied).
const database = {
    ...system,
    ...story,
    ...cutscenes
} satisfies Record<string, LogRecord>;

export type LogId = keyof typeof database;
export default database;
