const MAX_POINTS = 100;

const CATEGORY_INDEX = {
  red: 0,
  blue: 1,
  orange: 2,
  green: 3,
  purple: 4,
};

const CATEGORY_COLORS = [
  [1, 0, 0], // red
  [0, 0, 1], // blue
  [1, 165 / 255, 0], // orange
  [0, 128 / 255, 0], // green
  [128 / 255, 0, 128 / 255], // purple
];

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

#define MAX_POINTS ${MAX_POINTS}

uniform vec2 uPoints[MAX_POINTS];
uniform float uCategories[MAX_POINTS];
uniform int uNumPoints;
uniform int uK;
uniform float uAccuracy;
uniform vec3 uCategoryColors[5];

out vec4 fragColor;

void main() {
  vec2 fragPos = (floor(gl_FragCoord.xy / uAccuracy) + 0.5) * uAccuracy;

  float dists[MAX_POINTS];
  for (int i = 0; i < MAX_POINTS; i++) {
    if (i >= uNumPoints) break;
    vec2 d = uPoints[i] - fragPos;
    dists[i] = dot(d, d);
  }

  bool used[MAX_POINTS];
  for (int i = 0; i < MAX_POINTS; i++) {
    used[i] = false;
  }

  float counts[5];
  float nearestCategoryDist[5];

  for (int c = 0; c < 5; c++) {
    counts[c] = 0.0;
    nearestCategoryDist[c] = 1.0e30;
  }

  for (int kk = 0; kk < MAX_POINTS; kk++) {
    if (kk >= uK) break;

    float minDist = 1.0e30;
    int minIdx = -1;
    for (int i = 0; i < MAX_POINTS; i++) {
      if (i >= uNumPoints) break;
      if (used[i]) continue;
      if (dists[i] < minDist) {
        minDist = dists[i];
        minIdx = i;
      }
    }

    if (minIdx >= 0) {
      used[minIdx] = true;
      int cat = int(uCategories[minIdx] + 0.5);
      counts[cat] += 1.0;
      nearestCategoryDist[cat] =
          min(nearestCategoryDist[cat], minDist);
    }
  }

  float maxCount = -1.0;
  float bestNearestDist = 1.0e30;
  int predCat = 0;
  for (int c = 0; c < 5; c++) {
    if (counts[c] > maxCount ||
        (counts[c] == maxCount &&
         nearestCategoryDist[c] < bestNearestDist)) {

      maxCount = counts[c];
      bestNearestDist = nearestCategoryDist[c];
      predCat = c;
    }
  }

  fragColor = vec4(uCategoryColors[predCat], 1.0);
}
`;

class WebGLBackground {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      throw new Error("WebGL2 is not supported in this browser.");
    }

    this.gl = gl;
    this._initProgram();
    this._initQuad();
  }

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error("Error compiling shader: " + info);
    }
    return shader;
  }

  _initProgram() {
    const gl = this.gl;
    const vertexShader = this._compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this._compileShader(
      gl.FRAGMENT_SHADER,
      FRAGMENT_SHADER,
    );

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      throw new Error("Error linking WebGL program: " + info);
    }

    this.program = program;

    this.uniforms = {
      aPosition: gl.getAttribLocation(program, "aPosition"),
      uPoints: gl.getUniformLocation(program, "uPoints"),
      uCategories: gl.getUniformLocation(program, "uCategories"),
      uNumPoints: gl.getUniformLocation(program, "uNumPoints"),
      uK: gl.getUniformLocation(program, "uK"),
      uAccuracy: gl.getUniformLocation(program, "uAccuracy"),
      uCategoryColors: gl.getUniformLocation(program, "uCategoryColors"),
    };
  }

  _initQuad() {
    const gl = this.gl;
    // Two triangles covering the entire viewport in NDC
    const vertices = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  /**
   * Computes and renders the KNN colored area.
   * @param {Array<{x:number,y:number,category:string}>} points
   * @param {number} k
   * @param {number} fullWidth width of the main canvas (px CSS)
   * @param {number} fullHeight height of the main canvas (px CSS)
   * @param {number} accuracy size of the "block" in px (larger = less precise, faster)
   */
  render(points, k, fullWidth, fullHeight, accuracy) {
    const gl = this.gl;

    // Render at full resolution (like the main canvas): this avoids
    // depending on CSS scaling to enlarge a low-resolution canvas,
    // which could misposition/dimension poorly.
    if (this.canvas.width !== fullWidth) this.canvas.width = fullWidth;
    if (this.canvas.height !== fullHeight) this.canvas.height = fullHeight;

    gl.viewport(0, 0, fullWidth, fullHeight);
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(this.uniforms.aPosition);
    gl.vertexAttribPointer(this.uniforms.aPosition, 2, gl.FLOAT, false, 0, 0);

    const numPoints = Math.min(points.length, MAX_POINTS);
    const posArr = new Float32Array(MAX_POINTS * 2);
    const catArr = new Float32Array(MAX_POINTS);

    for (let i = 0; i < numPoints; i++) {
      const p = points[i];
      posArr[i * 2] = p.x;
      // Vertical flip: gl_FragCoord has its origin at the bottom-left.
      posArr[i * 2 + 1] = fullHeight - p.y;
      catArr[i] = CATEGORY_INDEX[p.category] ?? 0;
    }

    gl.uniform2fv(this.uniforms.uPoints, posArr);
    gl.uniform1fv(this.uniforms.uCategories, catArr);
    gl.uniform1i(this.uniforms.uNumPoints, numPoints);
    gl.uniform1i(this.uniforms.uK, Math.max(1, Math.min(k, numPoints || 1)));
    gl.uniform1f(this.uniforms.uAccuracy, accuracy);
    gl.uniform3fv(this.uniforms.uCategoryColors, CATEGORY_COLORS.flat());

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
