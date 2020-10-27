import React from 'react';

import Outside from "./outside";
import Structures from "./structures";
import ResourceBar from "./resource_bar";
import Log from "./log";
import Computer from "./computer";
import StandaloneUpgrades from "./standalone_upgrades";
import PlanetStatus from "./planet_status";

export default class App extends React.Component {
    render() {
        return (
            <div className="app">
                <div className="top-row">
                    <Outside/>
                    <PlanetStatus/>
                    <ResourceBar/>
                </div>
                <div className="bottom-row">
                    <div className="left-column">
                        <Log/>
                    </div>
                    <div className="right-column">
                        <div className="column-container">
                            <Structures/>
                            <StandaloneUpgrades/>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
