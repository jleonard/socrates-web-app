import { useLoaderData } from "react-router";
import type { loader } from "./loader";
import { Form } from "react-router";

interface LoaderData {
  activeUsers: any[];
  purchases: any[]; // replace with proper type if you want
}

export default function Purchase() {
  const { activeUsers, purchases } = useLoaderData<LoaderData>();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Active Users (Last 24 Hours)</h2>

      <div className="grid gap-4">
        {activeUsers.map((user: any) => {
          const access = user.access?.[0]; // assuming one access record per user
          const hasProduct = Boolean(access?.product_code);

          //console.log("user: ", user);

          return (
            <div
              key={user.id}
              className="rounded-lg border border-gray-200 p-4 shadow-sm bg-white flex items-center justify-between"
            >
              {/* Left column */}
              <div>
                <p className="font-medium text-gray-900">{user.email}</p>
                <p className="text-sm text-gray-500">
                  Last seen: {new Date(user.last_seen).toLocaleString()}
                </p>

                {access ? (
                  <p className="text-sm text-gray-500">
                    Access expires:{" "}
                    {new Date(access.expiration).toLocaleString([], {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-red-500">No access record</p>
                )}
              </div>

              {/* Right column */}
              <div className="flex items-center gap-2">
                {hasProduct ? (
                  <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-3 py-1 text-xs font-medium">
                    Product Assigned
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-medium">
                    No Product
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
