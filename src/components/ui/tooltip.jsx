import React from 'react';
import ReactTooltip from "react-tooltip";
import ReactDOM from "react-dom";

/**
 * Creates a tooltip
 * props.place (optional) Can set to be a normal ReactTooltip place option (left/right/top/bottom) or one of the
 *                        following special options: align-left-column / align-right-column. This will align the tooltip
 *                        with either the main left column or right column, respectively.
 */
export default function Tooltip(props) {
    // Do not call createPortal until DOM is ready: https://stackoverflow.com/a/66447347
    const [domReady, setDomReady] = React.useState(false)
    React.useEffect(() => {
        setDomReady(true)
    }, [])
    if (!domReady) {
        return null;
    }

    let place = props.place || 'align-right-column';
    let alignmentClass = '';

    if (place === 'align-left-column') {
        place = 'right'; // the tooltip will be to the 'right' of the left column
        alignmentClass = 'align-left-column';
    }
    if (place === 'align-right-column') {
        place = 'left'; // the tooltip will be to the 'left' of the right column
        alignmentClass = 'align-right-column';
    }

    // Need to use createPortal to attach tooltip to an outer element (near <body>) otherwise the
    // tooltip might get clipped by overflow:hidden containers
    // https://github.com/ReactTooltip/react-tooltip/issues/358#issuecomment-1000442259
    return ReactDOM.createPortal(
        <ReactTooltip id={props.id} className={`game-tooltip ${alignmentClass}`}
                      place={place}
                      border effect={'solid'}
                      backgroundColor={'#151d1a'} textColor={'#f0e7e7'} borderColor={'#f0e7e7'}
        >
            {props.children}
        </ReactTooltip>,
        document.getElementById("tooltip-container")
    )

}
