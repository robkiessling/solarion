/**
 * Not sure if going to keep this... deciding between a canvas approach vs. straight up HTML
 */

import React from 'react';
import Canvas from "../lib/canvas";

export default class Outside extends React.Component {
    constructor(props) {
        super(props);

        this.canvasContainer = React.createRef();
        this.canvas = React.createRef();
    }

    componentDidMount() {
        const canvas = new Canvas(this.canvasContainer.current, this.canvas.current);

        const image = [
            'asdf',
            'fdsa'
        ]
        canvas.drawImage(image, 0, 0);
    }


    render() {
        return (
            <div id="outside-container" ref={this.canvasContainer}>
                <canvas id="outside-canvas" ref={this.canvas}>

                </canvas>
            </div>
        );
    }
}