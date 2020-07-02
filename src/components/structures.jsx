import React from 'react';
import {connect} from "react-redux";
import Structure from "./structure";

class Structures extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structures">
                {this.props.structureOrder.map((structureKey, index) =>
                    <Structure type={structureKey} key={index} />
                )}
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    return {
        structureOrder: state.structures.order
    };
};

export default connect(
    mapStateToProps,
    null
)(Structures);

