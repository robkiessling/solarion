
import {createArray} from "./helpers";


// const PLANET_LAYOUT = [
//                   '··············',
//             '··························',
//         '··································',
//       '······································',
//     '··········································',
//     '··········································',
//     '··········································',
//       '·············@························',
//         '··································',
//             '··························',
//                   '··············'
// ];


// const PLANET_LAYOUT = [
//               'SSSSSSMMMSSSSS',
//         'MMMSSSSSSSMMMSSSSSSSSSMMMM',
//     'MMMMMSSSSSSSMMMMMSSSSSMMMMMMMMMMMM',
//   'MMMMMMMMMMMSMMMMMSSSSSSMMMSSSSMMMMMMMM',
// 'SSMMMMMMMMMMMMMMSSSSSSSSSMMMSSSSSMSMMMMMSS',
// 'SSMMMSSSSSMMMMMMMMSSSSSSSMMMMMSSSMMMMMMSSS',
// 'SSSMSSSSSSSMMMMMMMMSSSSSSSSMMMMMMMMMSSSSSS',
//   'SSSSSSMMMMMMMM@MMSSSSSSMMMMSMMMSSSSSSS',
//     'SSSMMSMSSMMMMMMMMMMMMMMMSSSSSSSSSS',
//         'SSSSSSSSMMMMMMMMMMSSSSSSSS',
//               'SSSSSSSSSSSSSS'
// ];
// const HOME_BASE = '@';
// const LAND = 'M';
// const UNKNOWN = '·';
// const EXPLORED = 'M';
// const MINED = '*';
// const OCEAN = 'S';


const PLANET_LAYOUT = [
              '··············',
        '··························',
    '··········ΛΛ+····Λ················',
  '··········ΛΛΛΛ+···+ΛΛΛ················',
'····++++··ΛΛΛ+++++··+++ΛΛ·+····Λ++++······',
'·····++++·Λ+++++++++++***+++··+++Λ········',
'·······+++++++++++++++******+++++Λ········',
  '·········+++++++++*****@**++++········',
    '··········+++++***Λ******+Λ·······',
        '·······++++++++ΛΛ++··+++··',
              '····++++++····'
];
const HOME_BASE = '@';
const UNKNOWN = '·';
const MOUNTAIN = 'Λ';
const EXPLORED = '+';
const MINED = '*';



const PLANET_ROW_LENGTHS = PLANET_LAYOUT.map(row => row.length);
const DISPLAY_ROW_LENGTHS = PLANET_ROW_LENGTHS.map(size => Math.round(size / 2)); // only half the planet is visible at once

// const DISPLAY_ROW_LENGTHS = [7, 13, 17, 19, 21, 21, 21, 19, 17, 13, 7];
// const DISPLAY_ROW_LENGTHS = [7, 17, 23, 29, 33, 35, 37, 39, 39, 39, 39, 39, 39, 39, 37, 35, 33, 29, 23, 17, 7];
// const PLANET_ROW_LENGTHS = DISPLAY_ROW_LENGTHS.map(length => length * 2);

export const WIDEST_PLANET_ROW = Math.max(...PLANET_ROW_LENGTHS);
const WIDEST_DISPLAY_ROW = Math.max(...DISPLAY_ROW_LENGTHS);

// If true, each rotation step will occur an equal amount of time apart. Only some rows will move though because some
//   rows have farther to move than others.
// If false, rows can move independently
const DISCRETE_ROTATION = true;

const TWILIGHT_PCT = 0.7; // Section of planet to shade as twilight
const DARKNESS_PCT = 0.85; // Section of planet to shade as twilight


export default class PlanetManager {
    constructor() {
        this.generateMap();
    }

    // static percentRotated

    // TODO randomly generate this
    generateMap() {
        this.map = [];

        // PLANET_ROW_LENGTHS.forEach(rowLength => {
        //     this.map.push(createArray(rowLength, UNKNOWN));
        // });

        this.map = PLANET_LAYOUT.map(row => row.split(''));

        this.map.forEach(row => {
            console.log(row.join(''));
        });

        // this._generateDebugMeridians();

        // this.map[HOME_COORDS[0]][HOME_COORDS[1]] = HOME_BASE;

        // init mountains (ignore top/bottom row)

    }

    // (For testing) Will draw meridians on the planet
    _generateDebugMeridians(numMeridians = 4) {
        PLANET_ROW_LENGTHS.forEach(rowLength => {
            let row = [];
            let meridians = [];
            for (let i = 0; i < numMeridians; i++) {
                meridians.push(Math.floor(rowLength * i / numMeridians));
            }

            for (let i = 0; i < rowLength; i++) {
                let meridianIndex = meridians.indexOf(i);
                row.push(meridianIndex === -1 ? UNKNOWN : meridianIndex);
            }
            this.map.push(row);
        });
    }

    image(fractionOfDay) {
        let percentRotated;

        if (DISCRETE_ROTATION) {
            // where the prime meridian currently is (value of 0 means it is on the left-most side of planet)
            const primeMeridianIndex = Math.floor(fractionOfDay * WIDEST_PLANET_ROW);
            percentRotated = primeMeridianIndex / WIDEST_PLANET_ROW;
        }
        else {
            percentRotated = fractionOfDay;
        }

        return this.map.map((planetRow, rowIndex) => {
            const planetRowLength = PLANET_ROW_LENGTHS[rowIndex];
            const displayRowLength = DISPLAY_ROW_LENGTHS[rowIndex]

            const startIndex = Math.floor(percentRotated * planetRowLength);
            const endIndex = (startIndex + displayRowLength) % planetRowLength;

            let displayRow;
            if (startIndex < endIndex) {
                displayRow = planetRow.slice(startIndex, endIndex);
            }
            else {
                displayRow = planetRow.slice(startIndex, planetRowLength).concat(planetRow.slice(0, endIndex));
            }

            const missingSpaces = (WIDEST_DISPLAY_ROW - displayRowLength) / 2;
            return displayRow.join('').padStart(displayRowLength + missingSpaces, ' ').split('').map((char, charIndex) => {
                charIndex -= missingSpaces;

                let color = '';
                switch(char) {
                    case HOME_BASE:
                        color += 'home';
                        break;
                    case UNKNOWN:
                        color += 'unknown';
                        break;
                    case MOUNTAIN:
                        color += 'mountain';
                        break;
                    case EXPLORED:
                        color += 'explored';
                        break;
                    case MINED:
                        color += 'mined';
                        break;

                    // case LAND:
                    //     color += 'land';
                    //     break;
                    // case OCEAN:
                    //     color += 'ocean';
                    //     break;
                }

                if (charIndex >= TWILIGHT_PCT * displayRowLength) { color += ' twilight'; }
                if (charIndex >= DARKNESS_PCT * displayRowLength) { color += ' darkness'; }

                return {
                    char: char,
                    color: color
                }
            })
        });
    }


}
