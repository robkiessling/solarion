import React from 'react';
import {connect} from "react-redux";
import AsciiCanvas from "../lib/ascii_canvas";
import {TERRAINS, STATUSES, generateImage, coordToImageCell, imageCellToCoord, isDisplayCellVisible} from "../lib/planet_map";
import {NUM_PLANET_ROWS, DISPLAY_COLS} from "../lib/planet_geometry";
import {drawPlanetImage, PLANET_COLORS} from "../lib/planet_render";
import {
    FIGHT_EFFECT_CHARS,
    POI_COLOR_KEYS,
    POI_GLYPHS,
    POI_LABELS,
    POI_STATUS,
    SQUAD_GLYPH,
    SQUAD_STATUS
} from "../lib/expeditions";
import {stepInDirection, sortieCrossMs, SORTIE_GLYPH} from "../lib/sortie";
import {sortieMoveTo, sortieStep} from "../redux/modules/planet";
import {findPath} from "../lib/planet_pathing";

const PATH_ANTS_STEP_MS = 180; // marching-ants crawl speed for the hovered-path highlight
const PATH_ANTS_SPACING = 6;  // 1 bright tile every N path tiles (higher = sparser ants)
const POI_PING_PERIOD_MS = 1200; // one full expand-and-fade cycle of the hovered marker's radar ping
const SQUAD_PING_PERIOD_MS = 2200; // slower, subtler locator pulse on the deployed squad
const DROID_GLYPH = '♦'; // a scout; small filled diamond pairs with the squad's big hollow '◊' (droids are diamonds)
                         // and can't be confused with '·' unknown
const SHOW_DROID_STACK_COUNTS = false; // when true, tiles with 2+ scouts show the count (2-9, '+') instead of the glyph
const SCOUT_PULSE_PERIOD_MS = 1800; // scouts breathe between dim and full brightness, phase-offset per tile
import {PLANET_FPS} from "../singletons/game_clock";
import * as fromClock from "../redux/modules/clock";

const CHAR_RATIO = 0.5; // cell width/height; must match the AsciiCanvas charRatio below

// Sortie driving input: screen-space direction vectors per key (y points down). On the uniform grid these
// map 1:1 onto coordinate steps (see stepInDirection), so movement is identical at any latitude/rotation.
const KEY_DIRS = {
    ArrowUp: [0, -1], w: [0, -1],
    ArrowDown: [0, 1], s: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0]
};
const BUMP_MS = 150;        // rejected-step nudge duration
const BUMP_AMPLITUDE = 0.3; // nudge distance, in cell units
const WALL_FLASH_MS = 300;  // how long the blocking tile stays highlighted after a bump

class Planet extends React.Component {
    constructor(props) {
        super(props);

        this.canvasContainer = React.createRef();
        this.canvas = React.createRef();

        this.waitTimeMs = 1000.0 / PLANET_FPS; // how long to wait between rendering

        // Sortie driving state (input-layer only, so it lives on the component, not in redux):
        this.heldKeys = [];      // pressed movement keys in press order; last one is the active direction
        this.bufferedDir = null; // a tap mid-slide queues one turn, executed on arrival
        this.bump = null;        // rejected-step feedback: { dx, dy, target, at }

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
    }

    componentDidMount() {
        this.canvasManager = new AsciiCanvas(
            this.canvasContainer.current, this.canvas.current, NUM_PLANET_ROWS, DISPLAY_COLS, null,

            // charRatio roughly matches DOM rendering with 1.2 line-height
            { fillContainer: true, charRatio: CHAR_RATIO, padding: 64 }
        );
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        this.drawPlanet();
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
    }

    // todo move this to base class. also throw warning if props.elapsedTime undefined
    shouldComponentUpdate(nextProps, nextState) {
        if (this.props.visible !== nextProps.visible) {
            return true;
        }

        if (!this.props.visible) {
            return false;
        }

        if (this.lastRenderAt && this.lastRenderAt > (nextProps.elapsedTime - this.waitTimeMs)) {
            return false;
        }

        this.lastRenderAt = nextProps.elapsedTime;
        return true;
    }

    componentDidUpdate(prevProps, prevState) {
        this.maybeContinueMovement(prevProps);
        this.drawPlanet();
    }

    /**
     * --- Sortie driving (prototype) ---
     * Tile-walker input model: a step starts instantly and takes crossTime to complete; a held key re-steps on
     * every arrival (own keydown/keyup tracking, not OS keyrepeat); a tap mid-slide buffers one turn; a blocked
     * step bumps in place and flashes the wall. Click-to-move routes via the same executor.
     */

