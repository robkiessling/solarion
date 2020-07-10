/**
 * TODO This is not implemented yet
 */


import React from "react";

// export default function ProgressButton(props) {
//     return (
//         <button
//             className="progress-button"
//             onClick={() => props.onClick()}>
//             {props.label}
//         </button>
//     );
// }

export default class ProgressButton extends React.Component {
    constructor(props) {
        super(props);

        this.progressBar = React.createRef();
    }

    onClick() {
        console.log('inner');
        // let progress = 100;

        // window.setInterval(() => {
        //     this.progressBar.current.style.width = `${progress}%`;
        // }, 10);

        this.props.onClick();
    }

    render() {
        return (
            <div className="progress-button" onClick={() => this.onClick()}>
                {this.props.label}
                <div className="progress-bar" ref={this.progressBar} style={ { width: `${this.props.remaining}%` } }/>
            </div>
        );
    }
}
