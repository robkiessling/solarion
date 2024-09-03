/**
 * Not sure if going to keep this... deciding between a canvas approach vs. straight up HTML
 */

import React from 'react';
import Canvas from "../lib/canvas";
import gameClock from "../singletons/game_clock";
import {fractionOfDay} from "../redux/modules/clock";
import {connect} from "react-redux";
import {generateImage, NUM_COLS, NUM_ROWS} from "../lib/outside";
import {animationData} from "../redux/modules/structures";
import {mod} from "../lib/helpers";

const INTERVAL_ID = 'main-display';

const CHANGE_SKY_OPACITY = true; // can turn off for sun orbit testing

// const SUN_ORBIT_X_RADIUS = 120; // This is a percentage; 50 means the x radius is half the width of the canvas
// const SUN_ORBIT_Y_RADIUS = 100;
// const SUN_ORBIT_X_ORIGIN = 50; // This is also a percentage, 50 means x origin is center (50%) of the canvas
// const SUN_ORBIT_Y_ORIGIN = 50;
// const SUN_RADIUS = '115vh'

const SUN_ORBIT_X_RADIUS = 90; // This is a percentage; 50 means the x radius is half the width of the canvas
const SUN_ORBIT_Y_RADIUS = 55;
const SUN_ORBIT_X_ORIGIN = 50; // This is also a percentage, 50 means x origin is center (50%) of the canvas
const SUN_ORBIT_Y_ORIGIN = 30;
const SUN_RADIUS = '60vh'



class Outside extends React.Component {
    constructor(props) {
        super(props);

        this.canvasContainer = React.createRef();
        this.canvas = React.createRef();
        this.skyCanvas = React.createRef();
    }

    componentDidMount() {
        this.canvasManager = new Canvas(this.canvasContainer.current, this.canvas.current, NUM_ROWS, NUM_COLS);
        this.skyCanvasManager = new Canvas(this.canvasContainer.current, this.skyCanvas.current, NUM_ROWS, NUM_COLS);
    }

    componentWillUnmount() {
        gameClock.clearInterval(INTERVAL_ID)
    }

    componentDidUpdate(/* prevProps, prevState */) {
        const image = generateImage(this.props.structureAnimationData, this.props.elapsedTime / 1000, this.props.fractionOfDay);
        this.canvasManager.clearAll();
        this.canvasManager.drawImage(image, 0, 0);
    }

    sunPosition() {
        // Midnight should be at bottom of the unit circle (instead of at (1,0)), so we have to go back 25% of the circle
        const fractionOfDay = mod(this.props.fractionOfDay - 0.25, 1);
        const radians = fractionOfDay * 2 * Math.PI;

        // Formula for an ellipse centered at (0,0):
        //      x = a*cos(t), where a = radius of x axis
        //      y = b*sin(t), where b = radius of y axis
        const x = SUN_ORBIT_X_RADIUS * Math.cos(radians) + SUN_ORBIT_X_ORIGIN;
        const y = SUN_ORBIT_Y_RADIUS * Math.sin(radians) * -1 + SUN_ORBIT_Y_ORIGIN; // Multiply by -1 because positive y direction is down

        return { x, y, radians };
    }

    render() {
        const { x, y, radians } = this.sunPosition();
        const skyColor = `radial-gradient(circle ${SUN_RADIUS} at ${x}% ${y}%, ` +
            `rgb(212 132 41) 20%, rgb(142, 56, 18) 50%, rgb(116 37 10) 100%)`;

        // Math.sin(radians) oscillates between 1 and -1 (y axis of unit circle). Adding a bit so that the sky turns
        // on a little before 6am / turns off a little after 6pm
        const skyOpacity = CHANGE_SKY_OPACITY ? Math.sin(radians) + 0.35 : 1;

        return (
            <div id="outside-container" ref={this.canvasContainer}>
                <canvas id="sky-color" ref={this.skyCanvas} style={{background: skyColor, opacity: skyOpacity}}/>
                <canvas id="outside-canvas" ref={this.canvas}></canvas>
            </div>
        );
    }
}


// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        visible: state.game.currentNavTab === 'surface', // todo
        fractionOfDay: fractionOfDay(state.clock),
        elapsedTime: state.clock.elapsedTime,
        structureAnimationData: animationData(state.structures)
    }
};

export default connect(
    mapStateToProps,
    {}
)(Outside);