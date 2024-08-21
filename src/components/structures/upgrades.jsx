import React from "react";
import {connect} from "react-redux";
import {getStructureUpgradeIds} from "../../redux/reducer";
import Upgrade from "./upgrade";

class Upgrades extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {

        return <div className="upgrades-area">
            {
                this.props.upgradeIds.map(id => {
                    return <Upgrade key={id} id={id} />
                })
            }
        </div>
    }
}

const mapStateToProps = (state, ownProps) => {
    const structure = ownProps.structure;

    return {
        upgradeIds: getStructureUpgradeIds(state, structure)
    }
};

export default connect(
    mapStateToProps,
    null
)(Upgrades);