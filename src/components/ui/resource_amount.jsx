import React from 'react';
import {formatInteger, formatNumber, roundToDecimal} from "../../lib/helpers";
import {isObject} from "lodash";

/**
 *
 * @param props
 *   - amount (required) A Number or an Object with format { hasEnough: true/false, amount: Number }
 *       Note: hasEnough is only supported if asRate:false currently
 *   - icon (optional) icon to show after the resource
 *   - invert (optional) If true, amount will be made negative
 *   - asRate (optional) If true, resource will be shown with +/- sign and /s suffix
 *   - colorRate (optional) If true (and asRate is also true), the rates will be colored red/green based on +/-
 *   - capacity (optional) If provided, will show "/ {capacity}" after the amount. Only relevant if asRate:false
 */
export default function ResourceAmount(props) {
    let amount = props.amount;
    let capacity = props.capacity && props.capacity < Infinity ? props.capacity : null;

    let hasEnough = true;
    if (isObject(amount)) {
        // Amount has been converted using `highlightCosts` -> need to deconstruct it
        hasEnough = amount.hasEnough;
        amount = amount.amount;
    }
    if (props.invert) {
        amount *= -1;
    }

    let amountFormatted = formatInteger(amount);
    let capacityFormatted = capacity ? formatInteger(capacity) : null;

    let colorClass = '';

    if (props.asRate) {
        if (amount > 0) {
            if (props.colorRate) { colorClass = 'text-green'; }
            amountFormatted = `+${amountFormatted}`;
        }
        else if (amount < 0) {
            if (props.colorRate) { colorClass = 'text-red'; }
        }

        return <span className={`resource-rate ${colorClass}`}>
            {amountFormatted}{props.icon && <span className={props.icon}/>}/s
        </span>;
    }
    else {
        if (!hasEnough) {
            colorClass = 'text-red';
        }
        return <span className={`resource-amount ${colorClass}`}>
            {amountFormatted}
            {capacityFormatted && <span>/{capacityFormatted}</span>}
            {props.icon && <span className={props.icon}/>}
        </span>
    }
}
