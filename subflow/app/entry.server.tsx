import { renderToReadableStream } from "react-dom/server.browser";
import { ServerRouter } from "react-router";
import { type AppLoadContext, type EntryContext } from "react-router";
import { isbot } from "isbot";
import { getShopify } from "./shopify.server";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  loadContext: AppLoadContext
) {
  const shopify = getShopify(loadContext.cloudflare.env);
  shopify.addDocumentResponseHeaders(request, responseHeaders);

  let shellRendered = false;
  const userAgent = request.headers.get("user-agent");

  const body = await renderToReadableStream(
    <ServerRouter context={reactRouterContext} url={request.url} />,
    {
      onError(error: unknown) {
        responseStatusCode = 500;
        if (shellRendered) {
          console.error(error);
        }
      },
    },
  );
  shellRendered = true;

  if (userAgent && isbot(userAgent)) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
