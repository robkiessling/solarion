import React from 'react';
import { connect } from 'react-redux';
import { NAV_TAB_TITLES, updateSetting } from "../redux/modules/game";
import { isOnGrid, squadBatteryCapacity, squadDrainPerTile, squadHp } from "../lib/squad";
import { getCrossTime, getTerrain, TERRAINS } from "../lib/planet_map";
import { PLANET_COLORS } from "../lib/planet_render";

const formatStat = (n) => Number.isInteger(n) ? n : n.toFixed(1);

/**
 * The tab strip above the map. While a squad is fielded (and the Planet tab is up) the strip becomes the
 * expedition HUD instead: the tab labels give way to squad health and battery readouts, the tab underline splits
 * into the two meters, and the ground underfoot reads on a line beneath. That both locks the player onto the planet until the squad is home (Base isn't
 * reachable mid-expedition) and puts the numbers you actually watch while driving in the widest, most
 * peripherally legible slot on the screen instead of the sidebar. It stays up through fights (that's when
 * squad health moves most); the encounter popup keeps below it (see $hud-clearance in outside.scss).
 */
class NavigationTabs extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hpFlash: 0 // bumps per reserve-power health burn; keys the health meter's bleed flash
        };
    }

    // On reserve power each tile is paid in health; flash the meter per payment
    componentDidUpdate(prevProps) {
        const prev = prevProps.squad, cur = this.props.squad;
        if (!prev || !cur || cur.battery > 0) return;
        const sum = (s) => (s.droidHp || []).reduce((total, hp) => total + hp, 0);
        if (sum(cur) < sum(prev)) {
            this.setState({ hpFlash: this.state.hpFlash + 1 });
        }
    }

    renderTabs() {
        return this.props.visibleNavTabs.map(tab =>
            <a key={tab} onClick={() => this.props.updateSetting('currentNavTab', tab)}
               className={`tab ${tab === this.props.currentNavTab ? 'current-tab' : ''}`}>
                {tab === this.props.currentNavTab ? '[[' : ''}
                {NAV_TAB_TITLES[tab]}
                {tab === this.props.currentNavTab ? ']]' : ''}
            </a>
        );
    }

    renderHud() {
        const squad = this.props.squad;
        const { hp, hpMax } = squadHp(squad);
        const capacity = squadBatteryCapacity(squad);
        const battery = squad.battery;
        const reserve = battery <= 0;
        const batteryLow = !reserve && battery <= capacity * 0.25;
        const hpLow = hp <= hpMax * 0.5;
        const rangeTiles = Math.floor(Math.max(0, battery) / squadDrainPerTile(squad));
        const pct = (value, max) => Math.max(0, Math.min(100, (value / max) * 100));

        return (
            <React.Fragment>
                <div className={`hud-meter hull${hpLow ? ' low' : ''}${this.state.hpFlash > 0 ? ' bleed' : ''}`}>
                    <div className="hud-label">
                        <span>Squad Health</span>
                        <span className="hud-value">{formatStat(hp)} / {formatStat(hpMax)}</span>
                    </div>
                    {/* Keyed by hpFlash so each hull burn remounts the bar (not the label, whose fade-in
                        would replay) and restarts its bleed animation */}
                    <div key={this.state.hpFlash} className="hud-bar">
                        <span className="fill" style={{ width: `${pct(hp, hpMax)}%` }}/>
                    </div>
                </div>
                <div className={`hud-meter battery${reserve ? ' reserve' : batteryLow ? ' low' : ''}`}>
                    <div className="hud-label">
                        <span>Battery</span>
                        <span className="hud-value">
                            {reserve ? 'RESERVE' : `${Math.ceil(battery)} / ${capacity} · ${isFinite(rangeTiles) ? `~${rangeTiles} tiles` : 'no drain'}`}
                        </span>
                    </div>
                    <div className="hud-bar">
                        <span className="fill" style={{ width: `${pct(battery, capacity)}%` }}/>
                        <span className="tick"/>
                    </div>
                </div>
            </React.Fragment>
        );
    }

    // The ground underfoot, as one line under the meters: terrain name in its map color, then the effects
    // the driver should notice (a speed divisor when the ground slows the squad; the hive warning). Kept
    // to one line of fixed height so the strip holds still as conditions come and go.
    renderTerrainLine() {
        const { sector, onGrid, unlockedTerrains } = this.props;
        if (!sector) return null;

        const terrain = getTerrain(sector.terrain);
        // Crossing-time multiple relative to flatland (integer multiples by construction), shown as a speed
        // divisor and only when the ground actually slows the squad; drain isn't shown (constant per
        // deployment; the range readout above carries it live)
        const slowdown = getCrossTime(sector.terrain, unlockedTerrains) / TERRAINS.flatland.crossTime;
        const slow = !onGrid && slowdown > 1;

        return (
            <div className="hud-terrain">
                <span style={{ color: PLANET_COLORS[terrain.key] }}>{terrain.display} {terrain.label}</span>
                {slow && <span className="hud-terrain-effect">· speed ÷{formatStat(slowdown)}</span>}
                {sector.infestedBy && <span className="hud-terrain-warn" style={{ color: PLANET_COLORS.infested }}>· ⚠ Hive territory</span>}
            </div>
        );
    }

    render() {
        const hud = !!this.props.squad && this.props.currentNavTab === 'planet';
        return (
            <div className={`navigation-tabs ${hud ? 'squad-hud' : ''} ${this.props.visible ? '' : 'hidden'}`}>
                {hud ? this.renderHud() : this.renderTabs()}
                {hud && this.renderTerrainLine()}
            </div>
        );
    }
}

const mapStateToProps = state => {
    const squad = state.planet.squad;
    const map = state.planet.map;
    return {
        visible: state.game.visibleNavTabs.length,
        visibleNavTabs: state.game.visibleNavTabs,
        currentNavTab: state.game.currentNavTab,
        squad,
        sector: squad && map.length > 0 ? map[squad.coord[0]][squad.coord[1]] : null,
        onGrid: !!(squad && map.length > 0 && isOnGrid(map, squad.coord)),
        unlockedTerrains: state.planet.unlockedTerrains
    }
};

export default connect(
    mapStateToProps,
    { updateSetting }
)(NavigationTabs);
