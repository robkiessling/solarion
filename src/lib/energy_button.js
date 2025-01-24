import {debounce, getRandomIntInclusive} from "./helpers";

let animationIdSeq = 1;

const BUTTON_WIDTH = 50;
const BUTTON_HEIGHT = 50;
const SHADOW_OFFSET = 4;

export default class EnergyButton {
  constructor(container, canvas, onClickCallback) {
    this.container = container;
    this.canvas = canvas;
    this.onClickCallback = onClickCallback;

    // Turn off alpha for performance boost:
    // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#turn_off_transparency
    this.context = this.canvas.getContext('2d', { alpha: true });

    this._setupResize();
    this.resize();

    // Local state is not persisted to redux... it is just for fleeting animations so there is no need to persist them
    this._state = {
      button: {
        x: this.width / 2 - BUTTON_WIDTH / 2,
        y: this.height / 2 - BUTTON_HEIGHT / 2,
      },
      animations: [],
      heatBar: {},
    }

    this.canvas.addEventListener('mousemove', event => {
      this._onMousemove(event);
    })
    this.canvas.addEventListener('mousedown', event => {
      this._onMousedown(event);
    })
    this.canvas.addEventListener('mouseup', event => {
      this._onMouseup(event);
    })
  }

  clearAll() {
    this.context.clearRect(0, 0, this.width, this.height);
  }

  drawState(state, elapsedTime) {
    this.clearAll();

    this._state.elapsedTime = elapsedTime;

    this._drawAnimations();
    this._drawButton();
  }

  _drawAnimations() {
    this._state.animations.forEach(animation => {
      animation.process(this._state.elapsedTime);
    });
  }

  _drawButton() {
    // draw base first so that the real button can cover most of it
    const base = new Path2D();
    base.roundRect(
      this._state.button.x,
      this._state.button.y,
      BUTTON_WIDTH, BUTTON_HEIGHT, [10]
    );
    this.context.fillStyle = 'rgb(202,126,126)';
    this.context.fill(base);

    // draw button top
    const button = new Path2D();
    let buttonX = this._state.button.x - SHADOW_OFFSET;
    let buttonY = this._state.button.y - SHADOW_OFFSET;
    if (this._state.button.isPressed) {
      this.context.fillStyle = 'rgb(52,159,181)';
      buttonX += SHADOW_OFFSET / 2;
      buttonY += SHADOW_OFFSET / 2;
    }
    else if (this._state.button.isHovered) {
      this.context.fillStyle = 'rgb(52,159,181)';
    }
    else {
      this.context.fillStyle = 'rgba(62,192,218,1)';
    }
    this.context.strokeStyle = "white";
    button.roundRect(buttonX, buttonY, BUTTON_WIDTH, BUTTON_HEIGHT, [10]);
    this.context.fill(button);
    this.context.stroke(button);
    this._state.button.path = button;

    // draw button text
    const fontSize = 16;
    const fontOffsetX = 11;
    const fontOffsetY = 14;
    this.context.font = `${fontSize}px monospace`;
    this.context.fillStyle = '#000000'
    // this.context.fillText("┤§≡¿Ï§", buttonX + fontOffsetX, buttonY + fontSize + fontOffsetY);
    this.context.fillText("░┤§", buttonX + fontOffsetX, buttonY + fontSize + fontOffsetY);
  }

  _createAnimation(duration, ready, process) {
    const animation = {
      id: animationIdSeq++,
      startTime: this._state.elapsedTime,
      buttonCenter: this._buttonCenter(),
      duration: duration,
      process: function(currentTime) {
        // Note: `this` refers to the outside `animation` object
        const progress = (currentTime - this.startTime) / this.duration;

        if (process) {
          process(this, currentTime, progress)
        }
      }
    }

    if (ready) {
      ready(animation);
    }

    this._state.animations.push(animation);

    setTimeout(() => {
      this._state.animations = this._state.animations.filter(otherAnim => otherAnim.id !== animation.id);
    }, duration);

    return animation;
  }

  _buttonCenter() {
    return {
      x: this._state.button.x + BUTTON_WIDTH / 2,
      y: this._state.button.y + BUTTON_HEIGHT / 2,
    }
  }

