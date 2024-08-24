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

        this.nightImage = React.createRef();
        this.dayImage = React.createRef();
        this.skyColor = React.createRef();
    }

    componentDidMount() {
        const background = new Background(this.nightImage.current);
        background.drawImage(backgrounds.stars.background, 3);
        const background2 = new Background(this.dayImage.current);
        background2.drawImage(backgrounds.planet.background, 3);

        // if (!DYNAMIC_SKY) {
        //     this.nightImage.current.style.opacity = 0;
        //     this.dayImage.current.style.opacity = 0.75;
        //     this.dayImage.current.style.background = `radial-gradient(circle at ${25}% ${25}%, rgb(212 132 41) 5%, rgb(142, 56, 18) 5%, rgb(61 19 0) 100%)`;
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
        //         this.dayImage.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgb(212 132 41) 10%, rgb(142, 56, 18) 50%, rgb(116 37 10) 100%)`;
        //         // this.dayImage.current.style.background = `radial-gradient(circle at ${x}% ${y}%, rgb(212, 132, 41) 4%, rgb(142, 56, 18) 6%, rgb(110 39 7) 100%)`
        //
        //         this.dayImage.current.style.opacity = Math.sin(t / 360 * 2 * Math.PI) + 0.25;
        //     }, 100);
        // }
    }

    render() {
        // These are percentages:
        const minX = -10;
        const maxX = 110;
        const minY = -20;
        const maxY = 200;

        // Midnight = Bottom of unit circle, so we have to go back 25% of the circle
        const fractionOfDay = (this.props.fractionOfDay - 0.25) % 1;
        const radians = fractionOfDay * 2 * Math.PI;
        const x = ((Math.cos(radians) + 1) / 2) * Math.abs(maxX - minX) + minX;
        const y = ((-Math.sin(radians) + 1) / 2) * Math.abs(maxY - minY) + minY;

        const skyColor = `radial-gradient(circle at ${x}% ${y}%, ` +
            `rgb(212 132 41) 10%, rgb(142, 56, 18) 50%, rgb(116 37 10) 100%)`;
        const skyOpacity = Math.sin(radians) + 0.25;
        const nightOpacity = -Math.sin(radians) + 0.6;

        return (
            <div id="outside" className={`${this.props.windowOpen ? 'open' : 'closed'} ${this.props.visible ? '' : 'hidden'}`}>
                <pre className="shutters"></pre>
                <pre className="sky-color" ref={this.skyColor} style={{background: skyColor, opacity: skyOpacity}}/>
                <pre className="sky-image" ref={this.dayImage}/>
                <pre className="sky-image" ref={this.nightImage} style={{opacity: nightOpacity}}/>
            </div>
        );
    }
}

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        visible: state.game.currentNavTab === 'planet',
        fractionOfDay: fractionOfDay(state.clock),
        windowOpen: state.game.windowOpen
    }
};

export default connect(
    mapStateToProps,
    {}
)(Outside);