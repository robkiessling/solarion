/**
 * Not sure if going to keep this... deciding between a canvas approach vs. straight up HTML
 */

import React from 'react';
import Background from "../lib/background";
import backgrounds from "../database/backgrounds";
import {fractionOfDay} from "../redux/modules/clock";
import {connect} from "react-redux";

const DYNAMIC_SKY = true;

class Outside extends React.Component {
    constructor(props) {
        super(props);

        this.nightSky = React.createRef();
        this.daySky = React.createRef();
    }

    componentDidMount() {
        const background = new Background(this.nightSky.current);
        background.drawImage(backgrounds.stars.background);
        const background2 = new Background(this.daySky.current);
        background2.drawImage(backgrounds.planet.background);

        // if (!DYNAMIC_SKY) {
        //     this.nightSky.current.style.opacity = 0;
        //     this.daySky.current.style.opacity = 0.75;
        //     this.daySky.current.style.background = `radial-gradient(circle at ${25}% ${25}%, rgb(212 132 41) 5%, rgb(142, 56, 18) 5%, rgb(61 19 0) 100%)`;
        // }
        // else {
        //     const minX = -10;
        //     const maxX = 110;
        //     const minY = -20;
        //     const maxY = 200;
        //     let t = 0;
        //
        //     window.setInterval(() => {
        //         t += 1;
        //         t = t % 360;
        //         let x = ((Math.cos(t / 360 * 2 * Math.PI) + 1) / 2) * Math.abs(maxX - minX) + minX;
        //         let y = ((-Math.sin(t / 360 * 2 * Math.PI) + 1) / 2) * Math.abs(maxY - minY) + minY;
        //
        //         this.daySky.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgb(212 132 41) 10%, rgb(142, 56, 18) 50%, rgb(116 37 10) 100%)`;
        //         // this.daySky.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgb(212, 132, 41) 4%, rgb(142, 56, 18) 6%, rgb(110 39 7) 100%)`
        //
        //         this.daySky.current.style.opacity = Math.sin(t / 360 * 2 * Math.PI) + 0.25;
        //     }, 100);
        // }
    }

    render() {
        const minX = -10;
        const maxX = 110;
        const minY = -20;
        const maxY = 200;

        // Midnight = Bottom of unit circle, so we have to go back 25% of the circle
        const fractionOfDay = (this.props.fractionOfDay - 0.25) % 1;
        const radians = fractionOfDay * 2 * Math.PI;
        const x = ((Math.cos(radians) + 1) / 2) * Math.abs(maxX - minX) + minX;
        const y = ((-Math.sin(radians) + 1) / 2) * Math.abs(maxY - minY) + minY;

        const dayBackground = `radial-gradient(circle at ${x}% ${y}%, ` +
            `rgb(212 132 41) 10%, rgb(142, 56, 18) 50%, rgb(116 37 10) 100%)`;
        const dayOpacity = Math.sin(radians) + 0.25;

        return (
            <div id="outside">
                <pre className="sky" ref={this.nightSky}/>
                <pre className="sky" ref={this.daySky} style={{background: dayBackground, opacity: dayOpacity}}/>
                <div className="outside-border"/>
            </div>
        );
    }
}

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        fractionOfDay: fractionOfDay(state.clock),
    }
};

export default connect(
    mapStateToProps,
    {}
)(Outside);