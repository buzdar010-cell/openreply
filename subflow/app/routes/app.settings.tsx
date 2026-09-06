import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { getShopify } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  await shopify.authenticate.admin(request);
  return null;
};

export default function SettingsPage() {
  return (
    <s-page heading="Settings">
      <s-section>
        <s-stack direction="block" gap="base">
          <s-text type="strong">Coming soon</s-text>
          <s-paragraph>
            App-wide settings will live here — things like a default
            discount and delivery interval for new plans, so you don't have
            to reset them every time.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
