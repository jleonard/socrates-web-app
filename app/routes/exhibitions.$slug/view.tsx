import { Button } from "components/Button/Button";
import { ChevronRight } from "lucide-react";
import { useLoaderData, useNavigate } from "react-router";
import type { loader } from "./loader";

export default function ExhibitionPage() {
  const { exhibition } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-[400px] px-4 py-10 flex flex-col gap-1">
      {exhibition?.large_image && (
        <img
          src={exhibition?.large_image}
          alt={exhibition?.name ?? ""}
          className="mb-6 rounded-lg "
        />
      )}
      <div className="w-full gap-1 flex flex-col">
        <h1 className="text-2xl font-semibold">
          {exhibition?.name ?? "Untitled Exhibition"}
        </h1>

        {exhibition?.description && (
          <p className="text text-neutral-600">{exhibition?.description}</p>
        )}
      </div>
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
  );
}
