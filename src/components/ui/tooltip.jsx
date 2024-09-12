import React from 'react';
import ReactTooltip from "react-tooltip";
import ReactDOM from "react-dom";

export default function Tooltip(props) {

    // TODO this doesn't work well if the tooltip is forced to move, since it is still offset according to original direction
    const place = props.place || 'right';
    let offset = {};
    switch(place) {
        case 'top':
            offset = { top: 10 }
            break;
        case 'right':
            offset = { right: 10 }
            break;
        case 'bottom':
            offset = { bottom: 10 }
            break;
        case 'left':
            offset = { left: 10 }
            break;
    }

    // Need to use createPortal to attach tooltip to an outer element (near <body>) otherwise the
    // tooltip might get clipped by overflow:hidden containers
    // https://github.com/ReactTooltip/react-tooltip/issues/358#issuecomment-1000442259
    return ReactDOM.createPortal(
        <ReactTooltip id={props.id} className={`game-tooltip`}
                      offset={offset} place={place}
                      border effect={'solid'}
                      backgroundColor={'#151d1a'} textColor={'#f0e7e7'} borderColor={'#f0e7e7'}
        >
            {props.children}
        </ReactTooltip>,
        document.getElementById("tooltip-container")
    )

}
