import React from 'react';
import { connect } from 'react-redux';
import {getStandaloneIds} from "../redux/modules/upgrades";
import ComputerUpgrade from "./computer_upgrade";

class Computer extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="computer-container">
                <div className="computer">
                    {
                        this.props.visibleUpgradeIds.map((id) => {
                            return <ComputerUpgrade id={id} key={id}/>
                        })
                    }
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {
        visibleUpgradeIds: getStandaloneIds(state.upgrades)
    }
};

export default connect(
    mapStateToProps,
    null
)(Computer);