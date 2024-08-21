import React from "react";
import ReactTooltip from "react-tooltip";

export default function ProgressButton(props) {
    let className = 'progress-button';
    if (props.fullWidth) {
        className += ' full-width';
    }
    if (props.disabled) {
        className += ' disabled';
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
                    <div className={`progress-bar ${props.progress <= 0 ? 'hidden' : ''}`}
                         style={ { width: `${100 - props.progress}%` } }/>
                </div>
                <ReactTooltip id={props.tooltipId} place="right" effect="solid" className="game-tooltip">
                    {props.tooltip}
                </ReactTooltip>
            </div>
        );
    }
    else {
        return (
            <div className={className} onClick={() => props.onClick()}>
                {props.children}
                <div className="progress-bar" style={ { width: `${props.progress}%` } }/>
            </div>
        );
    }

}
