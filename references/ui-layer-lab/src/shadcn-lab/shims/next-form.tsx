import * as React from "react"

const Form = React.forwardRef<
  HTMLFormElement,
  React.FormHTMLAttributes<HTMLFormElement>
>((props, ref) => <form ref={ref} {...props} />)

Form.displayName = "NextFormAdapter"

export default Form
