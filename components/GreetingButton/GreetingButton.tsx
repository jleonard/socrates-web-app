import React, { useState } from "react";

import { Button as ReactAriaButton } from "react-aria-components";
import type { ButtonProps as ReactAriaButtonProps } from "react-aria-components";

export const GreetingButton = React.forwardRef<
  HTMLButtonElement,
  ReactAriaButtonProps
>((props, ref) => {
  const { className, children, onPress, ...rest } = props;

  const [wasClicked, setWasClicked] = useState(false);

  function handlePress(e: any) {
    setWasClicked(true);
    // call the parent handler if it exists
    onPress?.(e);
  }
  /// pointer-events-none
  return (
    <ReactAriaButton
      ref={ref}
      onPress={handlePress}
      className={`h-screen w-screen fixed top-0 left-0 z-100 bg-transparent ${
        wasClicked ? "pointer-events-none" : ""
      } ${className}`}
      {...rest}
    ></ReactAriaButton>
  );
});
