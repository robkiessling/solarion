import React from 'react';
import {connect} from "react-redux";
import {roundToDecimal} from "../lib/helpers";
import DroidCount from "./structures/droid_count";
import Ability from "./structures/ability";
import {getAbility} from "../redux/modules/abilities";
import {getIcon, getQuantity, getResource} from "../redux/modules/resources";
import {clearBeacon, percentExplored} from "../redux/modules/planet";
import {planetDevelopmentProgress, showDroidsUI, surveyAutomationUnlocked} from "../redux/reducer";

/**
 * The Planet tab's left-slot status card, the counterpart of the Base tab's Command Center: how much of the
 * world is known and how far replication has spread. Rows appear as their systems unlock (beacon and scouts
 * arrive with Survey Automation) rather than sitting under empty section headers.
 */
class PlanetCard extends React.Component {
    render() {
        return (
            <div className="planet-card">
                <div className="component-header">Planet</div>

                <span className="key-value-pair">
                    <span>Explored:</span>
                    <span>{roundToDecimal(this.props.percentExplored, 2).toFixed(2)}%</span>
                </span>
                <span className="key-value-pair">
                    <span>Sites found:</span>
                    <span>{this.props.sitesFound}</span>
                </span>
                <span className="key-value-pair">
                    <span>Available Land:</span>
                    <span>
                        {this.props.buildableLand}
                        <span className={this.props.buildableLandIcon}></span>
                    </span>
                </span>
                <span className="key-value-pair">
                    <span>Replication:</span>
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
                {
                    // Scout assignment is the Survey Automation unlock; before it, the squad is the only exploration
                    this.props.showDroidsUI && this.props.surveyUnlocked &&
                    <DroidCount label="Scouts:" droidData={this.props.droidData}
                                tooltipProps={{ place: 'align-left-column' }}
                                assignTooltip={`Assigned scouts automatically survey unexplored ground within uplink range of the powered grid.`}/>
                }

                {
                    // Held while a squad is out: the expedition is the focus, base growth waits for its return
                    // (a fielded squad's replication multiplier is snapshotted at deploy anyway)
                    this.props.replicateAbility && !this.props.finishedReplicating &&
                    <Ability id={this.props.replicateAbility.id} tooltipProps={{ place: 'align-left-column' }}
                             disabledReason={this.props.squadDeployed ? 'Unavailable while the squad is in the field.' : null}/>
                }
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    return {
        percentExplored: percentExplored(state.planet),
        sitesFound: Object.values(state.planet.pois).filter(poi => poi.status !== 'hidden').length,
        buildableLand: getQuantity(getResource(state.resources, 'buildableLand')),
        buildableLandIcon: getIcon('buildableLand'),
        developedLand: getQuantity(getResource(state.resources, 'developedLand')),
        replicateAbility: getAbility(state.abilities, 'replicate'),
        finishedReplicating: planetDevelopmentProgress(state) === 1.0,
        surveyUnlocked: surveyAutomationUnlocked(state),
        showDroidsUI: showDroidsUI(state),
        droidData: state.planet.droidData,
        beaconCoord: state.planet.beaconCoord,
        squadDeployed: !!state.planet.squad
    };
};

export default connect(
    mapStateToProps,
    { clearBeacon }
)(PlanetCard);
