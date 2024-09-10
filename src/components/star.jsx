/**
 * Not sure if going to keep this... deciding between a canvas approach vs. straight up HTML
 */

import React from 'react';
import AsciiCanvas from "../lib/ascii_canvas";
import {connect} from "react-redux";
import {generateImage, NUM_COLS, NUM_ROWS} from "../lib/outside";

const STANDARD_A = 130;
const STANDARD_B = 50;
const NUM_PTS = 100;

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

        // const image = generateImage(this.props.structureAnimationData, this.props.elapsedTime / 1000, this.props.fractionOfDay);
        this.canvasManager.clearAll();
        // this.canvasManager.drawCenteredImage([
        //     // [' xx ', 'yellow'],
        //     // ['xxxx', 'yellow'],
        //     // [' xx ', 'yellow']
        //     [[' ', 'yellow'], ['x', 'yellow'], ['x', 'yellow'], [' ', 'yellow']],
        // ]);

        /**
         * When drawn together these ellipses make the appearance of a 3-dimensional donut shape.
         *
         * The constants were chosen through trial-and-error... there is probably some formula to calculate
         * them but I couldn't figure it out. You basically want the x-intercepts of each ring to create a circle
         * shape.
         *
         * In simple terms this is what the constants do:
         * - param #1 (sizeFactor): slowly increases the size of the ellipse as we go from inner donut ring to outer
         *     donut ring
         * - param #2 (bFactor): slowly decrease the ellipse's b attribute as the ring size increases; this makes the
         *     ellipse wider than it is tall which makes it look like it's tilting into the z plane
         * - param #3 (offset): how high/low to offset the ring; the offset increases as we approach the top ring of
         *     the donut, then decreases back to origin as we get to the outer-most ring
         */
        // Top half of donut
        this.time = this.props.elapsedTime / 1000;
        const ORBIT_TIME = 30; // how long it takes
        this.orbitTheta = ((this.props.elapsedTime / 1000) % ORBIT_TIME) / ORBIT_TIME * 2 * Math.PI

        this._drawEllipse(0.00, 2.00,  0); // Inner-most ring
        this._drawEllipse(0.05, 1.90, 20);
        this._drawEllipse(0.25, 1.70, 35);
        this._drawEllipse(0.50, 1.60, 50);
        this._drawEllipse(0.75, 1.50, 60);
        this._drawEllipse(1.00, 1.50, 70); // Top ring
        this._drawEllipse(1.25, 1.40, 70);
        this._drawEllipse(1.50, 1.35, 60);
        this._drawEllipse(1.65, 1.30, 35);
        this._drawEllipse(1.73, 1.20,  0); // Outer-most ring

        // Bottom half of donut
        // this._drawEllipse(0.00, 2.00,  0); // Duplicated ring
        this._drawEllipse(0.05, 1.90, -20);
        this._drawEllipse(0.25, 1.70, -35);
        this._drawEllipse(0.50, 1.60, -50);
        this._drawEllipse(0.75, 1.50, -60);
        this._drawEllipse(1.00, 1.50, -70); // Bottom ring
        this._drawEllipse(1.25, 1.40, -70);
        this._drawEllipse(1.50, 1.35, -60);
        this._drawEllipse(1.65, 1.30, -35);
        // this._drawEllipse(1.73, 1.2,  0); // Duplicated ring
    }

    _drawEllipse(sizeFactor, bFactor = 2, offset = 0) {
        this.canvasManager.drawEllipse('X', NUM_PTS, {
            a: STANDARD_A * (1 + sizeFactor),
            b: STANDARD_B * (1 + sizeFactor * bFactor),

            /* Donut with no rotation */
            // k: offset,
            // h: 0,
            // r: 0

            /* Donut at 45 degree angle */
            k: offset / 2,
            h: offset / 2,
            r: -45
        }, this.orbitTheta);
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
    }
};

export default connect(
    mapStateToProps,
    {}
)(Star);