import React from 'react';
import {connect} from "react-redux";
import Slider from "rc-slider";
import {setRotation, setRotationMode} from "../redux/modules/planet";
import {SQUAD_GLYPH} from "../lib/squad";

// The two camera follow modes: [mode, glyph, label]. Manual isn't a third button: it's the state you fall
// into by dragging the slider (or the globe), or by switching the active mode off again. Team wears the
// squad's own map glyph.
const FOLLOW_MODES = [
    ['sun', '☀', 'Daytime'],
    ['squad', SQUAD_GLYPH, 'Team']
];

const SLIDER_MARKS = { 0: '0°', 0.25: '90°', 0.5: '180°', 0.75: '270°', 1: '360°' };

/**
 * Camera control strip under the globe: the longitude slider between the two follow-mode toggles. Lives with the
 * map because it's a property of the view, not of exploration; the strip mirrors the tab strip at the top of
 * the frame.
 */
class CameraStrip extends React.Component {
    toggleMode(mode) {
        this.props.setRotationMode(this.props.rotationMode === mode ? 'manual' : mode);
    }

    // Grabbing the slider takes the camera back, same as grabbing the globe. (Releasing it blurs the handle,
    // see onAfterChange: the arrow keys drive the squad and must not keep nudging the slider afterwards.)
    onSlide(value) {
        if (this.props.rotationMode !== 'manual') {
            this.props.setRotationMode('manual');
        }
        this.props.setRotation(value);
    }

    renderToggle([mode, glyph, label]) {
        const current = mode === this.props.rotationMode;
        return (
            <button className={`camera-mode ${current ? 'current' : ''}`}
                    onClick={(e) => { e.currentTarget.blur(); this.toggleMode(mode); }}>
                <span className="camera-mode-glyph">{glyph}</span> {label}
            </button>
        );
    }

    // Toggles flank the slider so the slider itself sits centered under the globe
    render() {
        return (
            <div className={`camera-strip${this.props.yielded ? ' yielded' : ''}`}>
                {this.renderToggle(FOLLOW_MODES[0])}
                <Slider className="range-slider camera-slider"
                        min={0} max={1} step={0.02} marks={SLIDER_MARKS}
                        onChange={(value) => this.onSlide(value)}
                        onAfterChange={() => document.activeElement && document.activeElement.blur()}
                        value={this.props.rotation}/>
                {this.renderToggle(FOLLOW_MODES[1])}
            </div>
        );
    }
}

const mapStateToProps = (state) => {
    return {
        rotation: state.planet.rotation,
        rotationMode: state.planet.rotationMode
    };
};

export default connect(
    mapStateToProps,
    { setRotation, setRotationMode }
)(CameraStrip);
