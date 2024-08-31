import React from 'react';
import { connect } from 'react-redux';

import {getNetResourceRates} from "../redux/reducer";
import {getCapacity, getQuantity} from "../redux/modules/resources";
import ResourceRate from "./ui/resource_rate";

class ResourceBar extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className={`resource-bar ${this.props.visible ? '' : 'invisible'}`}>
                <div className="component-header">Resources</div>
                <table>
                    <tbody>
                    {
                        this.props.visibleIds.map(id => {
                            const resource = this.props.resources[id];
                            const capacityText = getCapacity(resource) < Infinity ? `/${getCapacity(resource)}` : null;
                            return <tr key={id}>
                                <td width={'30%'}>
                                    {resource.name}
                                </td>
                                <td width={'35%'}>
                                    {Math.floor(getQuantity(resource))}{capacityText}<span className={resource.icon}/>
                                </td>
                                <td width={'35%'}>
                                    <ResourceRate rate={this.props.netResourceRates[id]} colorRate={true} parenthesis={true}/>
                                </td>
                            </tr>
                        })
                    }
                    </tbody>
                </table>
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