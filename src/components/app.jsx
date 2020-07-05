import React from 'react';

import Outside from "./outside";
import Structures from "./structures";
import ResourceBar from "./resource_bar";
import Tester from "./tester";

// Note: These imports are required; they actually initialize the singletons
import gameClock from "../singletons/game_clock"
import resourceManager from "../singletons/resource_manager"

export default class App extends React.Component {
    render() {
        return (
            <div className="app">
                <ResourceBar/>
                {/*<Tester/>*/}
                <Outside/>
                <Structures/>
            </div>
        );
    }
}
