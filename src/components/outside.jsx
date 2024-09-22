
import React from 'react';
import AsciiCanvas from "../lib/ascii_canvas";
import {OUTSIDE_FPS} from "../singletons/game_clock";
import {fractionOfDay} from "../redux/modules/clock";
import {connect} from "react-redux";
import {generateImage, getSkyColorAndOpacity, NUM_COLS, NUM_ROWS} from "../lib/outside";
import {animationData} from "../redux/modules/structures";

class Outside extends React.Component {
    constructor(props) {
        super(props);

        this.canvasContainer = React.createRef();
        this.canvas = React.createRef();
        this.skyCanvas = React.createRef();

        this.waitTimeMs = 1000.0 / OUTSIDE_FPS; // how long to wait between rendering
    }

    componentDidMount() {
        this.canvasManager = new AsciiCanvas(this.canvasContainer.current, this.canvas.current, NUM_ROWS, NUM_COLS);
        this.skyCanvasManager = new AsciiCanvas(this.canvasContainer.current, this.skyCanvas.current, NUM_ROWS, NUM_COLS);
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
            this.skyCanvasManager.resize();
        }

        const image = generateImage(
            this.props.structureAnimationData,
            this.props.elapsedTime / 1000,
            this.props.fractionOfDay,
            this.props.burnOutside
        );
        this.canvasManager.clearAll();
        this.canvasManager.drawImage(image, 0, 0);
    }

    render() {
        const { skyColor, skyOpacity } = getSkyColorAndOpacity(this.props.fractionOfDay)

        let containerClass = '';
        containerClass += (this.props.visible ? '' : ' hidden');
        containerClass += (this.props.shuttersOpen ? ' shutters-open' : ' shutters-closed');
        containerClass += (this.props.burnOutside ? ' burning' : '');

        return (
            <div id="outside-container" ref={this.canvasContainer} className={containerClass}>
                <div id="shutters"></div>
                <canvas id="sky-color" ref={this.skyCanvas} style={{background: skyColor, opacity: skyOpacity}}/>
                <canvas id="outside-canvas" ref={this.canvas}></canvas>
            </div>
        );
    }
}


// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        visible: state.game.currentNavTab === 'outside',
        shuttersOpen: state.game.shuttersOpen,
        fractionOfDay: fractionOfDay(state.clock),
        elapsedTime: state.clock.elapsedTime,
        structureAnimationData: animationData(state.structures),
        burnOutside: state.game.burnOutside ? state.planet.cookedPct : false,
    }
};

export default connect(
    mapStateToProps,
    {}
)(Outside);