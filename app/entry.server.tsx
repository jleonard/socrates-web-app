import { PassThrough } from "node:stream";
import type { AppLoadContext, EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import * as Sentry from "@sentry/react-router";

export const streamTimeout = 5000;

// Global React Router error handler → Sentry reports loader/action errors
export const handleError = Sentry.createSentryHandleError({
  logErrors: true,
});

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  _loadContext: AppLoadContext
) {
  return isbot(request.headers.get("user-agent") || "")
    ? handleBotRequest(
        request,
        responseStatusCode,
        responseHeaders,
        reactRouterContext
      )
    : handleBrowserRequest(
        request,
        responseStatusCode,
        responseHeaders,
        reactRouterContext
      );
}

function handleBotRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        onAllReady() {
          shellRendered = true;

          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },

        onShellError(error) {
          Sentry.captureException(error);
          reject(error);
        },

        onError(error) {
          responseStatusCode = 500;
          Sentry.captureException(error);

          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(abort, streamTimeout + 1000);
  });
}

function handleBrowserRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        onShellReady() {
          shellRendered = true;

          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },

        onShellError(error) {
          Sentry.captureException(error);
          reject(error);
        },

        onError(error) {
          responseStatusCode = 500;
          Sentry.captureException(error);

          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(abort, streamTimeout + 1000);
  });
}
