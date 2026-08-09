import React from 'react';
import {connect} from "react-redux";
import AsciiCanvas from "../lib/ascii_canvas";
import {TERRAINS, STATUSES, generateImage} from "../lib/planet_map";
import {NUM_PLANET_ROWS, WIDEST_DISPLAY_ROW} from "../lib/planet_geometry";
import {drawPlanetImage, PLANET_COLORS} from "../lib/planet_render";
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

        const droidCounts = {};
        (this.props.droids || []).forEach(droid => {
            if (!droid.coord) return;
            const key = `${droid.coord[0]},${droid.coord[1]}`;
            droidCounts[key] = (droidCounts[key] || 0) + 1;
        });

        const planetImage = generateImage(
            this.props.map,
            this.props.fractionOfDay,
            this.props.rotation,
            this.props.sunTracking,
            this.props.cookedPct,
            droidCounts
        );

        this.canvasManager.clearAll();
        drawPlanetImage(this.canvasManager, planetImage);
    }

    render() {
        const legend = [TERRAINS.home, STATUSES.unknown, TERRAINS.flatland, TERRAINS.mountain, TERRAINS.developed];

        return (
            <div id="planet" ref={this.canvasContainer} className={`${this.props.visible ? '' : 'hidden'}`}>
                <canvas id="planet-canvas" ref={this.canvas}></canvas>
                <div className="planet-legend">
                    <span className='d-flex justify-center underline'>Legend</span>
                    {
                        legend.map((attributes) => {
                            return <span key={attributes.key}>
                                <span style={{color: PLANET_COLORS[attributes.key]}}>
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
        elapsedTime: state.clock.elapsedTime,
        fractionOfDay: fromClock.fractionOfDay(state.clock),
        rotation: state.planet.rotation,
        cookedPct: state.planet.cookedPct,
        sunTracking: state.planet.sunTracking,
    }
};

export default connect(
    mapStateToProps,
    {}
)(Planet);
