import React from 'react';
import { connect } from 'react-redux';
import Upgrade from "./upgrade";

class Computer extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="computer-container">
                <div className="computer">
                    <div>
                        <b>Computing</b>
                    </div>
                    {
                        this.props.visibleUpgradeIds.map((id) => {
                            return <Upgrade id={id} key={id}/>
                        })
                    }
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {
        visibleUpgradeIds: state.upgrades.visibleIds
    }
};

export default connect(
    mapStateToProps,
    null
)(Computer);