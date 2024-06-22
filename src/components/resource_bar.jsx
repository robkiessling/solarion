import React from 'react';
import { connect } from 'react-redux';

import Resource from "./resource"
import {getNetResourceRates} from "../redux/reducer";
import {getCapacity, getQuantity} from "../redux/modules/resources";

class ResourceBar extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className={`resource-bar ${this.props.visible ? '' : 'hidden'}`}>
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
        visible: state.game.showResourceBar,
        elapsedTime: state.clock.elapsedTime,
        visibleIds: state.resources.visibleIds,
        resources: state.resources.byId,
        netResourceRates: getNetResourceRates(state)
    }
};

export default connect(
    mapStateToProps,
    {}
)(ResourceBar);