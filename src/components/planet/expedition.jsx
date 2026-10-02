import React from 'react';
import ReactTooltip from "react-tooltip";
import {connect} from "react-redux";
import {deploySquad, disbandSquad} from "../../redux/modules/squad";
import {formatResourceList} from "../../lib/planet/pois";
import {EQUIPMENT_DEFS, EQUIPMENT_ORDER} from "../../database/squad/equipment";
import upgradesDatabase from "../../database/base/upgrades";
import {pendingForSquad} from "../../redux/modules/decisions";
import {isOnGrid} from "../../lib/planet/squad";
import {SQUAD_DRAIN_PER_TILE} from "../../database/squad/tuning";
import {getBatteryCapacity, getDroidStats, getReplicationMultiplier, getSquadUpgradeIds, ownedEquipment} from "../../redux/reducer";
import DecisionRow from "../structures/decision_row";
import DroidCount from "../structures/droid_count";
import Upgrade from "../structures/upgrade";
import Tooltip from "../ui/tooltip";
import Vista from "./vista";

const formatStat = (n) => Number.isInteger(n) ? n : n.toFixed(1);

// "●●○": charges remaining vs spent for one equipment piece
const chargeDots = (itemId, charges) =>
    '●'.repeat(charges) + '○'.repeat(Math.max(0, EQUIPMENT_DEFS[itemId].charges - charges));

/**
 * Squad sidebar. The one player-driven squad: staff it (droids are assigned like a structure's), equip and
 * deploy it here, drive it on the map with arrows/WASD. Fights start by stepping into a settlement on the map and play out in the encounter popup;
 * site intel lives on the map itself (glyphs), not in a directory here.
 */
class Expedition extends React.Component {
    // The squad's gear: owned pieces (one-time factory upgrades / story salvage) ride along automatically.
    // At base: names only (a fresh squad always leaves fully loaded), comma separated. Fielded: charge dots per
    // piece, which separate the pieces themselves (a comma after a dot reads as part of the count).
    renderEquipment(carried) {
        const ids = EQUIPMENT_ORDER.filter(id => carried[id] !== undefined);
        if (ids.length === 0) return null;

        return (
            <React.Fragment>
                <span className="cargo-line key-value-pair">
                    <span>Equipment:</span>
                    {/* Each piece is an unbreakable unit, so a long list wraps between pieces (right-aligned
                        under the first line), never mid-name or between a name and its charge dots. The
                        separating space sits between the pieces, not inside one: a space inside a nowrap
                        span is no place to break, and the whole list would run off the panel. */}
                    <span className="equipment-list">
                        {ids.map((id, i) =>
                            <React.Fragment key={id}>
                                {i > 0 && ' '}
                                <span className="equipment-item" data-tip data-for={`equipment-${id}-tip`}>
                                    {this.props.squad ?
                                        `${EQUIPMENT_DEFS[id].name} ${chargeDots(id, carried[id])}` :
                                        `${EQUIPMENT_DEFS[id].name}${i < ids.length - 1 ? ',' : ''}`}
                                </span>
                            </React.Fragment>)}
                    </span>
                </span>
                {/* One tooltip per piece: what it does (its upgrade's card text, the only place a found piece's
                    text is read outside a fight) and the stock a fresh loadout holds (read from the state, not
                    written into the text, so it follows whatever raises it) */}
                {ids.map(id =>
                    <Tooltip key={id} id={`equipment-${id}-tip`}>
                        <p className="tooltip-header">{EQUIPMENT_DEFS[id].name}</p>
                        <p>{upgradesDatabase[EQUIPMENT_DEFS[id].upgradeId].description}</p>
                        <p>Stock: {this.props.ownedEquipment[id] ?? EQUIPMENT_DEFS[id].charges}</p>
                    </Tooltip>)}
            </React.Fragment>
        );
    }

