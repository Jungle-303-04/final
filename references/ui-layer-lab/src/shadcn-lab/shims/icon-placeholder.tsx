import * as React from "react"
import * as LucideIcons from "lucide-react"
import { SquareIcon, type LucideProps } from "lucide-react"

type IconPlaceholderProps = React.SVGProps<SVGSVGElement> & {
  lucide: string
  tabler: string
  hugeicons: string
  phosphor: string
  remixicon: string
}

const iconLibrary = LucideIcons as unknown as Record<
  string,
  React.ComponentType<LucideProps>
>

export function IconPlaceholder({
  lucide,
  tabler: _tabler,
  hugeicons: _hugeicons,
  phosphor: _phosphor,
  remixicon: _remixicon,
  ...props
}: IconPlaceholderProps) {
  const Icon = iconLibrary[lucide] ?? SquareIcon
  return <Icon {...(props as LucideProps)} />
}
