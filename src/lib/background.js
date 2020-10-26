import {emptyElement} from "./helpers";

export default class Background {
    constructor(container) {
        this.container = container;
        this.clear();
    }

    clear() {
        emptyElement(this.container);
    }

    drawImage(charArray, repeat = 1) {
        // const scaledX = x * this.fontWidth();
        // let scaledY = y * this.fontHeight();
        // scaledY += (this.fontHeight() - 2); // Move down one row. Move up a tiny bit.
        //
        // // Draw one line at a time
        // for (let row = 0; row < charArray.length; row++) {
        //
        //     this.context.fillStyle = color || FONT_COLOR;
        //     this.context.fillText(
        //         charArray[row],
        //         scaledX,
        //         scaledY + row * this.fontHeight()
        //     );
        // }

        // TODO actually use x and y

        let rows = []

        for (let row = 0, rowLen = charArray.length; row < rowLen; row++) {
            rows.push(charArray[row].repeat(repeat));
        }

        this.container.innerHTML = rows.join('\n');

        // Centering the image horizontally:
        // const numColumns = Math.max(...charArray.map(row => row.length)) * repeat;
        // const halfOfWidth = numColumns / 2 * (0.55) * 16; // half the columns * font width (which is 3/5 16pt)
        // this.container.style.paddingLeft = `calc(50% - ${halfOfWidth}px`;
        // this.container.style.width = `calc(50% + ${halfOfWidth}px`;
    }



}
