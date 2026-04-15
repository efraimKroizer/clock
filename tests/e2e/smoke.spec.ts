import { expect, test } from '@playwright/test'

test('can add project and create a work entry', async ({ page }) => {
  await page.goto('/projects')

  await page.getByTestId('add-project-name').fill('פרויקט E2E')
  await page.getByTestId('add-project-notes').fill('בדיקה אוטומטית')
  await page.getByTestId('add-project-submit').click()

  await expect(page.getByLabel('שם פרויקט לעריכה').first()).toHaveValue('פרויקט E2E')

  await page.goto('/')

  const toggleButton = page.locator('[data-testid^="clock-toggle-"]').first()
  await expect(toggleButton).toBeVisible()

  await toggleButton.click()
  await page.waitForTimeout(1100)
  await toggleButton.click()

  await expect(page.getByText('שורות כניסה ויציאה (היום)')).toBeVisible()
  await expect(page.getByText('פרויקט E2E').first()).toBeVisible()
})

test('can edit and pause a project', async ({ page }) => {
  await page.goto('/projects')

  await page.getByTestId('add-project-name').fill('פרויקט לניהול')
  await page.getByTestId('add-project-notes').fill('הערות התחלתיות')
  await page.getByTestId('add-project-submit').click()

  const nameInput = page.getByLabel('שם פרויקט לעריכה').first()
  const notesInput = page.getByLabel('הערות פרויקט לעריכה').first()

  await nameInput.fill('פרויקט מנוהל')
  await notesInput.fill('הערות מעודכנות')
  await page.getByTitle('שמור').first().click()

  await expect(page.getByText('השינויים נשמרו')).toBeVisible()

  await page.getByTitle('השהה').first().click()
  await expect(page.getByText('הפרויקט הושהה')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText('פרויקט מנוהל')).toBeVisible()
  await expect(page.getByText('פרויקט מושהה')).toBeVisible()
  await expect(page.getByTestId(/^clock-toggle-/).first()).toHaveCount(0)
})

test('can edit and delete a time entry', async ({ page }) => {
  const projectName = `פרויקט זמן ${Date.now()}`

  await page.goto('/projects')

  await page.getByTestId('add-project-name').fill(projectName)
  await page.getByTestId('add-project-submit').click()
  await expect(page.getByLabel('שם פרויקט לעריכה').first()).toHaveValue(projectName)

  await page.goto('/')
  await expect(page.locator('.project-card', { hasText: projectName }).first()).toBeVisible()

  const projectCard = page.locator('.project-card', { hasText: projectName }).first()
  const toggleButton = projectCard.locator('[data-testid^="clock-toggle-"]')
  await toggleButton.click()
  await page.waitForTimeout(1100)
  await toggleButton.click()

  const noteBox = page.locator('tbody textarea').first()
  await noteBox.fill('  הערת בדיקה  ')
  await noteBox.blur()

  await page.getByLabel('ערוך שעות').first().click()
  const dateTimeInputs = page.locator('input[type="datetime-local"]')
  await dateTimeInputs.nth(0).fill('2026-04-13T08:00')
  await dateTimeInputs.nth(1).fill('2026-04-13T09:00')
  await page.getByLabel('שמור שעות').first().click()

  await expect(page.getByText('השעות נשמרו בהצלחה')).toBeVisible()

  await page.getByLabel('מחק שורה').first().click()
  await expect(page.getByText('השורה נמחקה')).toBeVisible()
  await expect(page.getByText('עדיין אין שורות להיום')).toBeVisible()
})
