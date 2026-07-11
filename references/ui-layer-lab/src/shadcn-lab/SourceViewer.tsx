import * as React from "react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

import type { SourceFile } from "./catalog"

export function SourceViewer({ files }: { files: SourceFile[] }) {
  const [activePath, setActivePath] = React.useState(files[0]?.path ?? "")
  const [loadedSource, setLoadedSource] = React.useState({ path: "", content: "" })

  const activeFile = files.find((file) => file.path === activePath) ?? files[0]

  React.useEffect(() => {
    let current = true
    if (!activeFile) return
    void activeFile.load().then((source) => {
      if (!current) return
      setLoadedSource({ path: activeFile.path, content: source })
    })
    return () => {
      current = false
    }
  }, [activeFile])

  const loading = loadedSource.path !== activeFile?.path

  if (!activeFile) {
    return (
      <div className="grid min-h-72 place-items-center rounded-xl border bg-muted/20 text-sm text-muted-foreground">
        No source file was found for this registry item.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap gap-1 border-b bg-muted/30 p-2">
        {files.map((file) => (
          <Button
            key={file.path}
            type="button"
            size="sm"
            variant={file.path === activeFile.path ? "secondary" : "ghost"}
            className="max-w-full justify-start font-mono text-xs"
            onClick={() => setActivePath(file.path)}
          >
            {file.path.split("/").slice(-1)[0]}
          </Button>
        ))}
      </div>
      <div className="border-b px-4 py-2 font-mono text-xs text-muted-foreground">
        {activeFile.path}
      </div>
      <ScrollArea className="h-[min(70vh,760px)]">
        <pre className="min-w-max p-5 text-[13px] leading-6 text-foreground">
          <code>{loading ? "Loading official source…" : loadedSource.content}</code>
        </pre>
      </ScrollArea>
    </div>
  )
}
