import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

export async function expectNoAutomatedViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(wcagTags)
    .analyze()
  const summary = results.violations
    .map((violation) => `${violation.id}: ${violation.nodes.length}개 요소`)
    .join('\n')

  expect(results.violations, summary).toEqual([])
}
