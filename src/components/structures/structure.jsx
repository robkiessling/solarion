import React from 'react';
import {connect} from "react-redux";
import structures from "../../database/structures"
import {build} from "../../redux/modules/structures";
import resourceManager from "../../singletons/resource_manager";

class Structure extends React.Component {
    constructor(props) {
        super(props);
    }

    _canBuild() {
        return resourceManager.hasQuantity('minerals', this.props.record.cost.minerals.base);
    }

    costString() {
        return ` (-${this.props.record.cost.minerals.base})`;
    }

    render() {
        return (
            <div className="structure">
                <div className="header">
                    <div className="name">{this.props.record.name}</div>
                    <div className="count">{this.props.data.count}</div>
                </div>
                <div className="buttons">
                    <button onClick={() => this.props.build(this.props.type, 1, this.props.record.cost)}
                            disabled={!this._canBuild()}>
                        Build {this.props.record.name}{this.costString()}
                    </button>
                    {this.props.buttons}
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    return {
        resources: state.resources,
        record: structures[ownProps.type],
        data: state.structures.byId[ownProps.type]
    }
};

export default connect(
    mapStateToProps,
    { build }
)(Structure);

