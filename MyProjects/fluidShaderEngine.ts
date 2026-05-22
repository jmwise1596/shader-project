"react";

// Vertex shader definition (Shared viewport quad)
const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Navier Stokes calculations in Fragment Shaders
const SPLAT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_source;
uniform vec2 u_point;
uniform vec3 u_color;
uniform float u_radius;
uniform float u_aspect;
void main() {
    vec2 p = v_uv - u_point;
    p.x *= u_aspect;
    float splat = exp(-dot(p, p) / u_radius);
    vec3 base = texture(u_source, v_uv).xyz;
    outColor = vec4(base + splat * u_color, 1.0);
}
`;

const ADVECTION_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_dissipation;
void main() {
    // Semi-Lagrangian advection
    vec2 coord = v_uv - u_dt * u_texelSize * texture(u_velocity, v_uv).xy;
    outColor = u_dissipation * texture(u_source, coord);
}
`;

const DIVERGENCE_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
void main() {
    float L = texture(u_velocity, v_uv - vec2(u_texelSize.x, 0.0)).x;
    float R = texture(u_velocity, v_uv + vec2(u_texelSize.x, 0.0)).x;
    float B = texture(u_velocity, v_uv - vec2(0.0, u_texelSize.y)).y;
    float T = texture(u_velocity, v_uv + vec2(0.0, u_texelSize.y)).y;
    float div = 0.5 * (R - L + T - B);
    outColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

const PRESSURE_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texelSize;
void main() {
    // Jacobi iteration solve
    float L = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
    float R = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
    float B = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
    float T = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
    float div = texture(u_divergence, v_uv).x;
    float p = (L + R + B + T - div) * 0.25;
    outColor = vec4(p, 0.0, 0.0, 1.0);
}
`;

const GRADIENT_SUBTRACT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform vec2 u_texelSize;
void main() {
    float L = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
    float R = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
    float B = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
    float T = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
    vec2 vel = texture(u_velocity, v_uv).xy;
    vel -= 0.5 * vec2(R - L, T - B);
    outColor = vec4(vel, 0.0, 1.0);
}
`;

const DISPLAY_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_dye;
uniform float u_transition; // 0.0 (Fluid Mode) -> 1.0 (Static Mode)

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
    vec3 dye = texture(u_dye, v_uv).xyz;
    float d = clamp(length(dye), 0.0, 2.0);

    // --- FLUID MODE: LIQUID MERCURY ---
    vec3 fluidBg = vec3(0.05, 0.05, 0.06);

    // Compute surface normal using finite differences of the dye density field (as a heightmap)
    float eps = 1.0 / 256.0;
    float dL = length(texture(u_dye, v_uv - vec2(eps, 0.0)).xyz);
    float dR = length(texture(u_dye, v_uv + vec2(eps, 0.0)).xyz);
    float dB = length(texture(u_dye, v_uv - vec2(0.0, eps)).xyz);
    float dT = length(texture(u_dye, v_uv + vec2(0.0, eps)).xyz);

    // Normal vector: steeper heights create more pronounced surface curvature
    vec3 N = normalize(vec3((dL - dR) * 4.0, (dB - dT) * 4.0, 0.2));

    // Specular lighting (Blinn-Phong) - tighter, dimmer highlight
    vec3 V = vec3(0.0, 0.0, 1.0); // View direction (orthogonal)
    vec3 L_dir = normalize(vec3(0.4, 0.6, 1.0)); // Main light direction
    vec3 H = normalize(L_dir + V);
    float spec = pow(max(0.0, dot(N, H)), 64.0) * 0.7;

    // Fake environment reflection (Darkened Sky reflection gradient)
    vec3 R_vec = reflect(vec3(0.0, 0.0, -1.0), N);
    vec3 skyTop = vec3(0.55, 0.58, 0.65);
    vec3 skyBottom = vec3(0.08, 0.10, 0.15);
    vec3 envReflect = mix(skyBottom, skyTop, R_vec.y * 0.5 + 0.5);

    // Base chrome/mercury tint: darker gunmetal
    vec3 mercuryBase = vec3(0.35, 0.37, 0.42);
    vec3 metallicSurface = mix(mercuryBase, envReflect, 0.4) + vec3(spec);

    // Fresnel Effect - subtle edges
    float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);
    metallicSurface += fresnel * vec3(0.12, 0.15, 0.18);

    // Mask metallic surface based on density presence, blending with dark charcoal background
    float blobMask = smoothstep(0.005, 0.12, d);
    vec3 fluidColor = mix(fluidBg, metallicSurface, blobMask);

    // --- STATIC MODE: stark, digital, CRT glitched noise ---
    vec3 staticBg = vec3(0.0, 0.0, 0.0);
    
    // Hard cutoff mask
    float mask = step(0.08, d);
    
    // Pseudo-random digital noise
    float rnd = hash(v_uv + vec2(0.0, fract(u_transition * 12.34)));
    vec3 electricCyan = vec3(0.0, 1.0, 0.9);
    vec3 staticNoiseColor = mix(electricCyan, vec3(1.0, 1.0, 1.0), rnd);
    
    // Scanline pattern
    float scanline = mix(0.75, 1.0, step(0.5, fract(gl_FragCoord.y * 0.5)));
    vec3 staticColor = staticBg;
    if (mask > 0.5) {
        staticColor = staticNoiseColor * scanline;
    }

    // Crossfade smoothly between Fluid and Static modes
    vec3 finalColor = mix(fluidColor, staticColor, u_transition);
    outColor = vec4(finalColor, 1.0);
}
`;

// Helper types
export interface FluidSimulation {
  gl: WebGL2RenderingContext;
  programs: Record<string, WebGLProgram>;
  quadVAO: WebGLVertexArrayObject;
  simWidth: number;
  simHeight: number;
  aspectRatio: number;
  transition: number; // 0.0 to 1.0 transition target
  // Double buffer FBO definitions
  density: { read: FramebufferObject; write: FramebufferObject; swap: () => void };
  velocity: { read: FramebufferObject; write: FramebufferObject; swap: () => void };
  pressure: { read: FramebufferObject; write: FramebufferObject; swap: () => void };
  divergence: FramebufferObject;
  lastX?: number;
  lastY?: number;
}

interface FramebufferObject {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
}

// Utility to create and compile Shader
function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Utility to link Programs
function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program linking error:", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

// Create Double Buffered Framebuffers
function createFBO(gl: WebGL2RenderingContext, w: number, h: number, internalFormat: number, format: number, type: number): FramebufferObject {
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  return { fb, tex };
}

function createDoubleFBO(gl: WebGL2RenderingContext, w: number, h: number, internalFormat: number, format: number, type: number) {
  let fboA = createFBO(gl, w, h, internalFormat, format, type);
  let fboB = createFBO(gl, w, h, internalFormat, format, type);
  return {
    read: fboA,
    write: fboB,
    swap() {
      const temp = fboA;
      fboA = fboB;
      fboB = temp;
      this.read = fboA;
      this.write = fboB;
    }
  };
}

// Core WebGL initialization
export function initFluidSimulation(canvas: HTMLCanvasElement): FluidSimulation | null {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false });
  if (!gl) return null;

  // Check and enable float linear filtering support
  gl.getExtension("OES_texture_float_linear");
  gl.getExtension("EXT_color_buffer_float");

  // Determine ideal texture precision (Fallback gracefully to 8-bit float if Half Float fails)
  const isHalfFloatSupported = gl.getExtension("OES_texture_half_float") !== null;
  const internalFormat = gl.RGBA16F;
  const format = gl.RGBA;
  const type = gl.HALF_FLOAT;

  // We run the math simulation loop in small resolution (e.g., 256x256)
  // This produces buttery smooth visual diffusion shapes with spectacular performance
  const simWidth = 256;
  const simHeight = 256;

  // Compile programs
  const programs: Record<string, WebGLProgram> = {};
  programs.splat = createProgram(gl, VERTEX_SHADER, SPLAT_SHADER)!;
  programs.advect = createProgram(gl, VERTEX_SHADER, ADVECTION_SHADER)!;
  programs.divergence = createProgram(gl, VERTEX_SHADER, DIVERGENCE_SHADER)!;
  programs.pressure = createProgram(gl, VERTEX_SHADER, PRESSURE_SHADER)!;
  programs.gradSubtract = createProgram(gl, VERTEX_SHADER, GRADIENT_SUBTRACT_SHADER)!;
  programs.display = createProgram(gl, VERTEX_SHADER, DISPLAY_SHADER)!;

  // Quad Geometry setup
  const vertices = new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]);
  const quadVAO = gl.createVertexArray()!;
  gl.bindVertexArray(quadVAO);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Initialize Double Buffer Textures
  const density = createDoubleFBO(gl, simWidth, simHeight, internalFormat, format, type);
  const velocity = createDoubleFBO(gl, simWidth, simHeight, internalFormat, format, type);
  const pressure = createDoubleFBO(gl, simWidth, simHeight, internalFormat, format, type);
  const divergence = createFBO(gl, simWidth, simHeight, internalFormat, format, type);

  // Initial resize
  canvas.width = canvas.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;

  return {
    gl,
    programs,
    quadVAO,
    simWidth,
    simHeight,
    aspectRatio: canvas.width / canvas.height,
    transition: 0.0,
    density,
    velocity,
    pressure,
    divergence,
  };
}

// Triggers a splash of color and impulse force at screen coordinate normalized to (0-1)
export function triggerSplat(
  sim: FluidSimulation,
  x: number,
  y: number,
  dx: number,
  dy: number,
  strength: number,
  radius: number
) {
  const gl = sim.gl;
  gl.viewport(0, 0, sim.simWidth, sim.simHeight);
  gl.bindVertexArray(sim.quadVAO);

  // 1. Splat velocity vector
  gl.useProgram(sim.programs.splat);
  gl.uniform2f(gl.getUniformLocation(sim.programs.splat, "u_point"), x, y);
  gl.uniform3f(gl.getUniformLocation(sim.programs.splat, "u_color"), dx, dy, 0.0);
  gl.uniform1f(gl.getUniformLocation(sim.programs.splat, "u_radius"), radius);
  gl.uniform1f(gl.getUniformLocation(sim.programs.splat, "u_aspect"), sim.aspectRatio);
  
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sim.velocity.read.tex);
  gl.uniform1i(gl.getUniformLocation(sim.programs.splat, "u_source"), 0);
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.velocity.write.fb);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  sim.velocity.swap();

  // 2. Splat density dye
  let dyeColor = [0.4, 0.42, 0.45]; // Fluid Mode: darker mercury dye starting point
  if (sim.transition > 0.5) {
    // Static Mode: ice blue/white
    dyeColor = [0.8, 0.9, 1.0];
  }

  gl.uniform3f(
    gl.getUniformLocation(sim.programs.splat, "u_color"),
    dyeColor[0] * strength,
    dyeColor[1] * strength,
    dyeColor[2] * strength
  );

  gl.bindTexture(gl.TEXTURE_2D, sim.density.read.tex);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.density.write.fb);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  sim.density.swap();
}

// Performs math computations for fluid simulation loop frame step
export function stepFluidSimulation(sim: FluidSimulation, dt: number) {
  const gl = sim.gl;
  gl.viewport(0, 0, sim.simWidth, sim.simHeight);
  gl.bindVertexArray(sim.quadVAO);

  const texelSizeX = 1.0 / sim.simWidth;
  const texelSizeY = 1.0 / sim.simHeight;

  // Dynamic parameters based on transition mode
  // Fluid mode: velocity dissipation ~0.98, density dissipation ~0.985
  // Static mode: velocity dissipation ~0.75, density dissipation ~0.88
  const velocityDissipation = sim.transition > 0.5 ? 0.75 : 0.98;
  const densityDissipation = sim.transition > 0.5 ? 0.88 : 0.985;

  // 1. Advect Velocity
  gl.useProgram(sim.programs.advect);
  gl.uniform2f(gl.getUniformLocation(sim.programs.advect, "u_texelSize"), texelSizeX, texelSizeY);
  gl.uniform1f(gl.getUniformLocation(sim.programs.advect, "u_dt"), dt);
  gl.uniform1f(gl.getUniformLocation(sim.programs.advect, "u_dissipation"), velocityDissipation);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sim.velocity.read.tex);
  gl.uniform1i(gl.getUniformLocation(sim.programs.advect, "u_velocity"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sim.velocity.read.tex);
  gl.uniform1i(gl.getUniformLocation(sim.programs.advect, "u_source"), 1);

  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.velocity.write.fb);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  sim.velocity.swap();

  // 2. Advect Density (Dye field)
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sim.velocity.read.tex);
  gl.uniform1i(gl.getUniformLocation(sim.programs.advect, "u_velocity"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sim.density.read.tex);
  gl.uniform1i(gl.getUniformLocation(sim.programs.advect, "u_source"), 1);
  gl.uniform1f(gl.getUniformLocation(sim.programs.advect, "u_dissipation"), densityDissipation);

  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.density.write.fb);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  sim.density.swap();

  // 3. Compute Divergence
  gl.useProgram(sim.programs.divergence);
  gl.uniform2f(gl.getUniformLocation(sim.programs.divergence, "u_texelSize"), texelSizeX, texelSizeY);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sim.velocity.read.tex);
  gl.uniform1i(gl.getUniformLocation(sim.programs.divergence, "u_velocity"), 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.divergence.fb);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // 4. Solve Jacobi Pressure
  gl.useProgram(sim.programs.pressure);
  gl.uniform2f(gl.getUniformLocation(sim.programs.pressure, "u_texelSize"), texelSizeX, texelSizeY);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sim.divergence.tex);
  gl.uniform1i(gl.getUniformLocation(sim.programs.pressure, "u_divergence"), 1);

  // Clear pressure buffer to stabilize solve
  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.pressure.read.fb);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Run Jacobi iterations (more iterations = more realistic/smooth flow simulation, fewer iterations = rougher/more angular solver)
  const iterations = sim.transition > 0.5 ? 8 : 24;
  for (let i = 0; i < iterations; i++) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sim.pressure.read.tex);
    gl.uniform1i(gl.getUniformLocation(sim.programs.pressure, "u_pressure"), 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.pressure.write.fb);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    sim.pressure.swap();
  }

  // 5. Subtract Gradient to enforce incompressible flow
  gl.useProgram(sim.programs.gradSubtract);
  gl.uniform2f(gl.getUniformLocation(sim.programs.gradSubtract, "u_texelSize"), texelSizeX, texelSizeY);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sim.pressure.read.tex);
  gl.uniform1i(gl.getUniformLocation(sim.programs.gradSubtract, "u_pressure"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sim.velocity.read.tex);
  gl.uniform1i(gl.getUniformLocation(sim.programs.gradSubtract, "u_velocity"), 1);

  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.velocity.write.fb);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  sim.velocity.swap();

  // 6. Draw density/dye buffer output directly onto screen viewport canvas
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.useProgram(sim.programs.display);
  gl.uniform1f(gl.getUniformLocation(sim.programs.display, "u_transition"), sim.transition);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sim.density.read.tex);
  gl.uniform1i(gl.getUniformLocation(sim.programs.display, "u_dye"), 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// Adapts Canvas sizes and simulation dynamic scaling ratios correctly
export function resizeFluidSimulation(sim: FluidSimulation) {
  const gl = sim.gl;
  const canvas = gl.canvas as HTMLCanvasElement;
  canvas.width = canvas.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;
  sim.aspectRatio = canvas.width / canvas.height;
}