import type { ActionFunctionArgs } from "react-router";
import { getShopify } from "../shopify.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { shop, session, topic } = await shopify.authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    const shopSessions = await shopify.sessionStorage.findSessionsByShop(shop);
    await shopify.sessionStorage.deleteSessions(shopSessions.map((s) => s.id));
  }

  return new Response();
};
