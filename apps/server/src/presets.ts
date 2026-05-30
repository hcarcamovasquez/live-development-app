/**
 * Presets de estilo para la librería de componentes de landing.
 *
 * Fuente de verdad ÚNICA compartida por:
 *  - la API (`GET/POST /api/agent/style`) que serializa los tokens a `tokens.css`,
 *  - el system prompt del agente (la `description` define el "vibe" a respetar).
 *
 * Cada preset define un design system completo: pareja tipográfica (Google Fonts),
 * paleta, radios, sombras y espaciado. Los componentes generados deben CONSUMIR las
 * variables CSS (`var(--color-accent)`, `var(--font-display)`, …), nunca hardcodear.
 */

export type Preset = {
  id: string
  label: string
  /** Se inyecta en el system prompt: tono, layout, densidad, imágenes, movimiento. */
  description: string
  /** URL(s) de Google Fonts a importar en tokens.css. */
  fontLinks: string[]
  /** Pares nombre→valor CSS que se vuelcan en :root. */
  tokens: Record<string, string>
}

/** Pareja tipográfica intercambiable (override opcional del usuario). */
export type FontPair = {
  id: string
  label: string
  display: string
  text: string
  link: string
}

export const FONT_PAIRS: FontPair[] = [
  {
    id: 'grotesk',
    label: 'Space Grotesk + Outfit',
    display: "'Space Grotesk', sans-serif",
    text: "'Outfit', sans-serif",
    link: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap',
  },
  {
    id: 'editorial',
    label: 'Playfair Display + Lora',
    display: "'Playfair Display', serif",
    text: "'Lora', serif",
    link: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Playfair+Display:wght@500;600;700;800&display=swap',
  },
  {
    id: 'serif-sans',
    label: 'Cormorant + Jost',
    display: "'Cormorant Garamond', serif",
    text: "'Jost', sans-serif",
    link: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Jost:wght@300;400;500;600&display=swap',
  },
  {
    id: 'mono',
    label: 'Space Mono + IBM Plex Mono',
    display: "'Space Mono', monospace",
    text: "'IBM Plex Mono', monospace",
    link: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap',
  },
  {
    id: 'neo',
    label: 'Sora + Manrope',
    display: "'Sora', sans-serif",
    text: "'Manrope', sans-serif",
    link: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@400;600;700;800&display=swap',
  },
  {
    id: 'futuristic',
    label: 'Orbitron + Rajdhani',
    display: "'Orbitron', sans-serif",
    text: "'Rajdhani', sans-serif",
    link: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800&family=Rajdhani:wght@400;500;600;700&display=swap',
  },
]

