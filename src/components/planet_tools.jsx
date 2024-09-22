import React from 'react';
import {connect} from "react-redux";
import {roundToDecimal} from "../lib/helpers";
import DroidCount from "./structures/droid_count";
import Slider from "rc-slider";
import ReactSwitch from "react-switch";
import {percentExplored, setRotation, setSunTracking} from "../redux/modules/planet";
import {showDroidsUI} from "../redux/reducer";
import {fractionOfDay} from "../redux/modules/clock";
import Replication from "./replication";
import Events from "./events";

class PlanetTools extends React.Component {
    constructor(props) {
        super(props);
    }

    shouldComponentUpdate(nextProps, nextState) {
        // Checking both this props and next props to ensure we update on visibility changes
        return this.props.visible || nextProps.visible;
    }

    render() {
        const sliderMarks = {
            0: '0°',
            0.25: '90°',
            0.5: '180°',
            0.75: '270°',
            1: '360°'
        }

        return (
            <div className={`planet-tools ${this.props.visible ? '' : 'hidden'}`}>
                <div className="exploration-status">
                    <span className='component-header'>Exploration</span>
                    <span className="key-value-pair">
                        <span>Explored:</span>
                        <span>{roundToDecimal(this.props.percentExplored, 2).toFixed(2)}%</span>
                    </span>

                    {/*<span className="key-value-pair">*/}
                    {/*    <span>Overall:</span>*/}
                    {/*    <span>{this.props.overallStatus}</span>*/}
                    {/*</span>*/}

                    <div className={'half-br'}></div>

                    {
                        this.props.showDroidsUI &&
                        <DroidCount droidData={this.props.droidData}
                                    assignTooltip={`Assigned droids will explore the planet surface. Each assigned droid increases the exploration rate.`}/>
                    }

                    <div className={'half-br'}></div>

                    <span>Longitude:</span>
                    <Slider className={'range-slider'}
                            disabled={this.props.sunTracking}
                            min={0} max={1} step={0.02} marks={sliderMarks}
                            onChange={(value) => this.props.setRotation(value)}
                            value={this.props.rotation}/>
                    <div className={'d-flex justify-center'}>
                        <label className={'on-off-switch text-center'}>
                            <ReactSwitch checked={this.props.sunTracking} onChange={this.props.setSunTracking}
                                         checkedIcon={false} uncheckedIcon={false} height={12} width={24}
                            />
                            Lock to Day-Side
                        </label>
                    </div>
                </div>
                <Replication />
                <Events/>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {

    return {
        visible: state.game.currentNavTab === 'planet',
        // fractionOfDay: fractionOfDay(state.clock),

        overallStatus: state.planet.overallStatus,
        percentExplored: percentExplored(state.planet),
        showDroidsUI: showDroidsUI(state),
        droidData: state.planet.droidData,
        rotation: state.planet.rotation,
        sunTracking: state.planet.sunTracking

    };
};

export default connect(
    mapStateToProps,
    { setRotation, setSunTracking }
)(PlanetTools);

