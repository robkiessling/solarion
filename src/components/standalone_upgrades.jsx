import React from 'react';
import {connect} from "react-redux";
import Upgrade from "./upgrade";
import {getStandaloneUpgrades} from "../redux/modules/upgrades";

class StandaloneUpgrades extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="structures">
                {
                    this.props.upgrades.map((upgrade) => {
                        return <Upgrade id={upgrade.id} key={upgrade.id}/>
                    })
                }
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    return {
        upgrades: getStandaloneUpgrades(state.upgrades)
    };
};

export default connect(
    mapStateToProps,
    null
)(StandaloneUpgrades);

