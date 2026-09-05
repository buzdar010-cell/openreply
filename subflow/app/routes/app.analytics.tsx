import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { getShopify } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  await shopify.authenticate.admin(request);
  return null;
};

export default function AnalyticsPage() {
  return (
    <s-page heading="Analytics">
      <s-section>
        <s-stack direction="block" gap="base">
          <s-text type="strong">Coming soon</s-text>
          <s-paragraph>
            We're building out a real analytics view here: monthly recurring
            revenue, active vs. cancelled subscribers over time, and how
            each plan is performing. For now, per-plan subscriber counts are
            available on the "Your subscription plans" page.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
