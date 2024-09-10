/**
 * Not sure if going to keep this... deciding between a canvas approach vs. straight up HTML
 */

import React from 'react';
import AsciiCanvas from "../lib/ascii_canvas";
import {connect} from "react-redux";
import {NUM_COLS, NUM_ROWS} from "../lib/outside";
import {drawStarAndProbes} from "../lib/star";
import {getQuantity, getResource} from "../redux/modules/resources";

class Star extends React.Component {
    constructor(props) {
        super(props);

        this.canvasContainer = React.createRef();
        this.canvas = React.createRef();
    }

    componentDidMount() {
        this.canvasManager = new AsciiCanvas(this.canvasContainer.current, this.canvas.current, NUM_ROWS, NUM_COLS);
    }

    shouldComponentUpdate(nextProps, nextState) {
        // Checking both this props and next props to ensure we update on visibility changes
        return this.props.visible || nextProps.visible;
    }

    componentDidUpdate(prevProps, prevState) {
        if (!prevProps.visible && this.props.visible) {
            // Whenever this tab gets switched to we need to resize canvases
            this.canvasManager.resize();
        }

        this.canvasManager.clearAll();
        drawStarAndProbes(this.canvasManager, this.props.elapsedTime, this.props.probeDistribution, this.props.numProbes);
    }

    render() {
        return (
            <div id="star-container" ref={this.canvasContainer} className={`${this.props.visible ? '' : 'hidden'}`}>
                <canvas id="star-canvas" ref={this.canvas}></canvas>
            </div>
        );
    }
}


// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        visible: state.game.currentNavTab === 'star',
        elapsedTime: state.clock.elapsedTime,
        probeDistribution: state.star.distribution,
        numProbes: getQuantity(getResource(state.resources, 'probes'))
    }
};

export default connect(
    mapStateToProps,
    {}
)(Star);