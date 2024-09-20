import React from 'react';
import { connect } from 'react-redux';

import {getNetResourceRates} from "../redux/reducer";
import {getCapacity, getQuantity} from "../redux/modules/resources";
import ResourceAmount from "./ui/resource_amount";

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

                            if (this.props.showResourceRates) {
                                return <tr key={id}>
                                    <td width={'25%'}>
                                        {resource.name}
                                    </td>
                                    <td width={'45%'}>
                                        <ResourceAmount amount={getQuantity(resource)} icon={resource.icon} capacity={getCapacity(resource)}/>
                                    </td>
                                    <td width={'30%'}>
                                        {resource.showRate && <ResourceAmount amount={this.props.netResourceRates[id]} asRate={true} colorRate={true} />}
                                    </td>
                                </tr>
                            }
                            else {
                                return <tr key={id}>
                                    <td width={'50%'}>
                                        {resource.name}
                                    </td>
                                    <td width={'50%'}>
                                        <ResourceAmount amount={getQuantity(resource)} icon={resource.icon} capacity={getCapacity(resource)}/>
                                    </td>
                                </tr>
                            }
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
        showResourceRates: state.game.showResourceRates,
        visibleIds: state.resources.visibleIds,
        resources: state.resources.byId,
        netResourceRates: getNetResourceRates(state)
    }
};

export default connect(
    mapStateToProps,
    {}
)(ResourceBar);