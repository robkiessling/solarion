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

export default class App extends React.Component {
    render() {
        return (
            <div id="app-container">
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
