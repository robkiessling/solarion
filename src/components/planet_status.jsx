import React from 'react';
import { connect } from 'react-redux';
import Clock from "./clock";
import {dayLength, dayNumber, fractionOfDay, surfaceTemperature, windSpeed} from "../redux/modules/clock";

// TODO rename to CommandCenter?

class PlanetStatus extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
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
        windSpeed: windSpeed(state.clock)
    }
};

export default connect(
    mapStateToProps,
    {}
)(PlanetStatus);