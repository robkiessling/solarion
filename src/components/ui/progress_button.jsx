import React from "react";
import Tooltip from "./tooltip";

const ASCII_CELLS = 31; // bar width in characters (plus the brackets); fits under a 30-character upgrade name

export default function ProgressButton(props) {
    let className = `progress-button ${props.className}`;
    if (props.fullWidth) {
        className += ' full-width';
    }
    if (props.disabled) {
        className += ' disabled';
    }
    if (props.progress !== undefined && props.progress > 0) {
        className += ' in-progress';
    }

    let progress;
    if (props.progress !== undefined && props.progress > 0) {
        if (props.showAsAscii) {
            // A terminal-style bar under the label: [#####     ]. Fixed width in characters; filled cells round
            // down, so the bar only reads full when the work is actually done.
            const cells = props.asciiCells || ASCII_CELLS;
            const filled = Math.min(cells, Math.floor(props.progress / 100 * cells));
            progress = <span className={'progress-ascii'}>[{'#'.repeat(filled)}{' '.repeat(cells - filled)}]</span>
        }
        else if (props.showAsPercent) {
            progress = <span className={'progress-percent'}> ({Math.floor(props.progress)}%)</span>
        } else {
            progress = <div className={`progress-bar ${props.progress <= 0 ? 'hidden' : ''}`}
                            style={{width: `${100 - props.progress}%`}}/>
        }
    }

    function onClick() {
        if (props.onClick && !props.disabled) {
            props.onClick();
        }
    }

    if (props.tooltip) {
        if (!props.tooltipId) {
            console.error("ProgressButton: `tooltipId` is required if using `tooltip`.");
        }
        return (
            <div className='progress-button-container'>
                <div className={className} onClick={onClick}
                     data-tip data-for={props.tooltipId}>
                    {props.children}
                    {progress}
                </div>
                <Tooltip id={props.tooltipId} {...props.tooltipProps}>
                    {props.tooltip}
                </Tooltip>
            </div>
        );
    }
    else {
        return (
            <div className={className} onClick={onClick}>
                {props.children}
                {progress}
            </div>
        );
    }

}
