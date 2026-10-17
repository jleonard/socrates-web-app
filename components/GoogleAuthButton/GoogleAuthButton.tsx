import React from "react";

import { useTranslation } from "react-i18next";
import { GoogleAuthButtonProps } from "./GoogleAuthButton.types";

// Got the code for the button here
// https://developers.google.com/identity/branding-guidelines

export const GoogleAuthButton = React.forwardRef<
  HTMLButtonElement,
  GoogleAuthButtonProps
>((props, ref) => {
  const { t } = useTranslation();
  const {
    className,
    label = `${t("global.continue_with", { provider: "Google" })}`,
    ...rest
  } = props;

  return (
    <>
      <button
        style={{ width: "364px" }}
        className="social-button border border-[#E6EAED]"
        {...rest}
      >
        <img src="/icons/Google.svg" className="size-[23px]" alt="Google" />
        <span>{label}</span>
      </button>
    </>
  );
});
