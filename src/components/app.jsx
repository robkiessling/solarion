import React from 'react';

import Outside from "./outside";
import Structures from "./structures";
import ResourceBar from "./resource_bar";
import Log from "./log";
import Tester from "./tester";

// Note: These imports are required; they actually initialize the singletons
import gameClock from "../singletons/game_clock"
import resourceManager from "../singletons/resource_manager"

export default class App extends React.Component {
    render() {
        return (
            <div className="app">
                <div className="left-column">
                    <ResourceBar/>
                    <Log/>
                </div>
                <div className="middle-column">
                    <Outside/>
                </div>
                <div className="right-column">
                    <Structures/>
                </div>
            </div>
        );
    }
}
