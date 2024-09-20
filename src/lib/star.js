import {shuffleArray} from "./helpers";
import Ellipse from "./ellipse";
import {QUEUE_TYPES} from "./ascii_canvas";


const USE_CACHED_CANVAS = true;

const SUN_SIZE = 75;
const SUN_ELLIPSE_COUNT = 4;
const SUN_CHARS_PER_ELLIPSE = 50;
const SUN_FOREGROUND = 'yellow';
const SUN_BACKGROUND = '#343400';
const SUN_CHAR_A = '('; // We use two different characters when drawing the sun's body
const SUN_CHAR_B = ')';


const PROBE_RADIUS_A = 130;
const PROBE_RADIUS_B = 50;
const PROBES_PER_ELLIPSE = 100;
const PROBE_ORBIT_TIME = 30;
const PROBE_CHAR = 'X';
const PROBE_COLOR = '#fff';
const PROBES_PER_CHAR = 1000; // one 'X' represents this many probes

// Note: if you change this you will have to change the addQueueFilter logic, as well as update the
//       generateProbeEllipse's h and k coordinates
const PROBE_ORBIT_ANGLE = -45;

/**
 * These drawProbeEllipse constants were chosen through trial-and-error... there is probably some formula to calculate
 * them but I couldn't figure it out. You basically want the x-intercepts of all the ellipses to create a circle
 * shape.
 */
const PROBE_ELLIPSES = [
    /*   Top half of donut:  */
    generateProbeEllipse(0.00, 2.00,  0), // Inner-most ellipse
    generateProbeEllipse(0.05, 1.90, 20),
    generateProbeEllipse(0.25, 1.70, 35),
    generateProbeEllipse(0.50, 1.60, 50),
    generateProbeEllipse(0.75, 1.50, 60),
    generateProbeEllipse(1.00, 1.50, 70), // Top ellipse
    generateProbeEllipse(1.25, 1.40, 70),
    generateProbeEllipse(1.50, 1.35, 60),
    generateProbeEllipse(1.65, 1.30, 35),
    generateProbeEllipse(1.73, 1.20,  0), // Outer-most ellipse

    /*   Bottom half of donut (same as top half, but using negative offsets):  */
    // generateProbeEllipse(0.00, 2.00,  0), // Duplicated inner-most ellipse
    generateProbeEllipse(0.05, 1.90, -20),
    generateProbeEllipse(0.25, 1.70, -35),
    generateProbeEllipse(0.50, 1.60, -50),
    generateProbeEllipse(0.75, 1.50, -60),
    generateProbeEllipse(1.00, 1.50, -70), // Bottom ellipse
    generateProbeEllipse(1.25, 1.40, -70),
    generateProbeEllipse(1.50, 1.35, -60),
    generateProbeEllipse(1.65, 1.30, -35),
    // generateProbeEllipse(1.73, 1.20,  0), // Duplicated outer-most ellipse
]

const PROBES_MAX_VISIBLE = PROBE_ELLIPSES.length * PROBES_PER_ELLIPSE;


const PLANET_POSITION = [5, 0.9]; // percent of canvas to draw lines to

// "Zaps" are the line flashes that appear when a probe is created (showing where the probe was sent from)
const ZAP_ENABLED = true;
const ZAP_DURATION = 200;
const ZAP_STARTING_OPACITY = 0.7;
const ZAP_ENDING_OPACITY = 0;
const ZAP_HIDE_AT_NUM_PROBES = 500;

const MIRROR_COLOR = 'rgba(255,255,0,0.2)'

/**
 * Creates an ellipse to represent a ring of probes orbiting the star
 * @param sizeFactor controls how large the ellipse is (inner ellipses are smallest, outer ellipses are largest)
 * @param bFactor scales the ellipse's b attribute (y radius). Decreasing this makes the ellipse makes the
 *   ellipse wider which makes it look like it's tilting into the z plane
 * @param offset how far to offset the ellipse from the origin; the offset increases as we approach the top of the donut
 */
function generateProbeEllipse(sizeFactor, bFactor = 2, offset = 0) {
    return new Ellipse(
        PROBE_RADIUS_A * (1 + sizeFactor),
        PROBE_RADIUS_B * (1 + sizeFactor * bFactor),
        offset / 2,
        offset / 2,
        PROBE_ORBIT_ANGLE
    )
}

/**
 * Generates a random distribution that is used to determine in what order the probes appear on the canvas. E.g. if you
 * only have 20 probes built, this determines where those 20 probes will be located (i.e. what ellipse they are on and
 * what index on the ellipse they are at).
 *
 * Returns an array like: [
 *     [3, 15, undefined], // represents ellipse #3 and index #15, the final undefined will be populated with the
 *                            elapsedTime when that probe is created
 *     [7, 83, undefined], // represents ellipse #7 and index #83
 *     ...
 * ]
 */
