import React from 'react';
import Structure from "./structure";
import {connect} from "react-redux";
import {getStructureStatistic} from "../../redux/reducer";
import {getStructure} from "../../redux/modules/structures";
import ResourceAmounts from "../ui/resource_amounts";
import {getIcon} from "../../redux/modules/resources";


export class EnergyBay extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <Structure type="energyBay">
                {
                    this.props.isBuilt && Object.keys(this.props.capacity).length > 0 &&
                    <div className={`d-flex space-between`}>
                        <div>Capacity:</div>
                        <div><ResourceAmounts amounts={this.props.capacity} /></div>
                    </div>
                }
                {
                    this.props.isBuilt && Object.keys(this.props.boost).length > 0 && this.props.boost.energy > 0 &&
                    <div className={`d-flex space-between`}>
                        <div>Production Boost:</div>
                        <div>{Math.floor(this.props.boost.energy * 100)}%<span className={getIcon('energy')}></span></div>
                    </div>
                }
            </Structure>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = getStructure(state.structures, 'energyBay');

    return {
        isBuilt: structure.count.total > 0,
        capacity: getStructureStatistic(state, structure, 'capacity'),
        boost: getStructureStatistic(state, structure, 'boost'),
    }
}

export default connect(
    mapStateToProps,
    {}
)(EnergyBay);

