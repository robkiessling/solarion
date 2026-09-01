// Bump when the saved state's shape changes in a way migrateSavedState can't repair (e.g. the switch from numeric
// to string enums). A save whose game.saveFormatVersion doesn't match is discarded and the game starts fresh.
// Kept in its own import-free module so the game slice can read it without pulling in the migration code.
export const SAVE_FORMAT_VERSION = 2;
