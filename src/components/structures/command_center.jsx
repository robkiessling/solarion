import React from 'react';
import {connect} from "react-redux";
import {getProduction, getStructure} from "../../redux/modules/structures";
import {toString} from "../../redux/modules/resources";

class CommandCenter extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structure">
                <div className="header">
                    <div className="name">{this.props.structure.name}</div>
                </div>
                <div className="buttons">
                    {this.props.buttons}
                </div>
                <div>
                    Produces: {toString(this.props.production)}
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = getStructure(state.structures, ownProps.type);

    return {
        structure: structure,
        production: getProduction(structure)
    }
};

export default connect(
    mapStateToProps,
    {}
)(CommandCenter);

