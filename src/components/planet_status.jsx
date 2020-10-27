import React from 'react';
import { connect } from 'react-redux';
import Clock from "./clock";
import {dayLength, dayNumber, fractionOfDay, surfaceTemperature, windSpeed} from "../redux/modules/clock";

class PlanetStatus extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="planet-status">
                <span className="planet-name">Planet: XLJ-800</span><br/>
                <Clock dayLength={this.props.dayLength}
                       dayNumber={this.props.dayNumber}
                       fractionOfDay={this.props.fractionOfDay} />
                Temperature: {this.props.temperature}°C<br/>
                Wind: {this.props.windSpeed} knots
            </div>

        );
    }
}

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
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