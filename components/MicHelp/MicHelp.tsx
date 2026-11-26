import { useState } from "react";
import { MicOff, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MicHelpProps } from "./MicHelp.types";

/**
 * Shown when the microphone can't be used: how to unblock it in this
 * browser, a Reload button (iOS Safari keeps refusing until a reload once
 * "Don't Allow" was tapped) and, in an app's built-in browser, a link to copy
 * into Safari or Chrome. Not a modal: the main button stays tappable.
 */
export function MicHelp({ problem, browser, link, onClose }: MicHelpProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // no clipboard access: select-and-copy from the text below instead
      setCopied(false);
    }
  };

  const title =
    problem === "blocked"
      ? t("mic.title_blocked")
      : problem === "dismissed"
        ? t("mic.title_dismissed")
        : t("mic.title_unavailable");

  const body =
    problem === "blocked"
      ? t(`mic.steps.${browser}`)
      : problem === "dismissed"
        ? t("mic.dismissed")
        : t("mic.unavailable");

  return (
    <div
      role="alert"
      className="fixed left-1/2 -translate-x-1/2 bottom-40 z-40 w-[calc(100vw-32px)] max-w-sm rounded-lg bg-white p-4 text-gray-900 shadow-lg"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("global.close")}
        className="absolute right-2 top-2 p-1 text-gray-500"
      >
        <X size={18} />
      </button>
      <div className="flex items-center gap-2 pr-6 font-semibold">
        <MicOff size={18} className="shrink-0 text-red-700" />
        {title}
      </div>
      <p className="mt-2 text-sm text-gray-700">{body}</p>

      {problem === "blocked" && browser === "in-app" && (
        <>
          <p className="mt-2 break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 select-all">
            {link}
          </p>
          <button
            type="button"
            onClick={copyLink}
            className="mt-3 w-full rounded-lg bg-black py-2 font-medium text-white"
          >
            {copied ? t("mic.copied") : t("mic.copy_link")}
          </button>
        </>
      )}

      {problem === "blocked" && browser !== "in-app" && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-3 w-full rounded-lg bg-black py-2 font-medium text-white"
        >
          {t("mic.reload")}
        </button>
      )}
    </div>
  );
}
