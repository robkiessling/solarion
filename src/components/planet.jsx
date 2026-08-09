import React from 'react';
import {connect} from "react-redux";
import AsciiCanvas from "../lib/ascii_canvas";
import {TERRAINS, STATUSES, generateImage} from "../lib/planet_map";
import {NUM_PLANET_ROWS, WIDEST_DISPLAY_ROW} from "../lib/planet_geometry";
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

class Planet extends React.Component {
    constructor(props) {
        super(props);

        this.canvasContainer = React.createRef();
        this.canvas = React.createRef();

        this.waitTimeMs = 1000.0 / PLANET_FPS; // how long to wait between rendering
    }

    componentDidMount() {
        this.canvasManager = new AsciiCanvas(
            this.canvasContainer.current, this.canvas.current, NUM_PLANET_ROWS, WIDEST_DISPLAY_ROW, null,

            // charRatio of 0.5 roughly matches DOM rendering with 1.2 line-height
            { fillContainer: true, charRatio: 0.5, padding: 64 }
        );
        this.drawPlanet();
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
        this.drawPlanet();
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

    render() {
        const legend = [TERRAINS.home, STATUSES.unknown, TERRAINS.flatland, TERRAINS.mountain, TERRAINS.developed];

        if ((this.props.droids || []).length > 0) {
            legend.push({ key: 'droid', display: DROID_GLYPH, label: 'Scout' });
            if (SHOW_DROID_STACK_COUNTS) {
                legend.push({ key: 'droidStack', colorKey: 'droid', display: '2+', label: 'Scouts (stacked)' });
            }
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
                <canvas id="planet-canvas" ref={this.canvas}></canvas>
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
    {}
)(Planet);
