import {debounce} from "./helpers";

const ROWS = 30;
const COLUMNS = 80;
const FONT_RATIO = 3/5;
const FONT_COLOR = '#fff';

export default class Canvas {
    constructor(container, canvas) {
        this.container = container;
        this.canvas = canvas;
        this.context = canvas.getContext('2d');

        this._convertCanvasToHiDPI();
        this.context.font = this.fontHeight() + 'px monospace';
        this.context.fillStyle = FONT_COLOR;

        this._setupResize();
    }

    clearAll() {
        this.clearArea(0, 0, this.width(), this.height());
    }
    clearArea(x, y, width, height) {
        this.context.clearRect(x, y, width, height);
    }
    scaleX(x) {
        return x * this.fontWidth();
    }
    scaleY(y) {
        return y * this.fontHeight();
    }
    width() {
        // return this.fontWidth() * COLUMNS;
        return this.container.getBoundingClientRect().width;
    }

    height() {
        // return this.container.getBoundingClientRect().height;
        return this.fontHeight() * ROWS;
    }

    fontWidth() {
        // return this.fontHeight() * FONT_RATIO;
        return this.width() / COLUMNS;
    }

    fontHeight() {
        // return this.height() / ROWS;
        return this.fontWidth() / FONT_RATIO;
    }

    drawImage(charArray, x, y, color) {
        const scaledX = x * this.fontWidth();
        let scaledY = y * this.fontHeight();
        scaledY += (this.fontHeight() - 2); // Move down one row. Move up a tiny bit.

        // Draw one character at a time (inefficient)
        //for (var row = 0; row < charArray.length; row++) {
        //    for (var col = 0; col < charArray[row].length; col++) {
        //        this.context.fillText(
        //            charArray[row][col],
        //            scaledX + col * Game.Settings.fontWidth(),
        //            scaledY + row * Game.Settings.fontHeight()
        //        );
        //    }
        //}

        // Draw one line at a time
        for (let row = 0; row < charArray.length; row++) {

            //if (solidBackground) {
            //    this.drawRect(
            //        scaledX,
            //        scaledY - this.scaleY(1) + 2 + row * this.fontHeight(),
            //        this.scaleX(charArray[row].length),
            //        this.scaleY(1),
            //        color || FONT_COLOR);
            //}

            this.context.fillStyle = color || FONT_COLOR;
            this.context.fillText(
                charArray[row],
                scaledX,
                scaledY + row * this.fontHeight()
            );
        }
    }


    _setupResize() {
        window.addEventListener("resize", debounce(() => {
            this._convertCanvasToHiDPI();
            // TODO Have to immediately redraw the current frame
        }));
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
        const width = this.width();
        const height = this.height();

        this.canvas.width = width * ratio;
        this.canvas.height = height * ratio;
        this.canvas.style.width = width + "px";
        this.canvas.style.height = height + "px";
        this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

}
