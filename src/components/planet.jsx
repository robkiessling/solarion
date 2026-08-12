import React from 'react';
import {connect} from "react-redux";
import AsciiCanvas from "../lib/ascii_canvas";
import {
    TERRAINS,
    STATUSES,
    generateImage,
    coordToImageCell,
    imageCellToCoord,
    isDisplayCellVisible,
    getGridHalo
} from "../lib/planet_map";
import {NUM_PLANET_ROWS, DISPLAY_COLS, PLANET_COLS} from "../lib/planet_geometry";
import {mod} from "../lib/helpers";
import {drawPlanetImage, PLANET_COLORS} from "../lib/planet_render";
import {
    FIGHT_EFFECT_CHARS,
    POI_COLOR_KEYS,
    POI_GLYPHS,
    POI_LABELS,
    POI_STATUS
} from "../lib/expeditions";
import {stepInDirection, squadCrossMs, SQUAD_GLYPH} from "../lib/squad";
import {CONSUMABLE_ORDER} from "../database/consumables";
import {
    retreatFromFight,
    ROTATION_MODES,
    setBeaconAt,
    setRotation,
    setRotationMode,
    squadInteract,
    squadLeavePrompt,
    squadStepInto,
    useConsumable
} from "../redux/modules/planet";
import EncounterPopup from "./encounter_popup";
import {surveyAutomationUnlocked} from "../redux/reducer";

const POI_PING_PERIOD_MS = 1200; // one full expand-and-fade cycle of the hovered marker's radar ping
const SQUAD_PING_PERIOD_MS = 2200; // slower, subtler locator pulse on the deployed squad
const DROID_GLYPH = '♦'; // a scout; small yellow diamond, kept apart from the squad's cyan '◈'
                         // and can't be confused with '·' unknown
const SHOW_DROID_STACK_COUNTS = false; // when true, tiles with 2+ scouts show the count (2-9, '+') instead of the glyph
const SCOUT_PULSE_PERIOD_MS = 1800; // scouts breathe between dim and full brightness, phase-offset per tile
const BEACON_GLYPH = '◎'; // the growth beacon: replication flows toward it
const BEACON_PING_PERIOD_MS = 2600; // slow locator pulse on the placed beacon
import {PLANET_FPS} from "../singletons/game_clock";
import * as fromClock from "../redux/modules/clock";

const CHAR_RATIO = 0.5; // cell width/height; must match the AsciiCanvas charRatio below

// Squad driving input: screen-space direction vectors per key (y points down). On the uniform grid these
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

// Drag-to-pan: horizontal movement past this threshold turns a press into a camera grab (and stops it from
// counting as a beacon click on release). Grabbing switches rotationMode to 'manual'; the segmented control
// in the Exploration panel just reflects that.
const DRAG_THRESHOLD_PX = 5;

class Planet extends React.Component {
    constructor(props) {
        super(props);

        this.canvasContainer = React.createRef();
        this.canvas = React.createRef();

        this.waitTimeMs = 1000.0 / PLANET_FPS; // how long to wait between rendering

        // Squad driving state (input-layer only, so it lives on the component, not in redux):
        this.heldKeys = [];      // pressed movement keys in press order; last one is the active direction
        this.bufferedDir = null; // a tap mid-slide queues one turn, executed on arrival
        this.bump = null;        // rejected-step feedback: { dx, dy, target, at }

        // Drag-to-pan state: set on mousedown, becomes a pan once the pointer moves DRAG_THRESHOLD_PX.
        // { startX, panning, baseRotation, baseX }; didPan suppresses the click that fires after a pan's mouseup.
        this.drag = null;
        this.didPan = false;

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
        this.handleCanvasMouseDown = this.handleCanvasMouseDown.bind(this);
        this.handleWindowMouseMove = this.handleWindowMouseMove.bind(this);
        this.handleWindowMouseUp = this.handleWindowMouseUp.bind(this);
    }

