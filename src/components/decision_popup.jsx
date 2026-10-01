import React from 'react';
import {connect} from "react-redux";
import database from "../database/base/decisions";
import {bodyLines, chooseOption, closeDecision, isAvailable, researchCost, researchTime, visibleOptions} from "../redux/modules/decisions";
import {highlightCosts} from "../redux/modules/resources";
import PopupFrame from "./ui/popup_frame";
import ResourceAmounts from "./ui/resource_amounts";

/**
 * The decision popup: the terminal asking the operator something (database/base/decisions.ts). Opened by the player
 * from a request row on a structure card (structures/decision_row.jsx), never by the game. Viewport-centered on
 * the shared PopupFrame chrome (z-index rule: below the settings modal). Title, optional ascii block, body
 * paragraphs, then the options stacked as buttons, the way out last. Close, ✕, or the backdrop close it without
 * answering; the request stays on its card.
 *
 * Mouse only, unlike the encounter popup: it was opened with a click, and an answer here can be permanent, so no
 * key picks one. Keys are still captured on window in the capture phase and stopped there while a decision is
 * open, so nothing under the popup (the planet's squad driving) sees them.
 */
class DecisionPopup extends React.Component {
    constructor(props) {
        super(props);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    componentDidMount() {
        window.addEventListener('keydown', this.onKeyDown, true);
    }
    componentWillUnmount() {
        window.removeEventListener('keydown', this.onKeyDown, true);
    }

    onKeyDown(event) {
        if (!this.props.record) return;
        event.stopPropagation();
    }

    render() {
        const { record, options, body, availability, costs } = this.props;
        if (!record) return null;

        return (
            <div className="popup-overlay">
                <PopupFrame className="decision-popup" title={record.title}
                            onClose={() => this.props.closeDecision()}
                            onBackdropClick={() => this.props.closeDecision()}>
                    {record.image &&
                        <pre className="decision-image">{record.image.join('\n')}</pre>}
                    <div className="popup-body">
                        {body.map((line, i) => <p key={i}>{line}</p>)}
                    </div>
                    <div className="popup-actions">
                        {options.map((option, i) => {
                            return (
                                <button key={i} disabled={!availability[i]} onClick={() => this.props.chooseOption(i)}>
                                    <span className="option-text">
                                        <span className="option-label">{option.label}</span>
                                        {option.detail && <span className="option-detail">{option.detail}</span>}
                                        {costs[i] &&
                                            <span className="option-cost">
                                                <ResourceAmounts amounts={costs[i].amounts}/>
                                                {costs[i].seconds > 0 && <span className="option-time">{costs[i].seconds}s</span>}
                                            </span>}
                                    </span>
                                </button>
                            );
                        })}
                        <button onClick={() => this.props.closeDecision()}>
                            <span className="option-text">
                                <span className="option-label">Close</span>
                            </span>
                        </button>
                    </div>
                </PopupFrame>
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    const id = state.decisions.openId;
    const record = id ? database[id] : null;
    if (!record) {
        return { record: null, options: [], body: [], availability: [], costs: [] };
    }
    const options = visibleOptions(state, record);
    return {
        record,
        options,
        body: bodyLines(state, record),
        availability: options.map(option => isAvailable(state, option)),
        // Research options show what choosing spends (short resources highlighted) and how long it takes; a free,
        // instant one (a fork's side) has nothing to show
        costs: options.map(option => {
            if (!option.research) return null;
            const seconds = Math.round(researchTime(option));
            const cost = researchCost(option);
            if (Object.keys(cost).length === 0 && seconds === 0) return null;
            return { amounts: highlightCosts(state.resources, cost), seconds };
        })
    };
};

export default connect(
    mapStateToProps,
    { chooseOption, closeDecision }
)(DecisionPopup);
