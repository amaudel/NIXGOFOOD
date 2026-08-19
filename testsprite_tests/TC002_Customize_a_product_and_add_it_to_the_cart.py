import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://localhost:3000/")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Agregar' button for 'Taco Birria con Queso' to open the product details and modifiers.
        # Agregar button
        elem = page.get_by_text('Popular$3.50', exact=True).locator("xpath=ancestor-or-self::*[.//button][1]").get_by_role('button', name='Agregar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Extra Queso Oaxaca Fundido' optional modifier to add it to the item.
        # Extra Queso Oaxaca Fundido +$ 0.75 button
        elem = page.get_by_role('button', name='Extra Queso Oaxaca Fundido +$0.75', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Agregar al pedido · $4.25' button to add the customized Taco Birria con Queso to the cart.
        # Agregar al pedido · $4.25 button
        elem = page.get_by_role('button', name='Agregar al pedido · $4.25', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Ver carrito' (View cart) button to open the cart and inspect its contents.
        # 1 $4.25 button
        elem = page.get_by_role('button', name='Ver carrito', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the item is added to the cart
        # Assert: The cart shows quantity 1 for the added item.
        await expect(page.locator("xpath=/html/body/div[2]/div/div[2]/div[2]/div/div/div[3]/div/span").nth(0)).to_have_text("1", timeout=15000), "The cart shows quantity 1 for the added item."
        # Assert: The cart shows the added item's price as $4.25.
        await expect(page.locator("xpath=/html/body/div[2]/div/div[2]/div[2]/div/div/div[3]/span").nth(0)).to_have_text("$ 4.25", timeout=15000), "The cart shows the added item's price as $4.25."
        # Assert: The cart subtotal is $4.25.
        await expect(page.locator("xpath=/html/body/div[2]/div/div[3]/div/div[1]/span[2]").nth(0)).to_have_text("$ 4.25", timeout=15000), "The cart subtotal is $4.25."
        # Assert: The cart total estimated is $4.25.
        await expect(page.locator("xpath=/html/body/div[2]/div/div[3]/div/div[3]/span[2]").nth(0)).to_have_text("$ 4.25", timeout=15000), "The cart total estimated is $4.25."
        current_url = await page.evaluate("() => window.location.href")
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    