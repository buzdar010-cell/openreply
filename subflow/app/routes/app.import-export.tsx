import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { getShopify } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  await shopify.authenticate.admin(request);
  return null;
};

export default function ImportExportPage() {
  return (
    <s-page heading="Import / Export">
      <s-section>
        <s-stack direction="block" gap="base">
          <s-text type="strong">Coming soon</s-text>
          <s-paragraph>
            This is where you'll be able to migrate your existing
            subscriptions in from another app (Recharge, Bold, Skio, etc.)
            and export your Subflow plans as a backup. Migration is a
            planned feature, not an afterthought — Subflow won't launch
            publicly without it.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
