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
                {this.props.visibleIds.map((id) =>
                    <Structure type={id} key={id} />
                )}
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    return {
        visibleIds: state.structures.visibleIds
    };
};

export default connect(
    mapStateToProps,
    null
)(Structures);

