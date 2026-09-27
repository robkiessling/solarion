// Bump when the saved state's shape changes in a way migrateSavedState can't repair (e.g. the switch from numeric
// to string enums). A save whose game.saveFormatVersion doesn't match is discarded and the game starts fresh.
// Kept in its own import-free module so the game slice can read it without pulling in the migration code.
export const SAVE_FORMAT_VERSION = 9; // 9: replication opens through per-site command-center copies (the firstSiteSecured trigger is gone); 8: network sites are their own POI type; 7: an ambush POI carries `zones` (it relocates after a failed contact); 6: a POI's capability `requires` became an equipment-cleared `seal`
