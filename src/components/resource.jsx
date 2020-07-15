import React from 'react';
import {round} from "../lib/helpers";

export default function Resource(props) {
    let rateText = null;
    if (props.rate > 0) {
        rateText = <span className="text-green"> (+{props.rate}/s)</span>
    }
    else if (props.rate < 0) {
        rateText = <span className="text-red"> ({props.rate}/s)</span>
    }

    let capacityText = null;
    if (props.capacity < Infinity) {
        capacityText = `/${props.capacity}`;
    }

    return (
        // Have to use Math.floor on quantity; cannot round because then it might show you having enough resources
        // to build something when you actually don't
        <div className="resource">
            {props.name}: {Math.floor(props.quantity)}
            {capacityText}
            {rateText}
        </div>
    );
}
