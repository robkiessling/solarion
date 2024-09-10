import {debounce, mod} from "./helpers";

const FONT_RATIO = 3/5;
const FONT_COLOR = '#fff';

export default class AsciiCanvas {
    constructor(container, canvas, numRows, numCols) {
        this.container = container;
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.context.fillStyle = FONT_COLOR;
        this.numRows = numRows;
        this.numCols = numCols;

        this._setupResize();

        this.resize();
    }

    clearAll() {
        this.clearArea(0, 0, this.width, this.height);
    }

    clearArea(x, y, width, height) {
        this.context.clearRect(x, y, width, height);
    }

    setDimensions() {
        const outerWidth = this.container.getBoundingClientRect().width;
        const outerHeight = this.container.getBoundingClientRect().height;

        // This makes it so the canvas size is maximized to fit in rectangular region
        // const maxCharWidth = outerWidth / this.numCols;
        // const maxCharHeight = outerHeight / this.numRows;
        // const smallerDimension = maxCharWidth > maxCharHeight * FONT_RATIO ? 'height' : 'width';

        // Making the smaller dimension always height, so that the canvas will always hit top and bottom of screen
        // (even if the sides get cut off).
        const smallerDimension = 'height';

        if (smallerDimension === 'height') {
            this.height = outerHeight;
            this.fontHeight = this.height / this.numRows
            this.fontWidth = this.fontHeight * FONT_RATIO
            this.width = this.fontWidth * this.numCols;
        }
        else {
            this.width = outerWidth;
            this.fontWidth = this.width / this.numCols;
            this.fontHeight = this.fontWidth / FONT_RATIO;
            this.height = this.fontHeight * this.numRows
        }
    }

    center() {
        return [this.width / 2, this.height / 2]
    }

    /**
     * Draws an ellipse shape out of characters.
     *
     * @param char {String} The character to repeat
     * @param numPoints {Number} The number of points (chars) that make up the ellipse
     * @param ellipseVars {Object} Ellipse variables used to shape the ellipse, according to the following equation:
     * @param color {String} CSS color (hex string, or color name)
     *
     * Parametric equations for an ellipse WITH ROTATION:
     *   x = h + (a * cos(t)) * cos(r) + (b * sin(t)) * -sin(r)
     *   y = k + (a * cos(t)) * sin(r) + (b * sin(t)) * cos(r)
     *
     * where:
     *   h = center of ellipse on x axis (relative to center of canvas)
     *   k = center of ellipse on y axis (relative to center of canvas)
     *   a = radius of ellipse on x axis
     *   b = radius of ellipse on y axis
     *   r = rotation angle of ellipse (in degrees)
     *   t = theta (angle of x,y coordinate -- independent variable)
     *
     */
    drawCharEllipse(char, numPoints, ellipseVars, thetaOffset = 0, color = '#fff') {
        const [canvasCenterX, canvasCenterY] = this.center();

        const a = ellipseVars.a === undefined ? 10 : ellipseVars.a;
        const b = ellipseVars.b === undefined ? 10 : ellipseVars.b;
        const h = canvasCenterX + (ellipseVars.h === undefined ? 0 : ellipseVars.h);
        const k = canvasCenterY + (ellipseVars.k === undefined ? 0 : ellipseVars.k)// + this.fontHeight - 2; // Move down one row. Move up a tiny bit.

        const r = ellipseVars.r === undefined ? 0 : ellipseVars.r * Math.PI / 180;

        const maxTheta = 2 * Math.PI;
        const thetaStepSize = maxTheta / numPoints;

        this.context.fillStyle = color;

        for (let i = 0; i < numPoints; i++) {
            const t = mod(i * thetaStepSize + thetaOffset, maxTheta);
            const x = h + (a * Math.cos(t)) * Math.cos(r) + (b * Math.sin(t)) * -1 * Math.sin(r);
            const y = k + (a * Math.cos(t)) * Math.sin(r) + (b * Math.sin(t)) * Math.cos(r);
            this.context.fillText(char, x, y);
        }
    }

    drawFilledCircle(radius, color = '#000', xOffset = 0, yOffset = 0) {
        const [canvasCenterX, canvasCenterY] = this.center();

        this.context.beginPath();
        this.context.arc(canvasCenterX + xOffset, canvasCenterY + yOffset, radius, 0, 2 * Math.PI);
        this.context.fillStyle = color;
        this.context.fill();
    }

    drawCharImage(charArray, x, y) {
        const startingX = x * this.fontWidth;
        let startingY = y * this.fontHeight;
        startingY += (this.fontHeight - 2); // Move down one row. Move up a tiny bit.

        // Draw one character at a time (inefficient)
        for (let row = 0; row < charArray.length; row++) {
           for (let col = 0; col < charArray[row].length; col++) {
               const [char, color] = charArray[row][col];
               if (char !== undefined) {
                   this.context.fillStyle = color;
                   this.context.fillText(
                       char,
                       startingX + col * this.fontWidth,
                       startingY + row * this.fontHeight
                   );
               }
           }
        }

        // Draw one line at a time
        // for (let row = 0; row < charArray.length; row++) {
        //     this.context.fillStyle = color || FONT_COLOR;
        //     this.context.fillText(
        //         charArray[row],
        //         scaledX,
        //         scaledY + row * this.fontHeight
        //     );
        // }
    }

    resize() {
        this.setDimensions();
        this._convertCanvasToHiDPI();
        this.context.font = this.fontHeight + 'px monospace';
        // TODO Have to immediately redraw the current frame
    }

    _setupResize() {
        window.addEventListener("resize", debounce(() => this.resize()));
    }

    _convertCanvasToHiDPI(ratio) {
        if (!ratio) {
            // TODO Internet Explorer
            // https://stackoverflow.com/questions/22483296/html5-msbackingstorepixelratio-and-window-devicepixelratio-dont-exist-are-the
            const dpr = window.devicePixelRatio || 1;
            const bsr = this.context.webkitBackingStorePixelRatio ||
                this.context.mozBackingStorePixelRatio ||
                this.context.msBackingStorePixelRatio ||
                this.context.oBackingStorePixelRatio ||
                this.context.backingStorePixelRatio || 1;
            ratio = dpr / bsr;
        }

        this.canvas.width = this.width * ratio;
        this.canvas.height = this.height * ratio;
        this.canvas.style.width = this.width + "px";
        this.canvas.style.height = this.height + "px";
        this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

}
