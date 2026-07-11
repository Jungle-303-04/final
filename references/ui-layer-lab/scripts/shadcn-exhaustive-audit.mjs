import { spawn } from "node:child_process"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { chromium } from "playwright"

const port = 5197
const baseUrl = `http://127.0.0.1:${port}`
const inventory = JSON.parse(
  await readFile(new URL("../vendor/shadcn/inventory.json", import.meta.url), "utf8")
)
const routes = [
  ...inventory.componentExamples.map(({ name }) => ({ kind: "example", id: name })),
  ...inventory.areaCharts.map((id) => ({ kind: "chart", id })),
  ...inventory.blocks.map((id) => ({ kind: "block", id })),
]

const server = spawn(
  "npm",
  ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
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
  await waitForServer(baseUrl)
  const browser = await chromium.launch({ headless: true })
  const failures = []
  const cursor = { value: 0 }
  const progress = { value: 0 }
  const workerCount = 4

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      let activeRoute = null
      page.on("pageerror", (error) => {
        if (activeRoute) failures.push(`${activeRoute}: page error: ${error.message}`)
      })
      page.on("console", (message) => {
        if (activeRoute && message.type() === "error") {
          failures.push(`${activeRoute}: console error: ${message.text()}`)
        }
      })

      while (cursor.value < routes.length) {
        const route = routes[cursor.value++]
        activeRoute = `${route.kind}/${route.id}`
        try {
          await page.goto(`${baseUrl}/preview/${activeRoute}?theme=light`, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          })
          await page.waitForFunction(
            () =>
              Boolean(document.querySelector("#root")?.firstElementChild) &&
              !document.body.innerText.includes("Loading official source…"),
            undefined,
            { timeout: 8_000 }
          )
          await page.waitForTimeout(75)
          const body = await page.locator("body").innerText()
          if (body.includes("Preview runtime error") || body.includes("Unknown official registry item")) {
            failures.push(`${activeRoute}: ${body.slice(0, 300)}`)
          }
        } catch (error) {
          failures.push(`${activeRoute}: ${error instanceof Error ? error.message : String(error)}`)
        }
        activeRoute = null
        progress.value += 1
        if (progress.value % 25 === 0 || progress.value === routes.length) {
          console.log(`audited ${progress.value}/${routes.length} previews`)
        }
      }
      await page.close()
    })
  )

  await browser.close()

  if (failures.length) {
    const uniqueFailures = [...new Set(failures)]
    const outputDir = new URL("../output/playwright/", import.meta.url)
    await mkdir(outputDir, { recursive: true })
    await writeFile(
      new URL("shadcn-audit-failures.json", outputDir),
      `${JSON.stringify(uniqueFailures, null, 2)}\n`
    )
    throw new Error(
      `shadcn exhaustive audit failed (${uniqueFailures.length} failures)\n${uniqueFailures
        .slice(0, 40)
        .join("\n")}`
    )
  }

  await rm(new URL("../output/playwright/shadcn-audit-failures.json", import.meta.url), {
    force: true,
  })
  console.log(`shadcn exhaustive audit passed (${routes.length} rendered previews)`)
} finally {
  server.kill("SIGTERM")
  if (/error/i.test(serverOutput)) process.stderr.write(serverOutput)
}

async function waitForServer(url) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Preview server did not start at ${url}`)
}
