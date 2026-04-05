import { useState } from "react";
import { useFetcher, useLoaderData, useSearchParams, Form } from "react-router";
import type { ElevenLabsConversation } from "~/types";
import { ElevenLabsConversationView } from "components/admin/ElevenLabsConversationView/ElevenLabsConversationView";
import type { loader } from "./loader";

export default function ElevenLabsConversationAdmin() {
  const { entries, total, page, search, pageSize } =
    useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const totalPages = Math.ceil(total / pageSize);

  const [selected, setSelected] = useState<ElevenLabsConversation | null>(null);
  const [qa, setQa] = useState("");

  function goToPage(p: number) {
    setSearchParams((prev) => {
      prev.set("page", String(p));
      return prev;
    });
    setSelected(null);
    setQa("");
  }

  function handleSave() {
    if (!selected) return;
    fetcher.submit({ id: String(selected.id), qa }, { method: "post" });
    setSelected(null);
    setQa("");
  }

  return (
    <div className="absolute inset-0 overflow-y-auto py-10 px-4 max-w-3xl z-50 bg-paper">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-medium">ElevenLabs conversation admin</h1>
        <p className="text-sm text-gray-500 mt-1">
          Inspect and annotate agent conversations.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="text-xs text-gray-400 uppercase tracking-wide">
            Total
          </div>
          <div className="text-xl font-medium mt-1">{total}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="text-xs text-gray-400 uppercase tracking-wide">
            Page
          </div>
          <div className="text-xl font-medium mt-1">
            {totalPages === 0 ? "—" : `${page + 1} / ${totalPages}`}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="text-xs text-gray-400 uppercase tracking-wide">
            Page size
          </div>
          <div className="text-xl font-medium mt-1">{pageSize}</div>
        </div>
      </div>

      {/* Search */}
      <Form method="get" className="flex gap-2 mb-4">
        <input
          name="q"
          defaultValue={search}
          placeholder="Search conversations…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
        />
        <input type="hidden" name="page" value="0" />
        <button
          type="submit"
          className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Search
        </button>
        {search && (
          <a
            href="?"
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500"
          >
            Clear
          </a>
        )}
      </Form>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No conversations found.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`border rounded-xl overflow-hidden transition-colors ${
                selected?.id === entry.id
                  ? "border-gray-400"
                  : "border-gray-200"
              }`}
            >
              <div className="p-4">
                <ElevenLabsConversationView conversation={entry} />
              </div>

              {/* Footer bar */}
              <div className="flex items-center px-4 py-2 border-t border-gray-200 bg-gray-50">
                {entry.qa && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 text-xs">
                    QA
                  </span>
                )}
                <button
                  onClick={() => {
                    setSelected(selected?.id === entry.id ? null : entry);
                    setQa(entry.qa ?? "");
                  }}
                  className="ml-auto text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white transition-colors"
                >
                  {selected?.id === entry.id ? "Close" : "Annotate"}
                </button>
              </div>

              {/* Inline QA panel */}
              {selected?.id === entry.id && (
                <div className="px-4 py-3 border-t border-gray-200 flex flex-col gap-3">
                  <div className="text-xs text-gray-400 uppercase tracking-wide">
                    QA annotation
                  </div>
                  <textarea
                    value={qa}
                    onChange={(e) => setQa(e.target.value)}
                    placeholder="Add a QA note…"
                    rows={3}
                    className="w-full text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 outline-none focus:border-gray-400 resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSave}
                      disabled={!qa || fetcher.state === "submitting"}
                      className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {fetcher.state === "submitting" ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-gray-500">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of{" "}
            {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
