import React from 'react';
import {connect} from "react-redux";
import {retreatFromFight, squadDescend, squadEngage, squadInteract, squadLeaveApproach, squadLeavePrompt, squadWithdraw, useEquipment} from "../../redux/modules/squad";
import {approachTextFor, estimateSignatureRange, formatResourceList, isGarrisoned, fightSignatures, poiLevels, promptTextFor} from "../../lib/planet/pois";
import {POI_COLOR_KEYS, POI_GLYPHS, POI_TYPE_DEFAULTS} from "../../database/planet/poi_types";
import {CAPABILITY_LABELS} from "../../database/planet/capabilities";
import {PLANET_COLORS} from "../../database/planet/colors";
import {ARENA_W, battleBlurb, countSpawners, countUnits} from "../../lib/battle/sim";
import {CONTACT_MS, POPUP_INPUT_LOCK_MS} from "../../database/squad/tuning";
import {promptActions} from "../../lib/planet/prompt_actions";
import {EQUIPMENT_DEFS, EQUIPMENT_ORDER} from "../../database/squad/equipment";
import {APPROACH_GROUND} from "../../database/battle/blurbs";
import BattleCanvas from "./canvas";
import Tooltip from "../ui/tooltip";
import PopupFrame from "../ui/popup_frame";

/**
 * The centered encounter popup over the planet canvas, in one of four modes: the squad is standing on a
 * site awaiting a choice (offer phase), on a garrisoned site deciding whether to fight (approach phase: the
 * card that commits to the battle), reading what happened there (result phase, including a wipe's ending),
 * or fighting -- the live battle arena with the equipment action row. Offer/result are views of
 * planet.prompt (planet-level, so a wipe's popup outlives the squad); the battle is a view of
 * squad.fighting. The world stays live behind the backdrop dim (nothing pauses), but the popup blocks
 * squad movement. Every button carries its one key: numbered 1..N left to right with the way out last, and
 * Esc on a fight's Retreat only (lib/planet/prompt_actions.ts has the rule and the phase lists; the planet
 * component's input layer fires the same lists). A freshly opened phase ignores clicks for
 * POPUP_INPUT_LOCK_MS, the same beat the input layer holds its number keys. Connected on its own so
 * updates aren't gated by the canvas's FPS-throttled shouldComponentUpdate. Chrome (backdrop/surface/title)
 * is the shared PopupFrame; no dismissal props are passed -- leaving is an explicit action, never a stray click.
 */
// Layout constants mirrored from the stylesheets: the top bar's min-height (app.scss) and the deployed HUD
// strip's clearance within the planet frame ($hud-clearance, base_view.scss). Big fights anchor the popup
// to the viewport and must keep below the HUD by hand.
const TOP_BAR_REM = 3.2;
const HUD_CLEARANCE_REM = 6.5;

class EncounterPopup extends React.Component {
    constructor(props) {
        super(props);
        this.openedAt = -Infinity; // performance.now() of the last phase opening (the click lock's start)
    }

    componentDidUpdate(prevProps) {
        const fightStarted = this.props.squad && this.props.squad.fighting && !(prevProps.squad && prevProps.squad.fighting);
        if ((this.props.prompt && this.props.prompt !== prevProps.prompt) || fightStarted) {
            this.openedAt = performance.now();
        }
    }

    // A button's click, dropped while the phase's input lock holds (the buttons don't grey out for it: a
    // quarter-second flash of disabled styling on every popup would read as a glitch)
    guarded(run) {
        return () => { if (performance.now() - this.openedAt >= POPUP_INPUT_LOCK_MS) run(); };
    }

    // The phase's answers as its button row, numbered in list order
    renderPromptActions(poi, prompt) {
        return (
            <div className="popup-actions">
                {promptActions(poi, prompt).map((action, i) => (
                    <button key={i} onClick={this.guarded(() => action.run(this.props))}>
                        <kbd>{i + 1}</kbd>{action.label}
                    </button>
                ))}
            </div>
        );
    }

