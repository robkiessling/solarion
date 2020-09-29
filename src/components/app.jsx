import React from 'react';

import Outside from "./outside";
import Structures from "./structures";
import ResourceBar from "./resource_bar";
import Log from "./log";
import Computer from "./computer";

export default class App extends React.Component {
    render() {
        return (
            <div className="app">
                <div className="left-column">
                    <Outside/>
                    <div className="split-container">
                        <Log/>
                        <Computer/>
                    </div>
                </div>
                <div className="right-column">
                    <ResourceBar/>
                    <Structures/>
                </div>

            </div>
        );
    }
}
