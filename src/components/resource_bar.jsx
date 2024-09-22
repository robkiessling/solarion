import React from 'react';
import { connect } from 'react-redux';

import {getNetResourceRates} from "../redux/reducer";
import {getCapacity, getQuantity} from "../redux/modules/resources";
import ResourceAmount from "./ui/resource_amount";
import {isTargetingPlanet} from "../redux/modules/star";

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
                            const quantity = getQuantity(resource);
                            let showRate = resource.showRate
                            let capacity = getCapacity(resource);

                            if (id === 'energy' && this.props.mirroringToPlanet) {
                                capacity = undefined;
                                showRate = false;
                            }

                            if (this.props.showResourceRates) {
                                return <tr key={id}>
                                    <td width={'25%'}>
                                        {resource.name}
                                    </td>
                                    <td width={'45%'}>
                                        <ResourceAmount amount={quantity} icon={resource.icon} capacity={capacity}/>
                                    </td>
                                    <td width={'30%'}>
                                        {showRate && <ResourceAmount amount={this.props.netResourceRates[id]} asRate={true} colorRate={true} />}
                                    </td>
                                </tr>
                            }
                            else {
                                return <tr key={id}>
                                    <td width={'50%'}>
                                        {resource.name}
                                    </td>
                                    <td width={'50%'}>
                                        <ResourceAmount amount={quantity} icon={resource.icon} capacity={capacity}/>
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

const mapStateToProps = state => {
    return {
        visible: state.game.showResourceBar,
        showResourceRates: state.game.showResourceRates,
        visibleIds: state.resources.visibleIds,
        resources: state.resources.byId,
        netResourceRates: getNetResourceRates(state),
        mirroringToPlanet: isTargetingPlanet(state.star)
    }
};

export default connect(
    mapStateToProps,
    {}
)(ResourceBar);