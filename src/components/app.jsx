import React from 'react';

import Outside from "./outside";
import Structures from "./structures";
import ResourceBar from "./resource_bar";
import Log from "./log";
import PlanetStatus from "./planet_status";
import Computer from "./computer";
import NavigationTabs from "./navigation_tabs";
import Planet from "./planet";

export default class App extends React.Component {
    render() {
        return (
            <div className="app">
                <div className="top-row">
                    <Outside/>
                    <PlanetStatus/>
                    <ResourceBar/>
                    <NavigationTabs/>
                    <Planet/>
                </div>
                <div className="bottom-row">
                    <div className="left-column">
                        <Log/>
                        <Computer/>
                    </div>
                    <div className="right-column">
                        <Structures/>
                    </div>
                </div>
            </div>
        );
    }
}
