import React from 'react';
import {connect} from "react-redux";
import {retreatFromFight, squadInteract, squadLeavePrompt, useEquipment} from "../redux/modules/planet";
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
import {ARENA_W, BATTLE_PHASES, countSpawners, countUnits} from "../lib/battle";
import {CONTACT_MS} from "../lib/squad";
import {EQUIPMENT_DEFS, EQUIPMENT_ORDER} from "../database/equipment";
import BattleCanvas from "./battle_canvas";
import Tooltip from "./ui/tooltip";

/**
 * The centered encounter popup over the planet canvas, in one of three modes: the squad is standing on a
 * site awaiting a choice (offer phase), reading what happened there (result phase, including a wipe's
 * ending), or fighting -- the live battle arena with the equipment action row. Offer/result are views of
 * planet.prompt (planet-level, so a wipe's popup outlives the squad); the battle is a view of
 * squad.fighting. The world stays live behind it (no backdrop dim, nothing pauses), but the popup blocks
 * squad movement. Keyboard mapping (1..N actions, Enter/Space accept, Esc leave/retreat) lives in the
 * planet component's input layer; the buttons mirror it. Connected on its own so updates aren't gated by
 * the canvas's FPS-throttled shouldComponentUpdate.
 */
class EncounterPopup extends React.Component {
    // Force fractions, alive/starting (escapees count as alive: off the field, not dead). Mirrored:
    // labels sit at the outer edges. The bug denominator is the swarm's high-water mark (bugsPeak),
    // so spawner reinforcements raise the ceiling instead of overflowing it, and spawner fights add
    // a Hives fraction -- kill the sources or the swarm never drains. Shared between the live fight
    // and the result phase's frozen final frame, so the header doesn't jump when the battle ends.
    renderBattleHeader(battle) {
        const droids = countUnits(battle, 'droid') + battle.escaped;
        const spawners = countSpawners(battle);
        const bugs = countUnits(battle, 'bug') - spawners;
        return (
            <div className="battle-header">
                <span className="battle-side">
                    <span className="battle-count droids">Droids {droids}/{battle.startingDroids}</span>
                </span>
                <span className={`battle-vs${battle.buffs.overchargeMs > 0 ? ' overcharged' : ''}`}>
                    {battle.buffs.overchargeMs > 0 ? 'OVERCHARGE' : 'vs'}
                </span>
                <span className="battle-side bugs">
                    {battle.startingSpawners > 0 &&
                        <span className="battle-count hives">{spawners}/{battle.startingSpawners} Hives</span>}
                    <span className="battle-count bugs">{bugs}/{battle.bugsPeak} Bugs</span>
                </span>
            </div>
        );
    }

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
        // Battle results hold the field's final frame (frozen, nothing ticks it) with a verdict banner
        // over it, so the fight's ending stays on screen instead of snapping down to the small prompt;
        // the outcome text and Continue share the fixed-height footer the action row occupied.
        const finalBattle = result.finalBattle;
        const body = (
            <div className="popup-body">
                {story && <span className="story-text">"{story}"</span>}
                {result.wiped &&
                    <span className="result-line">
                        Contact lost — all {result.squadSize} {result.multiplier > 1 ? 'units' : 'droids'} destroyed.
                    </span>}
                {result.wiped && result.cargoLost &&
                    <span className="result-line">
                        Cargo lost: {formatResourceList(result.cargoLost)}.
                    </span>}
                {result.losses != null &&
                    <span className="result-line">
                        Nest cleared — lost {result.losses} of {result.squadSize} {result.multiplier > 1 ? 'units' : 'droids'}.
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
        );
        const actions = (
            <div className="popup-actions">
                <button onClick={() => this.props.squadLeavePrompt()}>
                    <kbd>1</kbd>Continue
                </button>
            </div>
        );
        if (!finalBattle) {
            return <React.Fragment>{body}{actions}</React.Fragment>;
        }
        return (
            <React.Fragment>
                {this.renderBattleHeader(finalBattle)}
                <div className="battle-final">
                    <BattleCanvas battle={finalBattle}/>
                    <div className={`battle-verdict${result.wiped ? ' wiped' : ''}`}>
                        {result.wiped ? 'CONTACT LOST' : 'NEST CLEARED'}
                    </div>
                </div>
                <div className="battle-footer">
                    {body}
                    {actions}
                </div>
            </React.Fragment>
        );
    }

