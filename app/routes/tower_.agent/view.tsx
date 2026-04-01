import { useState } from "react";
import { useFetcher, useLoaderData, useSearchParams, Form } from "react-router";

import type { RedisEntry } from "~/types";
import type { loader } from "./loader";

// ─── View ─────────────────────────────────────────────────────────────────────
export default function CacheAdmin() {
  const { entries, total, page, search, pageSize } =
    useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const totalPages = Math.ceil(total / pageSize);

  const [selected, setSelected] = useState<RedisEntry | null>(null);
  const [confirming, setConfirming] = useState(false);

  function goToPage(p: number) {
    setSearchParams((prev) => {
      prev.set("page", String(p));
      return prev;
    });
    setSelected(null);
    setConfirming(false);
  }

  function handleDelete(key: string) {
    fetcher.submit({ key }, { method: "post" });
    setSelected(null);
    setConfirming(false);
  }

  return (
    <div className="absolute inset-0 overflow-y-auto py-10 px-4 max-w-3xl z-50 bg-paper">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-medium">Cache admin</h1>
        <p className="text-sm text-gray-500 mt-1">
          Inspect and delete Redis cache entries matching{" "}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
            cache:*
          </code>
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
          placeholder="Search by question…"
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
          No entries found.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <button
              key={entry.key}
              onClick={() => {
                setSelected(selected?.key === entry.key ? null : entry);
                setConfirming(false);
              }}
              className={`w-full text-left border rounded-xl px-4 py-3 hover:border-gray-300 transition-colors ${
                selected?.key === entry.key
                  ? "border-gray-400 bg-gray-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="text-sm truncate">{entry.question}</div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-400 font-mono truncate max-w-xs">
                  {entry.key}
                </span>
                <span className="text-xs text-gray-400 ml-4 shrink-0">
                  {parseInt(entry.hits || "0", 10)} hits
                </span>
              </div>
            </button>
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
        <div className="mt-6 border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
            <span className="text-sm font-medium">Entry detail</span>
            <div className="flex gap-2">
              {!confirming && (
                <button
                  onClick={() => setConfirming(true)}
                  className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => {
                  setSelected(null);
                  setConfirming(false);
                }}
                className="px-3 py-1.5 text-xs border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-4">
            <Field label="Question" value={selected.question} />
            <Field label="Answer" value={selected.answer} truncate />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tool" value={selected.tool} />
              <Field label="Hits" value={selected.hits} />
            </div>
            <Field label="Key" value={selected.key} mono />
            <Field label="Embedding" value={selected.embedding} truncate mono />
          </div>

          {confirming && (
            <div className="flex justify-between items-center px-4 py-3 border-t border-red-200 bg-red-50">
              <span className="text-sm text-red-600">
                Delete this entry? This cannot be undone.
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-500 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(selected.key)}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Yes, delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div
        className={`text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 ${
          mono ? "font-mono" : ""
        } ${truncate ? "truncate" : "break-all whitespace-pre-wrap"}`}
      >
        {value || "—"}
      </div>
    </div>
  );
}
