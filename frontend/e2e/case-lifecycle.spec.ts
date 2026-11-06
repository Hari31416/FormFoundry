import { test, expect } from '@playwright/test'

test.describe('FormFoundry E2E Case Lifecycle', () => {
  test.skip(!process.env.E2E_USERNAME || !process.env.E2E_PASSWORD, 'Live lifecycle tests require E2E_USERNAME and E2E_PASSWORD for an account with schema access.')
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'))
    await page.goto('/login')
    await page.getByLabel('Username', { exact: true }).fill(process.env.E2E_USERNAME!)
    await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).not.toHaveURL(/\/login$/)
  })
  test('should create, interview, verify, and approve a case', async ({ page }) => {
    // 1. Navigate to the landing page
    await page.goto('/')

    // Verify template control center title is present
    await expect(page.locator('h1')).toContainText(/Intake Control Center/i)

    // 2. Select a template and click 'Start Case'
    // We target the Indian FIR Report Intake card specifically
    const templateCard = page.locator('.group').filter({ hasText: /Indian FIR Report Intake/i })
    await expect(templateCard).toBeVisible()

    const startCaseButton = templateCard.getByRole('button', { name: /Start Case/i })
    await expect(startCaseButton).toBeEnabled()
    await startCaseButton.click()

    // 3. Verify page redirects to the Case Workspace
    // The URL structure: /cases/:caseId
    await page.waitForURL(/\/cases\/[a-zA-Z0-9-]+/)
    const caseId = page.url().split('/').pop()
    console.log(`Successfully created case: ${caseId}`)

    // 4. Verify workspace header elements
    await expect(page.locator('header')).toContainText(/Intake/i)

    // Check for the AI's greeting message in the chat container
    const chatContainer = page.locator('main')
    await expect(chatContainer).toContainText(/Welcome/i)

    // 5. Answer the outstanding questions
    // Locate the chat text input area at the bottom of the page
    const chatTextarea = page.locator('textarea')
    await expect(chatTextarea).toBeVisible()

    // Fill in detailed complainant and incident details to satisfy the schema in one go
    const fullStory = 'My name is Jane Elizabeth Doe, my phone number is +919988776655, I live at 123 Baker Street, Mumbai. On 2026-05-15 at 10:00 AM at Victoria Terminus, someone stole my bag containing valuables, so I want to report this theft at Colaba Police Station. The accused is not known to me and there were no witnesses.'
    await chatTextarea.fill(fullStory)
    await chatTextarea.press('Enter') // Submits the message

    // Wait for the UI to reflect the sent message
    await expect(chatContainer).toContainText('Jane Elizabeth Doe')

    // Wait for the assistant to ask the next question about the estimated loss
    await expect(chatContainer).toContainText(/estimated loss/i, { timeout: 20000 })

    // 5b. Answer the estimated loss question
    await chatTextarea.fill('The estimated loss is 5000 INR')
    await chatTextarea.press('Enter')

    // Wait for the UI to reflect the second response
    await expect(chatContainer).toContainText('5000 INR')

    // 6. Monitor schema state and field verification
    // Once the assistant extracts information, fields transition to 'proposed' state.
    // If the questionnaire completes, the 'Intake Questionnaire Complete' banner appears.
    const completeBanner = page.locator('text=Intake Questionnaire Complete')

    // We add an auto-waiting step to let the backend extract all values
    await expect(completeBanner).toBeVisible({ timeout: 20000 })

    // 7. Verify the FieldRow UI component has captured the value
    const nameFieldRow = page.locator('.group').filter({ hasText: 'Complainant full name' })
    await expect(nameFieldRow).toBeVisible()
    await expect(nameFieldRow).toContainText('Jane Elizabeth Doe')

    // 8. Confirm the field value
    // Click 'Confirm All Fields' to move the field from 'proposed' to 'confirmed' status
    const confirmAllButton = page.getByRole('button', { name: /Confirm All Fields/i })
    if (await confirmAllButton.isVisible()) {
      await confirmAllButton.click()
    }

    // 9. Approve the completed case
    // Once everything is confirmed and verified, the approve button becomes active.
    const approveButton = page.getByRole('button', { name: /Approve & Close/i }).first()
    await expect(approveButton).toBeEnabled()
    await approveButton.click()

    // Verify status changes to 'approved'
    await expect(page.locator('header')).toContainText(/Approved/i)
  })

  test('should handle field rejection and redo QA', async ({ page }) => {
    // 1. Navigate to the landing page
    await page.goto('/')

    // 2. Select a template and click 'Start Case'
    const templateCard = page.locator('.group').filter({ hasText: /Indian FIR Report Intake/i })
    await expect(templateCard).toBeVisible()

    const startCaseButton = templateCard.getByRole('button', { name: /Start Case/i })
    await expect(startCaseButton).toBeEnabled()
    await startCaseButton.click()

    // 3. Verify page redirects to the Case Workspace
    await page.waitForURL(/\/cases\/[a-zA-Z0-9-]+/)
    const chatContainer = page.locator('main')
    await expect(chatContainer).toContainText(/Welcome/i)

    // 4. Answer the initial questions to complete the questionnaire first
    const chatTextarea = page.locator('textarea')
    await expect(chatTextarea).toBeVisible()

    const fullStory = 'My name is Jane Elizabeth Doe, my phone number is +919988776655, I live at 123 Baker Street, Mumbai. On 2026-05-15 at 10:00 AM at Victoria Terminus, someone stole my bag containing valuables, so I want to report this theft at Colaba Police Station. The accused is not known to me and there were no witnesses.'
    await chatTextarea.fill(fullStory)
    await chatTextarea.press('Enter')

    // Wait for the UI to reflect the sent message
    await expect(chatContainer).toContainText('Jane Elizabeth Doe')

    // Wait for the assistant to ask the next question about the estimated loss
    await expect(chatContainer).toContainText(/estimated loss/i, { timeout: 20000 })

    // Answer the estimated loss question
    await chatTextarea.fill('The estimated loss is 5000 INR')
    await chatTextarea.press('Enter')

    // Wait for the UI to reflect the second response
    await expect(chatContainer).toContainText('5000 INR')

    // Wait for the questionnaire to complete so inline verification cards appear
    const completeBanner = page.locator('text=Intake Questionnaire Complete')
    await expect(completeBanner).toBeVisible({ timeout: 20000 })

    // 5. Verify the Complainant full name FieldRow is visible and has the extracted value
    const nameFieldRow = page.locator('.group').filter({ hasText: 'Complainant full name' })
    await expect(nameFieldRow).toContainText('Jane Elizabeth Doe')

    // 6. Click 'Reject Match' on the complainant name FieldRow
    const rejectButton = nameFieldRow.getByRole('button', { name: /Reject Match/i })
    await expect(rejectButton).toBeVisible()
    await rejectButton.click()

    // 7. Verify the local rejection badge is displayed
    await expect(nameFieldRow).toContainText(/Rejected/i)

    // 8. Confirm all other proposed fields so that unreviewedProposedCount becomes 0
    const otherFieldRows = page.locator('.group')
    const count = await otherFieldRows.count()
    for (let i = 0; i < count; i++) {
      const row = otherFieldRows.nth(i)
      const label = await row.locator('span').first().textContent()
      if (label && label.includes('Complainant full name')) {
        continue
      }
      const confirmButton = row.getByRole('button', { name: /Confirm Match/i })
      if (await confirmButton.isVisible()) {
        await confirmButton.click()
        // Wait for the confirmation to complete (status changes to confirmed, hiding the button)
        await expect(confirmButton).not.toBeVisible()
      }
    }

    // 9. Locate and click 'Start QA for Rejected Fields (1)'
    const startQaButton = page.getByRole('button', { name: /Start QA for Rejected Fields/i })
    await expect(startQaButton).toBeVisible()
    await startQaButton.click()

    // 10. Now, redo the QA by providing the corrected name in the chat
    await chatTextarea.fill('Actually, my full legal name is Janet Elizabeth Doe')
    await chatTextarea.press('Enter')

    // Wait for the questionnaire to complete again
    await expect(completeBanner).toBeVisible({ timeout: 20000 })

    // 11. Verify the FieldRow now contains the updated name "Janet Elizabeth Doe"
    await expect(nameFieldRow).toContainText('Janet Elizabeth Doe')

    // 12. Confirm the corrected complainant full name field
    const nameConfirmButton = nameFieldRow.getByRole('button', { name: /Confirm Match/i })
    if (await nameConfirmButton.isVisible()) {
      await nameConfirmButton.click()
    }

    // 13. Approve and close
    const approveButton = page.getByRole('button', { name: /Approve & Close/i }).first()
    await expect(approveButton).toBeEnabled()
    await approveButton.click()

    // Verify status changes to 'approved'
    await expect(page.locator('header')).toContainText(/Approved/i)
  })
})
