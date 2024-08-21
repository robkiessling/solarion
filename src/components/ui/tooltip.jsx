import React from 'react';
import ReactTooltip from "react-tooltip";

export default function Tooltip(props) {

    return <ReactTooltip id={props.id} className={`game-tooltip`} border
                         place={props.place || 'left'} effect={props.effect || 'solid'}
                         backgroundColor={'#151d1a'} textColor={'#f0e7e7'} borderColor={'#f0e7e7'}
    >
        {props.children}
    </ReactTooltip>;

}
