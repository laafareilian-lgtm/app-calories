import {
  AuthenticationError,
  RateLimitError,
} from '@anthropic-ai/sdk'

const MSG_AUTH = `Clé API refusée (401). Si vous utilisez Vercel : vérifiez la variable VITE_ANTHROPIC_API_KEY dans le projet (Environnement → Production), sans espace en trop, puis redéployez. Sinon régénérez une clé sur console.anthropic.com.`

/** Message lisible pour l’utilisateur (déploiement Vercel, clé invalide, etc.). */
export function formatApiError(e: unknown): string {
  if (e instanceof AuthenticationError) {
    return MSG_AUTH
  }
  if (e instanceof RateLimitError) {
    return 'Trop de requêtes vers Anthropic. Réessayez dans quelques instants.'
  }
  if (e instanceof Error) {
    const msg = e.message
    if (
      /401/.test(msg) ||
      /authentication/i.test(msg) ||
      /Invalid API Key/i.test(msg)
    ) {
      return MSG_AUTH
    }
    return msg
  }
  return 'Une erreur est survenue.'
}
