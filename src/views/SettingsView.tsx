import { Download, Lock, RotateCcw, Upload } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Avatar, RoleBadge } from '../components/Avatar'
import type { ScoringWeights } from '../domain/types'
import { btnDanger, btnSecondary, inputCls, SCORE_COLORS } from '../lib/meta'
import { useAppStore } from '../store/useAppStore'

function downloadJson(json: string) {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `relay-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function SettingsView() {
  const settings = useAppStore((s) => s.settings)
  const members = useAppStore((s) => s.members)
  const me = useAppStore((s) => s.members.find((m) => m.id === s.currentUserId))
  const { updateSettings, exportData, importData, resetDemo } = useAppStore.getState()
  const isLead = me?.role === 'lead'
  const fileRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const w = settings.weights
  const sum = w.rice + w.votes + w.revenue || 1
  const setWeight = (k: keyof ScoringWeights, pct: number) => updateSettings({ weights: { ...w, [k]: pct / 100 } })

  const onImport = async (file: File) => {
    const res = importData(await file.text())
    setNotice(res.ok ? { ok: true, text: 'Workspace restored from backup.' } : { ok: false, text: res.reason })
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-slate-200 bg-white px-8 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Workspace configuration for prioritization, flow and data.</p>
      </header>
      <div className="mx-auto max-w-3xl space-y-6 px-8 py-6">
        <Section
          title="Prioritization model"
          description="How the feature request score is weighted. Weights are normalized, so they always add up to 100%."
          locked={!isLead}
        >
          {(
            [
              ['rice', 'RICE', 'Reach × Impact × Confidence ÷ Effort'],
              ['votes', 'Team votes', 'Points spent by teammates from their budget'],
              ['revenue', 'Revenue at stake', 'ARR from customers asking for it'],
            ] as const
          ).map(([k, label, hint]) => (
            <div key={k} className="grid grid-cols-[10rem_1fr_4rem] items-center gap-4 py-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <span className={`h-2 w-2 rounded-full ${SCORE_COLORS[k]}`} />
                  {label}
                </div>
                <div className="text-xs text-slate-400">{hint}</div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={!isLead}
                value={Math.round(w[k] * 100)}
                onChange={(e) => setWeight(k, Number(e.target.value))}
                aria-label={`${label} weight`}
                className="accent-indigo-600"
              />
              <span className="text-right text-sm font-semibold tabular-nums text-slate-700">{Math.round((100 * w[k]) / sum)}%</span>
            </div>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
            <NumberField label="Vote points per person" value={settings.voteBudget} min={1} max={50} disabled={!isLead} onChange={(v) => updateSettings({ voteBudget: v })} />
            <NumberField label="Max points per request" value={settings.maxVotesPerRequest} min={1} max={settings.voteBudget} disabled={!isLead} onChange={(v) => updateSettings({ maxVotesPerRequest: v })} />
          </div>
        </Section>

        <Section title="Flow" description="Doing blocks new cards once it reaches this many. Set 0 to turn off." locked={!isLead}>
          <NumberField label="WIP limit for Doing" value={settings.doingWipLimit} min={0} max={50} disabled={!isLead} onChange={(v) => updateSettings({ doingWipLimit: v })} />
        </Section>

        <Section title="Team" description="Roles show up as badges across the board, requests and discussion.">
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Avatar member={m} size="md" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900">{m.name}</div>
                  <div className="text-xs text-slate-500">{m.title}</div>
                </div>
                <RoleBadge member={m} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Data" description="Everything is stored in this browser. Export a backup regularly, or move a workspace between machines.">
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnSecondary} onClick={() => downloadJson(exportData())}>
              <Download className="h-4 w-4" />
              Export JSON
            </button>
            <button className={btnSecondary} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onImport(f)
                e.target.value = ''
              }}
            />
            <div className="ml-auto">
              {confirmReset ? (
                <span className="flex items-center gap-2">
                  <span className="text-sm text-rose-700">Replace all data with demo data?</span>
                  <button
                    className={btnDanger}
                    onClick={() => {
                      resetDemo()
                      setConfirmReset(false)
                      setNotice({ ok: true, text: 'Demo data restored.' })
                    }}
                  >
                    Reset
                  </button>
                  <button className={btnSecondary} onClick={() => setConfirmReset(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button className={btnDanger} onClick={() => setConfirmReset(true)}>
                  <RotateCcw className="h-4 w-4" />
                  Reset demo data
                </button>
              )}
            </div>
          </div>
          {notice && <p className={`mt-3 text-sm ${notice.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{notice.text}</p>}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, description, locked, children }: { title: string; description: string; locked?: boolean; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {locked && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
            <Lock className="h-3 w-3" />
            Leads only
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function NumberField({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="number"
        className={`${inputCls} w-32`}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value))
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
      />
    </label>
  )
}
