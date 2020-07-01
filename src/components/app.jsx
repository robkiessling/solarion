import React from 'react';

import Outside from "./outside";
import Structures from "./structures";
import ResourceBar from "./resource_bar";
import Tester from "./tester";

// TODO
// import game from "../singletons/game"
// import gameClock from "../singletons/game_clock"

export default class App extends React.Component {
    render() {
        return (
            <div className="app">
                <ResourceBar/>
                <Tester/>
                <Outside/>
                <Structures/>
            </div>
        );
    }
}
