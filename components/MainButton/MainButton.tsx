import React from "react";

import { Button as ReactAriaButton } from "react-aria-components";
import { useTranslation } from "react-i18next";

import { MainButtonStyles } from "./MainButton.styles";
import { MainButtonProps } from "./MainButton.types";

import { LoaderCircle } from "lucide-react";

export const MainButton = React.forwardRef<HTMLButtonElement, MainButtonProps>(
  (props, ref) => {
    const {
      className,
      mode,
      userAccess,
      expiration,
      label = "Start",
      children,
      ...rest
    } = props;

    const { t } = useTranslation();

    function getTimeRemainingLabel(expiration: string) {
      const end = new Date(expiration);
      const now = new Date();
      const diffMs = end.getTime() - now.getTime();

      if (diffMs <= 0) return "";

      const minutes = Math.floor(diffMs / 60_000);
      if (minutes < 60) {
        return t("main_button.minutes_remaining", { count: minutes });
      }

      const hours = Math.floor(minutes / 60);
      if (hours < 24) {
        return t("main_button.hours_remaining", { count: hours });
      }

      const days = Math.floor(hours / 24);
      if (days < 7) {
        return t("main_button.days_remaining", { count: days });
      }

      if (days < 30) {
        const weeks = Math.floor(days / 7);
        return t("main_button.weeks_remaining", { count: weeks });
      }

      const months = Math.floor(days / 30);
      return t("main_button.months_remaining", { count: months });
    }

    return (
      <>
        {/* the agent-state text ("Press to talk", "Ask away", …) lives in
            app/routes/app/view.tsx */}
        <ReactAriaButton
          ref={ref}
          className={MainButtonStyles({ mode, className })}
          {...rest}
        >
          <>
            {mode === "connecting" && (
              <LoaderCircle className="animate-spin" size={24} />
            )}
            {mode === "listening" && (
              <img src="/icons/Stop.svg" className="size-[26px]" />
            )}

            {mode === "speaking" && (
              <img src="/icons/Stop.svg" className="size-[26px]" />
            )}

            {mode === "disconnected" && (
              <span className="font-bold">{label}</span>
            )}

            {children}
          </>
        </ReactAriaButton>
        {userAccess !== "unused" && (
          <span className="fixed left-1/2 -translate-x-1/2 bottom-8 z-20 text-center">
            {getTimeRemainingLabel(expiration)}
          </span>
        )}
      </>
    );
  },
);
