import { v4 as uuidv4 } from 'uuid'
import type { Template } from '@/types'

// A4 dimensions: 210 x 297 mm
const A4_WIDTH = 210
const A4_HEIGHT = 297

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: '白紙',
    description: '空のキャンバス。自由にレイアウトを作成できます',
    pages: [
      {
        id: uuidv4(),
        name: 'ページ 1',
        elements: [],
        background: '#ffffff',
        width: A4_WIDTH,
        height: A4_HEIGHT,
        sections: [
          {
            id: uuidv4(),
            sectionType: 'body',
            height: A4_HEIGHT,
            elements: [],
          },
        ],
      },
    ],
    settings: {
      paperSize: 'A4',
      orientation: 'portrait',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm',
    },
  },
  {
    id: 'simple-report',
    name: 'シンプルレポート',
    description: 'タイトル・サマリー付きのシンプルなレポートテンプレート',
    pages: [
      {
        id: uuidv4(),
        name: 'ページ 1',
        elements: [
          {
            id: uuidv4(),
            type: 'text',
            // ~10mm from left/top, width ~190mm, height ~16mm
            position: { x: 10, y: 10 },
            size: { width: 190, height: 16 },
            zIndex: 1,
            locked: false,
            visible: true,
            content: 'レポートタイトル',
            style: { fontSize: 32, fontWeight: 'bold', color: '#1a1a1a', textAlign: 'center' },
          },
          {
            id: uuidv4(),
            type: 'shape',
            position: { x: 10, y: 29 },
            size: { width: 190, height: 0.5 },
            zIndex: 2,
            locked: false,
            visible: true,
            shape: 'line',
            stroke: '#3b82f6',
            strokeWidth: 2,
          },
          {
            id: uuidv4(),
            type: 'text',
            position: { x: 10, y: 33 },
            size: { width: 190, height: 32 },
            zIndex: 3,
            locked: false,
            visible: true,
            content: '概要\n\nここにレポートの概要を入力してください。このテンプレートはビジネスレポートの出発点としてご利用いただけます。',
            style: { fontSize: 14, color: '#374151', textAlign: 'left' },
          },
        ],
        background: '#ffffff',
        width: A4_WIDTH,
        height: A4_HEIGHT,
        sections: [],
      },
    ],
    settings: {
      paperSize: 'A4',
      orientation: 'portrait',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm',
    },
  },
]

// Populate sections from elements for the simple-report template
const simpleReportPage = BUILTIN_TEMPLATES[1].pages[0]
simpleReportPage.sections = [
  {
    id: uuidv4(),
    sectionType: 'body',
    height: A4_HEIGHT,
    elements: simpleReportPage.elements,
  },
]
