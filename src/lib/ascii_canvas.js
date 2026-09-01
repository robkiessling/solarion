// @ts-check
import {debounce} from "./helpers";

const FONT_RATIO = 3/5;
const FONT_COLOR = '#fff';

export const QUEUE_TYPES = {
    fillText: 0,
    stroke: 1,
    drawCachedChar: 2
}

export default class AsciiCanvas {
    // options.fillContainer: the canvas covers the whole container and the char grid is contain-fit (fully visible,
    // scaled to the largest size that fits) and centered inside it. The letterbox area around the grid is still
    // drawable. Default mode: canvas is sized to the grid itself, fit to container height (sides may crop).
    // options.padding: (fillContainer only) minimum px between the char grid and the container edges; a number,
    // or {x, y} for different horizontal/vertical margins.
    // options.charRatio: width/height of one grid cell. Defaults to the glyph's natural ratio (FONT_RATIO). Smaller
    // values add vertical leading between rows (like CSS line-height), stretching the image taller; the font is
    // shrunk to fit the narrower cell so glyphs never overlap horizontally.
    constructor(container, canvas, numRows, numCols, cachedCanvas, options = {}) {
        this.container = container;
        this.canvas = canvas;
        this.options = options;
        this.charRatio = options.charRatio || FONT_RATIO;

        // Turn off alpha for performance boost:
        // https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#turn_off_transparency
        this.context = this.canvas.getContext('2d', { alpha: true });
        this.context.fillStyle = FONT_COLOR;
        this.numRows = numRows;
        this.numCols = numCols;
        this.queue = [];

        if (cachedCanvas) {
            // cachedCanvas is used for pre-rendering and caching of text. See cacheChar function below for more information
            this.cachedCanvas = cachedCanvas;
            this.cachedContext = this.cachedCanvas.getContext('2d', { alpha: true });
            this.cachedContext.fillStyle = FONT_COLOR;
        }

        this._setupResize();

        this.resize();
    }

    clearAll() {
        this.clearArea(0, 0, this.width, this.height);
    }

    clearArea(x, y, width, height) {
        this.context.clearRect(x, y, width, height);
    }

    _setDimensions() {
        const outerWidth = this.container.getBoundingClientRect().width;
        const outerHeight = this.container.getBoundingClientRect().height;

        if (this.options.fillContainer) {
            const [padX, padY] = this._padding();
            const availWidth = Math.max(outerWidth - padX * 2, 0);
            const availHeight = Math.max(outerHeight - padY * 2, 0);

            this.width = outerWidth;
            this.height = outerHeight;
            this.fontHeight = Math.min(availHeight / this.numRows, availWidth / (this.numCols * this.charRatio));
            this.fontWidth = this.fontHeight * this.charRatio;
            this._setFontSize();
            return;
        }

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
            this.fontWidth = this.fontHeight * this.charRatio
            this.width = this.fontWidth * this.numCols;
        }
        else {
            this.width = outerWidth;
            this.fontWidth = this.width / this.numCols;
            this.fontHeight = this.fontWidth / this.charRatio;
            this.height = this.fontHeight * this.numRows
        }

