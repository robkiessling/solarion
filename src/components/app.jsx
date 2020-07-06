import React from 'react';

import Outside from "./outside";
import Structures from "./structures";
import ResourceBar from "./resource_bar";
import Log from "./log";
import Tester from "./tester";
import Title from "./title";

export default class App extends React.Component {
    render() {
        return (
            <div className="app">
                <div className="left-column">
                    <ResourceBar/>
                    <Log/>
                </div>
                <div className="middle-column">
                    <Title/>
                    <Outside/>
                </div>
                <div className="right-column">
                    <Structures/>
                </div>
            </div>
        );
    }
}
