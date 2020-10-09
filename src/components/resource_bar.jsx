import React from 'react';
import { connect } from 'react-redux';

import Resource from "./resource"
import {getNetResourceRates} from "../redux/reducer";
import {getCapacity, getQuantity} from "../redux/modules/resources";
import {dayLength, dayNumber, fractionOfDay} from "../redux/modules/clock";
import Clock from "./clock";

class ResourceBar extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="resource-bar">
                <div>
                    {/*Time: { Math.floor(this.props.elapsedTime / 1000.0) }*/}
                    {/*<br/>*/}
                    <Clock dayLength={this.props.dayLength}
                           dayNumber={this.props.dayNumber}
                           fractionOfDay={this.props.fractionOfDay} />
                </div>
                <br/>
                {
                    this.props.visibleIds.map((id) => {
                        const resource = this.props.resources[id];
                        return <Resource type={id} key={id}
                                         rate={this.props.netResourceRates[id]}
                                         name={resource.name}
                                         icon={resource.icon}
                                         colorRate={true}
                                         quantity={getQuantity(resource)}
                                         capacity={getCapacity(resource)}
                        />
                    })
                }
            </div>
        );
    }
}

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        elapsedTime: state.clock.elapsedTime,
        visibleIds: state.resources.visibleIds,
        resources: state.resources.byId,
        netResourceRates: getNetResourceRates(state),
        dayLength: dayLength(state.clock),
        dayNumber: dayNumber(state.clock),
        fractionOfDay: fractionOfDay(state.clock),
    }
};

export default connect(
    mapStateToProps,
    {}
)(ResourceBar);