import * as React from "react"

type ImageSource = string | { src: string; width?: number; height?: number }

type ImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "width" | "height"
> & {
  src: ImageSource
  width?: number | `${number}`
  height?: number | `${number}`
  fill?: boolean
  priority?: boolean
  unoptimized?: boolean
}

const Image = React.forwardRef<HTMLImageElement, ImageProps>(
  (
    {
      src,
      fill,
      priority,
      unoptimized: _unoptimized,
      style,
      width,
      height,
      ...props
    },
    ref
  ) => (
    <img
      ref={ref}
      src={typeof src === "string" ? src : src.src}
      width={fill ? undefined : width ?? (typeof src === "string" ? undefined : src.width)}
      height={fill ? undefined : height ?? (typeof src === "string" ? undefined : src.height)}
      fetchPriority={priority ? "high" : undefined}
      style={
        fill
          ? { ...style, position: "absolute", inset: 0, width: "100%", height: "100%" }
          : style
      }
      {...props}
    />
  )
)

Image.displayName = "NextImageAdapter"

export default Image
