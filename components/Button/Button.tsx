import React, { ReactElement } from "react";

import { Button as ReactAriaButton } from "react-aria-components";

import { ButtonProps } from "./Button.types";
import { ButtonStyles } from "./Button.styles";

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    const {
      className,
      level = "primary",
      size = "default",
      disabled,
      children,
      unstyled = false,
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
        {children}
      </ReactAriaButton>
    );
  }
);
