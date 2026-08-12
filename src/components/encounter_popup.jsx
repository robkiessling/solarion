import React from 'react';
import {connect} from "react-redux";
import {squadInteract, squadLeavePrompt} from "../redux/modules/planet";
import {
    actionLabelFor,
    CAPABILITY_LABELS,
    formatResourceList,
    POI_COLOR_KEYS,
    POI_GLYPHS,
    promptTextFor,
    STORY_TEXTS
} from "../lib/expeditions";
import {PLANET_COLORS} from "../lib/planet_render";

/**
 * The centered encounter popup over the planet canvas: the squad is standing on a site awaiting a choice
 * (offer phase), or reading what it found there (result phase). A view of squad.prompt, deliberately
 * non-modal: no backdrop, and driving away dismisses it (movement clears the prompt in the reducer).
 * Keyboard mapping (1/Enter/Space accept, Esc leave) lives in the planet component's input layer; the
 * buttons mirror it. Connected on its own so updates aren't gated by the canvas's FPS-throttled
 * shouldComponentUpdate.
 */
class EncounterPopup extends React.Component {
    renderOffer(poi) {
        return (
            <React.Fragment>
                <div className="popup-body">{promptTextFor(poi)}</div>
                <div className="popup-actions">
                    <button onClick={() => this.props.squadInteract()}>
                        <kbd>1</kbd>{actionLabelFor(poi)}
                    </button>
                    <button onClick={() => this.props.squadLeavePrompt()}>
                        <kbd>Esc</kbd>Leave
                    </button>
                </div>
                <div className="popup-keys">or drive away to dismiss</div>
            </React.Fragment>
        );
    }

    renderResult(result) {
        const story = result.storyId ? STORY_TEXTS[result.storyId] : null;
        return (
            <React.Fragment>
                <div className="popup-body">
                    {story && <span className="story-text">"{story}"</span>}
                    {result.capability &&
                        <span className="outcome-line">
                            Salvaged: {CAPABILITY_LABELS[result.capability] || result.capability}
                        </span>}
                    {result.loaded &&
                        <span className="outcome-line">Loaded {formatResourceList(result.loaded)}.</span>}
                </div>
                <div className="popup-actions">
                    <button onClick={() => this.props.squadLeavePrompt()}>
                        <kbd>1</kbd>Continue
                    </button>
                </div>
                <div className="popup-keys">or drive away</div>
            </React.Fragment>
        );
    }

    render() {
        const prompt = this.props.squad && this.props.squad.prompt;
        if (!prompt) return null;
        const poi = this.props.pois[prompt.poiId];
        if (!poi) return null;

        return (
            <div className="encounter-popup">
                <div className="popup-title">
                    <span style={{color: PLANET_COLORS[POI_COLOR_KEYS[poi.type]]}}>{POI_GLYPHS[poi.type]}</span>
                    {' '}{poi.name.toUpperCase()}
                </div>
                {prompt.phase === 'result' ? this.renderResult(prompt.result) : this.renderOffer(poi)}
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {
        squad: state.planet.squad,
        pois: state.planet.pois
    };
};

export default connect(
    mapStateToProps,
    { squadInteract, squadLeavePrompt }
)(EncounterPopup);