        this._setFontSize();
    }

    // [horizontal, vertical] px margins from options.padding (see constructor)
    _padding() {
        const padding = this.options.padding || 0;
        return typeof padding === 'number' ? [padding, padding] : [padding.x || 0, padding.y || 0];
    }

    // The font is sized so a glyph's natural advance width fits the cell width. When charRatio equals FONT_RATIO
    // this is exactly fontHeight; narrower cells shrink the font, leaving vertical leading between rows.
    _setFontSize() {
        this.fontSize = Math.min(this.fontHeight, this.fontWidth / FONT_RATIO);
    }

    center() {
        return [this.width / 2, this.height / 2]
    }

    // Top-left pixel of the char grid. [0, 0] unless fillContainer mode centers the grid within a larger canvas.
    gridOrigin() {
        if (!this.options.fillContainer) {
            return [0, 0];
        }
        return [
            (this.width - this.fontWidth * this.numCols) / 2,
            (this.height - this.fontHeight * this.numRows) / 2
        ];
    }

    // Inverse of the grid drawing math: returns fractional [row, col] for a pixel coordinate (e.g. from a mouse
    // event relative to the canvas). Callers floor the values and bounds-check against the grid.
    xyToGrid(x, y) {
        const [originX, originY] = this.gridOrigin();
        return [(y - originY) / this.fontHeight, (x - originX) / this.fontWidth];
    }

    /**
     * Draws an ellipse shape out of characters.
     * @param ellipse {import('./ellipse').default} Ellipse object used to shape the ellipse
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

    // Same as drawEllipse but uses a cached char
    drawEllipseCachedChar(ellipse, cacheIndex, numPoints, thetaOffset = 0) {
        const [canvasCenterX, canvasCenterY] = this.center();

        ellipse.xyPoints(numPoints, thetaOffset, (x, y) => {
            this.drawCachedChar(cacheIndex, x + canvasCenterX, y + canvasCenterY);
        });
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

    drawLine(start, end) {
        if (this.queueFilter) {
            const filterArgs = { startX: start.x, startY: start.y, endX: end.x, endY: end.y }
            if (this.queueFilter(QUEUE_TYPES.stroke, filterArgs)) {
                this.queue.push({ type: QUEUE_TYPES.stroke, args: filterArgs })
                return;
            }
        }

        this.context.beginPath();
        this.context.moveTo(start.x, start.y);
        this.context.lineTo(end.x, end.y);
        this.context.stroke();
    }

    setFillStyle(color) {
        this.context.fillStyle = color;
    }

    setStrokeStyle(color) {
        this.context.strokeStyle = color;
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
            const args = item.args;
            switch(item.type) {
                case QUEUE_TYPES.fillText:
                    this.context.fillText(args.text, args.x, args.y);
                    break;
                case QUEUE_TYPES.stroke:
                    this.context.beginPath();
                    this.context.moveTo(args.startX, args.startY);
                    this.context.lineTo(args.endX, args.endY);
                    this.context.stroke();
                    break;
                case QUEUE_TYPES.drawCachedChar:
                    this._copyCachedChar(args.cacheIndex, args.x, args.y);
                    break;
            }
        });
        this.queue = [];
    }

    fillText(text, x, y) {
        if (this.queueFilter) {
            const filterArgs = { x, y, text };
            if (this.queueFilter(QUEUE_TYPES.fillText, filterArgs)) {
                this.queue.push({ type: QUEUE_TYPES.fillText, args: filterArgs })
                return;
            }
        }
        this.context.fillText(text, x, y);
    }

    /**
     * -------- Char caching ---------
     *
     * fillText is an expensive canvas operation: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#more_tips
     *
     * If you're drawing the same char over and over (e.g. when drawing space probes), one optimization is to draw
     * that char to an offscreen canvas and then use drawImage to copy that char from the offscreen canvas to the real canvas.
     */

    // Caches a char for later use. Returns the index of the cached char so you can refer to it with drawCachedChar
    cacheChar(char, color) {
        if (this.cache === undefined) {
            this.cache = [];
        }
        this.cache.push({ char, color });
        this._redrawCache();

        return this.cache.length - 1;
    }


    // Draws a cached char to the real canvas (alternative to fillText)
    drawCachedChar(cacheIndex, x, y) {
        if (this.queueFilter) {
            const filterArgs = { x, y, cacheIndex };
            if (this.queueFilter(QUEUE_TYPES.drawCachedChar, filterArgs)) {
                this.queue.push({ type: QUEUE_TYPES.drawCachedChar, args: filterArgs })
                return;
            }
        }
        this._copyCachedChar(cacheIndex, x, y);
    }

    _copyCachedChar(cacheIndex, x, y) {
        this.context.drawImage(
            this.cachedCanvas,
            cacheIndex * this.fontWidth * this.ratio, // sx
            0, // sy
            this.fontWidth * this.ratio, // sWidth
            this.fontHeight * this.ratio, // sHeight
            x, // dx
            y - this.fontHeight * this.ratio / 2, // dy
            this.fontWidth, // dWidth
            this.fontHeight, // dHeight
        );
    }

    _redrawCache() {
        this.cachedContext.clearRect(0, 0, this.width, this.height);

        this.cache.forEach((item, index) => {
            this.cachedContext.fillStyle = item.color;
            this.cachedContext.fillText(item.char, index * this.fontWidth, this.fontHeight);
        });
    }









    resize() {
        this._setDimensions();

        this._convertCanvasToHiDPI(this.canvas, this.context);

        if (this.cachedCanvas) {
            this._convertCanvasToHiDPI(this.cachedCanvas, this.cachedContext);
        }

        this.context.font = this.fontSize + 'px monospace';

        if (this.cachedCanvas) {
            this.cachedContext.font = this.fontSize + 'px monospace';
        }

        // TODO Have to immediately redraw the current frame
        if (this.cachedCanvas && this.cache) {
            this._redrawCache();
        }
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
