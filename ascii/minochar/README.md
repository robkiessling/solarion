# Minochar drawings

These drawings are the source of truth for the world map and the battle terrain. Edit them in minochar, then
run `npm run import:art` (or leave `npm run watch:art` running). Never edit the generated files.

Which drawing goes where is the `IMPORTS` table in `scripts/import_art.mjs`. A drawing the table does not
name is ignored.

Everything here imports: the world map, the battle pieces and the battlefields drawn whole, markers included.

To see a terrain as the game will lay it out, without playing to it:

    npm run preview:terrain -- ruins                  (the smallest arena)
    npm run preview:terrain -- ruins 800 12           (an 800-unit fight, at another site)
    npm run preview:terrain -- ruins 100 1 groups     (with a fight's opening on it: who starts where)
    npm run preview:terrain -- open 60 1 surround loose

Which pieces a terrain scatters is a record in `src/database/battle/terrains.ts`.

## Files

| Drawing | Canvas | Holds |
|---|---|---|
| `planet/map.minochar` | 120×30 | The world map |
| `battle/pieces.minochar` | any | Pieces, one per frame (trimmed of empty rows and columns) |
| any other file in `battle/` | its own | Whole battlefields, one per frame, all the size of the canvas |

A battlefield's name is its terrain: a level fights on it by naming it (`terrain: 'compound1a'` in
`src/database/planet/pois.ts`). Its canvas is its arena, at any army size: 50×19 suits a fight of about 320
(both sides together), 79×30 about 800, 125×47 about 2000. The import prints what each one has room for
(the open ground the squad can reach, a unit to three cells); an army too big for it is scaled down to fit
(each unit on the field stands for several). Frames that share a name are looks of one battlefield, picked
between by site.

## Layers

| Layer | Drawn in game | Blocks | Holds |
|---|---|---|---|
| `names` | no | no | The frame's name, typed in the top-left |
| (any other name) | yes | yes | The art: every character blocks one cell |
| `markers` | no | no | Spawn points (see below) |

Only `names` and the art layer are required. Hidden layers are left out, except that the reserved layers are
read whether they show or not. The names `decor` and `low` are set aside for later (art that does not block,
art that blocks bodies but not shots): a layer called either is ignored for now.

## Frame names

- One word, camelCase (`boulderBig`).
- A frame with no name continues the name before it, so a run of frames is one piece with several looks.
- A repeated name joins the same piece, wherever the frame sits.
- A frame with no art is skipped.

## Markers

| Marker | Meaning |
|---|---|
| `0` | The squad starts here (drawings only, never a piece). Without it: the left edge. |
| `1` to `9` | Hostile spawn point. Lower numbers come into use first, as the garrison grows (about 40 to a point); points sharing a number open together. |
| `P` | Post: a fixed unit that attacks stands here (optional) |

Markers go in drawings and in pieces alike; a piece's markers travel with it to wherever it is placed.

Each spawn point gets a group, which arranges itself: a fixed unit that produces others takes the centre (so
to put one somewhere, put a numbered point there), the rest ring around it, and posts stand on the edge facing
the squad unless `P` markers say where. A level sets how close the group stands: `tight` (the default) or
`loose`.

Markers position units, they never add them: the counts come from the level in `src/database/planet/pois.ts`.
Extra units without a marker join the main body; extra markers are ignored.

The level's `formation` says who decides the opening:

| `formation` | Hostiles start | The squad starts |
|---|---|---|
| `terrain` (or left out) | On the terrain's numbered points; as `front` if it marks none | On the terrain's `0`; at the left edge if it has none |
| `front` | In groups down the hostile side | At the left edge |
| `groups` | In groups spread over the hostile half | At the left edge |
| `surround` | In the corners of the whole field | In the middle |

Naming `front`, `groups` or `surround` overrules the terrain's numbered points and its `0` (never its `P`
marks). A camp or an ambush opens `surround` unless its level names another.

## Drawing rules

- The view is from above. A cell is about one body wide, and taller than it is wide (a square room is about
  8 characters across for every 5 down).
- Gaps a unit should pass through: at least 2 cells wide, 2 rows tall.
- Walls: 2 cells thick.
- Nothing fully sealed: every open area needs a way in.
- The import closes what no body could use and says so: open cells walled in on every side (the inside of a
  boulder) and gaps one cell wide. They stay undrawn but block like the art around them. On a battlefield,
  "walled in" is whatever the squad cannot walk to from where it starts, and a marker there is an error.
- A typed space is a character (it hides the layers under it); an empty cell is transparent.
