import React from 'react';
import {fractionOfDay} from "../redux/modules/clock";
import {connect} from "react-redux";
import {NUM_SECTORS, TERRAINS, STATUSES} from "../lib/planet_map";
import {roundToDecimal} from "../lib/helpers";
import {numReconDroids, planetMapImage} from "../redux/reducer";

class Planet extends React.Component {
    constructor(props) {
        super(props);

        // this.manager = new PlanetManager();
    }

    render() {
        const legend = [TERRAINS.home, STATUSES.unknown, TERRAINS.flatland, TERRAINS.developed, TERRAINS.mountain];

        return (
            <div id="planet" className={`${this.props.visible ? '' : 'hidden'}`}>
                <div className="planet-image">
                    {
                        this.props.planetImage.map((imageRow, rowIndex) => {
                            return <span key={rowIndex}>
                                {imageRow.map((sector, colIndex) => {
                                    const {char, className} = sector;
                                    return <span key={colIndex} className={className}>{char}</span>
                                })}
                            </span>
                        })
                    }
                </div>
                <div className="exploration-status">
                    <span>~~ Exploration ~~</span>
                    <span>
                        Sectors: {this.props.numExplored} / {NUM_SECTORS}
                        ({roundToDecimal(this.props.numExplored / NUM_SECTORS * 100, 1)}%)
                    </span>
                    <span>Recon Droids: {this.props.numReconDroids}</span>
                    <span>Status: {this.props.overallStatus}</span>
                    <span>prog: {this.props.coordsInProgress.join(', ')}</span>
                </div>
                <div className="planet-legend">
                    {
                        legend.map((attributes) => {
                            return <span key={attributes.key}>
                                <span className={attributes.className}>
                                    {attributes.display} {attributes.label}
                                </span>
                            </span>
                        })
                    }
                    <span style={{marginTop: '2px'}}>
                        <span className={'exploring'}>&nbsp;</span> Exploring
                    </span>
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
        planetImage: planetMapImage(state),
        overallStatus: state.planet.overallStatus,
        coordsInProgress: state.planet.coordsInProgress,
        numExplored: state.planet.numExplored,
        numReconDroids: numReconDroids(state)
    }
};

export default connect(
    mapStateToProps,
    {}
)(Planet);