export function generateRandomProbeDist() {
    const distribution = [];

    for (let i = 0; i < PROBE_ELLIPSES.length; i++) {
        for (let j = 0; j < PROBES_PER_ELLIPSE; j++) {
            distribution.push([i, j]);
        }
    }

    shuffleArray(distribution);

    return distribution;
}

export function probeCapacity() {
    return PROBES_MAX_VISIBLE * PROBES_PER_CHAR;
}

let CACHED_PROBE_CHAR, CACHED_SUN_CHAR_A, CACHED_SUN_CHAR_B;
export function setupCache(manager) {
    if (USE_CACHED_CANVAS) {
        CACHED_PROBE_CHAR = manager.cacheChar(PROBE_CHAR, PROBE_COLOR);
        CACHED_SUN_CHAR_A = manager.cacheChar(SUN_CHAR_A, SUN_FOREGROUND);
        CACHED_SUN_CHAR_B = manager.cacheChar(SUN_CHAR_B, SUN_FOREGROUND);
    }
}

// Draws many probe ellipses to simulate the appearance of a 3-dimensional donut shape. Also draws a sun in the center
// of the donut.
export function drawStarAndProbes(canvas, elapsedTime, probeDistribution, numProbes, mirrorSettings) {
    // How far into their orbit each probe is (in radians)
    const orbitTheta = ((elapsedTime / 1000) % PROBE_ORBIT_TIME) / PROBE_ORBIT_TIME * 2 * Math.PI;

    numProbes = Math.ceil(numProbes / PROBES_PER_CHAR);

    /**
     * We first draw all the probes located in the the top-left area of the canvas, then draw the sun, and then draw the
     * probes in the bottom-right area of the canvas. This way the sun appears to be in front of the top-left probes and
     * behind the bottom-right probes.
     *
     * We accomplish this by creating a line (y = mx + b) from the bottom-left corner to the top-right corner of the
     * canvas. Then we add a queue filter to the canvas: if a point is below this line it will be QUEUED instead of DRAWN.
     * After we finish drawing the sun, we will process the queue to draw any queued points.
     */
    const [centerX, centerY] = canvas.center();
    const m = centerY / centerX;
    const b = -1 * centerY - m * centerX;
    canvas.addQueueFilter((type, args) => {
        // Queue update if point is below our imaginary line from bottom-left to top-right corner.
        // We multiply y by -1 because for a canvas a positive y means go DOWN.
        switch(type) {
            case QUEUE_TYPES.fillText:
            case QUEUE_TYPES.drawCachedChar:
                return -1 * args.y < m * args.x + b;
            case QUEUE_TYPES.stroke:
                return -1 * args.startY < m * args.startX + b;
        }
    })

    if (mirrorSettings && mirrorSettings.mirrorEnabled) {
        drawMirrors(canvas, probeDistribution, numProbes, orbitTheta, mirrorSettings);
    }
    drawProbes(canvas, probeDistribution, numProbes, orbitTheta);

    canvas.removeQueueFilter();

    drawSun(canvas, orbitTheta);

    // Set styles accordingly so we can process the queued mirrors/probes
    canvas.setFillStyle(PROBE_COLOR);
    canvas.setStrokeStyle(MIRROR_COLOR);
    canvas.processQueue();

    if (ZAP_ENABLED && numProbes > 0) {
        drawZaps(numProbes, elapsedTime, canvas, probeDistribution, orbitTheta)
    }
}

function drawMirrors(canvas, probeDistribution, numProbes, thetaOffset, mirrorSettings) {
    const [centerX, centerY] = canvas.center();

    canvas.setStrokeStyle(MIRROR_COLOR);
    const endPoint = { x: canvas.width * PLANET_POSITION[0], y: canvas.height * PLANET_POSITION[1] }

    // Draw mirror reflection lines first
    const maxMirrors = mirrorSettings.mirrorAmount * PROBES_MAX_VISIBLE
    probeDistribution.slice(0, Math.min(numProbes, maxMirrors)).forEach(probeCoord => {
        const [x, y] = PROBE_ELLIPSES[probeCoord[0]].xyPoint(PROBES_PER_ELLIPSE, thetaOffset, probeCoord[1]);
        canvas.drawLine(
            { x: x + centerX + canvas.fontWidth / 2, y: y + centerY - canvas.fontHeight / 2 },
            endPoint
        )
    })
}

