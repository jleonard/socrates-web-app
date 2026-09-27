import { usePageConfig } from "app/hooks/usePageConfig";
import clsx from "clsx";
import { Container } from "components/Container/Container";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useNavOverlay } from "~/context/nav-overlay";

export const ControlBar = ({ className }: { className?: string }) => {
  const { isOpen, toggle } = useNavOverlay();
  const { hiddenControlBar } = usePageConfig();
  const { t } = useTranslation();

  if (hiddenControlBar) return null;

  {
    /* todo remove pointer events none and pointer events auto when bar is complete */
  }

  return (
    <div
      className={clsx(
        "bg-transparent px-4 py-5 rounded-t-xl z-50 pointer-events-none",
        className,
      )}
    >
      <Container className="flex flex-row justify-between">
        {/* left side */}
        <div className="flex flex-row gap-3">
          <Link
            to="/history"
            className="pointer-events-auto inline-flex flex-col gap-0 items-center justify-center w-[68px] h-[54px] text-xs"
          >
            <div className="w-6 h-6 flex items-center justify-center">
              {/* icon img */}
              <img src="/icons/History.svg" alt="History" />
            </div>
            {t("global.history")}
          </Link>
        </div>

        {/* right side */}
        <div className="flex flex-row gap-3">
          <button
            onClick={toggle}
            className="pointer-events-auto inline-flex flex-col gap-0 items-center justify-center w-[68px] h-[54px] text-xs"
          >
            <div className="w-6 h-6 flex items-center justify-center">
              {/* icon img */}
              {isOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <img src="/icons/Menu.svg" alt="Menu" />
              )}
            </div>
            {isOpen ? t("global.close") : t("global.menu")}
          </button>
        </div>
      </Container>
    </div>
  );
};
