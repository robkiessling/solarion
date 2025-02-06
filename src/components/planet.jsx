import React from 'react';
import {connect} from "react-redux";
import {TERRAINS, STATUSES, generateImage} from "../lib/planet_map";
import {PLANET_FPS} from "../singletons/game_clock";
import * as fromClock from "../redux/modules/clock";
import {EXPEDITION_STATUS} from "../redux/modules/planet";

class Planet extends React.Component {
    constructor(props) {
        super(props);

        this.waitTimeMs = 1000.0 / PLANET_FPS; // how long to wait between rendering
    }

    // todo move this to base class. also throw warning if props.elapsedTime undefined
    shouldComponentUpdate(nextProps, nextState) {
        if (this.props.visible !== nextProps.visible) {
            return true;
        }

        if (!this.props.visible) {
            return false;
        }

        if (this.lastRenderAt && this.lastRenderAt > (nextProps.elapsedTime - this.waitTimeMs)) {
            return false;
        }

        this.lastRenderAt = nextProps.elapsedTime;
        return true;
    }

    render() {
        const legend = [TERRAINS.home, STATUSES.unknown, TERRAINS.flatland, TERRAINS.mountain, TERRAINS.developed];

        const planetImage = generateImage(
            this.props.map,
            this.props.expedition.status === EXPEDITION_STATUS.unstarted ? null : this.props.expedition,
            this.props.fractionOfDay,
            this.props.sunTracking,
            this.props.cookedPct
        );

        return (
            <div id="planet" className={`${this.props.visible ? '' : 'hidden'}`}>
                <div className="planet-image">
                    {
                        planetImage.map((imageRow, rowIndex) => {
                            return <span key={rowIndex}>
                                {imageRow.map((sector, colIndex) => {
                                    const {char, className, style} = sector;
                                    if (style) {
                                        return <span key={colIndex} className={className} style={style}>{char}</span>
                                    }
                                    else {
                                        return <span key={colIndex} className={className}>{char}</span>
                                    }
                                })}
                            </span>
                        })
                    }
                </div>
                <div className="planet-legend">
                    <span className='d-flex justify-center underline'>Legend</span>
                    {
                        legend.map((attributes) => {
                            return <span key={attributes.key}>
                                <span className={attributes.className}>
                                    {attributes.display} {attributes.label}
                                </span>
                            </span>
                        })
                    }
                    {/*<span style={{marginTop: '2px'}}>*/}
                    {/*    <span className={'exploring'}>&nbsp;</span> Exploring*/}
                    {/*</span>*/}
                </div>
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {
        visible: state.game.currentNavTab === 'planet',
        map: state.planet.map,
        elapsedTime: state.clock.elapsedTime,
        expedition: state.planet.expedition,
        fractionOfDay: fromClock.fractionOfDay(state.clock),
        sunTracking: state.planet.sunTracking ? undefined : state.planet.rotation,
        cookedPct: state.planet.cookedPct
    }
};

export default connect(
    mapStateToProps,
    {}
)(Planet);