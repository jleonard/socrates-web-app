/*
 * This is the main error boundary in the front end app so we can use Sentry
 */
import * as Sentry from "@sentry/react-router";
import {
  isRouteErrorResponse,
  useRouteError,
  type ErrorResponse,
} from "react-router";

export function ErrorBoundary() {
  const error = useRouteError() as Error | ErrorResponse | undefined;

  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error instanceof Error) {
    // capture non-404 runtime exceptions
    Sentry.captureException(error);

    if (import.meta.env.DEV) {
      details = error.message;
      stack = error.stack;
    }
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
