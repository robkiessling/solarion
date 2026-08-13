import React from 'react';
import {connect} from "react-redux";
import {deploySquad, disbandSquad} from "../redux/modules/planet";
import {getQuantity, getResource} from "../redux/modules/resources";
import {formatResourceList} from "../lib/expeditions";
import {EQUIPMENT_DEFS, EQUIPMENT_ORDER} from "../database/equipment";
import {isOnGrid, RESERVE_SPEED_PENALTY, SQUAD_DRAIN_PER_DROID, SQUAD_MAX_CHARGE, squadDrainPerTile} from "../lib/squad";
import {DROID_BASE_STATS} from "../lib/battle";
import {getDroidStats, getReplicationMultiplier, ownedEquipment} from "../redux/reducer";
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
            teamSize: DEFAULT_TEAM_SIZE // staged size; droids only leave the pool at Deploy
        };
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
                    Equipment: {ids.map(id => this.props.squad ?
                        `${EQUIPMENT_DEFS[id].name} ${chargeDots(id, carried[id])}` :
                        EQUIPMENT_DEFS[id].name).join(', ')}
                </span>
                <Tooltip id="equipment-tip">
                    Fired with number keys mid-battle; charges reload on the powered grid.
                </Tooltip>
            </React.Fragment>
        );
    }

    // Droid combat specs: live (base + researched upgrades) while staging, the deploy-time snapshot once
    // fielded -- so a squad running pre-refit stats shows what it actually fights with.
    renderSpecs(stats) {
        return (
            <React.Fragment>
                <span className="spec-line" data-tip data-for="droid-spec-tip">
                    Droids: HP {formatStat(stats.hp)} · Damage {formatStat(stats.damage)}
                </span>
                <Tooltip id="droid-spec-tip">
                    {`Swings every ${(stats.attackMs / 1000).toFixed(1)}s · move speed ${stats.speed}. ` +
                        'Upgrades refit the next deployed squad.'}
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
                    <div className="team-line team-builder">
                        <span>Team:</span>
                        <button className="stepper" disabled={size <= 1}
                                onClick={() => this.setState({ teamSize: size - 1 })}>-</button>
                        <span className="staged-size">{size}</span>
                        <button className="stepper" disabled={size >= idleDroids}
                                onClick={() => this.setState({ teamSize: size + 1 })}>+</button>
                        <span className="idle-count">({idleDroids} idle)</span>
                    </div>
                    <span className="spec-line" data-tip data-for="force-projection-tip">
                        {multiplier > 1 && `Fields ${size * multiplier} units (×${multiplier}) · `}
                        Charge −{formatStat(SQUAD_DRAIN_PER_DROID * size)} / tile
                    </span>
                    <Tooltip id="force-projection-tip">
                        {(multiplier > 1 ?
                            'Replication multiplies the fielded force, snapshotted at deploy. ' : '') +
                            'Each assigned droid drains charge off-grid: bigger teams have shorter range.'}
                    </Tooltip>
                    {this.renderSpecs(this.props.droidStats)}
                    {this.renderEquipment(this.props.ownedEquipment)}
                    <span className="squad-status-text">Status: At base</span>
                    <div className="field-telemetry"/>
                    <span className="cargo-line">Cargo: —</span>
                    <div className="squad-actions">
                        <button disabled={idleDroids < 1}
                                onClick={() => this.props.deploySquad(size)}>Deploy</button>
                    </div>
                </div>
            );
        }

        const promptPoi = this.props.prompt ? this.props.pois[this.props.prompt.poiId] : null;

        let statusText;
        if (squad.fighting) {
            statusText = 'Engaging hostiles...';
        }
        else if (promptPoi) {
            statusText = `At ${promptPoi.name}`;
        }
        else if (onGrid) {
            statusText = 'On the grid';
        }
        else {
            statusText = squad.path.length > 0 ? 'In the field — moving' : 'In the field';
        }

        return (
            <div className="squad-card">
                <div className="team-line">
                    <span className="key-value-pair">
                        <span>Team:</span>
                        <span>{(squad.multiplier || 1) > 1 ?
                            `${squad.squadSize} units (${squad.assignedDroids} droids ×${squad.multiplier})` :
                            `${squad.squadSize} droids`}</span>
                    </span>
                </div>
                {this.renderSpecs(squad.droidStats || DROID_BASE_STATS)}
                <span className="squad-status-text">{statusText}</span>
                {this.renderTelemetry()}
                <span className="cargo-line">Cargo: {formatResourceList(squad.cargo) || '—'}</span>
                {this.renderEquipment(squad.equipment || {})}
                <div className="squad-actions">
                    <span data-tip data-for="disband-tip">
                        <button disabled={!onGrid || !!squad.fighting}
                                onClick={() => this.props.disbandSquad()}>Disband</button>
                    </span>
                    {!onGrid &&
                        <Tooltip id="disband-tip">Return to powered ground to disband.</Tooltip>}
                </div>
            </div>
        );
    }

    // Deployed-squad telemetry: the charge bar and a readout of the terrain underfoot. The bar's color carries
    // the charge state (gold under the 25% tick, red on reserve power); the exact number lives in a tooltip.
    renderTelemetry() {
        const { squad, sector, onGrid, unlockedTerrains } = this.props;
        if (!sector) return <div className="field-telemetry"/>;

        const terrain = getTerrain(sector.terrain);
        const reserve = squad.charge <= 0;
        const low = !reserve && squad.charge <= SQUAD_MAX_CHARGE * 0.25;
        const chargePct = Math.max(0, Math.min(100, (squad.charge / SQUAD_MAX_CHARGE) * 100));

        // Speed relative to flatland (integer multiples by construction; reserve power doubles it)
        const speed = (getCrossTime(sector.terrain, unlockedTerrains) / TERRAINS.flatland.crossTime) *
            (reserve ? RESERVE_SPEED_PENALTY : 1);
        const effectsText = onGrid ? 'on the grid · charge full' :
            `speed ×${speed} · charge −${formatStat(squadDrainPerTile(squad))} / tile`;

        return (
            <div className="field-telemetry">
                <div className="charge-row" data-tip data-for="squad-charge-tip">
                    <span>Charge:</span>
                    <div className={`charge-bar${reserve ? ' reserve' : low ? ' low' : ''}`}>
                        <span className="fill" style={{width: `${chargePct}%`}}/>
                        <span className="tick"/>
                    </div>
                    {reserve && <span className="reserve-label">RESERVE</span>}
                </div>
                <Tooltip id="squad-charge-tip">
                    {reserve ?
                        'Reserve power: crossings take twice as long. Recharges on the grid.' :
                        `${Math.ceil(squad.charge)} / ${SQUAD_MAX_CHARGE}`}
                </Tooltip>
                {this.renderHpBar()}
                <span className="terrain-line">
                    <span className="terrain-key">Terrain:</span>{' '}
                    <span style={{color: PLANET_COLORS[terrain.key]}}>{terrain.display} {terrain.label}</span>
                </span>
                <span className="terrain-effects">{effectsText}</span>
                <span className="terrain-warn">{sector.infestedBy ? '⚠ Hive territory' : ''}</span>
            </div>
        );
    }

    // Squad HP: battle wounds persist in the field and repair on the grid, exactly like charge. The bar
    // sums per-droid hp; green like the arena's unit bars (hp language), distinct from the cyan charge bar.
    renderHpBar() {
        const { squad } = this.props;
        const hpMax = squad.squadSize * ((squad.droidStats || DROID_BASE_STATS).hp);
        const hp = (squad.droidHp || []).reduce((sum, unitHp) => sum + unitHp, 0) || hpMax;
        const hpPct = Math.max(0, Math.min(100, (hp / hpMax) * 100));

        return (
            <React.Fragment>
                <div className="charge-row" data-tip data-for="squad-hp-tip">
                    <span>HP:</span>
                    <div className={`charge-bar hull${hp <= hpMax * 0.5 ? ' low' : ''}`}>
                        <span className="fill" style={{width: `${hpPct}%`}}/>
                    </div>
                </div>
                <Tooltip id="squad-hp-tip">
                    {`${hp} / ${hpMax}. Battle damage persists in the field; repairs on the grid.`}
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
        pois: state.planet.pois, // for the prompt's site name in the status line
        squad,
        prompt: state.planet.prompt,
        onGrid: !!(squad && state.planet.map.length > 0 && isOnGrid(state.planet.map, squad.coord)),
        sector: squad && state.planet.map.length > 0 ? state.planet.map[squad.coord[0]][squad.coord[1]] : null,
        unlockedTerrains: state.planet.unlockedTerrains,
        idleDroids: Math.floor(getQuantity(getResource(state.resources, 'standardDroids'))),
        droidStats: getDroidStats(state),
        ownedEquipment: ownedEquipment(state),
        multiplier: getReplicationMultiplier(state)
    };
};

export default connect(
    mapStateToProps,
    { deploySquad, disbandSquad }
)(Expedition);
