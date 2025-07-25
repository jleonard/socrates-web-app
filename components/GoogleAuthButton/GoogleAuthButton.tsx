import React from "react";

import { GoogleAuthButtonProps } from "./GoogleAuthButton.types";

// Got the code for the button here
// https://developers.google.com/identity/branding-guidelines

export const GoogleAuthButton = React.forwardRef<
  HTMLButtonElement,
  GoogleAuthButtonProps
>((props, ref) => {
  const { className, label = "Continue with Google", ...rest } = props;

  return (
    <>
      <button
        style={{ width: "364px" }}
        className="social-button social-button--google"
        {...rest}
      >
        <img src="/icons/Google.svg" className="size-[23px]" alt="Google" />
        <span>{label}</span>
      </button>
    </>
  );
});
