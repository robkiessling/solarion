import React from 'react';
import {connect} from "react-redux";
import {roundToDecimal} from "../../lib/helpers";
import DroidCount from "../structures/droid_count";
import Ability from "../structures/ability";
import Upgrade from "../structures/upgrade";
import {getAbility} from "../../redux/modules/abilities";
import {getStandaloneIds} from "../../redux/modules/upgrades";
import {getIcon, getQuantity, getResource} from "../../redux/modules/resources";
import {clearBeacon, percentExplored} from "../../redux/modules/planet";
import {planetDevelopmentProgress, showDroidsUI, surveyAutomationUnlocked} from "../../redux/reducer";

/**
 * The Planet tab's left-slot status card, the counterpart of the Base tab's Command Center: how much of the
 * world is known and how far replication has spread. Rows appear as their systems unlock (sites once one is
 * found, replication once a secured site offers a copy of the base, land with the replicate ability, beacon and
 * scouts with Survey Automation) rather than sitting under empty section headers.
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
                {
                    this.props.sitesFound > 0 &&
                    <span className="key-value-pair">
                        <span>Sites found:</span>
                        <span>{this.props.sitesFound}</span>
                    </span>
                }
                {
                    // Replication counts command centers: home, then each secured site the base is copied onto (the
                    // offers below), then land copies once the replicate ability opens. The row arrives with the first
                    // offer; land is only ever spent on the ability, so its pair arrives with that.
                    this.props.replicationShown &&
                    <span className="key-value-pair">
                        <span>Replication:</span>
                        <span className="replication-x">×{this.props.developedLand}</span>
                    </span>
                }
                {
                    this.props.replicateAbility &&
                    <span className="key-value-pair">
                        <span>Available Land:</span>
                        <span>
                            {this.props.buildableLand}
                            <span className={this.props.buildableLandIcon}></span>
                        </span>
                    </span>
                }
                {
                    // A secured site's one-time offer: copy the base onto its foundations (replication_site* in
                    // database/base/upgrades.ts). Bought once each, so the list empties as they are taken.
                    this.props.siteUpgradeIds.length > 0 &&
                    <div className="site-replication">
                        {this.props.siteUpgradeIds.map(id =>
                            <Upgrade key={id} id={id} tooltipProps={{ place: 'align-left-column' }}/>)}
                    </div>
                }
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
    const siteUpgradeIds = getStandaloneIds(state.upgrades); // the only standalone upgrades are the site copies
    const developedLand = getQuantity(getResource(state.resources, 'developedLand'));
    const replicateAbility = getAbility(state.abilities, 'replicate');
    return {
        siteUpgradeIds,
        replicationShown: siteUpgradeIds.length > 0 || developedLand > 1 || !!replicateAbility,
        percentExplored: percentExplored(state.planet),
        sitesFound: Object.values(state.planet.pois).filter(poi => poi.status !== 'hidden' && poi.type !== 'camp').length, // camps are contacts, not sites
        buildableLand: getQuantity(getResource(state.resources, 'buildableLand')),
        buildableLandIcon: getIcon('buildableLand'),
        developedLand,
        replicateAbility,
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