    // Force fractions, alive/starting (escapees count as alive: off the field, not dead). Mirrored:
    // labels sit at the outer edges. The hostile denominator is the field's high-water mark (hostilesPeak),
    // so spawner reinforcements raise the ceiling instead of overflowing it, and spawner fights add
    // a shelters fraction -- kill the sources or the field never drains. Shared between the live fight
    // and the result phase's frozen final frame, so the header doesn't jump when the battle ends.
    renderBattleHeader(battle) {
        const droids = countUnits(battle, 'droid') + battle.escaped;
        const spawners = countSpawners(battle);
        const hostiles = countUnits(battle, 'hostile') - spawners;
        return (
            <div className="battle-header">
                <span className="battle-side">
                    <span className="battle-count droids">Droids {droids}/{battle.startingDroids}</span>
                </span>
                <span className={`battle-vs${battle.buffs.overchargeMs > 0 ? ' overcharged' : ''}`}>
                    {battle.buffs.overchargeMs > 0 ? 'OVERCHARGE' : 'vs'}
                </span>
                <span className="battle-side hostiles">
                    {battle.startingSpawners > 0 &&
                        <span className="battle-count shelters">{spawners}/{battle.startingSpawners} Sources</span>}
                    <span className="battle-count hostiles">{hostiles}/{battle.hostilesPeak} Hostiles</span>
                </span>
            </div>
        );
    }

    renderOffer(poi, prompt) {
        return (
            <React.Fragment>
                <div className="popup-body">{promptTextFor(poi)}</div>
                {this.renderPromptActions(poi, prompt)}
            </React.Fragment>
        );
    }

    // The approach card: what the sensors make of the site from outside (the authored line, the ground ahead, the
    // threat as a band until a fight has shown the true count), and the choice.
    renderApproach(poi, prompt) {
        const level = poiLevels(poi)[0];
        const ground = level && APPROACH_GROUND[level.terrain || 'open'];
        let threat = null;
        if (level) {
            const signatures = fightSignatures(level);
            const [lo, hi] = estimateSignatureRange(signatures);
            threat = poi.signaturesKnown ? `Signatures: ${signatures}.` : `Signatures: ${lo} to ${hi}.`;
        }
        return (
            <React.Fragment>
                <div className="popup-body">
                    <span className="result-line">{approachTextFor(poi)}</span>
                    {ground && <span className="result-line">{ground}</span>}
                    {threat && <span className="outcome-line">{threat}</span>}
                </div>
                {this.renderPromptActions(poi, prompt)}
            </React.Fragment>
        );
    }

