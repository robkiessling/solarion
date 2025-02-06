import React from "react";
import Tooltip from "./tooltip";

export default function ProgressButton(props) {
    let className = `progress-button ${props.className}`;
    if (props.fullWidth) {
        className += ' full-width';
    }
    if (props.disabled) {
        className += ' disabled';
    }

    let progress;
    if (props.progress !== undefined && props.progress > 0) {
        if (props.showAsPercent) {
            progress = <span className={'progress-percent'}> ({Math.floor(props.progress)}%)</span>
        } else {
            progress = <div className={`progress-bar ${props.progress <= 0 ? 'hidden' : ''}`}
                            style={{width: `${100 - props.progress}%`}}/>
        }
    }

    if (props.tooltip) {
        if (!props.tooltipId) {
            console.error("ProgressButton: `tooltipId` is required if using `tooltip`.");
        }
        return (
            <div className='progress-button-container'>
                <div className={className} onClick={() => props.onClick()}
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
            <div className={className} onClick={() => props.onClick()}>
                {props.children}
                {progress}
            </div>
        );
    }

}
