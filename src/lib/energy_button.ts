import {debounce, getRandomIntInclusive, nTimes} from "./helpers";

let animationIdSeq = 1;

type XY = { x: number, y: number };
interface ButtonAnimation {
  id: number;
  startTime: number;
  buttonCenter: XY;
  duration: number;
  process: (currentTime: number) => void;
  position?: XY; // floating numbers
  target?: XY;   // sparks
}
interface EnergyButtonState {
  elapsedTime: number;
  prevAnimationCounts: Record<string, number>;
  button: { x: number, y: number, isPressed?: boolean, isHovered?: boolean, path?: Path2D };
  animations: ButtonAnimation[];
  heatBar: {};
}

const BUTTON_WIDTH = 50;
const BUTTON_HEIGHT = 50;
const SHADOW_OFFSET = 4;

export default class EnergyButton {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  onClickCallback: () => void;
  context: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  ratio = 1;
  _state: EnergyButtonState;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement, onClickCallback: () => void) {
    this.container = container;
    this.canvas = canvas;
    this.onClickCallback = onClickCallback;

    // Turn off alpha for performance boost:
    // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#turn_off_transparency
    this.context = this.canvas.getContext('2d', { alpha: true })!;

    this._setupResize();
    this.resize();

    // Local state is not persisted to redux... it is just for fleeting animations so there is no need to persist them
    this._state = {
      elapsedTime: 0,
      prevAnimationCounts: {},
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

  drawState(state: RootState, elapsedTime: number, newAnimationValues: Record<string, number>) {
    // Resize whenever the container changed size underneath us. The canvas can mount at 0x0 (it lives in a
    // display:none slot whenever the app is on the Planet tab, including at boot in skip modes), and tab
    // switches don't fire the window resize listener.
    const rect = this.container.getBoundingClientRect();
    if (rect.width !== this.width || rect.height !== this.height) {
      this.resize();
    }

    this.clearAll();

    this._state.elapsedTime = elapsedTime;
    this._spawnNewAnimations(newAnimationValues);

    this._drawAnimations();
    this._drawButton();
  }

  _spawnNewAnimations(newAnimationValues: Record<string, number>) {
    for (const [animationKey, newValue] of Object.entries(newAnimationValues)) {
      const prevValue = this._state.prevAnimationCounts[animationKey];
      if (newValue > 0 && (prevValue === undefined || newValue > prevValue)) {
        // spawn new animation
        switch(animationKey) {
          case 'numClicks':
            nTimes(newAnimationValues.energyBonus, () => this._createSpark())
            // this._createSpark();
            // this._createFloatingNumber(newAnimationValues.energyBonus);
            break;
          case 'numMineralBonusProcs':
            this._createWave();
            break;
          // default:
          //   console.warn('No animation found for: ', animationKey);
        }
        this._state.prevAnimationCounts[animationKey] = newValue;
      }
    }
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
    this.context.fillStyle = 'rgb(142,142,142)';
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

  _createAnimation(duration: number, ready: ((animation: ButtonAnimation) => void) | undefined,
                   process?: (animation: ButtonAnimation, currentTime: number, progress: number) => void) {
    const animation: ButtonAnimation = {
      id: animationIdSeq++,
      startTime: this._state.elapsedTime,
      buttonCenter: this._buttonCenter(),
      duration: duration,
      process: function(this: ButtonAnimation, currentTime: number) {
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

  _buttonCenter(): XY {
    return {
      x: this._state.button.x + BUTTON_WIDTH / 2,
      y: this._state.button.y + BUTTON_HEIGHT / 2,
    }
  }

  _createWave() {
    this._createAnimation(2000, undefined, (animation, currentTime, progress) => {
      const growth = 1 + progress * 2;
      const width = BUTTON_WIDTH * growth;
      const height = BUTTON_HEIGHT * growth;
      const opacity = 1 - progress;

      const path = new Path2D();
      path.roundRect(
        animation.buttonCenter.x - width / 2,
        animation.buttonCenter.y - height / 2,
        width, height, [10]
      );
      this.context.strokeStyle = `rgba(62,192,218,${opacity})`;
      this.context.stroke(path);
    });
  }

  _createFloatingNumber(value: number) {
    this._createAnimation(1000, animation => {
      const PADDING = 16;
      animation.position = {
        x: getRandomIntInclusive(PADDING, this.width - PADDING),
        y: getRandomIntInclusive(PADDING, this.height - PADDING),
      }
    }, (animation, currentTime, progress) => {
      const opacity = 1 - progress;
      this.context.fillStyle = `rgba(255,255,255,${opacity})`;

      this.context.font = "14px monospace";
      this.context.fillText(`+${value}`, animation.position!.x, animation.position!.y);

      // this.context.font = "14px icomoon";
      // this.context.fillText(String.fromCharCode("0xe904"), animation.position.x + 16, animation.position.y);
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
    }, (animation, currentTime, progress) => {
      const opacity = 1 - progress;
      const target = animation.target!;
      const gradient = this.context.createLinearGradient(
        animation.buttonCenter.x, animation.buttonCenter.y,
        target.x, target.y
      )
      gradient.addColorStop(0, 'rgba(234,225,28, 0)'); // Start: fully opaque
      gradient.addColorStop(1, `rgba(234,225,28, ${opacity})`); // End: fully transparent
      this.context.strokeStyle = gradient;

      this.context.beginPath();
      this.context.moveTo(animation.buttonCenter.x, animation.buttonCenter.y);
      this.context.lineTo(target.x, target.y);
      this.context.stroke();
    });
  }

  // Path2D rendering help: https://stackoverflow.com/a/66722289
  _isMouseOverButton(event: MouseEvent) {
    if (!this._state.button.path) {
      return false;
    }

    // Note: have to scale event position for isPointInPath: https://stackoverflow.com/q/64072597
    const eventX = event.offsetX * this.ratio;
    const eventY = event.offsetY * this.ratio;

    return this.context.isPointInPath(this._state.button.path, eventX, eventY);
  }

  _onMousemove(event: MouseEvent) {
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

  _onMousedown(event: MouseEvent) {
    if (this._isMouseOverButton(event)) {
      this._state.button.isPressed = true;

      // this._createWave();
      // this._createSpark();
      this.onClickCallback();
    }
    else {
      // todo stop hot streak
    }
  }

  _onMouseup(event: MouseEvent) {
    this._state.button.isPressed = false;
  }

  center(): [number, number] {
    return [this.width / 2, this.height / 2]
  }

  resize() {
    this._setDimensions();

    this._convertCanvasToHiDPI(this.canvas, this.context);

    // Re-center the button: its position is stored state (not derived per-draw), so every resize must
    // recompute it. Guarded because the constructor calls resize() before _state exists.
    if (this._state) {
      this._state.button.x = this.width / 2 - BUTTON_WIDTH / 2;
      this._state.button.y = this.height / 2 - BUTTON_HEIGHT / 2;
    }
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

  _convertCanvasToHiDPI(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, ratio?: number) {
    if (!ratio) {
      // TODO Internet Explorer
      // https://stackoverflow.com/questions/22483296/html5-msbackingstorepixelratio-and-window-devicepixelratio-dont-exist-are-the
      const dpr = window.devicePixelRatio || 1;
      const vendor = context as any; // legacy vendor-prefixed backing store ratios
      const bsr = vendor.webkitBackingStorePixelRatio ||
        vendor.mozBackingStorePixelRatio ||
        vendor.msBackingStorePixelRatio ||
        vendor.oBackingStorePixelRatio ||
        vendor.backingStorePixelRatio || 1;
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