    renderResult(poi, prompt) {
        const result = prompt.result;
        // Battle results hold the field's final frame (frozen, nothing ticks it) with a verdict banner
        // over it, so the fight's ending stays on screen instead of snapping down to the small prompt;
        // the outcome text and Continue share the fixed-height footer the action row occupied.
        const finalBattle = result.finalBattle;
        // A level of a deeper site fell: the result doubles as the descend-or-withdraw choice (a tunnel's
        // levels run ahead, not down)
        const descent = result.nextLevel != null;
        const tunnel = poi.type === 'tunnel';
        const onward = tunnel ? 'ahead' : 'below';
        const body = (
            <div className="popup-body">
                {result.text && <span className="story-text">"{result.text}"</span>}
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
                        {descent ? `Level ${result.level + 1} cleared` : POI_TYPE_DEFAULTS[poi.type].clearedLabel} — lost {result.losses} of {result.squadSize} {result.multiplier > 1 ? 'units' : 'droids'}.
                    </span>}
                {result.landCredit > 0 &&
                    <span className="outcome-line">Reclaimed {result.landCredit} land.</span>}
                {result.capability &&
                    <span className="outcome-line">
                        Salvaged: {CAPABILITY_LABELS[result.capability] || result.capability}
                    </span>}
                {result.loaded &&
                    <span className="outcome-line">Loaded {formatResourceList(result.loaded)}.</span>}
                {result.battery != null && result.battery !== 0 &&
                    <span className="outcome-line">Battery {result.battery > 0 ? '+' : ''}{result.battery}.</span>}
                {result.unitsGained > 0 &&
                    <span className="outcome-line">Recovered {result.unitsGained} {result.unitsGained > 1 ? 'droids' : 'droid'}.</span>}
                {descent &&
                    <span className="result-line">
                        {result.levelsTotal ?
                            `Level ${result.nextLevel + 1} of ${result.levelsTotal} lies ${onward}.` :
                            `Signatures ${onward}.`}
                        {' '}{tunnel ? 'Press on?' : 'Descend?'}
                    </span>}
            </div>
        );
        const actions = this.renderPromptActions(poi, prompt);
        if (!finalBattle) {
            return <React.Fragment>{body}{actions}</React.Fragment>;
        }
        return (
            <React.Fragment>
                {this.renderBattleHeader(finalBattle)}
                <div className="battle-final">
                    <BattleCanvas battle={finalBattle}/>
                    <div className={`battle-verdict${result.wiped ? ' wiped' : ''}`}>
                        {result.wiped ? 'CONTACT LOST' : descent ? 'LEVEL CLEARED' : (POI_TYPE_DEFAULTS[poi.type].clearedLabel || 'Cleared').toUpperCase()}
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
        const withdrawing = battle.phase === 'withdrawing';
        const poiLevel = poiLevels(poi)[fighting.level || 0];

        return (
            <React.Fragment>
                {this.renderBattleHeader(battle)}
                <BattleCanvas battle={battle}/>
                <div className="battle-footer">
                    <div className="popup-body battle-blurb">{poiLevel.blurb || battleBlurb(battle, poiLevel.formation)}</div>
                    <div className="popup-actions">
                        {slots.map((id, i) => (
                            <React.Fragment key={id}>
                                <button data-tip data-for={`battle-item-${id}-tip`}
                                        disabled={!(equipment[id] > 0)}
                                        onClick={this.guarded(() => this.props.useEquipment(id))}>
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
        // Opens the moment the fight is committed to. The contact beat (the squad dropping into the settlement on
        // the map, the battle held at its opening frame) plays out behind and inside it: the beat is too short for
        // the eye to find the glyph on the map, and the arena standing still for it before the first shot reads
        // better than a blank gap between the approach card and the fight.
        const fighting = this.props.squad && this.props.squad.fighting;
        const prompt = this.props.prompt;
        // A sprung approach card (a camp, an ambush) holds shut through the contact beat too: the map is
        // playing the squad's glyph blinking on the tile it was caught on.
        if (prompt && prompt.phase === 'approach' && prompt.sprungAt != null &&
            this.props.elapsedTime - prompt.sprungAt < CONTACT_MS) return null;
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
                // Same centering rule as the stylesheet's frame-anchored case, in viewport terms: insets
                // of top bar + HUD clearance keep the popup off the live health/battery readout, auto
                // margins center it when it fits, top-align it when it doesn't. The width cap keeps the
                // whole popup (5:3 arena + chrome) inside the top inset and a 1rem foot.
                const inset = TOP_BAR_REM + HUD_CLEARANCE_REM;
                style = {
                    width: `min(${(34 * scale).toFixed(1)}rem, 94vw, calc(150vh - ${(13 + 1.5 * inset + 1.5).toFixed(2)}rem))`,
                    position: 'fixed',
                    left: '50%',
                    top: `${inset.toFixed(2)}rem`,
                    bottom: `${inset.toFixed(2)}rem`,
                    zIndex: 3
                };
            }
        }

        // Which level of a multi-level settlement this is. An announced site counts from the start ("Level 1 of 3");
        // an unannounced one says nothing on the surface (that would give away that there is more) and
        // only numbers the levels once the squad is below it.
        let levelLabel = '';
        const level = fighting ? fighting.level : prompt && prompt.result && prompt.result.level;
        if (isGarrisoned(poi) && level != null && poiLevels(poi).length > 1) {
            if (poi.levelsShown) levelLabel = ` · Level ${level + 1} of ${poiLevels(poi).length}`;
            else if (level > 0) levelLabel = ` · Level ${level + 1}`;
        }

        // Glyph and site name as the popup's header, in the site's map color
        const title = <React.Fragment>{POI_GLYPHS[poi.type]} {poi.name}{levelLabel}</React.Fragment>;
        return (
            <PopupFrame className={`encounter-popup${battleView ? ' battle' : ''}`} style={style} title={title}
                        accent={PLANET_COLORS[POI_COLOR_KEYS[poi.type]]}>
                {fighting ? this.renderBattle(poi, fighting) :
                    prompt.phase === 'result' ? this.renderResult(poi, prompt) :
                    prompt.phase === 'approach' ? this.renderApproach(poi, prompt) : this.renderOffer(poi, prompt)}
            </PopupFrame>
        );
    }
}

const mapStateToProps = state => {
    return {
        squad: state.planet.squad,
        prompt: state.planet.prompt,
        pois: state.planet.pois,
        elapsedTime: state.clock.elapsedTime
    };
};

export default connect(
    mapStateToProps,
    { squadInteract, squadLeavePrompt, squadEngage, squadLeaveApproach, squadDescend, squadWithdraw, useEquipment, retreatFromFight }
)(EncounterPopup);
