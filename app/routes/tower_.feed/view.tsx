import { useState } from "react";
import { useFetcher, useLoaderData, useSearchParams, Form } from "react-router";

import type { AppEventLog } from "~/types";
import type { loader } from "./loader";
import { FeedRow } from "components/admin/FeedRow/FeedRow";

// ─── View ─────────────────────────────────────────────────────────────────────
export default function FeedView() {
  const { entries, total, page, search, pageSize } =
    useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const totalPages = Math.ceil(total / pageSize);

  const [selected, setSelected] = useState<AppEventLog | null>(null);
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

  // add this helper near the bottom with the other helpers
  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="absolute inset-0 overflow-y-auto py-10 px-4 max-w-4xl z-50 bg-paper">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-medium">App Event Log</h1>
        <p className="text-sm text-gray-500 mt-1">' '</p>
      </div>

      {/* Stats todo - hidden*/}
      <div className="grid grid-cols-3 gap-3 mb-6 hidden">
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
          placeholder="Search"
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
          No events found.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {entries.map((entry) => (
            <FeedRow
              key={entry.id}
              onNotesClick={(selected: AppEventLog) => {
                setSelected(selected);
                setQa(selected?.qa ? selected.qa : "");
              }}
              appEventLog={entry}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-gray-500">
            {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of{" "}
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

      {/* Detail drawer */}
      {selected && (
        <div className="fixed bg-slate-900/20 inset-0 flex overflow-hidden justify-center items-center">
          <div className="flex flex-col gap-2 bg-white w-3/4 rounded-sm px-4 py-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Notes</span>
              <button
                onClick={() => {
                  setSelected(null);
                  setQa("");
                }}
                className="px-3 py-1.5 text-xs border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="flex flex-col">
              <div className="text-sm py-2 pb-4">{selected?.event_message}</div>
              <div>
                <div className="text-xs text-gray-700 uppercase tracking-wide mb-1">
                  QA annotation
                </div>
                <textarea
                  value={qa}
                  onChange={(e) => setQa(e.target.value)}
                  placeholder="Add a QA note…"
                  rows={3}
                  className="w-full text-sm bg-yellow-50 rounded-lg px-3 py-2 border border-yellow-200 outline-none focus:border-gray-400 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
              <button
                onClick={handleSave}
                disabled={!qa || fetcher.state === "submitting"}
                className="px-3 py-1.5 text-xs bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {fetcher.state === "submitting" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
