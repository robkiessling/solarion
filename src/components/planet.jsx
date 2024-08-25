import React from 'react';
import {fractionOfDay} from "../redux/modules/clock";
import {connect} from "react-redux";
import PlanetManager from "../lib/planet_manager";

class Planet extends React.Component {
    constructor(props) {
        super(props);

        this.manager = new PlanetManager();
    }

    render() {
        const image = this.manager.image(this.props.fractionOfDay);

        return (
            <div id="planet" className={`${this.props.visible ? '' : 'hidden'}`}>
                <div className="planet-image">
                    {
                        image.map((imageRow, rowIndex) => {
                            return <span key={rowIndex}>
                                {imageRow.map((glyph, glyphIndex) => {
                                    const { char, color } = glyph;
                                    return <span key={glyphIndex} className={color}>{char}</span>
                                })}
                            </span>
                        })
                    }
                </div>
                <div className="exploration-status">
                    <span></span>
                </div>
            </div>
        );
    }
}

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        visible: state.game.currentNavTab === 'planet',
        fractionOfDay: fractionOfDay(state.clock)
    }
};

export default connect(
    mapStateToProps,
    {}
)(Planet);