    renderBattle(poi, fighting) {
        const battle = fighting.battle;
        const equipment = this.props.squad.equipment || {};
        // Carried gear in manifest order; slots stay put as charges run out, matching the number
        // hotkeys in the planet component's input layer
        const slots = EQUIPMENT_ORDER.filter(id => equipment[id] !== undefined);
        const withdrawing = battle.phase === BATTLE_PHASES.withdrawing;

        return (
            <React.Fragment>
                {this.renderBattleHeader(battle)}
                <BattleCanvas battle={battle}/>
                <div className="battle-footer">
                    <div className="popup-actions">
                        {slots.map((id, i) => (
                            <React.Fragment key={id}>
                                <button data-tip data-for={`battle-item-${id}-tip`}
                                        disabled={!(equipment[id] > 0)}
                                        onClick={() => this.props.useEquipment(id)}>
                                    <kbd>{i + 1}</kbd>{EQUIPMENT_DEFS[id].name}{' '}
                                    {'●'.repeat(equipment[id]) + '○'.repeat(Math.max(0, EQUIPMENT_DEFS[id].charges - equipment[id]))}
                                </button>
                                <Tooltip id={`battle-item-${id}-tip`} place="top">
                                    {EQUIPMENT_DEFS[id].description} Charges reload on the powered grid.
                                </Tooltip>
                            </React.Fragment>
                        ))}
                        <button disabled={withdrawing} onClick={() => this.props.retreatFromFight()}>
                            <kbd>Esc</kbd>{withdrawing ? 'Falling back…' : 'Retreat'}
                        </button>
                    </div>
                </div>
            </React.Fragment>
        );
    }

    render() {
        // Held shut through the contact beat: the squad is still visibly dropping into the hive on the map,
        // and the battle behind this hasn't started ticking yet (see advanceSquad's descent).
        const descending = this.props.squad && this.props.squad.fighting &&
            this.props.squad.fighting.contactMs !== undefined &&
            this.props.squad.fighting.contactMs < CONTACT_MS;
        const fighting = !descending && this.props.squad && this.props.squad.fighting;
        const prompt = this.props.prompt;
        const poiId = fighting ? fighting.poiId : prompt && prompt.poiId;
        if (!poiId) return null;
        const poi = this.props.pois[poiId];
        if (!poi) return null;

        // Battle mode grows the popup with the arena (same sqrt-of-headcount scale as the field itself),
        // capped near-fullscreen; the height cap keeps the 5:3 canvas plus header/actions on screen.
        // Scaled battles re-anchor to the viewport: the default home (#planet) clips overflow at the panel
        // edges and the flanking panels paint over it. z-index stays below the settings modal (4).
        // The result phase of a fight keeps the battle layout (its finalBattle frame stays on screen),
        // so the popup holds its size and position through the ending instead of snapping down.
        const battleView = fighting ? fighting.battle :
            (prompt && prompt.phase === 'result' && prompt.result.finalBattle) || null;
        let style;
        if (battleView) {
            const scale = (battleView.arenaW || ARENA_W) / ARENA_W;
            if (scale > 1) {
                style = {
                    width: `min(${(34 * scale).toFixed(1)}rem, 94vw, calc(150vh - 13rem))`,
                    position: 'fixed',
                    left: '50%',
                    top: '50%', // true center: at this size the panel-relative 46% would run into the top bar
                    zIndex: 3
                };
            }
        }

        return (
            <div className={`encounter-popup${battleView ? ' battle' : ''}`} style={style}>
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
    { squadInteract, squadLeavePrompt, useEquipment, retreatFromFight }
)(EncounterPopup);
