/** Extrait le premier objet JSON d'une réponse (bloc ```json ou brut). */
export function extractJsonObject<T>(text: string): T {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1].trim() : trimmed
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Réponse sans JSON exploitable.')
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T
}