  _createWave() {
    this._createAnimation(1000, undefined, (animation, currentTime, progress) => {
      const growth = 1 + progress;
      const width = BUTTON_WIDTH * growth;
      const height = BUTTON_HEIGHT * growth;
      const opacity = 1 - progress;

      const path = new Path2D();
      path.roundRect(
        animation.buttonCenter.x - width / 2,
        animation.buttonCenter.y - height / 2,
        width, height, [10]
      );
      this.context.strokeStyle = `rgba(202,126,126,${opacity})`;
      this.context.stroke(path);
    });
  }

  _createSpark() {
    this._createAnimation(500, animation => {
      const LINE_LENGTH = 200;
      const targetDegrees = getRandomIntInclusive(0, 359);
      const targetRadians = targetDegrees * Math.PI / 180;
      const targetX = animation.buttonCenter.x + LINE_LENGTH * Math.cos(targetRadians);
      const targetY = animation.buttonCenter.y + LINE_LENGTH * Math.sin(targetRadians);
      animation.target = { x: targetX, y: targetY };
      // animation.x = animation.buttonCenter.x;
      // animation.y = animation.buttonCenter.y;
    }, (animation, currentTime, progress) => {
      const opacity = 1 - progress;
      // this.context.strokeStyle = `rgba(234,225,28,${opacity})`;

      const gradient = this.context.createLinearGradient(
        animation.buttonCenter.x, animation.buttonCenter.y,
        animation.target.x, animation.target.y
      )
      gradient.addColorStop(0, 'rgba(234,225,28, 0)'); // Start: fully opaque
      gradient.addColorStop(1, `rgba(234,225,28, ${opacity})`); // End: fully transparent
      this.context.strokeStyle = gradient;

      this.context.beginPath();
      this.context.moveTo(animation.buttonCenter.x, animation.buttonCenter.y);
      this.context.lineTo(animation.target.x, animation.target.y);
      this.context.stroke();
    });
  }

  // Path2D rendering help: https://stackoverflow.com/a/66722289
  _isMouseOverButton(event) {
    if (!this._state.button.path) {
      return false;
    }

    // Note: have to scale event position for isPointInPath: https://stackoverflow.com/q/64072597
    const eventX = event.offsetX * this.ratio;
    const eventY = event.offsetY * this.ratio;

    return this.context.isPointInPath(this._state.button.path, eventX, eventY);
  }

  _onMousemove(event) {
    if (this._isMouseOverButton(event)) {
      this.canvas.style.cursor = 'pointer';
      this._state.button.isHovered = true;
    }
    else {
      this.canvas.style.cursor = 'default';
      this._state.button.isHovered = false;
      this._state.button.isPressed = false;
    }
  }

  _onMousedown(event) {
    if (this._isMouseOverButton(event)) {
      this._state.button.isPressed = true;

      // this._createWave();
      this._createSpark();
      this.onClickCallback(true);
    }
    else {
      // todo stop hot streak
    }
  }

  _onMouseup(event) {
    this._state.button.isPressed = false;
  }

  center() {
    return [this.width / 2, this.height / 2]
  }

  resize() {
    this._setDimensions();

    this._convertCanvasToHiDPI(this.canvas, this.context);
  }

  _setDimensions() {
    const outerWidth = this.container.getBoundingClientRect().width;
    const outerHeight = this.container.getBoundingClientRect().height;

    this.width = outerWidth;
    this.height = outerHeight;
  }

  _setupResize() {
    window.addEventListener("resize", debounce(() => this.resize()));
  }

  _convertCanvasToHiDPI(canvas, context, ratio) {
    if (!ratio) {
      // TODO Internet Explorer
      // https://stackoverflow.com/questions/22483296/html5-msbackingstorepixelratio-and-window-devicepixelratio-dont-exist-are-the
      const dpr = window.devicePixelRatio || 1;
      const bsr = context.webkitBackingStorePixelRatio ||
        context.mozBackingStorePixelRatio ||
        context.msBackingStorePixelRatio ||
        context.oBackingStorePixelRatio ||
        context.backingStorePixelRatio || 1;
      ratio = dpr / bsr;
    }

    canvas.width = this.width * ratio;
    canvas.height = this.height * ratio;
    canvas.style.width = this.width + "px";
    canvas.style.height = this.height + "px";
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ratio = ratio;
  }

}
