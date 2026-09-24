import React from 'react';
import ReactTooltip from "react-tooltip";
import {connect} from "react-redux";
import {deploySquad, disbandSquad} from "../redux/modules/planet";
import {formatResourceList} from "../lib/planet/pois";
import {EQUIPMENT_DEFS, EQUIPMENT_ORDER} from "../database/squad/equipment";
import {isOnGrid} from "../lib/planet/squad";
import {SQUAD_DRAIN_PER_TILE} from "../database/squad/tuning";
import {getBatteryCapacity, getDroidStats, getReplicationMultiplier, getSquadUpgradeIds, ownedEquipment} from "../redux/reducer";
import DroidCount from "./structures/droid_count";
import Upgrade from "./structures/upgrade";
import Tooltip from "./ui/tooltip";
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
    // At base: names only (a fresh squad always leaves fully loaded). Fielded: charge dots per piece.
    renderEquipment(carried) {
        const ids = EQUIPMENT_ORDER.filter(id => carried[id] !== undefined);
        if (ids.length === 0) return null;

        return (
            <React.Fragment>
                <span className="cargo-line key-value-pair" data-tip data-for="equipment-tip">
                    <span>Equipment:</span>
                    {/* Each piece is an unbreakable unit, so a long list wraps between pieces (right-aligned
                        under the first line), never mid-name or between a name and its charge dots */}
                    <span className="equipment-list">
                        {ids.map((id, i) =>
                            <span key={id} className="equipment-item">{i > 0 && ' '}
                                {this.props.squad ?
                                    `${EQUIPMENT_DEFS[id].name} ${chargeDots(id, carried[id])}` :
                                    EQUIPMENT_DEFS[id].name}{i < ids.length - 1 && ','}
                            </span>)}
                    </span>
                </span>
                <Tooltip id="equipment-tip">
                    <p className="tooltip-header">Equipment</p>
                    <p>Fired with number keys mid-battle; charges reload on the powered grid.</p>
                </Tooltip>
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
                        <span className="spec-line key-value-pair">
                            <span>Fielded:</span>
                            <span><span className="replication-x">(×{multiplier})</span> = {size * multiplier} units</span>
                        </span>}
                    <span className="spec-line key-value-pair" data-tip data-for="staging-health-tip">
                        <span>Squad Health:</span>
                        <span>{formatStat(size * multiplier * this.props.droidStats.hp)}</span>
                    </span>
                    <Tooltip id="staging-health-tip">
                        <p className="tooltip-header">Squad Health</p>
                        <p>{`Every unit's health added up: ${size * multiplier} × ${formatStat(this.props.droidStats.hp)}. ` +
                            'Battle damage and reserve-power burn come out of it in the field; it repairs on the ' +
                            'powered grid.'}</p>
                    </Tooltip>
                    <span className="spec-line key-value-pair" data-tip data-for="staging-battery-tip">
                        <span>Battery:</span>
                        <span>{this.props.batteryCapacity}</span>
                    </span>
                    <Tooltip id="staging-battery-tip">
                        <p className="tooltip-header">Battery</p>
                        <p>Drains each tile off the grid; recharges on powered ground.</p>
                        <p>At zero the squad runs on reserve power: every droid loses health each tile.</p>
                    </Tooltip>
                    {this.renderRange(
                        size > 0 ? Math.floor(this.props.batteryCapacity / SQUAD_DRAIN_PER_TILE) : null,
                        'force-projection-tip',
                        <React.Fragment>
                            <p className="tooltip-header">Deployment</p>
                            {multiplier > 1 &&
                                <p>Replication multiplies the fielded force, snapshotted at deploy.</p>}
                            <p>{`The battery drains ${formatStat(SQUAD_DRAIN_PER_TILE)} / tile off the grid.`}</p>
                            <p>Once drained, every droid loses health during movement.</p>
                        </React.Fragment>)}
                    {this.renderEquipment(this.props.ownedEquipment)}
                    <div className="squad-actions">
                        <span data-tip data-for="deploy-tip">
                            {/* hide() dismisses the visible tooltip at click AND resets hover tracking,
                                so the swapped-in Disband button's tooltip waits for a fresh hover */}
                            <button className="deploy" disabled={size < 1}
                                    onClick={() => { ReactTooltip.hide(); this.props.deploySquad(); }}>
                                Deploy</button>
                        </span>
                        <Tooltip id="deploy-tip">
                            <p className="tooltip-header">Deploy</p>
                            <p>Fields the team on the planet — drive it with arrows or WASD.</p>
                        </Tooltip>
                    </div>
                </div>
            );
        }

        return (
            <div className="squad-card">
                <div className="team-line">
                    <span className="key-value-pair">
                        <span>Droids:</span>
                        {/* Survivors / fielded, like the battle header's fractions: deaths only show here
                            (the HUD's squad health max shrinks with the roster, and survivors repair on the grid).
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
                        {!onGrid && <p>Return to powered ground to disband.</p>}
                    </Tooltip>
                </div>
            </div>
        );
    }

    // Range row (staging only; the HUD carries it live once deployed): tiles the battery buys the team
    renderRange(rangeTiles, tipId, tooltip) {
        return (
            <React.Fragment>
                <span className="spec-line key-value-pair" data-tip data-for={tipId}>
                    <span>Range:</span>
                    <span>{rangeTiles === null ? '—' : `~${rangeTiles} tiles`}</span>
                </span>
                <Tooltip id={tipId}>{tooltip}</Tooltip>
            </React.Fragment>
        );
    }

    // Outfitting (staging only): the upgrades that exist purely for expeditions (equipment, combat stats,
    // battery), offered here and nowhere else, under the droid spec line they modify. Refits apply to
    // the next deployment, so the section folds away while a squad is out.
    renderOutfitting() {
        const { squad, squadUpgradeIds, droidStats } = this.props;
        if (squad || squadUpgradeIds.length === 0) return null;

        return (
            <div className="outfitting">
                <div className="section-title">Outfitting</div>
                <span className="spec-line key-value-pair" data-tip data-for="droid-spec-tip">
                    <span>Droid:</span>
                    <span>
                        Health {formatStat(droidStats.hp)} · Damage {formatStat(droidStats.damage)}
                        {' · '}Swing {(droidStats.attackMs / 1000).toFixed(1)}s
                    </span>
                </span>
                <Tooltip id="droid-spec-tip">
                    <p className="tooltip-header">Droid</p>
                    <p>{`One expedition droid's combat spec (move speed ${droidStats.speed}). ` +
                        'Upgrades refit the next deployed squad.'}</p>
                </Tooltip>
                <div className="outfitting-list">
                    {squadUpgradeIds.map(id => <Upgrade key={id} id={id}/>)}
                </div>
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
        squadDroidData: state.planet.squadDroidData,
        multiplier: getReplicationMultiplier(state)
    };
};

export default connect(
    mapStateToProps,
    { deploySquad, disbandSquad }
)(Expedition);
