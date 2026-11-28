import { Button } from "components/Button/Button";
import { ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LocationPaneProps } from "./LocationPane.types";

/**
 * Bottom sheet for a place picked on the map. Absolutely positioned, so the
 * parent must be `relative` and end where the ControlBar begins (i.e. fill
 * <main>). Takes at most the lower half; long descriptions scroll inside.
 */
export function LocationPane({
  title,
  description,
  onStart,
  onClose,
}: LocationPaneProps) {
  const { t } = useTranslation();

  return (
    <div
      role="dialog"
      aria-label={title}
      className="absolute inset-x-0 bottom-0 z-10 max-h-[50%] flex flex-col gap-1 rounded-t-2xl bg-neutral-50 px-4 pt-7 pb-3 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
    >
      <div className="mx-auto w-full max-w-[400px] flex flex-col gap-1 min-h-0">
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-2xl font-semibold">{title}</h2>
          <Button
            unstyled
            aria-label={t("global.close")}
            onPress={onClose}
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-neutral-500 hover:bg-neutral-200"
          >
            <X size={20} strokeWidth={1.5} />
          </Button>
        </div>

        {description && (
          <p className="min-h-0 overflow-y-auto text-neutral-600">
            {description}
          </p>
        )}

        <Button
          className="w-full mt-4 shrink-0 text-sm tracking-widest"
          trailingContent={
            <ChevronRight size={18} strokeWidth={1} color="#fff" />
          }
          onPress={onStart}
        >
          {t("exhibition.start_experience")}
        </Button>
      </div>
    </div>
  );
}
