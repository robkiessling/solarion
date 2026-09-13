import React from 'react';
import {compareNumbers, formatInteger, formatRate, INFINITY, roundToDecimal} from "../../lib/helpers";
import {isObject} from "lodash";

/**
 *
 * @param props
 *   - amount (required) A Number or an Object with format { hasEnough: true/false, amount: Number }
 *       Note: hasEnough is only supported if asRate:false currently
 *   - icon (optional) icon to show after the resource
 *   - invert (optional) If true, amount will be made negative
 *   - asRate (optional) If true, resource will be shown with +/- sign and /s suffix
 *   - hideZeroValues (optional) If true, span will be hidden if value is zero
 *   - colorRate (optional) If true (and asRate is also true), the rates will be colored red/green based on +/-
 *   - capacity (optional) If provided, will show "/ {capacity}" after the amount. Only relevant if asRate:false
 */
export default function ResourceAmount(props) {
    let amount = props.amount;
    let capacity = props.capacity && props.capacity < INFINITY ? props.capacity : null;

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

    const hiddenClass = props.hideZeroValues && compareNumbers(amount, '===', 0) ? 'hidden' : '';

    if (props.asRate) {
        amountFormatted = formatRate(amount);
        if (amount > 0) {
            if (props.colorRate) { colorClass = 'text-green'; }
            amountFormatted = `+${amountFormatted}`;
        }
        else if (amount < 0) {
            if (props.colorRate) { colorClass = 'text-red'; }
        }

        return <span className={`resource-rate ${colorClass} ${hiddenClass}`}>
            {amountFormatted}{props.icon && <span className={props.icon}/>}/s
        </span>;
    }
    else {
        if (!hasEnough) {
            colorClass = 'text-red';
        }
        return <span className={`resource-amount ${colorClass} ${hiddenClass}`}>
            {amountFormatted}
            {capacityFormatted && <span>/{capacityFormatted}</span>}
            {props.icon && <span className={props.icon}/>}
        </span>
    }
}
