import React from 'react';
import {fractionOfDay} from "../redux/modules/clock";
import {connect} from "react-redux";
import {NUM_SECTORS, TERRAINS, STATUSES} from "../lib/planet_map";
import {roundToDecimal} from "../lib/helpers";
import {numReconDroids, planetMapImage} from "../redux/reducer";
import Slider from "rc-slider";
import {percentExplored, setRotation, setSunTracking} from "../redux/modules/planet";
import ReactSwitch from "react-switch";

class Planet extends React.Component {
    constructor(props) {
        super(props);

        // this.manager = new PlanetManager();
    }

    render() {
        const legend = [TERRAINS.home, STATUSES.unknown, TERRAINS.flatland, TERRAINS.developed, TERRAINS.mountain];
        const sliderMarks = {
            0: '0°',
            0.25: '90°',
            0.5: '180°',
            0.75: '270°',
            1: '360°'
        }

        return (
            <div id="planet" className={`${this.props.visible ? '' : 'hidden'}`}>
                <div className="planet-image">
                    {
                        this.props.planetImage.map((imageRow, rowIndex) => {
                            return <span key={rowIndex}>
                                {imageRow.map((sector, colIndex) => {
                                    const {char, className, style} = sector;
                                    if (style) {
                                        return <span key={colIndex} className={className} style={style}>{char}</span>
                                    }
                                    else {
                                        return <span key={colIndex} className={className}>{char}</span>
                                    }
                                })}
                            </span>
                        })
                    }
                </div>
                <div className="exploration-status">
                    <span className='justify-center'>~~ Planet ~~</span>
                    <span className="key-value-pair">
                        <span>Explored:</span>
                        <span>{roundToDecimal(this.props.percentExplored, 2).toFixed(2)}%</span>
                    </span>
                    <span className="key-value-pair">
                        <span>Recon Droids:</span>
                        <span>{this.props.numReconDroids}</span>
                    </span>
                    <span className="key-value-pair">
                        <span>Available Flatland:</span>
                        <span>{this.props.numExploredFlatland}</span>
                    </span>

                    <br/>
                    <span>Longitude:</span>
                    <Slider className={'range-slider'}
                            disabled={this.props.sunTracking}
                            min={0} max={1} step={0.01} marks={sliderMarks}
                            onChange={(value) => this.props.setRotation(value)}
                            value={this.props.rotation}/>
                    <div className={'justify-center'}>
                        <label className={'on-off-switch text-center'}>
                            <ReactSwitch checked={this.props.sunTracking} onChange={this.props.setSunTracking}
                                         checkedIcon={false} uncheckedIcon={false} height={12} width={24}
                            />
                            Track Daytime
                        </label>
                    </div>
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
        percentExplored: percentExplored(state.planet),
        numExploredFlatland: state.planet.numExploredFlatland,
        numReconDroids: numReconDroids(state),
        rotation: state.planet.rotation,
        sunTracking: state.planet.sunTracking
    }
};

export default connect(
    mapStateToProps,
    { setRotation, setSunTracking }
)(Planet);