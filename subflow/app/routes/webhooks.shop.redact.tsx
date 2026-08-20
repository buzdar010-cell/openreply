import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory GDPR webhook: sent 48 hours after a shop uninstalls the app,
// requiring any remaining shop data to be erased.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  await db.session.deleteMany({ where: { shop } });
  return new Response();
};
