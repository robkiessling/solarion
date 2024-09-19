import React from 'react';
import {connect} from "react-redux";
import Ability from "./structures/ability";
import {getAbility} from "../redux/modules/abilities";
import {getIcon, getQuantity, getResource} from "../redux/modules/resources";
import {planetDevelopmentProgress} from "../redux/reducer";

class Replication extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div className="replication-status">
                <div className="component-header">Replication</div>

                <span className="key-value-pair">
                    <span>Available Land:</span>
                    <span>
                        {this.props.buildableLand}
                        <span className={this.props.buildableLandIcon}></span>
                    </span>
                </span>
                {/*<span className="key-value-pair">*/}
                {/*    <span>Developed Land:</span>*/}
                {/*    <span>{this.props.developedLand - 1}</span>*/}
                {/*</span>*/}
                <span className="key-value-pair">
                    <span>Replication Multiplier:</span>
                    <span>{this.props.developedLand}x</span>
                </span>

                {this.props.replicateAbility && !this.props.finishedReplicating && <Ability id={this.props.replicateAbility.id} />}


            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    return {
        buildableLand: getQuantity(getResource(state.resources, 'buildableLand')),
        buildableLandIcon: getIcon('buildableLand'),
        developedLand: getQuantity(getResource(state.resources, 'developedLand')),
        replicateAbility: getAbility(state.abilities, 'replicate'),
        finishedReplicating: planetDevelopmentProgress(state) === 1.0
    };
};

export default connect(
    mapStateToProps,
    {}
)(Replication);

