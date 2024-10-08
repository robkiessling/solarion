
import React from 'react';
import AsciiCanvas from "../lib/ascii_canvas";
import {connect} from "react-redux";
import {NUM_COLS, NUM_ROWS} from "../lib/outside";
import {drawStarAndProbes, setupCache} from "../lib/star";
import {getQuantity, getResource} from "../redux/modules/resources";
import {STAR_FPS} from "../singletons/game_clock";
import {energyBeamStrengthPct} from "../redux/reducer";

class Star extends React.Component {
    constructor(props) {
        super(props);

        this.canvasContainer = React.createRef();
        this.canvas = React.createRef();
        this.cachedCanvas = React.createRef();

        this.waitTimeMs = 1000.0 / STAR_FPS; // how long to wait between rendering
    }

    componentDidMount() {
        this.canvasManager = new AsciiCanvas(
            this.canvasContainer.current, this.canvas.current, NUM_ROWS, NUM_COLS, this.cachedCanvas.current
        );
        setupCache(this.canvasManager)
    }

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
        if (!prevProps.visible && this.props.visible) {
            // Whenever this tab gets switched to we need to resize canvases
            this.canvasManager.resize();
        }

        this.canvasManager.clearAll();
        drawStarAndProbes(
            this.canvasManager,
            this.props.elapsedTime,
            this.props.probeDistribution,
            this.props.numProbes,
            this.props.mirrorSettings
        );
    }

    render() {
        return (
            <div id="star-container" ref={this.canvasContainer} className={`${this.props.visible ? '' : 'hidden'}`}>
                <canvas id="star-canvas" ref={this.canvas}></canvas>
                <canvas id="star-canvas-cache" ref={this.cachedCanvas} className={'invisible'}></canvas>
            </div>
        );
    }
}


const mapStateToProps = state => {
    return {
        visible: state.game.currentNavTab === 'star',
        elapsedTime: state.clock.elapsedTime,
        probeDistribution: state.star.distribution,
        numProbes: Math.floor(getQuantity(getResource(state.resources, 'probes'))),
        mirrorSettings: {
            mirrorsOnline: state.star.mirrorsOnline,
            mirrorTarget: state.star.mirrorTarget,
            mirrorAmount: energyBeamStrengthPct(state)
        }
    }
};

export default connect(
    mapStateToProps,
    {}
)(Star);