import React from 'react';
import {connect} from "react-redux";
import {closePanel} from "../../redux/modules/panels";
import SchematicIndex from "./schematic_index";
import {CHASSIS_PANEL} from "../../database/chassis";
import PopupFrame from "../ui/popup_frame";

/**
 * Host for special upgrade panels: full-screen structure-owned popups with bespoke UIs (vs. the
 * one-button upgrades on structure cards). Renders whichever panel state.panels.openPanelId names,
 * over a dimmed backdrop; Esc or ✕ closes. To add a panel (e.g. a solar circuitry board): register
 * its component + title here, add its state/actions in redux/modules/panels.js, and give its
 * structure card an opener button (see structures/droid_factory.jsx).
 */
const PANEL_REGISTRY = {
    [CHASSIS_PANEL.id]: { component: SchematicIndex, title: CHASSIS_PANEL.title },
};

class PanelHost extends React.Component {
    constructor(props) {
        super(props);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    componentDidMount() {
        document.addEventListener('keydown', this.onKeyDown);
    }
    componentWillUnmount() {
        document.removeEventListener('keydown', this.onKeyDown);
    }
    onKeyDown(event) {
        if (event.key === 'Escape' && this.props.openPanelId) {
            this.props.closePanel();
        }
    }

    render() {
        const entry = PANEL_REGISTRY[this.props.openPanelId];
        if (!entry) return null;

        const PanelComponent = entry.component;
        return (
            // The overlay is just the viewport-centering context; chrome (backdrop/surface/title/✕)
            // is the shared PopupFrame. Backdrop click, ✕, and Esc (above) all close.
            <div className="panel-overlay">
                <PopupFrame className="special-panel" title={entry.title}
                            onClose={() => this.props.closePanel()}
                            onBackdropClick={() => this.props.closePanel()}>
                    <PanelComponent/>
                </PopupFrame>
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    return {
        openPanelId: state.panels.openPanelId,
    };
};

export default connect(
    mapStateToProps,
    { closePanel }
)(PanelHost);