export const PRESETS: Preset[] = [
  {
    id: 'minimalista',
    label: 'Minimalista',
    description:
      'Minimalismo refinado: monocromo cálido, muchísimo espacio negativo, ' +
      'tipografía display contenida, jerarquía por tamaño y peso (no por color). ' +
      'Layouts limpios y alineados a una rejilla amplia; acento casi imperceptible. ' +
      'Movimiento sutil: fades y desplazamientos cortos.',
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap',
    ],
    tokens: {
      'font-display': "'Space Grotesk', sans-serif",
      'font-text': "'Outfit', sans-serif",
      'color-bg': '#fafaf8',
      'color-bg-2': '#f1f0ec',
      'color-surface': '#ffffff',
      'color-text': '#141410',
      'color-muted': '#6b6b62',
      'color-accent': '#141410',
      'color-accent-ink': '#ffffff',
      'color-border': '#e6e5df',
      radius: '6px',
      shadow: '0 1px 2px rgba(20,20,16,0.04)',
      space: '1rem',
      'max-width': '1120px',
    },
  },
  {
    id: 'brutalista',
    label: 'Brutalista',
    description:
      'Neo-brutalismo: alto contraste blanco/negro, bordes gruesos, sombras ' +
      'duras desplazadas (4px 4px 0), cero radios, tipografía mono o display ' +
      'pesada. Bloques rotundos, acento saturado (naranja). Composición ' +
      'descarada y asimétrica; hover con desplazamiento físico de la sombra.',
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap',
    ],
    tokens: {
      'font-display': "'Space Mono', monospace",
      'font-text': "'IBM Plex Mono', monospace",
      'color-bg': '#ffffff',
      'color-bg-2': '#f3f3f3',
      'color-surface': '#ffffff',
      'color-text': '#0a0a0a',
      'color-muted': '#444444',
      'color-accent': '#ff4f00',
      'color-accent-ink': '#ffffff',
      'color-border': '#0a0a0a',
      radius: '0px',
      shadow: '4px 4px 0 #0a0a0a',
      space: '1rem',
      'max-width': '1160px',
    },
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description:
      'Editorial de revista: serif display elegante, columnas, reglas finas, ' +
      'numeración, cuidado tipográfico extremo (interlineado, tracking). Paleta ' +
      'papel crema con tinta y un rojo profundo de acento. Imágenes a sangre, ' +
      'mucho ritmo vertical. Movimiento sobrio.',
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Playfair+Display:wght@500;600;700;800&display=swap',
    ],
    tokens: {
      'font-display': "'Playfair Display', serif",
      'font-text': "'Lora', serif",
      'color-bg': '#f7f4ef',
      'color-bg-2': '#efe9e0',
      'color-surface': '#fffdf8',
      'color-text': '#1c1a17',
      'color-muted': '#6f675d',
      'color-accent': '#8a1c1c',
      'color-accent-ink': '#fffdf8',
      'color-border': '#ddd5c8',
      radius: '2px',
      shadow: '0 8px 30px rgba(28,26,23,0.08)',
      space: '1.1rem',
      'max-width': '1080px',
    },
  },
  {
    id: 'lujo',
    label: 'Lujo',
    description:
      'Lujo oscuro: fondo casi negro, oro/champán como acento, serif display ' +
      'fina y aireada, mucho espacio, detalles delicados (filetes dorados, ' +
      'mayúsculas con tracking amplio). Sensación premium y silenciosa. ' +
      'Reveals lentos y elegantes.',
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Jost:wght@300;400;500;600&display=swap',
    ],
    tokens: {
      'font-display': "'Cormorant Garamond', serif",
      'font-text': "'Jost', sans-serif",
      'color-bg': '#0b0b0d',
      'color-bg-2': '#121216',
      'color-surface': '#15151a',
      'color-text': '#f0ece4',
      'color-muted': '#9a958c',
      'color-accent': '#c8a96a',
      'color-accent-ink': '#0b0b0d',
      'color-border': '#2a2a31',
      radius: '3px',
      shadow: '0 20px 60px rgba(0,0,0,0.45)',
      space: '1.2rem',
      'max-width': '1100px',
    },
  },
  {
    id: 'retro-futurista',
    label: 'Retro-futurista',
    description:
      'Retro-futurista / synthwave: fondo profundo violeta-azulado, acentos neón ' +
      '(cian/magenta) con glow, tipografía display tecnológica, rejillas y líneas ' +
      'de horizonte, brillos y reflejos. Movimiento llamativo: glows pulsantes, ' +
      'parallax sutil. Atmósfera nocturna y eléctrica.',
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800&family=Rajdhani:wght@400;500;600;700&display=swap',
    ],
    tokens: {
      'font-display': "'Orbitron', sans-serif",
      'font-text': "'Rajdhani', sans-serif",
      'color-bg': '#07060f',
      'color-bg-2': '#100b24',
      'color-surface': '#0f0d1f',
      'color-text': '#e6e6ff',
      'color-muted': '#8f8bc0',
      'color-accent': '#00f0ff',
      'color-accent-ink': '#07060f',
      'color-border': '#2a2350',
      radius: '8px',
      shadow: '0 0 40px rgba(0,240,255,0.25)',
      space: '1.1rem',
      'max-width': '1160px',
    },
  },
  {
    id: 'glass',
    label: 'Glass',
    description:
      'Glassmorphism moderno: fondo oscuro con malla de gradiente, tarjetas ' +
      'translúcidas con desenfoque (backdrop-filter), bordes finos luminosos, ' +
      'acento azul vivo. Sensación de profundidad por capas. Movimiento suave: ' +
      'flotación y reveals escalonados.',
    fontLinks: [
      'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@400;600;700;800&display=swap',
    ],
    tokens: {
      'font-display': "'Sora', sans-serif",
      'font-text': "'Manrope', sans-serif",
      'color-bg': '#0a0e1a',
      'color-bg-2': '#111a33',
      'color-surface': 'rgba(255,255,255,0.06)',
      'color-text': '#eef1f8',
      'color-muted': '#9aa6c2',
      'color-accent': '#6ea8fe',
      'color-accent-ink': '#0a0e1a',
      'color-border': 'rgba(255,255,255,0.14)',
      radius: '16px',
      shadow: '0 16px 50px rgba(0,0,0,0.4)',
      space: '1.1rem',
      'max-width': '1140px',
    },
  },
]

