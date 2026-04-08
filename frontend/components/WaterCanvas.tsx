'use client'
import { useEffect, useRef } from 'react'

/* ─── Vertex shader (shared) ───────────────────────────────────────────────── */
const VERT = `
attribute vec2 a;
varying vec2 uv;
void main(){ gl_Position=vec4(a,0.0,1.0); uv=a*0.5+0.5; }
`

/* ─── Wave propagation update shader ──────────────────────────────────────── */
const UPDATE = `
precision highp float;
uniform sampler2D tC, tP;
uniform vec2 px;
uniform vec2 drop;
uniform float str;

void main(){
  vec2 uv = gl_FragCoord.xy * px;
  float c = texture2D(tC, uv).r;
  float p = texture2D(tP, uv).r;
  float n = texture2D(tC, uv + vec2(0.0,  px.y)).r;
  float s = texture2D(tC, uv - vec2(0.0,  px.y)).r;
  float e = texture2D(tC, uv + vec2(px.x, 0.0 )).r;
  float w = texture2D(tC, uv - vec2(px.x, 0.0 )).r;
  float v = (n+s+e+w)*0.5 - p;
  v *= 0.982;
  if(str>0.0){
    float d = length(uv - drop);
    v += str * max(0.0, 0.05 - d) * 22.0;
  }
  gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
}
`

