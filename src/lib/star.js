

const PROBE_RADIUS_A = 130;
const PROBE_RADIUS_B = 50;
const PROBES_PER_ELLIPSE = 100;
const PROBE_ORBIT_TIME = 30; // how long it takes
const PROBE_CHAR = 'X';

const SUN_SIZE = 75; // Note: If you increase this you may have to change order of drawSun (within drawProbeEllipse calls)
const SUN_ELLIPSE_COUNT = 5;
const SUN_CHARS_PER_ELLIPSE = 50;
const SUN_COLOR = 'yellow';
const SUN_CHAR_A = '('; // We use two different characters to compose the sun's body
const SUN_CHAR_B = ')';


// Draws many probe ellipses to simulate the appearance of a 3-dimensional donut shape. Also draws a sun in the center
// of the donut.
export function drawStarAndSwarm(canvas, elapsedTime) {
    // How far into their orbit each probe is (in radians)
    const orbitTheta = ((elapsedTime / 1000) % PROBE_ORBIT_TIME) / PROBE_ORBIT_TIME * 2 * Math.PI;

    /**
     * Draws an ellipse of characters to represent a ring of probes orbiting the star
     * @param sizeFactor controls how large the ellipse is (inner ellipses are smallest, outer ellipses are largest)
     * @param bFactor scales the ellipse's b attribute (y radius). Decreasing this makes the ellipse makes the
     *   ellipse wider which makes it look like it's tilting into the z plane
     * @param offset how far to offset the ellipse from the origin; the offset increases as we approach the top of the donut
     */
    function drawProbeEllipse(sizeFactor, bFactor = 2, offset = 0) {
        canvas.drawCharEllipse(PROBE_CHAR, PROBES_PER_ELLIPSE, {
            a: PROBE_RADIUS_A * (1 + sizeFactor),
            b: PROBE_RADIUS_B * (1 + sizeFactor * bFactor),

            /* Donut with no rotation */
            // k: offset,
            // h: 0,
            // r: 0

            /* Donut at 45 degree angle */
            k: offset / 2,
            h: offset / 2,
            r: -45
        }, orbitTheta);
    }

    /**
     * These drawProbeEllipse constants were chosen through trial-and-error... there is probably some formula to calculate
     * them but I couldn't figure it out. You basically want the x-intercepts of all the ellipses to create a circle
     * shape.
     */
    /*   Top half of donut  */
    drawProbeEllipse(0.00, 2.00,  0); // Inner-most ellipse
    drawProbeEllipse(0.05, 1.90, 20);
    drawProbeEllipse(0.25, 1.70, 35);
    drawProbeEllipse(0.50, 1.60, 50);
    drawProbeEllipse(0.75, 1.50, 60);
    drawProbeEllipse(1.00, 1.50, 70); // Top ellipse
    drawProbeEllipse(1.25, 1.40, 70);
    drawProbeEllipse(1.50, 1.35, 60);
    drawProbeEllipse(1.65, 1.30, 35);
    drawProbeEllipse(1.73, 1.20,  0); // Outer-most ellipse

    /*   Bottom half of donut  */
    // drawProbeEllipse(canvas, orbitTheta, 0.00, 2.00,  0); // Duplicated inner-most ellipse
    drawProbeEllipse(0.05, 1.90, -20);
    drawSun(canvas, orbitTheta) // We draw the sun right here so that its black background covers the correct ellipses
    drawProbeEllipse(0.25, 1.70, -35);
    drawProbeEllipse(0.50, 1.60, -50);
    drawProbeEllipse(0.75, 1.50, -60);
    drawProbeEllipse(1.00, 1.50, -70); // Bottom ellipse
    drawProbeEllipse(1.25, 1.40, -70);
    drawProbeEllipse(1.50, 1.35, -60);
    drawProbeEllipse(1.65, 1.30, -35);
    // drawProbeEllipse(canvas, orbitTheta, 1.73, 1.2,  0); // Duplicated outer-most ellipse
}

function drawSun(canvas, orbitTheta) {
    // Draw a black circle background behind the sun to help create the illusion that the sun is inside of the probe donut
    canvas.drawFilledCircle(SUN_SIZE + 2, '#000', 4, -4); // small x/y offsets due to char drawing

    const stepSize = 1 / (SUN_ELLIPSE_COUNT - 1);
    for (let i = 0; i < SUN_ELLIPSE_COUNT; i++) {
        const offset = i === 0 ? 0.1 : stepSize * i;

        // Ellipses in the horizontal direction
        canvas.drawCharEllipse(i % 2 === 0 ? SUN_CHAR_A : SUN_CHAR_B, SUN_CHARS_PER_ELLIPSE, {
            a: SUN_SIZE,
            b: SUN_SIZE * offset
        }, orbitTheta, SUN_COLOR);

        // Ellipses in the vertical direction
        canvas.drawCharEllipse(i % 2 === 0 ? SUN_CHAR_B : SUN_CHAR_A, SUN_CHARS_PER_ELLIPSE, {
            a: SUN_SIZE * offset,
            b: SUN_SIZE
        }, orbitTheta, SUN_COLOR);
    }
}