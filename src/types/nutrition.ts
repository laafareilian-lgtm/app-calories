export interface NutritionLineItem {
  name: string
  calories: number
}

export interface NutritionEstimate {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  summary: string
  confidence?: 'low' | 'medium' | 'high'
  items?: NutritionLineItem[]
}
