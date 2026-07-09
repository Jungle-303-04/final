import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  wide?: boolean;
  variant?: "default" | "primary";
};

export function Button({ children, className = "", type = "button", wide = false, variant = "default", ...props }: ButtonProps) {
  const classes = ["ui-button", variant === "primary" ? "primary-button" : "", wide ? "stable-wide" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} type={type} {...props}>
      {children}
    </button>
  );
}
