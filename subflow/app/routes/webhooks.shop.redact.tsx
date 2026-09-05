import type { ActionFunctionArgs } from "react-router";
import { getShopify } from "../shopify.server";

// Mandatory GDPR webhook: sent 48 hours after a shop uninstalls the app,
// requiring any remaining shop data to be erased.
export const action = async ({ request, context }: ActionFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { shop, topic } = await shopify.authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const shopSessions = await shopify.sessionStorage.findSessionsByShop(shop);
  await shopify.sessionStorage.deleteSessions(shopSessions.map((s) => s.id));
  return new Response();
};