    handleKeyDown(event) {
        const dir = KEY_DIRS[event.key];
        if (!dir || !this.props.visible || !this.props.sortie) return;
        event.preventDefault();
        if (event.repeat) return; // we do our own repeat (re-step on arrival), OS keyrepeat only jitters it

        this.heldKeys = this.heldKeys.filter(held => held.key !== event.key).concat({ key: event.key, dir });

        if (this.props.sortie.path.length > 0) {
            this.bufferedDir = dir; // mid-slide: queue the turn for arrival
        }
        else {
            this.tryStep(dir);
        }
    }

    handleKeyUp(event) {
        this.heldKeys = this.heldKeys.filter(held => held.key !== event.key);
    }

    // On arrival (path just emptied), continue: a buffered tap wins once, then any still-held key takes over.
    maybeContinueMovement(prevProps) {
        const sortie = this.props.sortie;
        if (!sortie || sortie.path.length > 0) return;
        if (!prevProps.sortie || prevProps.sortie.path.length === 0) return; // wasn't moving

        const next = this.bufferedDir || (this.heldKeys.length > 0 ? this.heldKeys[this.heldKeys.length - 1].dir : null);
        this.bufferedDir = null;
        if (next) this.tryStep(next);
    }

    tryStep(dir) {
        const sortie = this.props.sortie;
        if (!sortie || sortie.path.length > 0) return;

        const target = stepInDirection(sortie.coord, dir);
        if (!target) {
            this.startBump(dir, null); // pushing north/south past the pole rows
            return;
        }

        // sortieStep returns false when the tile is impassable (revealing it if it was unknown -- probing a
        // hidden wall teaches the map). Either way a rejection renders as a bump toward the target.
        if (!this.props.sortieStep(target)) {
            this.startBump(dir, target);
        }
    }

    startBump(dir, target) {
        this.bump = { dx: dir[0], dy: dir[1], target, at: this.props.elapsedTime };
    }

    handleCanvasClick(event) {
        if (!this.props.sortie) return; // clicks only drive the sortie; POI dispatch stays panel-driven

        const rect = this.canvas.current.getBoundingClientRect();
        const [gridRow, gridCol] = this.canvasManager.xyToGrid(event.clientX - rect.left, event.clientY - rect.top);
        const imageRow = Math.floor(gridRow);
        const imageCol = Math.floor(gridCol);
        if (!isDisplayCellVisible(imageRow, imageCol)) return; // outside the planet silhouette (masked corners)
        const coord = imageCellToCoord(imageRow, imageCol, this.props.rotation);
        if (!coord) return; // letterbox padding

        this.bufferedDir = null; // a click overrides any queued keyboard turn
        this.props.sortieMoveTo(coord);
    }

    drawPlanet() {
        if (!this.props.visible) {
            return;
        }

        // Resize whenever the container changed size underneath us (e.g. tab switches)
        const containerRect = this.canvasContainer.current.getBoundingClientRect();
        if (containerRect.width !== this.canvasManager.width || containerRect.height !== this.canvasManager.height) {
            this.canvasManager.resize();
        }

        const planetImage = generateImage(
            this.props.map,
            this.props.fractionOfDay,
            this.props.rotation,
            this.props.sunTracking,
            this.props.cookedPct,
            this.buildOverlays()
        );

        this.canvasManager.clearAll();
        drawPlanetImage(this.canvasManager, planetImage);
    }

    // The route the squad would take to the hovered POI, from wherever the next order would start (home base, or
    // the squad's held position). Only shown when an order is actually possible. Cached per hover/origin/map state
    // so the 30fps redraw doesn't re-run Dijkstra.
    hoverPath() {
        const { hoveredPoiId, pois, squad, homeCoord, map, numExplored, unlockedTerrains } = this.props;

        const poi = hoveredPoiId && pois[hoveredPoiId];
        if (!poi) return null;

        let origin = null;
        if (!squad) {
            origin = homeCoord;
        }
        else if (squad.status === SQUAD_STATUS.holding) {
            origin = squad.coord; // held squads can always move on, even with a fight pending (Engage is the commitment)
        }
        if (!origin) return null; // squad busy (traveling/fighting/returning): marker highlight only

        const cacheKey = `${hoveredPoiId}|${origin[0]},${origin[1]}|${numExplored}`;
        if (this.hoverPathKey !== cacheKey) {
            this.hoverPathKey = cacheKey;
            this.cachedHoverPath = findPath(map, origin, poi.coord, { unlocks: unlockedTerrains });
        }
        return this.cachedHoverPath;
    }

