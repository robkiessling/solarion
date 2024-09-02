import {debounce} from "./helpers";

const FONT_RATIO = 3/5;
const FONT_COLOR = '#fff';

export default class Canvas {
    constructor(container, canvas, numRows, numCols) {
        this.container = container;
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.context.fillStyle = FONT_COLOR;
        this.numRows = numRows;
        this.numCols = numCols;

        this._setupResize();

        this._resize();
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

    _resize() {
        this.setDimensions();
        this._convertCanvasToHiDPI();
        this.context.font = this.fontHeight + 'px monospace';
        // TODO Have to immediately redraw the current frame
    }

    _setupResize() {
        window.addEventListener("resize", debounce(() => this._resize()));
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
