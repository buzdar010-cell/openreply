import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Mandatory GDPR webhook: a customer or their representative requested a
// copy of the data this app stores about them. Subflow doesn't store any
// customer-specific data (only shop-level session records), so there's
// nothing to return.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
