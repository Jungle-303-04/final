import * as React from "react"

type LinkHref = string | { pathname?: string; hash?: string }

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: LinkHref
  prefetch?: boolean
  replace?: boolean
  scroll?: boolean
}

function hrefToString(href: LinkHref) {
  if (typeof href === "string") return href
  return `${href.pathname ?? ""}${href.hash ?? ""}` || "#"
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(
  ({ href, prefetch: _prefetch, replace: _replace, scroll: _scroll, ...props }, ref) => (
    <a ref={ref} href={hrefToString(href)} {...props} />
  )
)

Link.displayName = "NextLinkAdapter"

export default Link