function drawProbes(canvas, probeDistribution, numProbes, thetaOffset) {
    const [centerX, centerY] = canvas.center();

    canvas.setFillStyle(PROBE_COLOR);

    probeDistribution.slice(0, numProbes).forEach(probeCoord => {
        const [x, y] = PROBE_ELLIPSES[probeCoord[0]].xyPoint(PROBES_PER_ELLIPSE, thetaOffset, probeCoord[1]);
        if (USE_CACHED_CANVAS) {
            canvas.drawCachedChar(CACHED_PROBE_CHAR, x + centerX, y + centerY);
        }
        else {
            canvas.fillText(PROBE_CHAR, x + centerX, y + centerY);
        }
    })
}

function drawSun(canvas, orbitTheta) {
    // Draw a black circle background behind the sun to help create the illusion that the sun is inside of the probe donut
    canvas.drawFilledCircle(SUN_SIZE + 2, SUN_BACKGROUND, 4, -4); // small x/y offsets due to char padding

    const stepSize = 1 / (SUN_ELLIPSE_COUNT - 1);
    canvas.setFillStyle(SUN_FOREGROUND);

    for (let i = 0; i < SUN_ELLIPSE_COUNT; i++) {
        const offset = i === 0 ? 0.1 : stepSize * i;

        if (USE_CACHED_CANVAS) {
            // Sun ellipses in the horizontal direction
            canvas.drawEllipseCachedChar(
                new Ellipse(SUN_SIZE, SUN_SIZE * offset),
                i % 2 === 0 ? CACHED_SUN_CHAR_A : CACHED_SUN_CHAR_B,
                SUN_CHARS_PER_ELLIPSE,
                orbitTheta
            );

            // Sun ellipses in the vertical direction
            canvas.drawEllipseCachedChar(
                new Ellipse(SUN_SIZE * offset, SUN_SIZE),
                i % 2 === 0 ? CACHED_SUN_CHAR_B : CACHED_SUN_CHAR_A,
                SUN_CHARS_PER_ELLIPSE,
                orbitTheta
            );
        }
        else {
            // Sun ellipses in the horizontal direction
            canvas.drawEllipse(
                new Ellipse(SUN_SIZE, SUN_SIZE * offset),
                i % 2 === 0 ? SUN_CHAR_A : SUN_CHAR_B,
                SUN_CHARS_PER_ELLIPSE,
                orbitTheta
            );

            // Sun ellipses in the vertical direction
            canvas.drawEllipse(
                new Ellipse(SUN_SIZE * offset, SUN_SIZE),
                i % 2 === 0 ? SUN_CHAR_B : SUN_CHAR_A,
                SUN_CHARS_PER_ELLIPSE,
                orbitTheta
            );
        }
    }
}




const zaps = []; // Records when every probe's zap started
const visibleZaps = {}; // Records zaps that are currently visible

function drawZaps(numProbes, elapsedTime, canvas, probeDistribution, orbitTheta) {
    if (numProbes > PROBES_MAX_VISIBLE) {
        return;
    }

    const opacityRange = ZAP_STARTING_OPACITY - ZAP_ENDING_OPACITY
    const fadeAmount = Math.min(numProbes / ZAP_HIDE_AT_NUM_PROBES, 1); // percent of range to fade
    const opacity = ZAP_STARTING_OPACITY - fadeAmount * opacityRange;

    if (opacity <= 0) {
        return;
    }

    const latestProbeIndex = numProbes - 1;

    if (zaps[latestProbeIndex] === undefined) {
        zaps[latestProbeIndex] = elapsedTime;
        visibleZaps[latestProbeIndex] = elapsedTime;
    }

    // remove expired zaps
    for (const [probeIndex, startTime] of Object.entries(visibleZaps)) {
        if (elapsedTime > startTime + ZAP_DURATION) {
            delete visibleZaps[probeIndex];
        }
    }

    // show zaps
    for (const [probeIndex, startTime] of Object.entries(visibleZaps)) {
        drawZapLine(canvas, probeDistribution[probeIndex], orbitTheta, opacity);
    }
}

function drawZapLine(canvas, probeCoord, thetaOffset, opacity) {
    const [ellipseIndex, probeIndex] = probeCoord;
    const ellipse = PROBE_ELLIPSES[ellipseIndex];
    const [canvasCenterX, canvasCenterY] = canvas.center();

    const [x, y] = ellipse.xyPoint(PROBES_PER_ELLIPSE, thetaOffset, probeIndex);

    canvas.setStrokeStyle(`rgba(255,255,255,${opacity})`)
    canvas.drawLine(
        { x: canvas.width * PLANET_POSITION[0], y: canvas.height * PLANET_POSITION[1] },
        { x: x + canvasCenterX + canvas.fontWidth / 2, y: y + canvasCenterY - canvas.fontHeight / 2 }
    )
}
