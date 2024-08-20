import React from 'react';
import {roundToDecimal} from "../../lib/helpers";

export default function ResourceRate(props) {
    let colorClass = '';
    let text = `${roundToDecimal(props.rate, 1)}`;

    if (props.rate > 0) {
        colorClass = 'text-green';
        text = `+${text}`;
    }
    else if (props.rate < 0) {
        colorClass = 'text-red';
    }

    if (!props.colorRate) {
        colorClass = '';
    }

    return <span className={`resource-rate ${colorClass}`}>
        {props.parenthesis && '('}
        {text}{props.icon && <span className={props.icon}/>}/s
        {props.parenthesis && ')'}
    </span>;
}
