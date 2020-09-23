import React from 'react';
import {round} from "../lib/helpers";
import ResourceRate from "./ui/resource_rate";

export default function Resource(props) {
    let capacityText = null;
    if (props.capacity < Infinity) {
        capacityText = `/${props.capacity}`;
    }

    return (
        // Have to use Math.floor on quantity; cannot round because then it might show you having enough resources
        // to build something when you actually don't
        <div className="resource">
            <span className={props.icon} />
            {props.name}: {Math.floor(props.quantity)}
            {capacityText}
            &nbsp;
            <ResourceRate rate={props.rate} colorRate={props.colorRate} parenthesis={true} />
        </div>
    );
}