    componentDidMount() {
        this.canvasManager = new AsciiCanvas(
            this.canvasContainer.current, this.canvas.current, NUM_PLANET_ROWS, DISPLAY_COLS, null,

            // charRatio roughly matches DOM rendering with 1.2 line-height
            { fillContainer: true, charRatio: CHAR_RATIO, padding: 64 }
        );
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        // Pan tracking lives on the window so a drag keeps working when the pointer leaves the canvas
        window.addEventListener('mousemove', this.handleWindowMouseMove);
        window.addEventListener('mouseup', this.handleWindowMouseUp);
        this.drawPlanet();
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('mousemove', this.handleWindowMouseMove);
        window.removeEventListener('mouseup', this.handleWindowMouseUp);
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
     * --- Squad driving (prototype) ---
     * Tile-walker input model: a step starts instantly and takes crossTime to complete; a held key re-steps on
     * every arrival (own keydown/keyup tracking, not OS keyrepeat); a tap mid-slide buffers one turn; a blocked
     * step bumps in place and flashes the wall. Click-to-move routes via the same executor.
     */

    handleKeyDown(event) {
        if (!this.props.visible) return;

        // Encounter popup hotkeys: 1/Enter/Space fire the primary action (accept the offer, or Continue past
        // the result), Esc leaves. The popup blocks movement -- the player must choose -- but movement keys
        // still track into heldKeys, so holding a direction while pressing Esc walks off without a re-press.
        // Handled before the squad guard: a wipe's result popup has no squad left, but still needs dismissing.
        const prompt = this.props.prompt;
        if (prompt) {
            if (event.key === 'Enter' || event.key === ' ' || event.key === '1') {
                event.preventDefault();
                if (!event.repeat) {
                    if (prompt.phase === 'result') this.props.squadLeavePrompt();
                    else this.props.squadInteract();
                }
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                if (!event.repeat) this.props.squadLeavePrompt();
                return;
            }
            const dir = KEY_DIRS[event.key];
            if (dir) {
                event.preventDefault();
                if (!event.repeat) {
                    this.heldKeys = this.heldKeys.filter(held => held.key !== event.key).concat({ key: event.key, dir });
                }
            }
            return;
        }

        if (!this.props.squad) return;

        // Mid-battle hotkeys: number keys pop consumables (1..N in pouch order, mirrored by the popup's
        // action row), Esc orders the retreat. Movement keys still track into heldKeys so a held direction
        // resumes driving the moment the battle ends.
        if (this.props.squad.fighting) {
            const slot = parseInt(event.key, 10);
            if (slot >= 1 && slot <= this.props.pouchOrder.length) {
                event.preventDefault();
                if (!event.repeat) this.props.useConsumable(this.props.pouchOrder[slot - 1]);
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                if (!event.repeat) this.props.retreatFromFight();
                return;
            }
            const dir = KEY_DIRS[event.key];
            if (dir) {
                event.preventDefault();
                if (!event.repeat) {
                    this.heldKeys = this.heldKeys.filter(held => held.key !== event.key).concat({ key: event.key, dir });
                }
            }
            return;
        }

        const dir = KEY_DIRS[event.key];
        if (!dir) return;
        event.preventDefault();
        if (event.repeat) return; // we do our own repeat (re-step on arrival), OS keyrepeat only jitters it

        this.heldKeys = this.heldKeys.filter(held => held.key !== event.key).concat({ key: event.key, dir });

        if (this.props.squad.path.length > 0) {
            this.bufferedDir = dir; // mid-slide: queue the turn for arrival
        }
        else {
            this.tryStep(dir, true);
        }
    }

    handleKeyUp(event) {
        this.heldKeys = this.heldKeys.filter(held => held.key !== event.key);
    }

    // When the squad becomes free again (arrival, fight resolved, prompt answered), continue: a buffered tap
    // wins once, then any still-held key takes over. An OPEN prompt suppresses continuation -- held-walk stops
    // at the site until the player answers the popup (a held direction then resumes on dismissal).
    maybeContinueMovement(prevProps) {
        const squad = this.props.squad;
        if (!squad || squad.path.length > 0 || squad.fighting || this.props.prompt) return;

        const prev = prevProps.squad;
        const wasBusy = prev && (prev.path.length > 0 || prev.fighting || prevProps.prompt);
        if (!wasBusy) return;

        const next = this.bufferedDir || (this.heldKeys.length > 0 ? this.heldKeys[this.heldKeys.length - 1].dir : null);
        this.bufferedDir = null;
        if (next) this.tryStep(next, false);
    }

    tryStep(dir, tap) {
        const squad = this.props.squad;
        if (!squad || squad.path.length > 0) return;

        const target = stepInDirection(squad.coord, dir);
        if (!target) {
            this.startBump(dir, null); // pushing north/south past the pole rows
            return;
        }

        // The thunk applies the contact rules (move / bump-to-attack on tap / blocked, revealing hidden
        // walls and POIs as probed). A rejection renders as a bump toward the target; 'busy' (mid-fight,
        // no squad) is silently ignored.
        const result = this.props.squadStepInto(target, tap);
        if (result === 'blocked') {
            this.startBump(dir, target);
        }
    }

    startBump(dir, target) {
        this.bump = { dx: dir[0], dy: dir[1], target, at: this.props.elapsedTime };
    }

    // --- Drag-to-pan ---
    // Grabbing the globe pans the camera: 1 cell of drag = 1 planet column (the display maps columns 1:1).
    // Crossing the drag threshold switches rotationMode to 'manual', taking the camera from the sun/team modes
    // exactly like grabbing the map in an RTS; the base rotation is sampled at that moment (not mousedown),
    // since a follow-cam may still be moving the camera until then.

    handleCanvasMouseDown(event) {
        if (!this.props.visible) return;
        this.drag = { startX: event.clientX, panning: false, baseRotation: null, baseX: null };
        this.didPan = false;
    }

    handleWindowMouseMove(event) {
        if (!this.drag) return;

        if (!this.drag.panning) {
            if (Math.abs(event.clientX - this.drag.startX) < DRAG_THRESHOLD_PX) return;
            this.drag.panning = true;
            this.drag.baseRotation = this.props.rotation;
            this.drag.baseX = event.clientX;
            this.didPan = true;
            this.canvas.current.style.cursor = 'grabbing';
            if (this.props.rotationMode !== ROTATION_MODES.manual) {
                this.props.setRotationMode(ROTATION_MODES.manual);
            }
        }

        const draggedCells = (event.clientX - this.drag.baseX) / this.canvasManager.fontWidth;
        // Dragging right moves the terrain right, i.e. the camera pans west (rotation decreases)
        this.props.setRotation(mod(this.drag.baseRotation - draggedCells / PLANET_COLS, 1));
    }

    handleWindowMouseUp() {
        if (!this.drag) return;
        if (this.drag.panning) {
            this.canvas.current.style.cursor = '';
        }
        this.drag = null;
    }

    // A map click places (or, on its own tile, clears) the growth beacon -- the one click the map accepts.
    // Movement stays keyboard-only (click-to-move was built, playtested, and cut).
    handleCanvasClick(event) {
        if (this.didPan) return; // the release of a camera grab, not a click
        if (!this.props.surveyUnlocked) return; // the beacon ships with Survey Automation

        const rect = this.canvas.current.getBoundingClientRect();
        const [gridRow, gridCol] = this.canvasManager.xyToGrid(event.clientX - rect.left, event.clientY - rect.top);
        const imageRow = Math.floor(gridRow);
        const imageCol = Math.floor(gridCol);
        if (!isDisplayCellVisible(imageRow, imageCol)) return; // outside the planet silhouette (masked corners)
        const coord = imageCellToCoord(imageRow, imageCol, this.props.rotation);
        if (!coord) return; // letterbox padding

        this.props.setBeaconAt(coord);
    }

    // Sub-column camera offset, in cell units: mid-slide under the follow-cam, the camera tracks the squad's
    // true (fractional) position. Redux rotation snaps a whole column on arrival exactly as this returns to 0,
    // so the scene scrolls continuously. Signed toward the step direction; 0 for vertical steps (the camera
    // never tracks rows) and in the manual/sun camera modes.
    cameraShift() {
        const squad = this.props.squad;
        if (!squad || this.props.rotationMode !== ROTATION_MODES.squad || squad.path.length === 0) return 0;

        const next = squad.path[0];
        // Wrap-aware step direction: +1 east / -1 west, including across the seam (col 119 -> 0)
        const step = mod(next[1] - squad.coord[1] + PLANET_COLS / 2, PLANET_COLS) - PLANET_COLS / 2;
        if (step === 0) return 0;

        const crossMs = squadCrossMs(this.props.map, next, this.props.unlockedTerrains, squad.charge);
        return step * Math.min(squad.moveProgress / crossMs, 1);
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

        const cameraShift = this.cameraShift();
        const planetImage = generateImage(
            this.props.map,
            this.props.fractionOfDay,
            this.props.rotation,
            this.props.sunTracking,
            this.props.cookedPct,
            this.buildOverlays(),
            cameraShift
        );

        this.canvasManager.clearAll();
        drawPlanetImage(this.canvasManager, planetImage, cameraShift);
    }

    // Expedition markers, keyed by planet "row,col". Later entries overwrite earlier ones, so precedence is
    // POI marker < beacon < squad glyph < fight effect (squad/fight sit on the POI's tile when there).
    buildOverlays() {
        const overlays = {};

        // Scout droids: a lone droid draws as a glyph, stacks show their count. Active scouts are yellow;
        // ones walking to the grid (recalled or docking) go gray (any active droid on a shared tile wins the
        // color). Docked scouts have no coord and aren't drawn; ones passing over the home tile are hidden too.
        const droidTiles = {};
        (this.props.droids || []).forEach(droid => {
            if (!droid.coord) return;
            const key = `${droid.coord[0]},${droid.coord[1]}`;
            const entry = droidTiles[key] || (droidTiles[key] = { count: 0, anyActive: false });
            entry.count++;
            if (!droid.returning && !droid.docking) entry.anyActive = true;
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

        // The growth beacon: placed by map click, replication grows toward it (wins over a POI marker on the
        // same tile -- the player put it there and can move it)
        const beacon = this.props.beaconCoord;
        if (beacon) {
            overlays[`${beacon[0]},${beacon[1]}`] = {
                char: BEACON_GLYPH,
                colorKey: 'beacon',
                ping: { fraction: (this.props.elapsedTime % BEACON_PING_PERIOD_MS) / BEACON_PING_PERIOD_MS, variant: 'beacon' }
            };
        }

        this.addSquadOverlays(overlays);

        this.addHaloBoundary(overlays);

        return overlays;
    }

    // Survey-range boundary: canvas line segments along cell edges (drawn by planet_render), NOT a tinted
    // char -- a row of tinted glyphs reads as terrain (a river). Every boundary tile is a ring tile (a
    // closer tile's neighbors are all within R), so only the ring needs its neighbors checked. Runs last
    // and MERGES into existing overlays, so markers keep their glyphs and the ring has no gaps under them.
    addHaloBoundary(overlays) {
        if (!this.props.surveyUnlocked) return;

        const { halo, ring } = getGridHalo(this.props.map, this.props.haloRadius);
        ring.forEach(key => {
            const [r, c] = key.split(',').map(Number);
            const edges = {
                top: r === 0 || !halo.has(`${r - 1},${c}`),
                bottom: r === NUM_PLANET_ROWS - 1 || !halo.has(`${r + 1},${c}`),
                left: !halo.has(`${r},${mod(c - 1, PLANET_COLS)}`),
                right: !halo.has(`${r},${mod(c + 1, PLANET_COLS)}`)
            };
            if (edges.top || edges.bottom || edges.left || edges.right) {
                overlays[key] = { ...(overlays[key] || {}), haloEdges: edges };
            }
        });
    }

    // The squad: the team glyph sliding smoothly between tiles (sub-cell offset from moveProgress),
    // skirmish effect on the nest while fighting, and bump/wall-flash feedback.
    addSquadOverlays(overlays) {
        const squad = this.props.squad;
        if (!squad) return;

        // Skirmish animation: effect chars churn on the nest tile (ambient echo of the battle playing out in
        // the popup); the squad stands its ground beside it
        if (squad.fighting) {
            const poi = this.props.pois[squad.fighting.poiId];
            if (poi) {
                const frame = Math.floor(squad.fighting.battle.elapsedMs / 250) % FIGHT_EFFECT_CHARS.length;
                overlays[`${poi.coord[0]},${poi.coord[1]}`] = { char: FIGHT_EFFECT_CHARS[frame], colorKey: 'battle' };
            }
        }

        let offsetX = 0;
        let offsetY = 0;

        if (squad.path.length > 0) {
            const next = squad.path[0];
            const crossMs = squadCrossMs(this.props.map, next, this.props.unlockedTerrains, squad.charge);
            const fraction = Math.min(squad.moveProgress / crossMs, 1);
            const fromCell = coordToImageCell(squad.coord, this.props.rotation);
            const toCell = coordToImageCell(next, this.props.rotation);
            if (fromCell && toCell) {
                // Under the follow-cam this horizontal offset is cancelled exactly by the scene-wide
                // cameraShift, pinning the glyph at center while the terrain scrolls beneath it
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

        overlays[`${squad.coord[0]},${squad.coord[1]}`] = {
            char: SQUAD_GLYPH,
            colorKey: 'squad',
            offsetX,
            offsetY,
            // Quiet locator pulse so the deployed team is followable at a glance
            ping: { fraction: (this.props.elapsedTime % SQUAD_PING_PERIOD_MS) / SQUAD_PING_PERIOD_MS, variant: 'squad' }
        };
    }

    render() {
        const legend = [TERRAINS.home, STATUSES.unknown, TERRAINS.flatland, TERRAINS.mountain, TERRAINS.acid, TERRAINS.developed];

        if ((this.props.droids || []).length > 0) {
            legend.push({ key: 'droid', display: DROID_GLYPH, label: 'Scout' });
            if (SHOW_DROID_STACK_COUNTS) {
                legend.push({ key: 'droidStack', colorKey: 'droid', display: '2+', label: 'Scouts (stacked)' });
            }
        }

        if (this.props.squad) {
            legend.push({ key: 'squad', colorKey: 'squad', display: SQUAD_GLYPH, label: 'Squad' });
        }

        if (this.props.surveyUnlocked) {
            legend.push({ key: 'haloRing', display: '╌', label: 'Survey range' });
        }
        if (this.props.beaconCoord) {
            legend.push({ key: 'beacon', display: BEACON_GLYPH, label: 'Growth beacon' });
        }

        // POI legend entries only appear once relevant (any POI discovered)
        const anyPoiVisible = Object.values(this.props.pois || {}).some(poi => poi.status !== POI_STATUS.hidden);
        if (anyPoiVisible) {
            ['cache', 'nest', 'storySite', 'gate'].forEach(type => {
                legend.push({ key: POI_COLOR_KEYS[type], display: POI_GLYPHS[type], label: POI_LABELS[type] });
            });
            legend.push({ key: 'infested', display: TERRAINS.flatland.display, label: 'Infested' });
        }

        return (
            <div id="planet" ref={this.canvasContainer} className={`${this.props.visible ? '' : 'hidden'}`}>
                <canvas id="planet-canvas" ref={this.canvas}
                        onClick={this.handleCanvasClick} onMouseDown={this.handleCanvasMouseDown}></canvas>
                <EncounterPopup/>
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
        prompt: state.planet.prompt,
        // The battle hotkey layout: carried item types in manifest order (stable through a fight, so slots
        // don't shift as an item runs out; the popup's action row mirrors this)
        pouchOrder: state.planet.squad ?
            CONSUMABLE_ORDER.filter(id => (state.planet.squad.pouch || {})[id] !== undefined) : [],
        hoveredPoiId: state.game.hoveredPoiId,
        homeCoord: state.planet.homeCoord,
        numExplored: state.planet.numExplored,
        unlockedTerrains: state.planet.unlockedTerrains,
        surveyUnlocked: surveyAutomationUnlocked(state),
        haloRadius: state.planet.haloRadius,
        beaconCoord: state.planet.beaconCoord,
        elapsedTime: state.clock.elapsedTime,
        fractionOfDay: fromClock.fractionOfDay(state.clock),
        rotation: state.planet.rotation,
        rotationMode: state.planet.rotationMode,
        cookedPct: state.planet.cookedPct,
        sunTracking: state.planet.rotationMode === 'sun', // generateImage's shading special-case
    }
};

export default connect(
    mapStateToProps,
    { squadStepInto, squadInteract, squadLeavePrompt, useConsumable, retreatFromFight,
      setBeaconAt, setRotation, setRotationMode }
)(Planet);
