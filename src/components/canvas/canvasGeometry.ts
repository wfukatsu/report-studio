/**
 * Pure geometry helpers for canvas drag/drop/snap logic.
 *
 * Extracted from ReportCanvas.tsx (which is coverage-excluded because its DnD /
 * pointer-event wiring is only exercisable via E2E) so the *math* — snap
 * resolution, section-by-Y lookup, and topmost hit-testing — can be unit-tested
 * in isolation. These functions must stay free of React/DOM dependencies (#223).
 */

/**
 * Snap a single axis position to the nearest of: grid point or margin boundary.
 * Used for margin-aware snap-to-grid during drag and drop.
 *
 * @param value       mm — position of the near edge (left or top)
 * @param elementSize mm — width or height of the element (undefined ⇒ no far-edge snap)
 * @param marginNear  mm — near margin (left or top)
 * @param marginFar   mm — far margin (right or bottom)
 * @param pageSize    mm — page width or height
 * @param threshold   max distance (mm) to trigger a margin snap (default 1mm ≈ 2.7px)
 */
export function snapAxis(
    value: number,
    elementSize: number | undefined,
    marginNear: number,
    marginFar: number,
    pageSize: number,
    doSnap: boolean,
    gridSize: number,
    threshold = 1,
): number {
    // Grid snap (always as baseline when snapToGrid is on)
    const gridSnapped = doSnap ? Math.round(value / gridSize) * gridSize : value
    if (!doSnap) return gridSnapped

    let best = gridSnapped
    let bestDist = Math.abs(value - gridSnapped)

    // Near margin boundary: snap left/top edge
    const nearBound = marginNear
    const distNear = Math.abs(value - nearBound)
    if (distNear < threshold && distNear < bestDist) {
        best = nearBound
        bestDist = distNear
    }

    // Far margin boundary: snap right/bottom edge so far edge aligns with margin
    if (elementSize !== undefined) {
        const farBound = pageSize - marginFar
        const distFar = Math.abs(value + elementSize - farBound)
        if (distFar < threshold && distFar < bestDist) {
            best = farBound - elementSize
        }
    }

    return best
}

/** Minimal shape of a vertically-stacked section for Y-lookup. */
export interface SectionLike {
    height: number
}

export interface SectionHit<S> {
    /** The section containing `yMm`, or undefined if `yMm` is past the last section. */
    section: S | undefined
    /** mm — top offset of `section` (running sum of preceding section heights). */
    sectionOffsetY: number
    /** mm — `yMm` expressed relative to the top of `section`. */
    relativeY: number
}

/**
 * Find which section (in top-to-bottom stacking order) contains `yMm`, the
 * distance in mm from the page top. Sections are laid out contiguously with no
 * gaps, each occupying `height` mm. When `yMm` falls past the last section,
 * `section` is undefined and `sectionOffsetY` equals the total stacked height.
 */
export function findSectionAtY<S extends SectionLike>(
    sections: readonly S[],
    yMm: number,
): SectionHit<S> {
    let sectionOffsetY = 0
    let section: S | undefined
    for (const sec of sections) {
        if (yMm < sectionOffsetY + sec.height) {
            section = sec
            break
        }
        sectionOffsetY += sec.height
    }
    return { section, sectionOffsetY, relativeY: yMm - sectionOffsetY }
}

/** Minimal box shape for hit-testing (positions in mm, section-relative). */
export interface BoxLike {
    zIndex: number
    position: { x: number; y: number }
    size: { width: number; height: number }
}

/**
 * Return the topmost (highest `zIndex`) element whose box contains the point
 * (`xMm`, `yMm`) and satisfies `predicate`. Coordinates are in mm; `yMm` is
 * section-relative (see {@link findSectionAtY}). Returns undefined when nothing
 * matches. Ties in `zIndex` resolve to the element earlier in `elements`
 * (stable sort), matching the DOM paint order used at the call site.
 */
export function topmostElementAt<E extends BoxLike>(
    elements: readonly E[],
    xMm: number,
    yMm: number,
    predicate: (el: E) => boolean = () => true,
): E | undefined {
    const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)
    return sorted.find(
        (el) =>
            xMm >= el.position.x &&
            xMm <= el.position.x + el.size.width &&
            yMm >= el.position.y &&
            yMm <= el.position.y + el.size.height &&
            predicate(el),
    )
}
