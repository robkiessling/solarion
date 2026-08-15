import React from 'react';
import {connect} from "react-redux";
import Ability from "./structures/ability";
import {getAbility} from "../redux/modules/abilities";
import {getIcon, getQuantity, getResource} from "../redux/modules/resources";
import {clearBeacon} from "../redux/modules/planet";
import {planetDevelopmentProgress, surveyAutomationUnlocked} from "../redux/reducer";

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
                    <span className="replication-x">×{this.props.developedLand}</span>
                </span>
                {
                    // The growth beacon (ships with Survey Automation): replication grows toward it
                    this.props.surveyUnlocked &&
                    <span className="key-value-pair">
                        <span>Growth Beacon:</span>
                        {this.props.beaconCoord ?
                            <a onClick={() => this.props.clearBeacon()}>Set [[clear]]</a> :
                            <span>None (click map)</span>}
                    </span>
                }

                {this.props.replicateAbility && !this.props.finishedReplicating &&
                    <Ability id={this.props.replicateAbility.id} tooltipProps={{ place: 'align-left-column' }} />}


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
        finishedReplicating: planetDevelopmentProgress(state) === 1.0,
        surveyUnlocked: surveyAutomationUnlocked(state),
        beaconCoord: state.planet.beaconCoord
    };
};

export default connect(
    mapStateToProps,
    { clearBeacon }
)(Replication);

