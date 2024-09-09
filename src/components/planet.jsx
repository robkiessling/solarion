import React from 'react';
import {connect} from "react-redux";
import {TERRAINS, STATUSES} from "../lib/planet_map";
import {planetMapImage} from "../redux/reducer";

class Planet extends React.Component {
    constructor(props) {
        super(props);

        // this.manager = new PlanetManager();
    }

    shouldComponentUpdate(nextProps, nextState) {
        // Checking both this props and next props to ensure we update on visibility changes
        return this.props.visible || nextProps.visible;
    }

    render() {
        const legend = [TERRAINS.home, STATUSES.unknown, TERRAINS.flatland, TERRAINS.developed, TERRAINS.mountain];

        return (
            <div id="planet" className={`${this.props.visible ? '' : 'hidden'}`}>
                <div className="planet-image">
                    {
                        this.props.planetImage.map((imageRow, rowIndex) => {
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

// Updates to these fields will trigger re-renders
const mapStateToProps = state => {
    return {
        visible: state.game.currentNavTab === 'planet',
        planetImage: planetMapImage(state),
    }
};

export default connect(
    mapStateToProps,
    {}
)(Planet);