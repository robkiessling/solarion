import React from 'react';
import {connect} from "react-redux";
import {retreatFromFight, squadInteract, squadLeavePrompt, useConsumable} from "../redux/modules/planet";
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
import {BATTLE_PHASES, countUnits} from "../lib/battle";
import {CONSUMABLE_DEFS, CONSUMABLE_ORDER} from "../database/consumables";
import BattleCanvas from "./battle_canvas";

/**
 * The centered encounter popup over the planet canvas, in one of three modes: the squad is standing on a
 * site awaiting a choice (offer phase), reading what happened there (result phase, including a wipe's
 * ending), or fighting -- the live battle arena with the consumable action row. Offer/result are views of
 * planet.prompt (planet-level, so a wipe's popup outlives the squad); the battle is a view of
 * squad.fighting. The world stays live behind it (no backdrop dim, nothing pauses), but the popup blocks
 * squad movement. Keyboard mapping (1..N actions, Enter/Space accept, Esc leave/retreat) lives in the
 * planet component's input layer; the buttons mirror it. Connected on its own so updates aren't gated by
 * the canvas's FPS-throttled shouldComponentUpdate.
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
            </React.Fragment>
        );
    }

    renderResult(result) {
        const story = result.storyId ? STORY_TEXTS[result.storyId] : null;
        return (
            <React.Fragment>
                <div className="popup-body">
                    {story && <span className="story-text">"{story}"</span>}
                    {result.wiped &&
                        <span className="result-line">
                            Contact lost — all {result.squadSize} droids destroyed.
                        </span>}
                    {result.wiped && result.cargoLost &&
                        <span className="result-line">
                            Cargo lost: {formatResourceList(result.cargoLost)}.
                        </span>}
                    {result.losses != null &&
                        <span className="result-line">
                            Nest cleared — lost {result.losses} of {result.squadSize} droids.
                        </span>}
                    {result.landCredit > 0 &&
                        <span className="outcome-line">Reclaimed {result.landCredit} land.</span>}
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
            </React.Fragment>
        );
    }

    renderBattle(poi, fighting) {
        const battle = fighting.battle;
        const pouch = this.props.squad.pouch || {};
        // Carried item types in manifest order; slots stay put as an item runs out, matching the number
        // hotkeys in the planet component's input layer
        const slots = CONSUMABLE_ORDER.filter(id => pouch[id] !== undefined);
        const withdrawing = battle.phase === BATTLE_PHASES.withdrawing;
        const droids = countUnits(battle, 'droid') + battle.escaped;
        const bugs = countUnits(battle, 'bug');

        // Force display: one pip per starting unit, colored while alive (escapees included: alive, off
        // the field), grey once dead -- the display IS the count, so the number and the visual can't
        // disagree. Alive pips pack toward the outside and the dead accumulate toward the center, so the
        // armies erode toward the center line. Pips shrink and wrap into rows for big armies, never
        // merging into a bar. Individual wounds show on the arena's per-unit slivers instead.
        const renderPips = (alive, total, side) => {
            const size = total <= 24 ? 7 : total <= 80 ? 5 : 3;
            return (
                <span className={`battle-pips ${side}`} style={{gap: size >= 5 ? 2 : 1}}>
                    {Array.from({ length: total }, (_, i) => (
                        <span key={i} className={`pip${i < alive ? ' alive' : ''}`}
                              style={{width: size, height: size}}/>
                    ))}
                </span>
            );
        };

        return (
            <React.Fragment>
                <div className="battle-header">
                    <span className="battle-side">
                        <span className="battle-count droids">Droids {droids}</span>
                        {renderPips(droids, battle.startingDroids, 'droids')}
                    </span>
                    <span className={`battle-vs${battle.buffs.overchargeMs > 0 ? ' overcharged' : ''}`}>
                        {battle.buffs.overchargeMs > 0 ? 'OVERCHARGE' : 'vs'}
                    </span>
                    <span className="battle-side bugs">
                        {renderPips(bugs, battle.startingBugs, 'bugs')}
                        <span className="battle-count bugs">Bugs {bugs}</span>
                    </span>
                </div>
                <BattleCanvas battle={battle}/>
                <div className="popup-actions">
                    {slots.map((id, i) => (
                        <button key={id} title={CONSUMABLE_DEFS[id].description}
                                disabled={!(pouch[id] > 0)}
                                onClick={() => this.props.useConsumable(id)}>
                            <kbd>{i + 1}</kbd>{CONSUMABLE_DEFS[id].name} ×{pouch[id]}
                        </button>
                    ))}
                    <button disabled={withdrawing} onClick={() => this.props.retreatFromFight()}>
                        <kbd>Esc</kbd>{withdrawing ? 'Falling back…' : 'Retreat'}
                    </button>
                </div>
            </React.Fragment>
        );
    }

    render() {
        const fighting = this.props.squad && this.props.squad.fighting;
        const prompt = this.props.prompt;
        const poiId = fighting ? fighting.poiId : prompt && prompt.poiId;
        if (!poiId) return null;
        const poi = this.props.pois[poiId];
        if (!poi) return null;

        return (
            <div className={`encounter-popup${fighting ? ' battle' : ''}`}>
                <div className="popup-title">
                    <span style={{color: PLANET_COLORS[POI_COLOR_KEYS[poi.type]]}}>{POI_GLYPHS[poi.type]}</span>
                    {' '}{poi.name.toUpperCase()}
                </div>
                {fighting ? this.renderBattle(poi, fighting) :
                    prompt.phase === 'result' ? this.renderResult(prompt.result) : this.renderOffer(poi)}
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {
        squad: state.planet.squad,
        prompt: state.planet.prompt,
        pois: state.planet.pois
    };
};

export default connect(
    mapStateToProps,
    { squadInteract, squadLeavePrompt, useConsumable, retreatFromFight }
)(EncounterPopup);
