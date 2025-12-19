import { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { ShieldCheck } from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // In real life, look up the code in your DB to show status
  const status = code ? "Deleted" : "Unknown";

  return { code, status };
};

export default function DeletionStatus() {
  const { code, status } = useLoaderData<typeof loader>();
  return (
    <div className="max-w-md mx-auto mt-20 rounded-2xl p-8 border border-gray-200">
      <h1 className="flex items-center text-2xl font-bold text-gray-800 mb-4 space-x-2">
        <ShieldCheck className="w-6 h-6 text-green-600" />
        <span>Data Deletion Status</span>
      </h1>
      <div className="space-y-3 text-gray-700">
        <p>
          <span className="font-semibold">Confirmation Code:</span>{" "}
          <span className="text-blue-600 font-mono">{code}</span>
        </p>
        <p>
          <span className="font-semibold">Status:</span>{" "}
          <span
            className={`inline-block px-2 py-1 rounded text-sm font-semibold ${
              status === "Deleted"
                ? "bg-green-100 text-green-700"
                : status === "Pending"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {status}
          </span>
        </p>
        <div className="mt-6 text-sm text-gray-600 border-t pt-4">
          <p>
            Have questions? Reach out to us at{" "}
            <a
              href={`mailto:hello@wonderway.ai?subject=Question about data deletion – Confirmation Code: ${code}`}
              className="text-blue-600 hover:underline font-medium"
            >
              hello@wonderway.ai
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
