import { Button } from "components/Button/Button";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData, useNavigate } from "react-router";
import type { loader } from "./loader";

export default function ExhibitionPage() {
  const { exhibition } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-[400px] px-4 pt-10 flex flex-col gap-1">
      {exhibition?.large_image && (
        <figure className="mb-6">
          <img
            src={exhibition?.large_image}
            alt={exhibition?.name ?? ""}
            className="w-full max-h-[45vh] rounded-lg object-cover"
          />
          {/* Required for CC BY / BY-SA card photos (card-credit.txt in the Dropbox room). */}
          {exhibition?.image_credit && (
            <figcaption className="mt-1 text-[11px] leading-snug text-neutral-500">
              {exhibition.image_credit_url ? (
                <a
                  href={exhibition.image_credit_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-neutral-300 underline-offset-2"
                >
                  {exhibition.image_credit}
                </a>
              ) : (
                exhibition.image_credit
              )}
            </figcaption>
          )}
        </figure>
      )}
      {/* Sticks to the bottom of <main>, i.e. just above the ControlBar; the image scrolls behind it. */}
      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-3 flex flex-col gap-1 bg-neutral-50">
        <h1 className="text-2xl font-semibold">
          {exhibition?.name ?? "Untitled Exhibition"}
        </h1>

        {/* Long descriptions scroll inside the panel so it never fills the screen. */}
        {exhibition?.description && (
          <p className="text text-neutral-600 max-h-[30svh] overflow-y-auto">
            {exhibition?.description}
          </p>
        )}

        <Button
          className="w-full mt-4 text-sm tracking-widest"
          trailingContent={
            <ChevronRight size={18} strokeWidth={1} color="#fff" />
          }
          onPress={() => navigate(`/app/?place=${exhibition.child_id}`)}
        >
          {t("exhibition.start_experience")}
        </Button>
      </div>
    </div>
  );
}
