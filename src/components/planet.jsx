import React from 'react';
import {fractionOfDay} from "../redux/modules/clock";
import {connect} from "react-redux";
import {FLATLAND, HOME_BASE, DEVELOPED, MOUNTAIN, NUM_SECTORS, UNKNOWN} from "../lib/planet_map";
import {roundToDecimal} from "../lib/helpers";
import {planetMapImage} from "../redux/reducer";

class Planet extends React.Component {
    constructor(props) {
        super(props);

        // this.manager = new PlanetManager();
    }

    render() {
        console.log('rerender')
        return (
            <div id="planet" className={`${this.props.visible ? '' : 'hidden'}`}>
                <div className="planet-image">
                    {
                        this.props.planetImage.map((imageRow, rowIndex) => {
                            return <span key={rowIndex}>
                                {imageRow.map((glyph, glyphIndex) => {
                                    const {char, color} = glyph;
                                    return <span key={glyphIndex} className={color}>{char}</span>
                                })}
                            </span>
                        })
                    }
                </div>
                <div className="exploration-status">
                    <span>~~ Exploration ~~</span>
                    <span>Sectors: 1 / {NUM_SECTORS} ({roundToDecimal(1 / NUM_SECTORS * 100, 1)}%)</span>
                    <span>Current Sector: 35%</span>
                    <span>Droids: 3</span>
                </div>
                <div className="planet-legend">
                    {/*<span><span className={'home'}>{HOME_BASE}</span> Command Center</span>*/}
                    {/*<span><span className={'unknown'}>{UNKNOWN}</span> Unknown</span>*/}
                    {/*<span><span className={'flatland'}>{FLATLAND}</span> Flatland</span>*/}
                    {/*<span><span className={'developed'}>{DEVELOPED}</span> Developed</span>*/}
                    {/*<span><span className={'mountain'}>{MOUNTAIN}</span> Mountain</span>*/}
                    <span><span className={'home'}>{HOME_BASE} Command Center</span></span>
                    <span><span className={'unknown'}>{UNKNOWN} Unknown</span></span>
                    <span><span className={'flatland'}>{FLATLAND} Flatland</span></span>
                    <span><span className={'developed'}>{DEVELOPED} Developed</span></span>
                    <span><span className={'mountain'}>{MOUNTAIN} Mountain</span></span>
                </div>
            </div>
        );
    }
}

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        visible: state.game.currentNavTab === 'planet',
        fractionOfDay: fractionOfDay(state.clock),
        planetImage: planetMapImage(state)
    }
};

export default connect(
    mapStateToProps,
    {}
)(Planet);