/**
 * WebGL edge-preserving camera smoother (skin "beautify").
 *
 * Runs a single-pass bilateral filter on the webcam frame. Each neighbouring
 * pixel is averaged into the centre, but weighted by how *similar in colour* it
 * is: flat regions (skin) average together so pores/blemishes soften, while
 * high-contrast detail (eyes, eyelashes, hair, glasses rims) has large colour
 * differences, gets almost no weight, and stays sharp. That edge preservation is
 * exactly what a plain Gaussian `blur()` lacks — and why this looks "clean"
 * instead of smeared. A light brightness / saturation / contrast pass adds the
 * flattering lift.
 *
 * One draw call per frame at the small PiP resolution, so it's frame-rate cheap.
 * The output `canvas` can be drawn straight into a 2D compositing canvas
 * (`ctx.drawImage`) for recording, or used directly as the live-preview surface.
 */

/** Tunable knobs the bilateral shader reads each frame. */
export type SmoothParams = {
  /** Blend toward the smoothed image, 0 (off) … 1 (full). */
  amount: number;
  /** Sample-spacing multiplier; widens the smoothing reach without more taps. */
  spread: number;
  /** Colour-difference tolerance; higher smooths across stronger edges. */
  sigmaColor: number;
  /** Exposure lift (1 = unchanged). */
  brightness: number;
  /** Saturation multiplier (1 = unchanged). */
  saturation: number;
  /** Contrast around mid-grey (1 = unchanged). */
  contrast: number;
};

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  // Flip Y so the video's top row maps to the top of the output.
  v_uv = vec2(a_pos.x, -a_pos.y) * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_mask;
uniform float u_useMask;
uniform vec2 u_texel;
uniform float u_amount;
uniform float u_spread;
uniform float u_sigmaColor;
uniform float u_brightness;
uniform float u_saturation;
uniform float u_contrast;

// Kernel radius. WebGL1 requires a constant loop bound.
const int R = 4;