    renderTeamCard() {
        const { squad, onGrid } = this.props;

        if (!squad) {
            const size = this.props.squadDroidData.numDroidsAssigned; // the team standing by at base
            const multiplier = this.props.multiplier;
            return (
                <div className="squad-card">
                    <DroidCount droidData={this.props.squadDroidData}
                                assignTooltip="Assigned droids stand by at base until the team deploys."/>
                    {multiplier > 1 &&
                        <React.Fragment>
                            <span className="spec-line key-value-pair" data-tip data-for="staging-fielded-tip">
                                <span>Fielded:</span>
                                <span><span className="replication-x">(×{multiplier})</span> = {size * multiplier} units</span>
                            </span>
                            <Tooltip id="staging-fielded-tip">
                                <p className="tooltip-header">Fielded</p>
                                <p>Replication multiplies the fielded force, snapshotted at deploy.</p>
                            </Tooltip>
                        </React.Fragment>}
                    {/* No squad health or range rows: squad health is the count times Droid Health below (and
                        the HUD carries it live once deployed); range is the battery itself, a unit per tile */}
                    <span className="spec-line key-value-pair" data-tip data-for="staging-battery-tip">
                        <span>Battery:</span>
                        <span>{this.props.batteryCapacity}</span>
                    </span>
                    <Tooltip id="staging-battery-tip">
                        <p className="tooltip-header">Battery</p>
                        <p>{`Drains ${formatStat(SQUAD_DRAIN_PER_TILE)} per tile off the grid; recharges at base.`}</p>
                        <p>At zero the squad runs on reserve power: every tile costs a droid.</p>
                    </Tooltip>
                    {this.renderEquipment(this.props.ownedEquipment)}
                </div>
            );
        }

        return (
            <div className="squad-card">
                <div className="team-line">
                    <span className="key-value-pair">
                        <span>Droids:</span>
                        {/* Survivors / fielded, like the battle header's fractions: the count of the dead (the
                            HUD's squad health shows them too, as the part of the bar a grid repair can't refill).
                            A replicated force tints the icon pink instead of spelling out the math. */}
                        <span>
                            {squad.squadSize} / {(squad.assignedDroids || squad.squadSize) * (squad.multiplier || 1)}{' '}
                            <span className={`icon-vintage-robot${(squad.multiplier || 1) > 1 ? ' replication-x' : ''}`}/>
                        </span>
                    </span>
                </div>
                {/* Squad health, battery, range and the terrain underfoot all read live on the HUD above the
                    map while fielded; the card keeps what the HUD doesn't carry */}
                <span className="cargo-line key-value-pair">
                    <span>Cargo:</span><span>{formatResourceList(squad.cargo) || 'Empty'}</span>
                </span>
                {this.renderEquipment(squad.equipment || {})}
                <div className="squad-actions">
                    <span data-tip data-for="disband-tip">
                        <button className="disband" disabled={!onGrid || !!squad.fighting}
                                onClick={() => { ReactTooltip.hide(); this.props.disbandSquad(); }}>
                            Disband</button>
                    </span>
                    <Tooltip id="disband-tip">
                        <p className="tooltip-header">Disband</p>
                        <p>Settles the expedition: surviving units stand down as whole droids, still
                            assigned to the team.</p>
                        {!onGrid && <p>Return to base to disband.</p>}
                    </Tooltip>
                </div>
            </div>
        );
    }

    // Outfitting (staging only): one droid's combat spec, and under it the upgrades that exist purely for
    // expeditions (equipment, combat stats, battery, tracks), offered here and nowhere else, with any pending
    // squad decision above them (the machine asking sits over the machine offering, as on a structure card).
    // The spec rows stay up with nothing on offer (the list is simply empty). Refits apply to the next
    // deployment, so the section folds away while a squad is out.
    renderOutfitting() {
        const { squad, squadUpgradeIds, squadDecisions, droidStats } = this.props;
        if (squad) return null;

        return (
            <div className="outfitting">
                {/* No title: the card's divider above sets the section off, and the rows name themselves.
                    One row per stat, like the squad card's rows above. */}
                <span className="spec-line key-value-pair">
                    <span>Droid Health:</span>
                    <span>{formatStat(droidStats.hp)}</span>
                </span>
                <span className="spec-line key-value-pair">
                    <span>Droid Damage:</span>
                    <span>{formatStat(droidStats.damage)}</span>
                </span>
                <span className="spec-line key-value-pair">
                    <span>Droid Swing:</span>
                    <span>{(droidStats.attackMs / 1000).toFixed(1)}s</span>
                </span>
                {squadDecisions.length + squadUpgradeIds.length > 0 &&
                    <div className="outfitting-list">
                        {squadDecisions.map(entry => <DecisionRow key={`decision-${entry.id}`} id={entry.id} seen={entry.seen}/>)}
                        {squadUpgradeIds.map(id => <Upgrade key={id} id={id}/>)}
                    </div>}
            </div>
        );
    }

    // Deploy (staging only) closes the panel: staff the team, read its specs, outfit it, then send it
    renderDeploy() {
        if (this.props.squad) return null;

        return (
            <div className="squad-actions">
                <span data-tip data-for="deploy-tip">
                    {/* hide() dismisses the visible tooltip at click AND resets hover tracking,
                        so the swapped-in Disband button's tooltip waits for a fresh hover */}
                    <button className="deploy" disabled={this.props.squadDroidData.numDroidsAssigned < 1}
                            onClick={() => { ReactTooltip.hide(); this.props.deploySquad(); }}>
                        Deploy</button>
                </span>
                <Tooltip id="deploy-tip">
                    <p className="tooltip-header">Deploy</p>
                    <p>Fields the team on the planet — drive it with arrows or WASD.</p>
                </Tooltip>
            </div>
        );
    }

    render() {
        return (
            <div className="expedition-status">
                <div className="component-header">Expedition</div>
                <Vista/>
                {this.renderTeamCard()}
                {this.renderOutfitting()}
                {this.renderDeploy()}
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const squad = state.planet.squad;
    return {
        squad,
        onGrid: !!(squad && state.planet.map.length > 0 && isOnGrid(state.planet.map, squad.coord)),
        droidStats: getDroidStats(state),
        batteryCapacity: getBatteryCapacity(state), // staging range preview; fielded squads use their snapshot
        ownedEquipment: ownedEquipment(state),
        squadUpgradeIds: getSquadUpgradeIds(state),
        squadDecisions: pendingForSquad(state.decisions),
        squadDroidData: state.planet.squadDroidData,
        multiplier: getReplicationMultiplier(state)
    };
};

export default connect(
    mapStateToProps,
    { deploySquad, disbandSquad }
)(Expedition);
