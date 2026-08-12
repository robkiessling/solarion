import React from 'react';
import {connect} from "react-redux";
import {deploySquad, disbandSquad, squadInteract, squadLeavePrompt} from "../redux/modules/planet";
import {updateSetting} from "../redux/modules/game";
import {getQuantity, getResource} from "../redux/modules/resources";
import {
    CAPABILITY_LABELS,
    estimateDifficultyRange,
    formatResourceList,
    POI_COLOR_KEYS,
    POI_GLYPHS,
    POI_STATUS,
    POI_TYPES
} from "../lib/expeditions";
import {isOnGrid, RESERVE_SPEED_PENALTY, SQUAD_DRAIN_PER_TILE, SQUAD_MAX_CHARGE} from "../lib/squad";
import {getCrossTime, getTerrain, TERRAINS} from "../lib/planet_map";
import {PLANET_COLORS} from "../lib/planet_render";
import Tooltip from "./ui/tooltip";

const DEFAULT_TEAM_SIZE = 5;
const MAX_VISIBLE_REPORTS = 5;

/**
 * Squad sidebar. The one player-driven squad: assemble and deploy it here, drive it on the map with
 * arrows/WASD. POI rows are pure intel (hover highlights the marker); fights start by stepping into a
 * nest on the map, and site interactions resolve through the prompt in the team card.
 */
class Expedition extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            teamSize: DEFAULT_TEAM_SIZE // staged size; droids only leave the pool at Deploy
        };
    }

    componentWillUnmount() {
        if (this.props.hoveredPoiId) {
            this.props.updateSetting('hoveredPoiId', null);
        }
    }

    teamSize() {
        return Math.max(1, Math.min(this.state.teamSize, this.props.idleDroids));
    }

    renderTeamCard() {
        const { squad, idleDroids, onGrid } = this.props;

        if (!squad) {
            const size = this.teamSize();
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
                    <span className="squad-status-text">Status: At base</span>
                    <div className="field-telemetry"/>
                    <span className="cargo-line">Cargo: —</span>
                    <div className="squad-actions">
                        <button disabled={idleDroids < 1} onClick={() => this.props.deploySquad(size)}>Deploy</button>
                    </div>
                </div>
            );
        }

        const promptPoi = squad.prompt ? this.props.pois[squad.prompt.poiId] : null;

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
                        <span>{squad.squadSize} droids</span>
                    </span>
                </div>
                <span className="squad-status-text">{statusText}</span>
                {this.renderTelemetry()}
                <span className="cargo-line">Cargo: {formatResourceList(squad.cargo) || '—'}</span>
                {promptPoi &&
                    <div className="squad-prompt">
                        <span className="prompt-text">
                            {promptPoi.promptText ||
                                (promptPoi.type === POI_TYPES.cache ?
                                    `Supply cache found${promptPoi.reward && promptPoi.reward.resources ?
                                        ` — ${formatResourceList(promptPoi.reward.resources)}` : ''}. Take it?` :
                                    'Structure of unknown origin. Investigate?')}
                        </span>
                        <div className="squad-actions">
                            <button onClick={() => this.props.squadInteract()}>
                                {promptPoi.actionLabel || (promptPoi.type === POI_TYPES.cache ? 'Take' : 'Explore')}
                            </button>
                            <button onClick={() => this.props.squadLeavePrompt()}>Leave</button>
                        </div>
                    </div>}
                <div className="squad-actions">
                    <button disabled={!onGrid || !!squad.fighting}
                            title={onGrid ? undefined : 'Return to powered ground to disband'}
                            onClick={() => this.props.disbandSquad()}>Disband</button>
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
            `speed ×${speed} · charge −${SQUAD_DRAIN_PER_TILE} / tile`;

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
                <span className="terrain-line">
                    <span className="terrain-key">Terrain:</span>{' '}
                    <span style={{color: PLANET_COLORS[terrain.key]}}>{terrain.display} {terrain.label}</span>
                </span>
                <span className="terrain-effects">{effectsText}</span>
                <span className="terrain-warn">{sector.infestedBy ? '⚠ Hive territory' : ''}</span>
            </div>
        );
    }

    renderPoiRow(poi) {
        const { unlockedTerrains } = this.props;

        const requiresUnmet = poi.requires && !unlockedTerrains[poi.requires];
        const glyphColor = PLANET_COLORS[POI_COLOR_KEYS[poi.type]];

        let difficultyText = null;
        if (poi.type === POI_TYPES.nest) {
            if (poi.difficultyKnown) {
                difficultyText = `Strength: ${poi.difficulty}`;
            }
            else {
                const [lo, hi] = estimateDifficultyRange(poi.difficulty);
                difficultyText = `Est. strength: ${lo}–${hi}`;
            }
        }

        // Rows are pure intel: hovering highlights the map marker; you reach sites by driving there.
        return (
            <div key={poi.id} className="poi-row inert"
                 onMouseEnter={() => this.props.updateSetting('hoveredPoiId', poi.id)}
                 onMouseLeave={() => this.props.updateSetting('hoveredPoiId', null)}>
                <div className="poi-head">
                    <span className="poi-title">
                        <span style={{color: glyphColor}}>{POI_GLYPHS[poi.type]}</span> {poi.name}
                        <span className="poi-distance"> ({poi.distance} tiles)</span>
                    </span>
                </div>
                {difficultyText && <span className="poi-detail">{difficultyText}</span>}
                {requiresUnmet && <span className="poi-requires">Requires: {CAPABILITY_LABELS[poi.requires] || poi.requires}</span>}
            </div>
        );
    }

    // Telemetry feed, newest first. Rows keep stable keys so only the newly-arrived report mounts (and plays
    // its arrival flash); older rows just dim.
    renderFieldReports() {
        const reports = this.props.fieldReports;
        if (reports.length === 0) return null;

        return (
            <div className="field-reports">
                <div className="field-reports-header">Field Reports</div>
                {reports.slice(-MAX_VISIBLE_REPORTS).reverse().map((report, index) =>
                    <div key={report.id}
                         className={`field-report report-${report.result} ${index === 0 ? 'latest' : ''}`}>
                        {report.text}
                    </div>
                )}
            </div>
        );
    }

    render() {
        const available = Object.values(this.props.pois)
            .filter(poi => poi.status === POI_STATUS.available)
            .sort((a, b) => a.distance - b.distance);

        return (
            <div className="expedition-status">
                <div className="component-header">Expeditions</div>
                {this.renderTeamCard()}
                {this.renderFieldReports()}
                {available.map(poi => this.renderPoiRow(poi))}
                {
                    available.length === 0 && !this.props.squad &&
                    <span className="no-sites">No sites of interest discovered. Deploy the squad and drive it into the unknown.</span>
                }
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const squad = state.planet.squad;
    return {
        pois: state.planet.pois,
        squad,
        onGrid: !!(squad && state.planet.map.length > 0 && isOnGrid(state.planet.map, squad.coord)),
        sector: squad && state.planet.map.length > 0 ? state.planet.map[squad.coord[0]][squad.coord[1]] : null,
        fieldReports: state.planet.fieldReports || [],
        unlockedTerrains: state.planet.unlockedTerrains,
        idleDroids: Math.floor(getQuantity(getResource(state.resources, 'standardDroids'))),
        hoveredPoiId: state.game.hoveredPoiId
    };
};

export default connect(
    mapStateToProps,
    { deploySquad, disbandSquad, squadInteract, squadLeavePrompt, updateSetting }
)(Expedition);