    // Expedition markers, keyed by planet "row,col". Later entries overwrite earlier ones, so precedence is
    // path highlight < POI marker < squad glyph < fight effect (squad/fight sit on the POI's tile when there).
    buildOverlays() {
        const overlays = {};

        // Marching-ants shimmer: every third tile is bright, and the bright pattern crawls toward the destination
        // (the path array runs origin -> destination). Color-only overlays: terrain glyphs stay.
        const hoverPath = this.hoverPath();
        if (hoverPath) {
            const phase = Math.floor(this.props.elapsedTime / PATH_ANTS_STEP_MS);
            hoverPath.forEach(([r, c], i) => {
                const bright = ((i - phase) % PATH_ANTS_SPACING + PATH_ANTS_SPACING) % PATH_ANTS_SPACING === 0;
                overlays[`${r},${c}`] = { colorKey: bright ? 'pathHighlightBright' : 'pathHighlight' };
            });
        }

        // Scout droids: a lone droid draws as a glyph, stacks show their count. Active scouts are yellow; recalled
        // ones walking home go gray (any active droid on a shared tile wins the color). Docked droids (home tile)
        // aren't drawn.
        const droidTiles = {};
        (this.props.droids || []).forEach(droid => {
            if (!droid.coord) return;
            const key = `${droid.coord[0]},${droid.coord[1]}`;
            const entry = droidTiles[key] || (droidTiles[key] = { count: 0, anyActive: false });
            entry.count++;
            if (!droid.returning) entry.anyActive = true;
        });
        const homeKey = this.props.homeCoord ? `${this.props.homeCoord[0]},${this.props.homeCoord[1]}` : null;
        Object.entries(droidTiles).forEach(([key, { count, anyActive }]) => {
            if (key === homeKey) return;

            // Slow brightness pulse (0.6..1.0), phase-offset by tile position so scouts twinkle out of sync
            const [r, c] = key.split(',').map(Number);
            const phase = ((r * 13 + c * 7) % 10) / 10;
            const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (this.props.elapsedTime / SCOUT_PULSE_PERIOD_MS + phase)));

            const stackChar = count > 9 ? '+' : `${count}`;
            overlays[key] = {
                char: (SHOW_DROID_STACK_COUNTS && count > 1) ? stackChar : DROID_GLYPH,
                colorKey: anyActive ? 'droid' : 'droidReturning',
                alpha: pulse
            };
        });

        Object.values(this.props.pois || {}).forEach(poi => {
            if (poi.status !== POI_STATUS.available) return;
            const hovered = poi.id === this.props.hoveredPoiId;
            overlays[`${poi.coord[0]},${poi.coord[1]}`] = {
                char: POI_GLYPHS[poi.type],
                colorKey: hovered ? 'poiHighlight' : POI_COLOR_KEYS[poi.type],
                // Radar ping on the hovered marker: 0..1 through the expand-and-fade cycle (drawn in planet_render)
                ping: hovered ?
                    { fraction: (this.props.elapsedTime % POI_PING_PERIOD_MS) / POI_PING_PERIOD_MS, variant: 'hover' } :
                    undefined
            };
        });

        this.addSortieOverlays(overlays);

        const squad = this.props.squad;
        if (squad && squad.coord) {
            const key = `${squad.coord[0]},${squad.coord[1]}`;
            // Quiet locator pulse so the deployed team is followable at a glance
            const squadPing = { fraction: (this.props.elapsedTime % SQUAD_PING_PERIOD_MS) / SQUAD_PING_PERIOD_MS, variant: 'squad' };

            if (squad.status === SQUAD_STATUS.fighting) {
                const frame = Math.floor(squad.fightRemaining / 250) % FIGHT_EFFECT_CHARS.length;
                overlays[key] = { char: FIGHT_EFFECT_CHARS[frame], colorKey: 'battle', ping: squadPing };
            }
            else {
                overlays[key] = { char: SQUAD_GLYPH, colorKey: 'squad', ping: squadPing };
            }
        }

        return overlays;
    }

    // Sortie prototype: remaining route as a dim highlight, the team glyph sliding smoothly between tiles
    // (sub-cell offset from moveProgress), and the bump/wall-flash feedback for rejected steps.
    addSortieOverlays(overlays) {
        const sortie = this.props.sortie;
        if (!sortie) return;

        (sortie.path || []).forEach(([r, c]) => {
            if (!overlays[`${r},${c}`]) overlays[`${r},${c}`] = { colorKey: 'pathHighlight' };
        });

        let offsetX = 0;
        let offsetY = 0;

        if (sortie.path.length > 0) {
            const next = sortie.path[0];
            const crossMs = sortieCrossMs(this.props.map, next, this.props.unlockedTerrains, sortie.charge);
            const fraction = Math.min(sortie.moveProgress / crossMs, 1);
            const fromCell = coordToImageCell(sortie.coord, this.props.rotation);
            const toCell = coordToImageCell(next, this.props.rotation);
            if (fromCell && toCell) {
                offsetX = (toCell[1] - fromCell[1]) * fraction;
                offsetY = (toCell[0] - fromCell[0]) * fraction;
            }
        }

        if (this.bump) {
            const sinceBump = this.props.elapsedTime - this.bump.at;
            if (sinceBump < BUMP_MS) {
                // Nudge out and spring back over BUMP_MS (half sine)
                const amplitude = Math.sin((sinceBump / BUMP_MS) * Math.PI) * BUMP_AMPLITUDE;
                offsetX = this.bump.dx * amplitude;
                offsetY = this.bump.dy * amplitude;
            }
            if (sinceBump < WALL_FLASH_MS && this.bump.target) {
                overlays[`${this.bump.target[0]},${this.bump.target[1]}`] = { colorKey: 'poiHighlight' };
            }
            if (sinceBump >= Math.max(BUMP_MS, WALL_FLASH_MS)) {
                this.bump = null;
            }
        }

        overlays[`${sortie.coord[0]},${sortie.coord[1]}`] = {
            char: SORTIE_GLYPH,
            colorKey: 'squad',
            offsetX,
            offsetY
        };
    }

    render() {
        const legend = [TERRAINS.home, STATUSES.unknown, TERRAINS.flatland, TERRAINS.mountain, TERRAINS.developed];

        if ((this.props.droids || []).length > 0) {
            legend.push({ key: 'droid', display: DROID_GLYPH, label: 'Scout' });
            if (SHOW_DROID_STACK_COUNTS) {
                legend.push({ key: 'droidStack', colorKey: 'droid', display: '2+', label: 'Scouts (stacked)' });
            }
        }

        if (this.props.sortie) {
            legend.push({ key: 'sortie', colorKey: 'squad', display: SORTIE_GLYPH, label: 'Sortie team' });
        }

        // POI/squad legend entries only appear once relevant (any POI discovered)
        const anyPoiVisible = Object.values(this.props.pois || {}).some(poi => poi.status !== POI_STATUS.hidden);
        if (anyPoiVisible) {
            ['cache', 'nest', 'storySite'].forEach(type => {
                legend.push({ key: POI_COLOR_KEYS[type], display: POI_GLYPHS[type], label: POI_LABELS[type] });
            });
            legend.push({ key: 'squad', display: SQUAD_GLYPH, label: 'Squad' });
        }

        return (
            <div id="planet" ref={this.canvasContainer} className={`${this.props.visible ? '' : 'hidden'}`}>
                <canvas id="planet-canvas" ref={this.canvas} onClick={this.handleCanvasClick}
                        style={this.props.sortie ? {cursor: 'crosshair'} : undefined}></canvas>
                <div className="planet-legend">
                    <span className='d-flex justify-center underline'>Legend</span>
                    {
                        legend.map((attributes) => {
                            return <span key={attributes.key}>
                                <span style={{color: PLANET_COLORS[attributes.colorKey || attributes.key]}}>
                                    {attributes.display} {attributes.label}
                                </span>
                            </span>
                        })
                    }
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {
        visible: state.game.currentNavTab === 'planet',
        map: state.planet.map,
        droids: state.planet.droids,
        pois: state.planet.pois,
        squad: state.planet.squad,
        sortie: state.planet.sortie,
        hoveredPoiId: state.game.hoveredPoiId,
        homeCoord: state.planet.homeCoord,
        numExplored: state.planet.numExplored,
        unlockedTerrains: state.planet.unlockedTerrains,
        elapsedTime: state.clock.elapsedTime,
        fractionOfDay: fromClock.fractionOfDay(state.clock),
        rotation: state.planet.rotation,
        cookedPct: state.planet.cookedPct,
        sunTracking: state.planet.rotationMode === 'sun', // generateImage's shading special-case
    }
};

export default connect(
    mapStateToProps,
    { sortieMoveTo, sortieStep }
)(Planet);
