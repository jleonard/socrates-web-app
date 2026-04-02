import { useState } from "react";
import { useFetcher, useLoaderData, useSearchParams, Form } from "react-router";

import type { AgentResponse } from "~/types";
import type { loader } from "./loader";

// ─── View ─────────────────────────────────────────────────────────────────────
export default function AgentResponseAdmin() {
  const { entries, total, page, search, pageSize } =
    useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const fetcher = useFetcher();
  const totalPages = Math.ceil(total / pageSize);

  const [selected, setSelected] = useState<AgentResponse | null>(null);
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
    <div className="absolute inset-0 overflow-y-auto py-10 px-4 max-w-3xl z-50 bg-paper">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-medium">Agent response admin</h1>
        <p className="text-sm text-gray-500 mt-1">
          Inspect and annotate agent responses from Supabase.
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
          placeholder="Search by query…"
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
              key={entry.id}
              onClick={() => {
                setSelected(selected?.id === entry.id ? null : entry);
                setQa("");
              }}
              className={`w-full text-left border rounded-sm px-4 py-3 hover:border-gray-300 transition-colors ${
                selected?.id === entry.id
                  ? "border-gray-400 bg-gray-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="text-sm truncate">{entry.query ?? "—"}</div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-600 font-mono truncate max-w-xs">
                  {entry.rag_index ?? "—"}
                </span>
                <span className="text-xs text-gray-400 font-mono truncate max-w-xs">
                  {entry.user_id ?? "—"}
                </span>

                <div className="flex gap-2 ml-4 shrink-0 justify-center items-center">
                  <span className="text-xs text-gray-600">
                    {formatDate(entry.created_at)}
                  </span>
                  <Check label="cache" value={entry.tool_cache} />
                  <Check
                    label={`rag ${entry.rag_score?.toFixed(2) ?? "—"}`}
                    value={entry.tool_rag}
                  />{" "}
                  <Check label="wiki" value={entry.tool_wikipedia} />
                  <Check label="follow up" value={entry.tool_followup} />
                </div>
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

          <div className="p-4 flex flex-col gap-4">
            <Field label="User ID" value={selected.user_id} mono />
            <Field label="Query" value={selected.query} />
            <Field label="Response" value={selected.response} />
            <div className="grid grid-cols-3 gap-4">
              <CheckField label="Cache" value={selected.tool_cache} />
              <CheckField label="RAG" value={selected.tool_rag} />
              <CheckField label="Wikipedia" value={selected.tool_wikipedia} />
              <CheckField label="Wikipedia" value={selected.tool_followup} />
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                QA annotation
              </div>
              <textarea
                value={qa}
                onChange={(e) => setQa(e.target.value)}
                placeholder="Add a QA note…"
                rows={3}
                className="w-full text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 outline-none focus:border-gray-400 resize-none"
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
      )}
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div
        className={`text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 break-all whitespace-pre-wrap ${
          mono ? "font-mono" : ""
        }`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

// ─── CheckField ───────────────────────────────────────────────────────────────
function CheckField({
  label,
  value,
}: {
  label: string;
  value: boolean | null;
}) {
  return (
    <div>
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
        {value ? "✓" : "—"}
      </div>
    </div>
  );
}

// ─── Check (inline badge) ─────────────────────────────────────────────────────
function Check({ label, value }: { label: string; value: boolean | null }) {
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded ${
        value
          ? "bg-green-600 text-green-200 border border-green-200"
          : "bg-gray-50 text-gray-300 border border-gray-200"
      }`}
    >
      {label}
    </span>
  );
}
