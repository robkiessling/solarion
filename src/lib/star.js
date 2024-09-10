import {shuffleArray} from "./helpers";
import Ellipse from "./ellipse";


const SUN_SIZE = 75;
const SUN_ELLIPSE_COUNT = 5;
const SUN_CHARS_PER_ELLIPSE = 50;
const SUN_COLOR = 'yellow';
const SUN_CHAR_A = '('; // We use two different characters when drawing the sun's body
const SUN_CHAR_B = ')';


const PROBE_RADIUS_A = 130;
const PROBE_RADIUS_B = 50;
const PROBES_PER_ELLIPSE = 100;
const PROBE_ORBIT_TIME = 30;
const PROBE_CHAR = 'X';

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

    /*   Bottom half of donut:  */
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
 *     [3, 15], // represents ellipse #3 and index #15
 *     [7, 83], // represents ellipse #7 and index #83
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

// Draws many probe ellipses to simulate the appearance of a 3-dimensional donut shape. Also draws a sun in the center
// of the donut.
export function drawStarAndProbes(canvas, elapsedTime, probeDistribution, numProbes) {
    // How far into their orbit each probe is (in radians)
    const orbitTheta = ((elapsedTime / 1000) % PROBE_ORBIT_TIME) / PROBE_ORBIT_TIME * 2 * Math.PI;

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
    canvas.addQueueFilter((x, y) => {
        // Queue update if point is below our imaginary line from bottom-left to top-right corner.
        // We multiply y by -1 because for a canvas a positive y means go DOWN.
        return -1 * y < m * x + b;
    })

    canvas.setFillStyle('#fff');
    probeDistribution.slice(0, numProbes).forEach(probeCoord => {
        canvas.drawEllipseChar(PROBE_ELLIPSES[probeCoord[0]], PROBE_CHAR, PROBES_PER_ELLIPSE, orbitTheta, probeCoord[1]);
    })
    canvas.removeQueueFilter();

    drawSun(canvas, orbitTheta);

    canvas.setFillStyle('#fff');
    canvas.processQueue();
}

function drawSun(canvas, orbitTheta) {
    // Draw a black circle background behind the sun to help create the illusion that the sun is inside of the probe donut
    canvas.drawFilledCircle(SUN_SIZE + 2, '#000', 4, -4); // small x/y offsets due to char padding

    const stepSize = 1 / (SUN_ELLIPSE_COUNT - 1);
    canvas.setFillStyle(SUN_COLOR);

    for (let i = 0; i < SUN_ELLIPSE_COUNT; i++) {
        const offset = i === 0 ? 0.1 : stepSize * i;

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