void main() {
  vec3 center = texture2D(u_tex, v_uv).rgb;
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  float sigmaSpace = float(R) * 0.5;
  float s2 = 2.0 * sigmaSpace * sigmaSpace;
  float c2 = 2.0 * u_sigmaColor * u_sigmaColor;

  for (int dx = -R; dx <= R; dx++) {
    for (int dy = -R; dy <= R; dy++) {
      vec2 off = vec2(float(dx), float(dy)) * u_texel * u_spread;
      vec3 smp = texture2D(u_tex, v_uv + off).rgb;
      float spatial = exp(-(float(dx * dx + dy * dy)) / s2);
      vec3 dc = smp - center;
      float range = exp(-dot(dc, dc) / c2); // edge-preserving weight
      float w = spatial * range;
      sum += smp * w;
      wsum += w;
    }
  }

  vec3 smoothed = sum / max(wsum, 1e-4);
  // Restrict smoothing to the face-skin mask when one is supplied; otherwise
  // smooth the whole frame.
  float skin = u_useMask > 0.5 ? texture2D(u_mask, v_uv).r : 1.0;
  vec3 color = mix(center, smoothed, u_amount * skin);

  color *= u_brightness;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, u_saturation);
  color = (color - 0.5) * u_contrast + 0.5;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("CameraSmoother shader compile failed:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function link(gl: WebGLRenderingContext): WebGLProgram | null {
  const vert = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vert || !frag) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("CameraSmoother program link failed:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

type Uniforms = {
  texel: WebGLUniformLocation | null;
  amount: WebGLUniformLocation | null;
  spread: WebGLUniformLocation | null;
  sigmaColor: WebGLUniformLocation | null;
  brightness: WebGLUniformLocation | null;
  saturation: WebGLUniformLocation | null;
  contrast: WebGLUniformLocation | null;
  useMask: WebGLUniformLocation | null;
};

/** A 1×1 white texture so the mask sampler is always valid (= "smooth here"). */
function configureTexture(gl: WebGLRenderingContext, tex: WebGLTexture): void {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

export class CameraSmoother {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly videoTex: WebGLTexture;
  private readonly maskTex: WebGLTexture;
  private readonly buffer: WebGLBuffer;
  private readonly uniforms: Uniforms;
  private w = 0;
  private h = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    videoTex: WebGLTexture,
    maskTex: WebGLTexture,
    buffer: WebGLBuffer,
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.videoTex = videoTex;
    this.maskTex = maskTex;
    this.buffer = buffer;
    this.uniforms = {
      texel: gl.getUniformLocation(program, "u_texel"),
      amount: gl.getUniformLocation(program, "u_amount"),
      spread: gl.getUniformLocation(program, "u_spread"),
      sigmaColor: gl.getUniformLocation(program, "u_sigmaColor"),
      brightness: gl.getUniformLocation(program, "u_brightness"),
      saturation: gl.getUniformLocation(program, "u_saturation"),
      contrast: gl.getUniformLocation(program, "u_contrast"),
      useMask: gl.getUniformLocation(program, "u_useMask"),
    };
  }

  /**
   * Build a smoother, optionally rendering into a caller-provided canvas (the
   * live preview passes its visible canvas; the recorder lets us make our own
   * offscreen one). Returns null when WebGL is unavailable so callers can fall
   * back to the raw, un-retouched camera.
   */
  static create(canvas?: HTMLCanvasElement): CameraSmoother | null {
    try {
      const cv = canvas ?? document.createElement("canvas");
      const opts: WebGLContextAttributes = {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
      };
      const gl = (cv.getContext("webgl", opts) ||
        cv.getContext("experimental-webgl", opts)) as WebGLRenderingContext | null;
      if (!gl) return null;

      const program = link(gl);
      if (!program) return null;

      // Full-screen quad as a triangle strip.
      const buffer = gl.createBuffer();
      const videoTex = gl.createTexture();
      const maskTex = gl.createTexture();
      if (!buffer || !videoTex || !maskTex) return null;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );

      gl.useProgram(program);
      const aPos = gl.getAttribLocation(program, "a_pos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      // Video on texture unit 0, mask on unit 1 (NPOT → clamp + linear).
      gl.uniform1i(gl.getUniformLocation(program, "u_tex"), 0);
      gl.uniform1i(gl.getUniformLocation(program, "u_mask"), 1);
      gl.activeTexture(gl.TEXTURE0);
      configureTexture(gl, videoTex);
      gl.activeTexture(gl.TEXTURE1);
      configureTexture(gl, maskTex);
      // Seed the mask with one white pixel so it reads as "smooth everywhere"
      // until a real mask arrives.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));

      return new CameraSmoother(cv, gl, program, videoTex, maskTex, buffer);
    } catch {
      return null;
    }
  }

  /**
   * Upload the current video frame, run the filter, leave the result in `canvas`.
   * Pass `mask` (white = smooth) to restrict smoothing to the face skin; omit it
   * to smooth the whole frame.
   */
  render(source: HTMLVideoElement, params: SmoothParams, mask?: HTMLCanvasElement | null): void {
    const w = source.videoWidth;
    const h = source.videoHeight;
    if (!w || !h) return;
    const gl = this.gl;

    if (w !== this.w || h !== this.h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.w = w;
      this.h = h;
      gl.viewport(0, 0, w, h);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);

    if (mask) {
      gl.activeTexture(gl.TEXTURE1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, mask);
    }
    gl.uniform1f(this.uniforms.useMask, mask ? 1 : 0);

    gl.uniform2f(this.uniforms.texel, 1 / w, 1 / h);
    gl.uniform1f(this.uniforms.amount, params.amount);
    gl.uniform1f(this.uniforms.spread, params.spread);
    gl.uniform1f(this.uniforms.sigmaColor, params.sigmaColor);
    gl.uniform1f(this.uniforms.brightness, params.brightness);
    gl.uniform1f(this.uniforms.saturation, params.saturation);
    gl.uniform1f(this.uniforms.contrast, params.contrast);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.videoTex);
    gl.deleteTexture(this.maskTex);
    gl.deleteBuffer(this.buffer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
