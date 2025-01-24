import React from 'react';
import Structure from "./structure";
import {connect} from "react-redux";
import EnergyButton from "../../lib/energy_button";
import {ENERGY_BUTTON_FPS} from "../../singletons/game_clock";
import {castAbility} from "../../redux/reducer";

export class CommandCenter extends React.Component {
  constructor(props) {
    super(props);

    this.energyButtonContainer = React.createRef();
    this.energyButtonCanvas = React.createRef();

    this.waitTimeMs = 1000.0 / ENERGY_BUTTON_FPS; // how long to wait between rendering
  }

  componentDidMount() {
    this.energyButton = new EnergyButton(
      this.energyButtonContainer.current,
      this.energyButtonCanvas.current,
      () => this.props.castAbility('commandCenter_charge')
    );
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (this.props.visible !== nextProps.visible) {
      return true;
    }

    if (!this.props.visible) {
      return false;
    }

    if (this.lastRenderAt && this.lastRenderAt > (nextProps.elapsedTime - this.waitTimeMs)) {
      return false;
    }

    this.lastRenderAt = nextProps.elapsedTime;
    return true;
  }

  componentDidUpdate(prevProps, prevState) {
    if (!prevProps.visible && this.props.visible) {
      // Whenever this tab gets switched to we need to resize canvases
      this.energyButton.resize();
    }

    this.energyButton.drawState({}, this.props.elapsedTime);
  }

  render() {
    return (
      <Structure type="commandCenter">
        <div id="energy-button-container" ref={this.energyButtonContainer} className="d-flex no-selection">
          <canvas id="energy-button-canvas" ref={this.energyButtonCanvas}></canvas>

        </div>
      </Structure>
    );
  }
}

const mapStateToProps = (state, ownProps) => {
  return {
    visible: state.game.currentNavTab === 'outside',
    elapsedTime: state.clock.elapsedTime,
  };
}

export default connect(
  mapStateToProps,
  { castAbility }
)(CommandCenter);

