import React from 'react';
import ReactTooltip from "react-tooltip";
import {connect} from "react-redux";
import {deploySquad, disbandSquad} from "../redux/modules/planet";
import {getQuantity, getResource} from "../redux/modules/resources";
import {formatResourceList} from "../lib/expeditions";
import {EQUIPMENT_DEFS, EQUIPMENT_ORDER} from "../database/equipment";
import {isOnGrid, SQUAD_DRAIN_PER_DROID, squadBatteryCapacity, squadDrainPerTile} from "../lib/squad";
import {DROID_BASE_STATS} from "../lib/battle";
import {getBatteryCapacity, getDroidStats, getReplicationMultiplier, ownedEquipment} from "../redux/reducer";
import {getCrossTime, getTerrain, TERRAINS} from "../lib/planet_map";
import {PLANET_COLORS} from "../lib/planet_render";
import Tooltip from "./ui/tooltip";

const DEFAULT_TEAM_SIZE = 5;

const formatStat = (n) => Number.isInteger(n) ? n : n.toFixed(1);

// "●●○": charges remaining vs spent for one equipment piece
const chargeDots = (itemId, charges) =>
    '●'.repeat(charges) + '○'.repeat(Math.max(0, EQUIPMENT_DEFS[itemId].charges - charges));

/**
 * Squad sidebar. The one player-driven squad: assemble, equip, and deploy it here, drive it on the map
 * with arrows/WASD. Fights start by stepping into a nest on the map and play out in the encounter popup;
 * site intel lives on the map itself (glyphs), not in a directory here.
 */
