import { Button } from "components/Button/Button";
import { ChevronRight } from "lucide-react";
import { useLoaderData, useNavigate } from "react-router";
import type { loader } from "./loader";

export default function ExhibitionPage() {
  const { exhibition } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-[400px] px-4 pt-10 flex flex-col gap-1">
      {exhibition?.large_image && (
        <img
          src={exhibition?.large_image}
          alt={exhibition?.name ?? ""}
          className="mb-6 w-full max-h-[45vh] rounded-lg object-cover"
        />
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
          Start experience
        </Button>
      </div>
    </div>
  );
}