/* ─── 3D render shader — normals + specular + caustics, สีเข้มตาม brand ───── */
const RENDER = `
precision highp float;
uniform sampler2D tW;
uniform vec2 px;
varying vec2 uv;

void main(){
  /* ── normals from height field ── */
  float hN = texture2D(tW, uv + vec2(0.0,   px.y*1.5)).r;
  float hS = texture2D(tW, uv - vec2(0.0,   px.y*1.5)).r;
  float hE = texture2D(tW, uv + vec2(px.x*1.5, 0.0  )).r;
  float hW = texture2D(tW, uv - vec2(px.x*1.5, 0.0  )).r;
  vec3 norm = normalize(vec3((hW-hE)*5.0, (hN-hS)*5.0, 1.0));

  /* ── brand gradient: #0f172a → #1e3a8a → #0ea5e9 (diagonal, ซ้ายล่าง→ขวาบน) ── */
  vec2 rUV  = clamp(uv + norm.xy * 0.03, 0.0, 1.0);
  vec3 dark = vec3(0.059, 0.090, 0.176);   // #0f172a
  vec3 navy = vec3(0.118, 0.227, 0.541);   // #1e3a8a
  vec3 cyan = vec3(0.055, 0.647, 0.914);   // #0ea5e9
  float t = clamp(rUV.x * 0.55 + rUV.y * 0.45, 0.0, 1.0);
  vec3 base = t < 0.5
    ? mix(dark, navy, t*2.0)
    : mix(navy, cyan, (t-0.5)*2.0);

  /* ── subtle normal-based shading (keeps base color rich) ── */
  base += norm.x * vec3(0.025, 0.04, 0.08);
  base += norm.y * vec3(0.020, 0.03, 0.06);

  /* ── specular (tight highlight, doesn't wash base) ── */
  vec3 eye = vec3(0.0, 0.0, 1.0);
  vec3 L   = normalize(vec3(0.5, 0.9, 1.3));
  vec3 H   = normalize(L + eye);
  float sp = pow(max(0.0, dot(norm, H)), 96.0) * 0.70;

  /* ── caustic shimmer (blue-white, subtle) ── */
  float caustic = pow(max(0.0, 1.0 - length(norm.xy)*5.0), 5.0) * 0.14;

  /* ── compose: base stays dominant ── */
  vec3 col = base;
  col += sp      * vec3(0.70, 0.88, 1.00);
  col += caustic * vec3(0.30, 0.60, 1.00);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

/* ─── Component ───────────────────────────────────────────────────────────── */
export default function WaterCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    /* ── Try WebGL2 first (native float FB), then WebGL1 ── */
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null =
      canvas.getContext('webgl2') as WebGL2RenderingContext | null

    const isWebGL2 = !!gl
    if (!gl) {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false }) as WebGLRenderingContext | null
      if (!gl) return
      if (!gl.getExtension('OES_texture_float')) return
    } else {
      if (!gl.getExtension('EXT_color_buffer_float')) return
    }

    const G = gl  // alias to keep TS happy

    /* ── helpers ── */
    function sh(type: number, src: string) {
      const s = G.createShader(type)!
      G.shaderSource(s, src)
      G.compileShader(s)
      return s
    }
    function prog(vs: string, fs: string) {
      const p = G.createProgram()!
      G.attachShader(p, sh(G.VERTEX_SHADER, vs))
      G.attachShader(p, sh(G.FRAGMENT_SHADER, fs))
      G.linkProgram(p)
      return p
    }
    function u1i(p: WebGLProgram, n: string, v: number) { G.uniform1i(G.getUniformLocation(p, n), v) }
    function u1f(p: WebGLProgram, n: string, v: number) { G.uniform1f(G.getUniformLocation(p, n), v) }
    function u2f(p: WebGLProgram, n: string, x: number, y: number) { G.uniform2f(G.getUniformLocation(p, n), x, y) }

    const updProg = prog(VERT, UPDATE)
    const renProg = prog(VERT, RENDER)

    /* ── full-screen quad ── */
    const quad = G.createBuffer()!
    G.bindBuffer(G.ARRAY_BUFFER, quad)
    G.bufferData(G.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), G.STATIC_DRAW)

    function bindQuad(p: WebGLProgram) {
      G.bindBuffer(G.ARRAY_BUFFER, quad)
      const loc = G.getAttribLocation(p, 'a')
      G.enableVertexAttribArray(loc)
      G.vertexAttribPointer(loc, 2, G.FLOAT, false, 0, 0)
    }

    /* ── ping-pong float textures ── */
    const S = 384
    const texType = G.FLOAT

    const texs: WebGLTexture[] = []
    const fbos: WebGLFramebuffer[] = []
    for (let i = 0; i < 3; i++) {
      const tex = G.createTexture()!
      G.bindTexture(G.TEXTURE_2D, tex)
      if (isWebGL2) {
        const gl2 = G as WebGL2RenderingContext
        gl2.texImage2D(G.TEXTURE_2D, 0, gl2.R32F, S, S, 0, gl2.RED, texType, null)
      } else {
        G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, S, S, 0, G.RGBA, texType, null)
      }
      G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MIN_FILTER, G.LINEAR)
      G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MAG_FILTER, G.LINEAR)
      G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_S, G.CLAMP_TO_EDGE)
      G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_T, G.CLAMP_TO_EDGE)
      texs.push(tex)

      const fbo = G.createFramebuffer()!
      G.bindFramebuffer(G.FRAMEBUFFER, fbo)
      G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, tex, 0)

      // Verify FBO is complete
      if (G.checkFramebufferStatus(G.FRAMEBUFFER) !== G.FRAMEBUFFER_COMPLETE) {
        G.bindFramebuffer(G.FRAMEBUFFER, null)
        return  // float FBO not supported — bail out gracefully
      }
      fbos.push(fbo)
    }
    G.bindFramebuffer(G.FRAMEBUFFER, null)

    let p = 0, c = 1, n = 2
    let drop = [0.5, 0.5] as [number, number]
    let str  = 0
    let raf  = 0

    /* ── resize ── */
    function resize() {
      canvas!.width  = window.innerWidth
      canvas!.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    /* ── auto ripples so water is always alive ── */
    let autoTimer = 0
    function scheduleAuto() {
      autoTimer = window.setTimeout(() => {
        drop = [Math.random(), Math.random()]
        str  = 0.15 + Math.random() * 0.2
        scheduleAuto()
      }, 800 + Math.random() * 1200)
    }
    scheduleAuto()

    /* ── main loop ── */
    function tick() {
      // Update simulation
      G.bindFramebuffer(G.FRAMEBUFFER, fbos[n])
      G.viewport(0, 0, S, S)
      G.useProgram(updProg)
      bindQuad(updProg)
      G.activeTexture(G.TEXTURE0); G.bindTexture(G.TEXTURE_2D, texs[c]); u1i(updProg, 'tC', 0)
      G.activeTexture(G.TEXTURE1); G.bindTexture(G.TEXTURE_2D, texs[p]); u1i(updProg, 'tP', 1)
      u2f(updProg, 'px', 1/S, 1/S)
      u2f(updProg, 'drop', drop[0], drop[1])
      u1f(updProg, 'str', str)
      G.drawArrays(G.TRIANGLE_STRIP, 0, 4)
      str *= 0.68

      // Render to screen
      G.bindFramebuffer(G.FRAMEBUFFER, null)
      G.viewport(0, 0, canvas!.width, canvas!.height)
      G.useProgram(renProg)
      bindQuad(renProg)
      G.activeTexture(G.TEXTURE0); G.bindTexture(G.TEXTURE_2D, texs[n]); u1i(renProg, 'tW', 0)
      u2f(renProg, 'px', 1/S, 1/S)
      G.drawArrays(G.TRIANGLE_STRIP, 0, 4)

      const tmp = p; p = c; c = n; n = tmp
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    /* ── input ── */
    let lastT = 0
    function setDrop(x: number, y: number, s: number) {
      const r = canvas!.getBoundingClientRect()
      drop = [(x - r.left) / r.width, 1 - (y - r.top) / r.height]
      str  = s
    }
    function onMove(e: MouseEvent) {
      const now = Date.now(); if (now - lastT < 20) return; lastT = now
      setDrop(e.clientX, e.clientY, 0.28)
    }
    function onClick(e: MouseEvent)  { setDrop(e.clientX, e.clientY, 1.1) }
    function onTouch(e: TouchEvent) {
      const t = e.touches[0]; if (t) setDrop(t.clientX, t.clientY, 0.65)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('click', onClick)
    window.addEventListener('touchmove', onTouch, { passive: true })
    window.addEventListener('touchstart', onTouch, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(autoTimer)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('click', onClick)
      window.removeEventListener('touchmove', onTouch)
      window.removeEventListener('touchstart', onTouch)
      texs.forEach(t => G.deleteTexture(t))
      fbos.forEach(f => G.deleteFramebuffer(f))
    }
  }, [])

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  )
}