class Expedition extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            teamSize: DEFAULT_TEAM_SIZE, // staged size; droids only leave the pool at Deploy
            hpFlash: 0                   // bumps per reserve-power hull burn; keys the HP bar's bleed flash
        };
    }

    // Reserve power pays for tiles in hull; make each payment visible. Battle damage doesn't trip this
    // (squad.droidHp only updates at fight end, and the battery can't be empty the moment a fight settles
    // without reserve driving beforehand -- and then the flash is the right signal anyway).
    componentDidUpdate(prevProps) {
        const prev = prevProps.squad, cur = this.props.squad;
        if (!prev || !cur || cur.battery > 0) return;
        const sum = (s) => (s.droidHp || []).reduce((total, hp) => total + hp, 0);
        if (sum(cur) < sum(prev)) {
            this.setState({ hpFlash: this.state.hpFlash + 1 });
        }
    }

    teamSize() {
        return Math.max(1, Math.min(this.state.teamSize, this.props.idleDroids));
    }

    // The squad's gear: owned pieces (one-time factory upgrades / story salvage) ride along automatically.
    // At base: names only (a fresh squad always leaves fully loaded). Fielded: charge dots per piece.
    renderEquipment(carried) {
        const ids = EQUIPMENT_ORDER.filter(id => carried[id] !== undefined);
        if (ids.length === 0) return null;

        return (
            <React.Fragment>
                <span className="cargo-line" data-tip data-for="equipment-tip">
                    <span className="row-label">Equipment:</span>{' '}
                    {ids.map(id => this.props.squad ?
                        `${EQUIPMENT_DEFS[id].name} ${chargeDots(id, carried[id])}` :
                        EQUIPMENT_DEFS[id].name).join(', ')}
                </span>
                <Tooltip id="equipment-tip">
                    <p className="tooltip-header">Equipment</p>
                    <p>Fired with number keys mid-battle; charges reload on the powered grid.</p>
                </Tooltip>
            </React.Fragment>
        );
    }

    // Droid combat specs: live (base + researched upgrades) while staging, the deploy-time snapshot once
    // fielded -- so a squad running pre-refit stats shows what it actually fights with.
    renderSpecs(stats) {
        return (
            <React.Fragment>
                <span className="spec-line key-value-pair" data-tip data-for="droid-spec-tip">
                    <span>Stats:</span>
                    <span>HP {formatStat(stats.hp)} · Damage {formatStat(stats.damage)}</span>
                </span>
                <Tooltip id="droid-spec-tip">
                    <p className="tooltip-header">Droid Stats</p>
                    <p>{`Swings every ${(stats.attackMs / 1000).toFixed(1)}s · move speed ${stats.speed}.`}</p>
                    <p>Upgrades refit the next deployed squad.</p>
                </Tooltip>
            </React.Fragment>
        );
    }

    renderTeamCard() {
        const { squad, idleDroids, onGrid } = this.props;

        if (!squad) {
            const size = this.teamSize();
            const multiplier = this.props.multiplier;
            return (
                <div className="squad-card">
                    <div className="team-line">
                        <span className="key-value-pair">
                            <span>Droids:</span>
                            <span className="team-stepper">
                                <button className="stepper" disabled={size <= 1}
                                        onClick={() => this.setState({ teamSize: size - 1 })}>-</button>
                                <span className="staged-size">{size}</span>
                                <button className="stepper" disabled={size >= idleDroids}
                                        onClick={() => this.setState({ teamSize: size + 1 })}>+</button>
                                {multiplier > 1 &&
                                    <span className="fielded-units">
                                        <span className="replication-x">(×{multiplier})</span> = {size * multiplier}
                                    </span>}
                            </span>
                        </span>
                    </div>
                    {this.renderVitals({
                        stats: this.props.droidStats,
                        rangeTiles: Math.floor(this.props.batteryCapacity / (SQUAD_DRAIN_PER_DROID * size)),
                        rangeTipId: 'force-projection-tip',
                        rangeTooltip:
                            <React.Fragment>
                                <p className="tooltip-header">Deployment</p>
                                {multiplier > 1 &&
                                    <p>Replication multiplies the fielded force, snapshotted at deploy.</p>}
                                <p>{`Each assigned droid adds ${formatStat(SQUAD_DRAIN_PER_DROID)} / tile of ` +
                                    'battery drain off the grid: bigger teams have shorter range.'}</p>
                                <p>Past empty, the squad runs on reserve power: every droid burns hull
                                    each tile.</p>
                            </React.Fragment>,
                        battery: this.props.batteryCapacity,
                        capacity: this.props.batteryCapacity,
                        hp: size * multiplier * this.props.droidStats.hp,
                        hpMax: size * multiplier * this.props.droidStats.hp
                    })}
                    {this.renderEquipment(this.props.ownedEquipment)}
                    <div className="squad-actions">
                        <span data-tip data-for="deploy-tip">
                            {/* hide() dismisses the visible tooltip at click AND resets hover tracking,
                                so the swapped-in Disband button's tooltip waits for a fresh hover */}
                            <button className="deploy" disabled={idleDroids < 1}
                                    onClick={() => { ReactTooltip.hide(); this.props.deploySquad(size); }}>
                                Deploy</button>
                        </span>
                        <Tooltip id="deploy-tip">
                            <p className="tooltip-header">Deploy</p>
                            <p>Fields the team on the planet — drive it with arrows or WASD. Assigned
                                droids leave the pool until the squad disbands.</p>
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
                            (the HP bar's max shrinks with the roster, and survivors repair on the grid).
                            A replicated force tints the icon pink instead of spelling out the math. */}
                        <span>
                            {squad.squadSize} / {(squad.assignedDroids || squad.squadSize) * (squad.multiplier || 1)}{' '}
                            <span className={`icon-vintage-robot${(squad.multiplier || 1) > 1 ? ' replication-x' : ''}`}/>
                        </span>
                    </span>
                </div>
                {this.renderVitals({
                    stats: squad.droidStats || DROID_BASE_STATS,
                    rangeTiles: Math.floor(squad.battery / squadDrainPerTile(squad)),
                    rangeTipId: 'squad-range-tip',
                    rangeTooltip:
                        <React.Fragment>
                            <p className="tooltip-header">Range</p>
                            <p>{`Tiles left on the current battery — the team drains ` +
                                `${formatStat(squadDrainPerTile(squad))} per tile. Recharges on the grid.`}</p>
                        </React.Fragment>,
                    battery: squad.battery,
                    capacity: squadBatteryCapacity(squad),
                    ...this.deployedHp(squad),
                    // Cargo rides between the bars and the terrain rows, so the reserved (often empty)
                    // warning rows trail the section instead of splitting it
                    cargoRow:
                        <span className="cargo-line key-value-pair">
                            <span>Cargo:</span><span>{formatResourceList(squad.cargo) || 'Empty'}</span>
                        </span>,
                    terrainRows: this.renderTerrainRows()
                })}
                {this.renderEquipment(squad.equipment || {})}
                <div className="squad-actions">
                    <span data-tip data-for="disband-tip">
                        <button className="disband" disabled={!onGrid || !!squad.fighting}
                                onClick={() => { ReactTooltip.hide(); this.props.disbandSquad(); }}>
                            Disband</button>
                    </span>
                    <Tooltip id="disband-tip">
                        <p className="tooltip-header">Disband</p>
                        <p>Settles the expedition: surviving units return to the droid pool as whole
                            droids.</p>
                        {!onGrid && <p>Return to powered ground to disband.</p>}
                    </Tooltip>
                </div>
            </div>
        );
    }

    // The shared card core, one render path for both states so the rows can't drift apart: Droids spec ->
    // Range -> battery/HP bars -> terrain readout. The staging card previews the next deployment (idle-full
    // bars, blank terrain rows -- their heights still reserved, so deploying doesn't shift the card);
    // the deployed card reads the fielded squad live.
    renderVitals({ stats, rangeTiles, rangeTipId, rangeTooltip, battery, capacity, hp, hpMax, cargoRow, terrainRows }) {
        return (
            <React.Fragment>
                {this.renderSpecs(stats)}
                <span className="spec-line key-value-pair" data-tip data-for={rangeTipId}>
                    <span>Range:</span>
                    <span>~{rangeTiles} tiles</span>
                </span>
                <Tooltip id={rangeTipId}>{rangeTooltip}</Tooltip>
                <div className="field-telemetry">
                    {this.renderBatteryBar(battery, capacity)}
                    {this.renderHpBar(hp, hpMax)}
                    {cargoRow}
                    {terrainRows}
                </div>
            </React.Fragment>
        );
    }

    // Mid-fight the settlement snapshot (squad.droidHp) is stale; read the live battle instead -- fielded
    // units' current hp plus the wounds the escapees carried out -- so the bar tracks the fight in real
    // time and is already sitting at the settlement value when it ends.
    deployedHp(squad) {
        const hpMax = squad.squadSize * ((squad.droidStats || DROID_BASE_STATS).hp);
        const battle = squad.fighting && squad.fighting.battle;
        const hp = battle ?
            battle.units.reduce((sum, unit) => sum + (unit.side === 'droid' ? unit.hp : 0), 0) +
                (battle.escapedHp || []).reduce((sum, unitHp) => sum + unitHp, 0) :
            (squad.droidHp || []).reduce((sum, unitHp) => sum + unitHp, 0) || hpMax;
        return { hp, hpMax };
    }

    // The terrain underfoot (deployed only): tile terrain, then its movement effects and the infestation
    // warning on reserved-height rows. These trail the telemetry section (cargo sits above them), so the
    // rows sitting empty read as bottom padding, not a hole in the readout.
    renderTerrainRows() {
        const { squad, sector, onGrid, unlockedTerrains } = this.props;
        if (!sector) return null;

        const terrain = getTerrain(sector.terrain);
        // Crossing-time multiple relative to flatland (integer multiples by construction). Shown as a
        // speed DIVISOR, and only when the ground actually slows the squad; drain isn't shown (it's
        // constant per deployment -- the Range countdown carries it live, its tooltip has the number).
        const slowdown = getCrossTime(sector.terrain, unlockedTerrains) / TERRAINS.flatland.crossTime;
        const effectsText = !onGrid && slowdown > 1 ? `speed ÷${formatStat(slowdown)}` : '';

        return (
            <React.Fragment>
                <span className="terrain-line key-value-pair">
                    <span className="row-label">Terrain:</span>
                    <span style={{color: PLANET_COLORS[terrain.key]}}>{terrain.display} {terrain.label}</span>
                </span>
                <span className="terrain-status">{effectsText}</span>
                <span className="terrain-status terrain-warn">
                    {sector.infestedBy ? '⚠ Hive territory' : ''}
                </span>
            </React.Fragment>
        );
    }

    // The two squad bars, shared between the cards: the staging card previews them idle-full (the deploy
    // snapshot to be), the deployed card shows them live. One card renders at a time, so the tooltip ids
    // don't collide.
    renderBatteryBar(battery, capacity) {
        const reserve = battery <= 0;
        const low = !reserve && battery <= capacity * 0.25;
        const pct = Math.max(0, Math.min(100, (battery / capacity) * 100));

        return (
            <React.Fragment>
                <div className="meter-row" data-tip data-for="squad-battery-tip">
                    <span>Battery:</span>
                    <div className={`meter-bar${reserve ? ' reserve' : low ? ' low' : ''}`}>
                        <span className="fill" style={{width: `${pct}%`}}/>
                        <span className="tick"/>
                        <span className="value">
                            {reserve ? 'RESERVE' : `${Math.ceil(battery)} / ${capacity}`}
                        </span>
                    </div>
                </div>
                <Tooltip id="squad-battery-tip">
                    <p className="tooltip-header">Battery</p>
                    <p>Drains each tile off the grid; recharges on powered ground.</p>
                    <p>At zero the squad runs on reserve power: every droid burns hull each tile.</p>
                </Tooltip>
            </React.Fragment>
        );
    }

    // Squad HP: battle wounds persist in the field and repair on the grid, exactly like the battery. The bar
    // sums per-droid hp; green like the arena's unit bars (hp language), distinct from the cyan battery bar.
    // Keyed by hpFlash so each reserve-power hull burn remounts the bar and restarts its bleed animation.
    renderHpBar(hp, hpMax) {
        const hpPct = Math.max(0, Math.min(100, (hp / hpMax) * 100));

        return (
            <React.Fragment>
                <div className="meter-row" data-tip data-for="squad-hp-tip">
                    <span>HP:</span>
                    <div key={this.state.hpFlash}
                         className={`meter-bar hull${hp <= hpMax * 0.5 ? ' low' : ''}` +
                             `${this.state.hpFlash > 0 ? ' bleed' : ''}`}>
                        <span className="fill" style={{width: `${hpPct}%`}}/>
                        <span className="value">{formatStat(hp)} / {formatStat(hpMax)}</span>
                    </div>
                </div>
                <Tooltip id="squad-hp-tip">
                    <p className="tooltip-header">HP</p>
                    <p>Battle damage persists in the field; repairs on the grid.</p>
                </Tooltip>
            </React.Fragment>
        );
    }

    render() {
        return (
            <div className="expedition-status">
                <div className="component-header">Expeditions</div>
                {this.renderTeamCard()}
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const squad = state.planet.squad;
    return {
        squad,
        onGrid: !!(squad && state.planet.map.length > 0 && isOnGrid(state.planet.map, squad.coord)),
        sector: squad && state.planet.map.length > 0 ? state.planet.map[squad.coord[0]][squad.coord[1]] : null,
        unlockedTerrains: state.planet.unlockedTerrains,
        idleDroids: Math.floor(getQuantity(getResource(state.resources, 'standardDroids'))),
        droidStats: getDroidStats(state),
        batteryCapacity: getBatteryCapacity(state), // staging range preview; fielded squads use their snapshot
        ownedEquipment: ownedEquipment(state),
        multiplier: getReplicationMultiplier(state)
    };
};

export default connect(
    mapStateToProps,
    { deploySquad, disbandSquad }
)(Expedition);
