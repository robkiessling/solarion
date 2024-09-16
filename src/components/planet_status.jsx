import React from 'react';
import { connect } from 'react-redux';
import Clock from "./clock";
import {dayLength, dayNumber, fractionOfDay, surfaceTemperature, windSpeed} from "../redux/modules/clock";
import Slider from "rc-slider";
import {updateSetting} from "../redux/modules/game";
import {createArray} from "../lib/helpers";

// TODO rename to CommandCenter?

class PlanetStatus extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        const debug__maxGameSpeed = 10;

        return (
            <div className={`planet-status ${this.props.visible ? '' : 'invisible'}`}>
                <div className="component-header">Command Center: XLJ-800</div>
                <div>
                    <Clock dayLength={this.props.dayLength}
                           dayNumber={this.props.dayNumber}
                           fractionOfDay={this.props.fractionOfDay} />
                    Temperature: {_.round(this.props.temperature)}°C<br/>
                    Wind: {_.round(this.props.windSpeed)} mph
                </div>
                <div style={{'marginTop': '1rem'}}>
                    [DEBUG] Game speed:
                    <Slider className={'range-slider'}
                            min={0} max={debug__maxGameSpeed} step={0.5}
                            marks={createArray(debug__maxGameSpeed + 1, i => i).reduce((obj, v) => ({ ...obj, [v]: v }), {})}
                            onChange={(value) => this.props.updateSetting('gameSpeed', value)}
                            value={this.props.gameSpeed}/>
                </div>
            </div>

        );
    }
}

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        visible: state.game.showPlanetStatus,// && state.game.currentNavTab === 'outside',
        dayLength: dayLength(state.clock),
        dayNumber: dayNumber(state.clock),
        fractionOfDay: fractionOfDay(state.clock),
        temperature: surfaceTemperature(state.clock),
        windSpeed: windSpeed(state.clock),

        gameSpeed: state.game.gameSpeed
    }
};

export default connect(
    mapStateToProps,
    { updateSetting }
)(PlanetStatus);