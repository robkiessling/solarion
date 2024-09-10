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
        this.queue = []

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
     * @param ellipse {Ellipse} Ellipse object used to shape the ellipse
     * @param char {String} The character to repeat over the ellipse's arc
     * @param numPoints {Number} The number of points (chars) that make up the ellipse
     * @param thetaOffset {Number} How much to offset the ring of characters
     */
    drawEllipse(ellipse, char, numPoints, thetaOffset = 0) {
        const [canvasCenterX, canvasCenterY] = this.center();

        ellipse.xyPoints(numPoints, thetaOffset, (x, y) => {
            this.fillText(char, x + canvasCenterX, y + canvasCenterY)
        });
    }

    // Draws a single char of an ellipse
    drawEllipseChar(ellipse, char, numPoints, thetaOffset, i) {
        const [canvasCenterX, canvasCenterY] = this.center();

        ellipse.xyPoint(numPoints, thetaOffset, i, (x, y) => {
            this.fillText(char, x + canvasCenterX, y + canvasCenterY);
        })
    }

    drawFilledCircle(radius, color = '#000', xOffset = 0, yOffset = 0) {
        const [canvasCenterX, canvasCenterY] = this.center();

        this.context.beginPath();
        this.context.arc(canvasCenterX + xOffset, canvasCenterY + yOffset, radius, 0, 2 * Math.PI);
        this.context.fillStyle = color;
        this.context.fill();
    }

    drawImage(charArray, x, y) {
        const startingX = x * this.fontWidth;
        let startingY = y * this.fontHeight;
        startingY += (this.fontHeight - 2); // Move down one row. Move up a tiny bit.

        // Draw one character at a time (inefficient)
        for (let row = 0; row < charArray.length; row++) {
           for (let col = 0; col < charArray[row].length; col++) {
               const [char, color] = charArray[row][col];
               if (char !== undefined) {
                   this.context.fillStyle = color;
                   this.fillText(char, startingX + col * this.fontWidth, startingY + row * this.fontHeight)
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

    setFillStyle(color) {
        this.context.fillStyle = color;
    }


    /**
     * --- Queueing Updates ---
     * 
     * The following methods provide a way to queue updates if they match a certain criteria. Once addQueueFilter is
     * called, all fillText calls will be first passed through the provided filter. If the x/y coordinates of the 
     * fillText call match the filter, the fill will be queued for later. If the coordinates do not match the filter, 
     * the fillText will be called as normal.
     * 
     * At a later time, you can call processQueue to draw all the queued fillText items.
     */
    addQueueFilter(filter) {
        this.queueFilter = filter;
    }
    
    removeQueueFilter() {
        this.queueFilter = undefined;
    }
    
    processQueue() {
        this.queue.forEach(item => {
            this.context.fillText(item.text, item.x, item.y);
        });
        this.queue = [];
    }
    
    fillText(text, x, y) {
        if (this.queueFilter && this.queueFilter(x, y)) {
            this.queue.push({ x: x, y: y, text: text })
            return;
        }
        this.context.fillText(text, x, y);
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
