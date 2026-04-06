/**
 * Utility functions for section management.
 */

import { v4 as uuidv4 } from 'uuid'
import type { Section, SectionType } from '@/types'

/**
 * Deep-clone a section with new IDs for the section and all its elements.
 * Used when creating a new page that should inherit master header/footer.
 */
export function cloneSectionForPage(section: Section): Section {
  const cloned = JSON.parse(JSON.stringify(section)) as Section
  cloned.id = uuidv4()
  cloned.elements = cloned.elements.map((el) => ({ ...el, id: uuidv4() }))
  return cloned
}

/**
 * Create a new empty section of the given type.
 */
export function createDefaultSection(type: SectionType, height = 0): Section {
  return {
    id: uuidv4(),
    sectionType: type,
    height,
    elements: [],
  }
}
