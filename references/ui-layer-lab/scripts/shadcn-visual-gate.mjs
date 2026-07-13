import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"

const port = 5196
const baseUrl = `http://127.0.0.1:${port}`
const outputDir = new URL("../output/playwright/", import.meta.url).pathname
const server = spawn(
  "npm",
  ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] }
)
let serverOutput = ""
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString()
})
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString()
})

try {
  await mkdir(outputDir, { recursive: true })
  await waitForServer(baseUrl)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const consoleErrors = []
  const apiRequests = []

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api")) apiRequests.push(request.url())
  })

  await page.goto(`${baseUrl}/components/examples?item=accordion-demo`, {
    waitUntil: "domcontentloaded",
  })
  await page.getByRole("heading", { name: "Accordion Demo" }).waitFor()
  await page
    .frameLocator("iframe")
    .getByRole("button", { name: "What are your shipping options?" })
    .waitFor()
  await assertNoOverflow(page, "desktop")
  await page.screenshot({ path: `${outputDir}shadcn-lab-desktop.png`, fullPage: true })

  await page.getByRole("button", { name: /^Source/ }).click()
  await page.getByText("accordion-demo.tsx", { exact: true }).first().waitFor()
  const source = await page.locator("pre").textContent()
  if (!source?.includes('@/styles/base-nova/ui/accordion')) {
    throw new Error("The source panel did not load the verbatim official accordion example.")
  }

  await page.goto(`${baseUrl}/charts/area?item=chart-area-default`, {
    waitUntil: "domcontentloaded",
  })
  await page.frameLocator("iframe").getByText("Showing total visitors for the last 6 months").waitFor()

  await page.goto(`${baseUrl}/blocks?item=login-03`, { waitUntil: "domcontentloaded" })
  await page.frameLocator("iframe").getByText("Welcome back").waitFor()

  await page.goto(`${baseUrl}/components/examples?item=accordion-demo`, {
    waitUntil: "domcontentloaded",
  })
  await page.getByRole("button", { name: "Use dark theme" }).click()
  await page.frameLocator("iframe").locator("html.dark").waitFor()
  await page.screenshot({ path: `${outputDir}shadcn-lab-dark.png`, fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.getByRole("heading", { name: "Accordion Demo" }).waitFor()
  await assertNoOverflow(page, "mobile")
  await page.screenshot({ path: `${outputDir}shadcn-lab-mobile.png`, fullPage: true })

  await browser.close()

  if (apiRequests.length) {
    throw new Error(`The backend-independent lab requested API routes:\n${apiRequests.join("\n")}`)
  }
  if (consoleErrors.length) {
    throw new Error(`shadcn visual console errors:\n${consoleErrors.join("\n")}`)
  }

  console.log("shadcn visual gate passed (component + source + chart + block + light/dark + mobile)")
} finally {
  server.kill("SIGTERM")
  if (/error/i.test(serverOutput)) process.stderr.write(serverOutput)
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  if (overflow > 1) throw new Error(`${label} horizontal overflow: ${overflow}px`)
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Vite did not start at ${url}`)
}
