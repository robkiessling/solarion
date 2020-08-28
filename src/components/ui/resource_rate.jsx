import React from 'react';

export default function ResourceRate(props) {
    let className = '';
    let text = `${props.rate}`;

    if (props.rate > 0) {
        className = 'text-green';
        text = `+${text}`;
    }
    else if (props.rate < 0) {
        className = 'text-red';
    }

    return <span className={className}>
        {props.parenthesis && '('}
        {text}{props.icon && <span className={props.icon}/>}/s
        {props.parenthesis && ')'}
    </span>;
}
