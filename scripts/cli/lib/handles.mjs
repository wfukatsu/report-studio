/**
 * Short element handles (e1, e2, …) for template outlines.
 *
 * Element IDs are UUIDs. Listing 61 of them costs roughly 1,000 tokens of pure
 * hex, which matters when the consumer is an LLM agent paying for every token of
 * context. `templates outline` assigns stable short handles and persists the map
 * so `templates edit --ops` can accept either form.
 *
 * The map is invalidated by `updatedAt`: if the template moved on since the
 * outline was taken, the handles may point at deleted elements, so we refuse
 * them rather than silently editing the wrong thing.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const HANDLE_RE = /^e\d+$/

function handleFile(config, templateId) {
  return join(config.handleDir, `${templateId}.json`)
}

export function saveHandles(config, templateId, updatedAt, map) {
  if (!existsSync(config.handleDir)) mkdirSync(config.handleDir, { recursive: true })
  const file = handleFile(config, templateId)
  writeFileSync(file, JSON.stringify({ updatedAt, map }, null, 2), { mode: 0o600 })
  return file
}

export function loadHandles(config, templateId) {
  try {
    return JSON.parse(readFileSync(handleFile(config, templateId), 'utf8'))
  } catch {
    return null
  }
}

/**
 * Resolve `e12` → UUID. Anything that is not a handle is returned unchanged, so
 * callers can accept both forms transparently.
 *
 * @returns {{ok: true, id: string} | {ok: false, reason: string}}
 */
export function resolveElementRef(config, templateId, ref, currentUpdatedAt) {
  if (!HANDLE_RE.test(ref)) return { ok: true, id: ref }
  const saved = loadHandles(config, templateId)
  if (!saved) {
    return { ok: false, reason: `ハンドル ${ref} のマップがありません。\`templates outline ${templateId}\` を実行してください。` }
  }
  if (currentUpdatedAt && saved.updatedAt && saved.updatedAt !== currentUpdatedAt) {
    return {
      ok: false,
      reason:
        `ハンドルマップが古くなっています（取得時 ${saved.updatedAt} / 現在 ${currentUpdatedAt}）。` +
        `\`templates outline ${templateId}\` で取り直してください。`,
    }
  }
  const id = saved.map?.[ref]
  if (!id) return { ok: false, reason: `ハンドル ${ref} はマップに存在しません。` }
  return { ok: true, id }
}

/** Drop handle maps older than `maxAgeDays` so the directory does not grow forever. */
export function pruneHandles(config, maxAgeDays = 7) {
  if (!existsSync(config.handleDir)) return 0
  const cutoff = Date.now() - maxAgeDays * 86_400_000
  let removed = 0
  for (const name of readdirSync(config.handleDir)) {
    const file = join(config.handleDir, name)
    try {
      if (statSync(file).mtimeMs < cutoff) {
        rmSync(file)
        removed++
      }
    } catch {
      // Ignore races / permission problems — pruning is best-effort.
    }
  }
  return removed
}
