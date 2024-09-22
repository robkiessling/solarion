import React from 'react';

// import Outside from "./outside";
import Outside from "./outside";
import Structures from "./structures";
import ResourceBar from "./resource_bar";
import Log from "./log";
import PlanetStatus from "./planet_status";
import Computer from "./computer";
import NavigationTabs from "./navigation_tabs";
import Planet from "./planet";
import PlanetTools from "./planet_tools";
import Star from "./star";
import BlockPointerEvents from "./block_pointer_events";
import {connect} from "react-redux";
import GameOver from "./game_over";

class App extends React.Component {

    render() {
        if (this.props.gameOver) {
            return <GameOver />
        }

        let containerClass = '';
        containerClass += (this.props.hideUI ? ' hide-ui' : '');
        containerClass += (this.props.hideCanvas ? ' hide-canvas' : '');
        containerClass += (this.props.fadeToBlack ? ' fade-to-black' : '');

        return (
            <div id="app-container"
                 className={containerClass}>
                <div className="left-column">
                    <Structures/>
                    <PlanetTools/>

                </div>
                <div className="center-column">
                    <Outside/>
                    <Planet/>
                    <Star/>
                    <NavigationTabs/>
                </div>
                <div className="right-column">
                    <ResourceBar/>
                    <PlanetStatus/>
                    <Log/>

                </div>
                <div id={"tooltip-container"}></div>
                <BlockPointerEvents/>
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {
        hideUI: state.game.hideUI,
        hideCanvas: state.game.hideCanvas,
        fadeToBlack: state.game.fadeToBlack,
        gameOver: state.game.gameOver
    }
};

export default connect(
    mapStateToProps,
    {}
)(App);
