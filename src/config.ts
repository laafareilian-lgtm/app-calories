/** Modèle Claude avec vision (photo de plat). Surchargeable via `.env.local` : VITE_ANTHROPIC_MODEL=... */
export const ANTHROPIC_MODEL =
  import.meta.env.VITE_ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514'

/** Définie dans `.env.local` : VITE_ANTHROPIC_API_KEY=… (non exposée dans l’interface) */
export const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''
