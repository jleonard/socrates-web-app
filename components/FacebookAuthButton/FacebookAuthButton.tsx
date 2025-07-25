import { FaFacebookF } from "react-icons/fa"; // Facebook icon
import React from "react";

import { FacebookAuthButtonProps } from "./FacebookAuthButton.types";

export const FacebookAuthButton = React.forwardRef<
  HTMLButtonElement,
  FacebookAuthButtonProps
>((props, ref) => {
  const { className, label = "Continue with Facebook", ...rest } = props;

  return (
    <>
      <button
        style={{ width: "364px" }}
        className="social-button social-button--facebook"
        {...rest}
      >
        <img src="/icons/Facebook.svg" className="size-[23px]" alt="Facebook" />
        <span>{label}</span>
      </button>
    </>
  );
});
