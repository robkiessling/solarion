import React from 'react';
import { connect } from 'react-redux';
import {
    dayLength,
    dayNumber,
    fractionOfDay,
    surfaceTemperature,
    timePeriodData,
    windSpeed
} from "../redux/modules/clock";
import {updateSetting} from "../redux/modules/game";
import {produce} from "../redux/modules/resources";

class PlanetStatus extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        const debug__maxGameSpeed = 10;

        const timePeriod = timePeriodData(this.props.fractionOfDay)[1];
        const secondsOfDay = this.props.fractionOfDay * (24 * 60 * 60);
        const hour = Math.floor(secondsOfDay / (60 * 60));
        const minutes = _.padStart(Math.round((secondsOfDay % (60 * 60)) / 60), 2, '0');

        return (
            <div className={`planet-status ${this.props.visible ? '' : 'invisible'} d-flex space-between`}>
                <div>
                    <span>Day {this.props.dayNumber} {hour}:{minutes} ({timePeriod})</span>
                </div>
                <div>
                    <span>Temperature: {_.round(this.props.temperature)}°C</span>
                </div>
                <div>
                    <span>Wind: {_.round(this.props.windSpeed)} kph</span>
                </div>
                {/*<div style={{'marginTop': '1rem'}}>*/}
                {/*    [DEBUG] Game speed:*/}
                {/*    <Slider className={'range-slider'}*/}
                {/*            min={0} max={debug__maxGameSpeed} step={0.5}*/}
                {/*            marks={createArray(debug__maxGameSpeed + 1, i => i).reduce((obj, v) => ({ ...obj, [v]: v }), {})}*/}
                {/*            onChange={(value) => this.props.updateSetting('gameSpeed', value)}*/}
                {/*            value={this.props.gameSpeed}/>*/}
                {/*    <button onClick={() => saveState(store.getState())}>Save</button>&emsp;*/}
                {/*    <button onClick={() => resetState()}>Reset</button>&emsp;*/}
                {/*    <button onClick={() => this.props.produce({*/}
                {/*        energy: 1e10, ore: 1e10, refinedMinerals: 1e10*/}
                {/*    })}>Gain Res.</button>*/}
                {/*</div>*/}
            </div>

        );
    }
}

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
    {updateSetting, produce}
)(PlanetStatus);