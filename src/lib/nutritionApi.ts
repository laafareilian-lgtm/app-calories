import Anthropic from '@anthropic-ai/sdk'
import { ANTHROPIC_MODEL } from '../config'
import type { NutritionEstimate } from '../types/nutrition'
import { extractJsonObject } from './extractJson'

const JSON_INSTRUCTION = `Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni texte autour.`

function normalizeEstimate(raw: Record<string, unknown>): NutritionEstimate {
  const num = (v: unknown, fallback = 0) =>
    typeof v === 'number' && !Number.isNaN(v) ? v : fallback
  const optNum = (v: unknown): number | null =>
    typeof v === 'number' && !Number.isNaN(v) ? v : null

  const items = Array.isArray(raw.items)
    ? raw.items
        .map((it) => {
          if (!it || typeof it !== 'object') return null
          const o = it as Record<string, unknown>
          const name = typeof o.name === 'string' ? o.name : ''
          const calories = num(o.calories, 0)
          if (!name) return null
          return { name, calories }
        })
        .filter(Boolean) as NutritionEstimate['items']
    : undefined

  return {
    calories: Math.round(num(raw.calories, 0)),
    protein_g: Math.round(num(raw.protein_g, 0) * 10) / 10,
    carbs_g: Math.round(num(raw.carbs_g, 0) * 10) / 10,
    fat_g: Math.round(num(raw.fat_g, 0) * 10) / 10,
    fiber_g: optNum(raw.fiber_g),
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    confidence:
      raw.confidence === 'low' ||
      raw.confidence === 'medium' ||
      raw.confidence === 'high'
        ? raw.confidence
        : undefined,
    items,
  }
}

function createClient(apiKey: string) {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  })
}

export async function estimateFromPhoto(
  apiKey: string,
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
): Promise<NutritionEstimate> {
  const client = createClient(apiKey)
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `Tu es un expert en estimation nutritionnelle à partir de photos de repas.
${JSON_INSTRUCTION}
Schéma attendu :
{"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number ou null,"summary":"court, en français","confidence":"low"|"medium"|"high","items":[{"name":"string","calories":number}]}
Si plusieurs aliments sont identifiables, remplis "items" avec une ligne par aliment approximatif. Sinon "items" peut être omis ou un seul élément.`,
          },
        ],
      },
    ],
  })
  const block = message.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error('Réponse vide du modèle.')
  }
  const raw = extractJsonObject<Record<string, unknown>>(block.text)
  return normalizeEstimate(raw)
}

export async function estimateFromFoodText(
  apiKey: string,
  foodName: string,
  quantity: string,
): Promise<NutritionEstimate> {
  const client = createClient(apiKey)
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Tu estimes les apports pour un aliment donné (bases courantes, portions standards).
Aliment : ${foodName.trim()}
Quantité : ${quantity.trim()}
${JSON_INSTRUCTION}
Schéma : {"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"fiber_g":number ou null,"summary":"court, en français","confidence":"low"|"medium"|"high"}`,
      },
    ],
  })
  const block = message.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error('Réponse vide du modèle.')
  }
  const raw = extractJsonObject<Record<string, unknown>>(block.text)
  return normalizeEstimate(raw)
}
