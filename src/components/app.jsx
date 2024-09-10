import React from 'react';

// import Outside from "./outside";
import Outside from "./outside__CANVAS";
import Structures from "./structures";
import ResourceBar from "./resource_bar";
import Log from "./log";
import PlanetStatus from "./planet_status";
import Computer from "./computer";
import NavigationTabs from "./navigation_tabs";
import Planet from "./planet";
import PlanetTools from "./planet_tools";
import Star from "./star";

export default class App extends React.Component {
    render() {
        return (
            <div id="app-container">
                <div className="left-column">
                    <PlanetStatus/>
                    <ResourceBar/>
                    <Log/>
                </div>
                <div className="center-column">
                    <Outside/>
                    <Planet/>
                    <Star/>
                    <NavigationTabs/>
                </div>
                <div className="right-column">
                    <Structures/>
                    <PlanetTools/>
                </div>

                {/*<div className="top-row">*/}
                {/*    <Outside/>*/}
                {/*    <PlanetStatus/>*/}
                {/*    <ResourceBar/>*/}
                {/*    <NavigationTabs/>*/}
                {/*    <Planet/>*/}
                {/*</div>*/}
                {/*<div className="bottom-row">*/}
                {/*    <div className="left-column">*/}
                {/*        <Log/>*/}
                {/*        <Computer/>*/}
                {/*    </div>*/}
                {/*    <div className="right-column">*/}
                {/*        <Structures/>*/}
                {/*    </div>*/}
                {/*</div>*/}
            </div>
        );
    }
}
