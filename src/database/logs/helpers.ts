import type {LogLineOptions} from './index';

/**
 * A line that fills in like [    ] -> [XX  ] -> [XXXX], one cell per frame.
 * @param label      text printed before the bar, e.g. 'Biometric scan '
 * @param width      number of cells in the bar; also the number of frames it takes to fill
 * @param frameDelay ms between one fill step and the next
 * @param delay      ms to pause after the bar is full, before the next line prints (like any line's delay)
 * @param fill       character used for a filled cell
 */
export function progressBar(label: string, width: number, frameDelay: number, delay = 0, fill = 'X'): LogLineOptions {
    const bar = (n: number) => `${label}[${fill.repeat(n)}${' '.repeat(width - n)}]`;
    const frames = Array.from({ length: width }, (_, n) => bar(n));
    return { text: bar(width), mode: 'frames', frames, frameDelay, delay };
}
