import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { ANTHROPIC_API_KEY } from './config'
import {
  addJournalEntry,
  compareDateKeys,
  DAILY_CALORIE_GOAL,
  getDayTotal,
  getTodayDateKey,
  loadJournal,
  parseDateKey,
  removeJournalEntry,
  saveJournal,
  shiftDateKey,
  type JournalStore,
} from './lib/dailyJournal'
import { formatApiError } from './lib/formatApiError'
import { estimateFromFoodText, estimateFromPhoto } from './lib/nutritionApi'
import type { NutritionEstimate } from './types/nutrition'
import './App.css'

type Mode = 'photo' | 'food'

const ACCEPT_IMAGES = 'image/jpeg,image/png,image/gif,image/webp'

function fileToVisionParts(file: File): Promise<{
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}> {
  return new Promise((resolve, reject) => {
    const t = file.type.toLowerCase()
    if (
      t !== 'image/jpeg' &&
      t !== 'image/png' &&
      t !== 'image/gif' &&
      t !== 'image/webp'
    ) {
      reject(
        new Error(
          'Format non pris en charge. Utilisez JPEG, PNG, GIF ou WebP.',
        ),
      )
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Lecture du fichier impossible.'))
        return
      }
      const base64 = result.split(',')[1]
      if (!base64) {
        reject(new Error('Image invalide.'))
        return
      }
      resolve({
        base64,
        mediaType: t as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      })
    }
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.readAsDataURL(file)
  })
}

function MacroRing({
  label,
  value,
  unit,
  color,
}: {
  label: string
  value: number
  unit: string
  color: string
}) {
  return (
    <div
      className="macro-ring"
      style={{ '--macro-color': color } as CSSProperties}
    >
      <div className="macro-ring__value">
        {value}
        <span className="macro-ring__unit">{unit}</span>
      </div>
      <div className="macro-ring__label">{label}</div>
    </div>
  )
}

function ResultCard({
  data,
  onAddToJournal,
}: {
  data: NutritionEstimate
  onAddToJournal?: () => void
}) {
  return (
    <article className="result-card" aria-live="polite">
      <div className="result-card__kcal">
        <span className="result-card__kcal-num">{data.calories}</span>
        <span className="result-card__kcal-unit">kcal</span>
      </div>
      <div className="result-card__macros">
        <MacroRing
          label="Protéines"
          value={data.protein_g}
          unit="g"
          color="var(--macro-protein)"
        />
        <MacroRing
          label="Glucides"
          value={data.carbs_g}
          unit="g"
          color="var(--macro-carbs)"
        />
        <MacroRing
          label="Lipides"
          value={data.fat_g}
          unit="g"
          color="var(--macro-fat)"
        />
      </div>
      {data.fiber_g != null && (
        <p className="result-card__fiber">Fibres · {data.fiber_g} g</p>
      )}
      {data.items && data.items.length > 0 && (
        <ul className="result-card__items">
          {data.items.map((it) => (
            <li key={it.name + it.calories}>
              <span>{it.name}</span>
              <span>{it.calories} kcal</span>
            </li>
          ))}
        </ul>
      )}
      <p className="result-card__summary">{data.summary}</p>
      {data.confidence && (
        <p className="result-card__confidence">
          Fiabilité estimée :{' '}
          {data.confidence === 'high'
            ? 'élevée'
            : data.confidence === 'medium'
              ? 'moyenne'
              : 'faible'}
        </p>
      )}
      {onAddToJournal && (
        <div className="result-card__add">
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={onAddToJournal}
          >
            Ajouter au journal du jour (+{data.calories} kcal)
          </button>
        </div>
      )}
    </article>
  )
}

