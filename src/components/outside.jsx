/**
 * Not sure if going to keep this... deciding between a canvas approach vs. straight up HTML
 */

import React from 'react';
import Background from "../lib/background";
import backgrounds from "../database/backgrounds";

export default class Outside extends React.Component {
    constructor(props) {
        super(props);

        this.container = React.createRef();
        this.content = React.createRef();
    }

    componentDidMount() {
        const background = new Background(this.content.current);
        background.drawImage(backgrounds.planet.background);
    }

    render() {
        return (
            <div id="outside-container" ref={this.container}>
                <div id="outside-content" ref={this.content}>
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                    ...oooOOO                                              OOOooo...<br />
                </div>
            </div>
        );
    }
}