/** Estilo persistido por proyecto (en `style.json`). */
export type StyleConfig = {
  preset: string | null
  tweak: string
  accent: string | null
  fontPair: string | null
}

export const DEFAULT_STYLE: StyleConfig = {
  preset: null,
  tweak: '',
  accent: null,
  fontPair: null,
}

export function getPreset(id: string | null | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}

/** Texto plano (#rrggbb) → luminancia relativa, para decidir tinta del acento. */
function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  // luminancia perceptual aproximada
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#0a0a0a' : '#ffffff'
}

/**
 * Genera el contenido de `src/styles/tokens.css` para un estilo dado.
 * Si no hay preset (estilo por defecto), usa un design system neutro.
 * Aplica overrides opcionales de acento (hex) y pareja tipográfica.
 */
export function renderTokensCss(style: StyleConfig): string {
  const preset = getPreset(style.preset)
  const tokens: Record<string, string> = preset
    ? { ...preset.tokens }
    : { ...NEUTRAL_TOKENS }
  const links: string[] = preset ? [...preset.fontLinks] : [...NEUTRAL_LINKS]

  // Override de pareja tipográfica
  if (style.fontPair) {
    const fp = FONT_PAIRS.find((f) => f.id === style.fontPair)
    if (fp) {
      tokens['font-display'] = fp.display
      tokens['font-text'] = fp.text
      links.length = 0
      links.push(fp.link)
    }
  }

  // Override de acento
  if (style.accent && /^#?[0-9a-f]{6}$/i.test(style.accent.trim())) {
    const hex = style.accent.trim().startsWith('#') ? style.accent.trim() : `#${style.accent.trim()}`
    tokens['color-accent'] = hex
    tokens['color-accent-ink'] = inkFor(hex)
  }

  const presetLabel = preset ? preset.label : 'Neutro'
  const vars = Object.entries(tokens)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n')
  const imports = links.map((l) => `@import url('${l}');`).join('\n')

  return `/* Design system de la librería — estilo: ${presetLabel}.
   Generado por el selector ✦ AI (POST /api/agent/style). Los componentes
   deben consumir estas variables (var(--color-accent), var(--font-display)…). */
${imports}

:root {
${vars}
}

* { box-sizing: border-box; }

html, body { margin: 0; padding: 0; }

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-text);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, h4 { font-family: var(--font-display); margin: 0; }
`
}

// Design system neutro (proyecto recién creado, sin estilo elegido aún).
const NEUTRAL_TOKENS: Record<string, string> = {
  'font-display': "'Space Grotesk', system-ui, sans-serif",
  'font-text': "'Outfit', system-ui, sans-serif",
  'color-bg': '#0f1115',
  'color-bg-2': '#161a21',
  'color-surface': '#181c23',
  'color-text': '#e7eaf0',
  'color-muted': '#8b94a3',
  'color-accent': '#8b8f98',
  'color-accent-ink': '#0f1115',
  'color-border': '#262b34',
  radius: '10px',
  shadow: '0 8px 30px rgba(0,0,0,0.3)',
  space: '1rem',
  'max-width': '1120px',
}
const NEUTRAL_LINKS: string[] = [
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap',
]
