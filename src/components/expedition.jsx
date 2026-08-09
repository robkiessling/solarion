import React from 'react';
import {connect} from "react-redux";
import {dispatchSquad, engageFight, moveSquad, recallSquad} from "../redux/modules/planet";
import {updateSetting} from "../redux/modules/game";
import {getQuantity, getResource} from "../redux/modules/resources";
import {
    estimateDifficultyRange,
    POI_COLOR_KEYS,
    POI_GLYPHS,
    POI_STATUS,
    POI_TYPES,
    SQUAD_STATUS
} from "../lib/expeditions";
import {PLANET_COLORS} from "../lib/planet_render";

const DEFAULT_TEAM_SIZE = 5;

/**
 * Expedition sidebar. There is one team to assemble/deploy. Clicking on a point of interest (POI) row performs
 * a single contextual action: E.g. "Send Team" from base, "Move Here" while holding forward. Hovering a row highlights
 * its map marker.
 */
class Expedition extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            teamSize: DEFAULT_TEAM_SIZE // staged size; droids only leave the pool at Send
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
        const { squad, pois, idleDroids } = this.props;

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
                    <div className="squad-actions"></div>
                </div>
            );
        }

        const targetPoi = squad.targetPoiId ? pois[squad.targetPoiId] : null;
        const atPoi = squad.atPoiId ? pois[squad.atPoiId] : null;

        let statusText;
        switch (squad.status) {
            case SQUAD_STATUS.traveling:
                statusText = `En route to ${targetPoi ? targetPoi.name : '...'}`;
                break;
            case SQUAD_STATUS.fighting:
                statusText = 'Engaging hostiles...';
                break;
            case SQUAD_STATUS.returning:
                statusText = 'Returning home';
                break;
            case SQUAD_STATUS.holding:
            default:
                statusText = squad.pendingFight ?
                    `Holding at ${atPoi ? atPoi.name : '...'} — hostiles detected` :
                    `Holding at ${atPoi ? atPoi.name : '...'} — awaiting orders`;
        }

        const canRecall = squad.status === SQUAD_STATUS.traveling || squad.status === SQUAD_STATUS.holding;

        return (
            <div className="squad-card">
                <div className="team-line">
                    <span className="key-value-pair">
                        <span>Team:</span>
                        <span>{squad.squadSize} droids</span>
                    </span>
                </div>
                <span className="squad-status-text">{statusText}</span>
                <div className="squad-actions">
                    {squad.pendingFight && squad.status === SQUAD_STATUS.holding &&
                        <button className="engage-button" onClick={() => this.props.engageFight()}>Engage</button>}
                    {canRecall &&
                        <button onClick={() => this.props.recallSquad()}>Recall</button>}
                </div>
            </div>
        );
    }

    renderPoiRow(poi) {
        const { squad, unlockedTerrains, idleDroids } = this.props;

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

        // Any held squad can move on -- including one facing a pending fight (holding is no-commitment; only
        // Engage locks you in). Moving away leaves the nest available for later.
        const teamIdleForward = squad && squad.status === SQUAD_STATUS.holding;
        const isTeamHere = squad && squad.atPoiId === poi.id;

        // The whole row is the action; there is exactly one verb per row, shown as a hover chip. Rows keep their
        // layout regardless of team state -- they only gain/lose clickability -- so embarking causes no layout jump.
        let verb = null;
        let onActivate = null;
        if (!squad && !requiresUnmet && idleDroids >= 1) {
            verb = 'Send ▸';
            onActivate = () => this.props.dispatchSquad(poi.id, this.teamSize());
        }
        else if (teamIdleForward && !isTeamHere && !requiresUnmet) {
            verb = 'Move ▸';
            onActivate = () => this.props.moveSquad(poi.id);
        }

        return (
            <div key={poi.id} className={`poi-row ${onActivate ? 'actionable' : 'inert'}`}
                 onClick={onActivate || undefined}
                 onMouseEnter={() => this.props.updateSetting('hoveredPoiId', poi.id)}
                 onMouseLeave={() => this.props.updateSetting('hoveredPoiId', null)}>
                <div className="poi-head">
                    <span className="poi-title">
                        <span style={{color: glyphColor}}>{POI_GLYPHS[poi.type]}</span> {poi.name}
                        <span className="poi-distance"> ({poi.distance} tiles)</span>
                    </span>
                    {verb && <span className="poi-verb">{verb}</span>}
                </div>
                {difficultyText && <span className="poi-detail">{difficultyText}</span>}
                {requiresUnmet && <span className="poi-requires">Requires: {poi.requires}</span>}
                {isTeamHere && <span className="poi-detail">Team on site</span>}
            </div>
        );
    }

    render() {
        const available = Object.values(this.props.pois)
            .filter(poi => poi.status === POI_STATUS.available)
            .sort((a, b) => a.distance - b.distance);

        // Nothing discovered yet: stay out of the sidebar entirely
        if (available.length === 0 && !this.props.squad) return null;

        return (
            <div className="expedition-status">
                <div className="component-header">Expeditions</div>
                {this.renderTeamCard()}
                {available.map(poi => this.renderPoiRow(poi))}
            </div>
        );
    }
}

const mapStateToProps = (state, ownProps) => {
    return {
        pois: state.planet.pois,
        squad: state.planet.squad,
        unlockedTerrains: state.planet.unlockedTerrains,
        idleDroids: Math.floor(getQuantity(getResource(state.resources, 'standardDroids'))),
        hoveredPoiId: state.game.hoveredPoiId
    };
};

export default connect(
    mapStateToProps,
    { dispatchSquad, moveSquad, engageFight, recallSquad, updateSetting }
)(Expedition);
