import React from 'react';
import {connect} from "react-redux";
import {deploySortie, disbandSortie, sortieInteract, sortieLeavePrompt} from "../redux/modules/planet";
import {updateSetting} from "../redux/modules/game";
import {getQuantity, getResource} from "../redux/modules/resources";
import {
    estimateDifficultyRange,
    formatResourceList,
    POI_COLOR_KEYS,
    POI_GLYPHS,
    POI_STATUS,
    POI_TYPES
} from "../lib/expeditions";
import {isOnGrid, SORTIE_MAX_CHARGE} from "../lib/sortie";
import {PLANET_COLORS} from "../lib/planet_render";

const DEFAULT_TEAM_SIZE = 5;
const MAX_VISIBLE_REPORTS = 5;

/**
 * Squad sidebar. One player-driven squad (the sortie): assemble and deploy it here, drive it on the map
 * (arrows/WASD at the frontier, click to route over known ground). POI rows are intel plus a one-click route
 * order; fights start by deliberately stepping into a nest (bump-to-attack), never from this panel.
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
        const { sortie, idleDroids, onGrid } = this.props;

        if (!sortie) {
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
                    <span className="cargo-line">Cargo: —</span>
                    <div className="squad-actions">
                        <button disabled={idleDroids < 1} onClick={() => this.props.deploySortie(size)}>Deploy</button>
                    </div>
                </div>
            );
        }

        const reserve = sortie.charge <= 0;
        const lowCharge = !reserve && sortie.charge <= SORTIE_MAX_CHARGE * 0.25;
        const chargeStyle = reserve ? {color: '#ff4d4d'} : lowCharge ? {color: '#ffd700'} : undefined;

        const promptPoi = sortie.prompt ? this.props.pois[sortie.prompt.poiId] : null;

        let statusText;
        if (sortie.fighting) {
            statusText = 'Engaging hostiles...';
        }
        else if (promptPoi) {
            statusText = `At ${promptPoi.name}`;
        }
        else if (onGrid) {
            statusText = 'On the grid';
        }
        else {
            statusText = sortie.path.length > 0 ? 'In the field — moving' : 'In the field';
        }

        return (
            <div className="squad-card">
                <div className="team-line">
                    <span className="key-value-pair">
                        <span>Team:</span>
                        <span>{sortie.squadSize} droids</span>
                    </span>
                </div>
                <span className="squad-status-text">{statusText}</span>
                <span className="key-value-pair">
                    <span>Charge:</span>
                    <span style={chargeStyle}>
                        {reserve ? 'RESERVE POWER' : `${Math.ceil(sortie.charge)} / ${SORTIE_MAX_CHARGE}`}
                    </span>
                </span>
                <span className="cargo-line">Cargo: {formatResourceList(sortie.cargo) || '—'}</span>
                {promptPoi &&
                    <div className="squad-prompt">
                        <span className="prompt-text">
                            {promptPoi.type === POI_TYPES.cache ?
                                `Supply cache found${promptPoi.reward && promptPoi.reward.resources ?
                                    ` — ${formatResourceList(promptPoi.reward.resources)}` : ''}. Take it?` :
                                'Structure of unknown origin. Investigate?'}
                        </span>
                        <div className="squad-actions">
                            <button onClick={() => this.props.sortieInteract()}>
                                {promptPoi.type === POI_TYPES.cache ? 'Take' : 'Explore'}
                            </button>
                            <button onClick={() => this.props.sortieLeavePrompt()}>Leave</button>
                        </div>
                    </div>}
                <div className="squad-actions">
                    <button disabled={!onGrid || !!sortie.fighting}
                            title={onGrid ? undefined : 'Return to powered ground to disband'}
                            onClick={() => this.props.disbandSortie()}>Disband</button>
                </div>
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
                {requiresUnmet && <span className="poi-requires">Requires: {poi.requires}</span>}
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
                    available.length === 0 && !this.props.sortie &&
                    <span className="no-sites">No sites of interest discovered. Deploy the squad and drive it into the unknown.</span>
                }
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    const sortie = state.planet.sortie;
    return {
        pois: state.planet.pois,
        sortie,
        onGrid: !!(sortie && state.planet.map.length > 0 && isOnGrid(state.planet.map, sortie.coord)),
        fieldReports: state.planet.fieldReports || [],
        unlockedTerrains: state.planet.unlockedTerrains,
        idleDroids: Math.floor(getQuantity(getResource(state.resources, 'standardDroids'))),
        hoveredPoiId: state.game.hoveredPoiId
    };
};

export default connect(
    mapStateToProps,
    { deploySortie, disbandSortie, sortieInteract, sortieLeavePrompt, updateSetting }
)(Expedition);
