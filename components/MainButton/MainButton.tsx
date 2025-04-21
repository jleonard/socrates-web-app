import React, { ReactElement } from "react";

import { Button as ReactAriaButton } from "react-aria-components";

import { MainButtonProps } from "./Mainbutton.types";
import { MainButtonStyles } from "./MainButton.styles";

export const MainButton = React.forwardRef<HTMLButtonElement, MainButtonProps>(
  (props, ref) => {
    const { className, active = false, children, ...rest } = props;

    return (
      <ReactAriaButton
        ref={ref}
        className={MainButtonStyles({ active, className })}
        {...rest}
      >
        {children}
      </ReactAriaButton>
    );
  }
);
