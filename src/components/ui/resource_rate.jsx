import React from 'react';
import {roundToDecimal} from "../../lib/helpers";

export default function ResourceRate(props) {
    let className = '';
    let text = `${roundToDecimal(props.rate, 1)}`;

    if (props.rate > 0) {
        className = 'text-green';
        text = `+${text}`;
    }
    else if (props.rate < 0) {
        className = 'text-red';
    }

    if (!props.colorRate) {
        className = '';
    }

    return <span className={className}>
        {props.parenthesis && '('}
        {text}{props.icon && <span className={props.icon}/>}/s
        {props.parenthesis && ')'}
    </span>;
}
