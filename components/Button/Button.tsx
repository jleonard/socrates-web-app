import React from "react";

import { Button as ReactAriaButton } from "react-aria-components";

import { ButtonStyles } from "./Button.styles";
import { ButtonProps } from "./Button.types";

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    const {
      className,
      level = "primary",
      size = "default",
      disabled,
      children,
      unstyled = false,
      trailingContent,
      ...rest
    } = props;

    return (
      <ReactAriaButton
        ref={ref}
        className={
          !unstyled
            ? ButtonStyles({ disabled, level, size, className })
            : className
        }
        isDisabled={disabled}
        {...rest}
      >
        {(renderProps) => (
          <span className="inline-flex items-center gap-2">
            {typeof children === "function" ? children(renderProps) : children}
            {trailingContent}
          </span>
        )}
      </ReactAriaButton>
    );
  },
);
