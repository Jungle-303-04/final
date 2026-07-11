type FontOptions = {
  subsets?: string[]
  variable?: string
}

export function Vazirmatn(options: FontOptions = {}) {
  return {
    className: "font-sans",
    variable: options.variable ?? "",
    style: { fontFamily: "Vazirmatn, Geist, sans-serif" },
  }
}
