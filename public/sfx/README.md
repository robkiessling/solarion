Sound effect files served as static assets at `sfx/<path>` (Vite copies `public/` to the site root untouched).
Files keep their original names under a `<source>/<pack>/` folder so it's easy to tell where each came from.
Register each file in the CLIPS table in `src/singletons/audio.ts`. Keep files small (OGG or MP3, not WAV).

Sources: Kenney.nl packs are CC0 (no attribution required).
