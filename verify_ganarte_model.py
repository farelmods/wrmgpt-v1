
import asyncio
import http.server
import socketserver
import threading
from playwright.async_api import async_playwright
import time
import os

PORT = 8000
SCREENSHOT_PATH = "ganarte_verification.png"

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=".", **kwargs)

async def main():
    httpd = None
    server_thread = None
    try:
        # 1. Start a web server in a separate thread
        httpd = socketserver.TCPServer(("", PORT), Handler)
        server_thread = threading.Thread(target=httpd.serve_forever)
        server_thread.daemon = True
        server_thread.start()
        print(f"Server started at http://localhost:{PORT}")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            # Listen for console messages from the browser
            page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))

            # 2. Go to the page
            await page.goto(f"http://localhost:{PORT}/index.html")
            print("Page loaded.")

            # 3. Log in
            await page.fill("#loginUsername", "testuser")
            await page.fill("#loginPassword", "testpass")
            await page.click(".login-btn")
            await page.wait_for_selector("#loginScreen", state="hidden")
            print("Logged in.")

            # 4. Open settings and select Ganarte model
            await page.click(".menu-btn")
            await page.wait_for_selector(".sidebar-drawer.active")
            await page.click('[onclick="openSettingsPanel()"]')

            await page.wait_for_selector("#settingsModal.active")
            print("Settings opened.")

            await page.select_option(".settings-select", "ganarte")
            print("Selected Ganarte model.")

            # Close settings
            await page.click("#settingsModal .close-modal")
            await page.wait_for_selector("#settingsModal:not(.active)")
            print("Settings closed.")


            # 5. Send a prompt
            prompt = "a cat wearing a hat"
            await page.fill("#input", prompt)
            await page.click(".send-btn")
            print(f"Prompt sent: '{prompt}'")

            # 6. Wait for the image response
            print("Waiting for image response...")

            # Wait for the bot message group that contains an image
            img_selector = ".msg-group.bot .msg-content img"
            await page.wait_for_selector(img_selector, timeout=60000)
            print("Image element appeared.")

            # 7. Explicitly wait for the src attribute to be a blob URL
            max_wait_time = 30  # seconds
            start_time = time.time()
            image_src = ""
            while time.time() - start_time < max_wait_time:
                image_src = await page.get_attribute(img_selector, "src")
                if image_src and image_src.startswith("blob:"):
                    print(f"Image src is a blob URL: {image_src}")
                    break
                await asyncio.sleep(1)
            else:
                 print(f"Timeout waiting for blob URL. Current src: {image_src}")


            # Take screenshot after a small delay to ensure rendering
            await asyncio.sleep(2)
            await page.screenshot(path=SCREENSHOT_PATH)
            print(f"Screenshot saved to {SCREENSHOT_PATH}")

            # 8. Verification
            final_image_src = await page.get_attribute(img_selector, "src")
            if final_image_src and final_image_src.startswith("blob:"):
                print("✅ VERIFICATION PASSED: Image rendered with a blob URL.")
            else:
                print(f"❌ VERIFICATION FAILED: Image src is not a blob URL. Found: {final_image_src}")
                raise Exception("Image verification failed")

            await browser.close()

    except Exception as e:
        print(f"An error occurred: {e}")
        # Make sure browser is closed if it exists
        if 'browser' in locals() and browser.is_connected():
            await browser.close()
    finally:
        # 9. Stop the server
        if httpd:
            httpd.shutdown()
            httpd.server_close()
            print("Server stopped.")
        if server_thread:
            server_thread.join()


if __name__ == "__main__":
    # Remove old screenshot if it exists
    if os.path.exists(SCREENSHOT_PATH):
        os.remove(SCREENSHOT_PATH)

    asyncio.run(main())
