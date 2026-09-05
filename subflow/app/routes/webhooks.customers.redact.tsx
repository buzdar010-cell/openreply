import type { ActionFunctionArgs } from "react-router";
import { getShopify } from "../shopify.server";

// Mandatory GDPR webhook: erase a customer's data. Subflow doesn't store
// any customer-specific data (only shop-level session records), so there's
// nothing to redact.
export const action = async ({ request, context }: ActionFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { shop, topic } = await shopify.authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
