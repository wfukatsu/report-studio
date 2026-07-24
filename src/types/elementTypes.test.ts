/**
 * #415: schemas/element-types.json ⇔ ELEMENT_TYPES 同期テスト。
 * union への型追加 → コンパイルエラーで ELEMENT_TYPES 更新を強制 →
 * このテストが JSON の再生成（npm run generate:schema）を強制 →
 * サーバ V2ElementParityMatrixTest が JSON を読んで自動 fail、の連鎖を守る。
 */
import { describe, it, expect } from 'vitest'
import { ELEMENT_TYPES } from './elementTypes'
import generated from '../../schemas/element-types.json'

describe('element-types.json 同期 (#415)', () => {
  it('生成 JSON が ELEMENT_TYPES と一致する（乖離時は npm run generate:schema を実行）', () => {
    expect(generated.elementTypes).toEqual([...ELEMENT_TYPES])
  })

  it('全24タイプが列挙されている', () => {
    expect(ELEMENT_TYPES).toHaveLength(24)
  })
})
