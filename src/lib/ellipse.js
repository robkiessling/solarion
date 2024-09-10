import {mod} from "./helpers";

const MAX_THETA = 2 * Math.PI;

/**
 *
 * Parametric equations for an ellipse WITH ROTATION:
 *   x = h + a * cos(t) * cos(r) + b * sin(t) * -sin(r)
 *   y = k + a * cos(t) * sin(r) + b * sin(t) * cos(r)
 *
 * where:
 *   h = center of ellipse on x axis (relative to center of canvas)
 *   k = center of ellipse on y axis (relative to center of canvas)
 *   a = radius of ellipse on x axis
 *   b = radius of ellipse on y axis
 *   r = rotation angle of ellipse (in degrees)
 *   t = theta (independent variable, angle of desired [x,y] coordinate)
 */
export default class Ellipse {
    constructor(a, b, h, k, r) {
        this.a = a === undefined ? 10 : a;
        this.b = b === undefined ? 10 : b;
        this.h = h === undefined ? 0 : h;
        this.k = k === undefined ? 0 : k;
        this.r = r === undefined ? 0 : r;

        this.rotationDegrees = this.r;
        this.rotationRadians = this.r * Math.PI / 180;
    }

    x(t) {
        return this.h +
            (this.a * Math.cos(t)) * Math.cos(this.rotationRadians) +
            (this.b * Math.sin(t)) * -1 * Math.sin(this.rotationRadians)
    }

    y(t) {
        return this.k +
            (this.a * Math.cos(t)) * Math.sin(this.rotationRadians) +
            (this.b * Math.sin(t)) * Math.cos(this.rotationRadians)
    }

    // Generates a list of xy coordinates following the ellipse's arc
    xyPoints(numPoints, thetaOffset, callback) {
        for (let i = 0; i < numPoints; i++) {
            this.xyPoint(numPoints, thetaOffset, i, callback);
        }
    }

    // Generates a single xy coordinates on the ellipse's arc
    xyPoint(numPoints, thetaOffset, i, callback) {
        const t = mod(i / numPoints * MAX_THETA + thetaOffset, MAX_THETA);
        callback(this.x(t), this.y(t));
    }
}

