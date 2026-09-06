import {
  GROWTH_PLAN,
  SCALE_PLAN,
  PLAN_TIERS,
  tierForSubscriberCount,
  type PlanTier,
} from "./shopify.server";

export async function getBillingStatus(admin: any, billing: any) {
  // read_own_subscription_contracts is a protected scope pending Shopify's
  // approval — until then this query is denied, so fail soft to zero
  // instead of blocking the merchant from using the app.
  let totalActiveSubscribers = 0;
  try {
    const contractsResponse = await admin.graphql(
      `#graphql
        query GetActiveSubscriptionContractCount {
          subscriptionContracts(first: 250, query: "status:active") {
            edges { node { id } }
          }
        }`,
    );
    const contractsJson = await contractsResponse.json();
    totalActiveSubscribers =
      contractsJson.data?.subscriptionContracts?.edges?.length ?? 0;
  } catch {
    // Scope not yet approved — treat as 0 until it is.
  }

  const billingCheck = await billing.check({
    plans: [GROWTH_PLAN, SCALE_PLAN],
    isTest: true, // TODO: flip to false before public launch — dev/test stores reject real charges
  });
  const activeNames = new Set(
    (billingCheck.appSubscriptions ?? []).map((s: any) => s.name),
  );
  let currentTier: PlanTier = PLAN_TIERS[0];
  if (activeNames.has(SCALE_PLAN)) currentTier = PLAN_TIERS[2];
  else if (activeNames.has(GROWTH_PLAN)) currentTier = PLAN_TIERS[1];

  const needsUpgrade = totalActiveSubscribers > currentTier.maxSubscribers;
  const nextTier = needsUpgrade
    ? tierForSubscriberCount(totalActiveSubscribers)
    : null;

  return { totalActiveSubscribers, currentTier, needsUpgrade, nextTier };
}
