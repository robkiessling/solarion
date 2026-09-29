# Minochar drawings

These drawings are the source of truth for the world map and the battle terrain. Edit them in minochar, then
run `npm run import:art` (or leave `npm run watch:art` running). Never edit the generated files.

Which drawing goes where is the `IMPORTS` table in `scripts/import_art.mjs`. A drawing the table does not
name is ignored.

Status: the world map and the battle pieces import. Full drawings, the `markers` layer and the `decor` layer
are planned, not built yet.

To see a terrain as the game will lay it out, without playing to it:

    npm run preview:terrain -- ruins          (the smallest arena)
    npm run preview:terrain -- ruins 800 12   (an 800-unit fight, at another site)

Which pieces a terrain scatters is a record in `src/database/battle/terrains.ts`.

## Files

| Drawing | Canvas | Holds |
|---|---|---|
| `planet/map.minochar` | 120×30 | The world map |
| `battle/pieces.minochar` | any | Pieces, one per frame (trimmed of empty rows and columns) |
| a drawing (planned) | its own | One whole battlefield, drawn for the fight it expects |

A drawing's canvas is its arena, at any army size: 50×19 suits a fight of about 320 (both sides together),
79×30 about 800, 125×47 about 2000. An army too big for it is scaled down to fit (each unit on the field
stands for several).

## Layers

| Layer | Drawn in game | Blocks | Holds |
|---|---|---|---|
| `names` | no | no | The frame's name, typed in the top-left |
| (any other name) | yes | yes | The art: every character blocks one cell |
| `decor` | yes | no | Floors, paths, texture |
| `markers` | no | no | Spawn points (see below) |

Only `names` and the art layer are required. Hidden layers are left out, except that the reserved layers are
read whether they show or not.

## Frame names

- One word, camelCase (`boulderBig`).
- A frame with no name continues the name before it, so a run of frames is one piece with several looks.
- A repeated name joins the same piece, wherever the frame sits.
- A frame with no art is skipped.

## Markers

| Marker | Meaning |
|---|---|
| `0` | The squad starts here (fields only). Without it: the left edge. |
| `1` to `9` | Hostile spawn point. Lower numbers come into use first, as the garrison grows; points sharing a number open together. |
| `S` | Source: a fixed unit that produces others stands here |
| `P` | Post: a fixed unit that attacks stands here |

Markers position units, they never add them: the counts come from the level in `src/database/planet/pois.ts`.
Extra units without a marker join the main body; extra markers are ignored. A drawing with no numbered points
falls back to the level's preset.

## Drawing rules

- The view is from above. A cell is about one body wide, and taller than it is wide (a square room is about
  8 characters across for every 5 down).
- Gaps a unit should pass through: at least 2 cells wide, 2 rows tall.
- Walls: 2 cells thick.
- Nothing fully sealed: every open area needs a way in.
- The import closes what no body could use and says so: open cells walled in on every side (the inside of a
  boulder) and gaps one cell wide. They stay undrawn but block like the art around them.
- A typed space is a character (it hides the layers under it); an empty cell is transparent.
