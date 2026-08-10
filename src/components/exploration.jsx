import React from 'react';
import {connect} from "react-redux";
import {roundToDecimal} from "../lib/helpers";
import DroidCount from "./structures/droid_count";
import Slider from "rc-slider";
import {percentExplored, ROTATION_MODES, setRotation, setRotationMode} from "../redux/modules/planet";
import {showDroidsUI} from "../redux/reducer";

// Camera segmented control: [mode, label]. 'Team' follows the expedition squad (or centers home base when idle).
const CAMERA_MODE_OPTIONS = [
    [ROTATION_MODES.manual, 'Manual'],
    [ROTATION_MODES.sun, 'Daytime'],
    [ROTATION_MODES.squad, 'Team']
];

class Exploration extends React.Component {
    render() {
        const sliderMarks = {
            0: '0°',
            0.25: '90°',
            0.5: '180°',
            0.75: '270°',
            1: '360°'
        }

        return (
            <div className="exploration-status">
                <span className='component-header'>Exploration</span>
                <span className="key-value-pair">
                    <span>Explored:</span>
                    <span>{roundToDecimal(this.props.percentExplored, 2).toFixed(2)}%</span>
                </span>

                <div className={'half-br'}></div>

                {
                    this.props.showDroidsUI &&
                    <DroidCount droidData={this.props.droidData}
                                assignTooltip={`Assigned droids will explore the planet surface. Each assigned droid increases the exploration rate.`}/>
                }

                <div className={'half-br'}></div>

                <div className="camera-modes">
                    <span className="camera-modes-label">Camera:</span>
                    <div className="camera-mode-options">
                        {CAMERA_MODE_OPTIONS.map(([mode, label]) =>
                            <a key={mode}
                               className={`camera-mode ${mode === this.props.rotationMode ? 'current' : ''}`}
                               onClick={() => this.props.setRotationMode(mode)}>
                                <span className={mode !== this.props.rotationMode ? 'invisible' : ''}>[[</span>
                                {label}
                                <span className={mode !== this.props.rotationMode ? 'invisible' : ''}>]]</span>
                            </a>
                        )}
                    </div>
                </div>

                <div className={'half-br'}></div>

                <span>Longitude:</span>
                <Slider className={'range-slider'}
                        disabled={this.props.rotationMode !== ROTATION_MODES.manual}
                        min={0} max={1} step={0.02} marks={sliderMarks}
                        onChange={(value) => this.props.setRotation(value)}
                        value={this.props.rotation}/>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    return {
        percentExplored: percentExplored(state.planet),
        showDroidsUI: showDroidsUI(state),
        droidData: state.planet.droidData,
        rotation: state.planet.rotation,
        rotationMode: state.planet.rotationMode
    };
};

export default connect(
    mapStateToProps,
    { setRotation, setRotationMode }
)(Exploration);