export default function App() {
  const baseId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>('photo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<NutritionEstimate | null>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)

  const [foodName, setFoodName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [dragActive, setDragActive] = useState(false)

  const [journal, setJournal] = useState<JournalStore>(() => loadJournal())
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    getTodayDateKey(),
  )

  const actualToday = getTodayDateKey()
  const isViewingToday = selectedDateKey === actualToday

  const dayTotal = useMemo(
    () => getDayTotal(journal, selectedDateKey),
    [journal, selectedDateKey],
  )
  const progressPct = Math.min(
    100,
    (dayTotal / DAILY_CALORIE_GOAL) * 100,
  )
  const overGoal = dayTotal > DAILY_CALORIE_GOAL

  const canAnalyzePhoto = useMemo(
    () => Boolean(ANTHROPIC_API_KEY.trim() && imageFile && !busy),
    [imageFile, busy],
  )

  const canAnalyzeFood = useMemo(
    () =>
      Boolean(
        ANTHROPIC_API_KEY.trim() &&
          foodName.trim() &&
          quantity.trim() &&
          !busy,
      ),
    [foodName, quantity, busy],
  )

  const onPickFile = useCallback((file: File | null) => {
    setError(null)
    setResult(null)
    setImageFile(file)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return file ? URL.createObjectURL(file) : null
    })
  }, [])

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null
      onPickFile(f)
    },
    [onPickFile],
  )

  const analyzePhoto = useCallback(async () => {
    const key = ANTHROPIC_API_KEY.trim()
    if (!key || !imageFile) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const { base64, mediaType } = await fileToVisionParts(imageFile)
      const data = await estimateFromPhoto(key, base64, mediaType)
      setResult(data)
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setBusy(false)
    }
  }, [imageFile])

  const analyzeFood = useCallback(async () => {
    const key = ANTHROPIC_API_KEY.trim()
    if (!key || !foodName.trim() || !quantity.trim()) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const data = await estimateFromFoodText(
        key,
        foodName.trim(),
        quantity.trim(),
      )
      setResult(data)
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setBusy(false)
    }
  }, [foodName, quantity])

  const addCurrentResultToJournal = useCallback(() => {
    if (!result) return
    let label =
      result.summary.trim().slice(0, 120) || 'Repas estimé'
    if (mode === 'food' && foodName.trim()) {
      label = `${foodName.trim()} — ${quantity.trim()}`
    } else if (mode === 'photo') {
      label = `Photo · ${result.summary.trim().slice(0, 100) || 'estimation'}`
    }
    setJournal((prev) => {
      const next = addJournalEntry(prev, selectedDateKey, result.calories, label)
      saveJournal(next)
      return next
    })
  }, [result, mode, foodName, quantity, selectedDateKey])

  const removeEntry = useCallback((id: string) => {
    setJournal((prev) => {
      const next = removeJournalEntry(prev, selectedDateKey, id)
      saveJournal(next)
      return next
    })
  }, [selectedDateKey])

  const tabPhotoId = `${baseId}-tab-photo`
  const tabFoodId = `${baseId}-tab-food`
  const panelPhotoId = `${baseId}-panel-photo`
  const panelFoodId = `${baseId}-panel-food`

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo" aria-hidden />
          <div>
            <h1 className="app__title">CalTrack</h1>
            <p className="app__tagline">
              Estimez calories et macros — photo ou saisie manuelle
            </p>
          </div>
        </div>
      </header>

      <section
        className="daily-tracker"
        aria-labelledby="daily-heading"
      >
        <div className="daily-tracker__nav">
          <button
            type="button"
            className="daily-nav-btn"
            onClick={() =>
              setSelectedDateKey((k) => shiftDateKey(k, -1))
            }
            aria-label="Jour précédent"
          >
            ‹ Précédent
          </button>
          <button
            type="button"
            className="daily-nav-btn"
            disabled={compareDateKeys(selectedDateKey, actualToday) >= 0}
            onClick={() =>
              setSelectedDateKey((k) => shiftDateKey(k, 1))
            }
            aria-label="Jour suivant"
          >
            Suivant ›
          </button>
        </div>
        <div className="daily-tracker__head">
          <h2 id="daily-heading" className="daily-tracker__title">
            {isViewingToday ? 'Objectif du jour' : 'Récapitulatif'}
          </h2>
          <p className="daily-tracker__subtitle">
            {parseDateKey(selectedDateKey).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {isViewingToday ? (
              <span className="daily-tracker__badge">Aujourd’hui</span>
            ) : null}
          </p>
          {!isViewingToday && (
            <button
              type="button"
              className="daily-tracker__today-link"
              onClick={() => setSelectedDateKey(getTodayDateKey())}
            >
              Revenir à aujourd’hui
            </button>
          )}
        </div>
        <div className="daily-tracker__nums">
          <span className="daily-tracker__current">{dayTotal}</span>
          <span className="daily-tracker__sep">/</span>
          <span className="daily-tracker__goal">{DAILY_CALORIE_GOAL}</span>
          <span className="daily-tracker__unit">kcal</span>
        </div>
        <div
          className="daily-progress"
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression vers l'objectif calorique"
        >
          <div
            className={`daily-progress__fill ${overGoal ? 'daily-progress__fill--over' : ''}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {overGoal && (
          <p className="daily-tracker__over">
            Objectif dépassé de {dayTotal - DAILY_CALORIE_GOAL} kcal
          </p>
        )}
        {!overGoal && dayTotal > 0 && (
          <p className="daily-tracker__remain">
            Il reste environ {Math.max(0, DAILY_CALORIE_GOAL - dayTotal)}{' '}
            kcal
          </p>
        )}
        {dayTotal > 0 && (
          <ul className="daily-tracker__list">
            {(journal.days[selectedDateKey] ?? []).map((e) => (
              <li key={e.id} className="daily-tracker__item">
                <span className="daily-tracker__item-label">{e.label}</span>
                <span className="daily-tracker__item-kcal">{e.calories}</span>
                <button
                  type="button"
                  className="daily-tracker__remove"
                  aria-label={`Retirer ${e.label}`}
                  onClick={() => removeEntry(e.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="daily-tracker__hint">
          Données enregistrées sur cet appareil (navigateur).
        </p>
      </section>

      <div className="tabs">
        <div
          className="tabs__list"
          role="tablist"
          aria-label="Mode d'estimation"
        >
          <button
            type="button"
            role="tab"
            id={tabPhotoId}
            aria-selected={mode === 'photo'}
            aria-controls={panelPhotoId}
            className={`tabs__tab ${mode === 'photo' ? 'tabs__tab--active' : ''}`}
            onClick={() => {
              setMode('photo')
              setError(null)
            }}
          >
            Photo du plat
          </button>
          <button
            type="button"
            role="tab"
            id={tabFoodId}
            aria-selected={mode === 'food'}
            aria-controls={panelFoodId}
            className={`tabs__tab ${mode === 'food' ? 'tabs__tab--active' : ''}`}
            onClick={() => {
              setMode('food')
              setError(null)
            }}
          >
            Aliment + quantité
          </button>
        </div>

        <div
          id={panelPhotoId}
          role="tabpanel"
          aria-labelledby={tabPhotoId}
          hidden={mode !== 'photo'}
          className="tabs__panel"
        >
          <p className="panel__intro">
            Prenez une photo nette du repas (lumière naturelle idéale). Le
            résultat reste une estimation.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_IMAGES}
            capture="environment"
            className="visually-hidden"
            onChange={onFileChange}
          />
          <div
            className={`dropzone ${previewUrl ? 'dropzone--filled' : ''} ${dragActive ? 'dropzone--drag' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragActive(false)
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              const f = e.dataTransfer.files?.[0]
              if (f) onPickFile(f)
            }}
            role="button"
            tabIndex={0}
            aria-label="Choisir ou prendre une photo"
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Aperçu du plat"
                className="dropzone__img"
              />
            ) : (
              <div className="dropzone__placeholder">
                <span className="dropzone__icon" aria-hidden />
                <span className="dropzone__text">
                  Touch pour appareil photo ou glisser-déposer
                </span>
                <span className="dropzone__formats">JPEG, PNG, WebP, GIF</span>
              </div>
            )}
          </div>
          <div className="panel__actions">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!previewUrl || busy}
              onClick={() => {
                onPickFile(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            >
              Retirer
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canAnalyzePhoto}
              onClick={analyzePhoto}
            >
              {busy && mode === 'photo' ? 'Analyse…' : 'Analyser la photo'}
            </button>
          </div>
        </div>

        <div
          id={panelFoodId}
          role="tabpanel"
          aria-labelledby={tabFoodId}
          hidden={mode !== 'food'}
          className="tabs__panel"
        >
          <p className="panel__intro">
            Indiquez l&apos;aliment et la portion (ex. « 120 g », « 1 bol »,
            « 2 tranches »).
          </p>
          <label className="field">
            <span className="field__label">Aliment</span>
            <input
              className="field__input"
              type="text"
              placeholder="ex. riz basmati cuit, yaourt grec, pomme…"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span className="field__label">Quantité</span>
            <input
              className="field__input"
              type="text"
              placeholder="ex. 150 g, 1 tasse, 2 œufs"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="panel__actions panel__actions--single">
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={!canAnalyzeFood}
              onClick={analyzeFood}
            >
              {busy && mode === 'food' ? 'Calcul…' : 'Estimer les macros'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      {result && (
        <ResultCard
          data={result}
          onAddToJournal={addCurrentResultToJournal}
        />
      )}

      <footer className="app__footer">
        <p>Estimations indicatives — pas un avis médical ou diététique.</p>
      </footer>
    </div>
  )
}
