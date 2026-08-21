import "@shopify/shopify-api/adapters/cf-worker";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { D1SessionStorage } from "./db.server";

export const GROWTH_PLAN = "Growth";
export const SCALE_PLAN = "Scale";
export const apiVersion = ApiVersion.July26;

export interface PlanTier {
  key: "free" | "growth" | "scale" | "enterprise";
  billingPlanName: string | null;
  label: string;
  maxSubscribers: number;
  price: number | null;
}

export const PLAN_TIERS: PlanTier[] = [
  { key: "free", billingPlanName: null, label: "Free", maxSubscribers: 100, price: null },
  { key: "growth", billingPlanName: GROWTH_PLAN, label: "Growth", maxSubscribers: 250, price: 9.99 },
  { key: "scale", billingPlanName: SCALE_PLAN, label: "Scale", maxSubscribers: 1000, price: 24.99 },
  { key: "enterprise", billingPlanName: null, label: "Enterprise", maxSubscribers: Infinity, price: null },
];

export function tierForSubscriberCount(count: number): PlanTier {
  return (
    PLAN_TIERS.find((tier) => count <= tier.maxSubscribers) ??
    PLAN_TIERS[PLAN_TIERS.length - 1]
  );
}

export interface Env {
  DB: D1Database;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SCOPES: string;
  SHOPIFY_APP_URL: string;
}

function buildShopifyApp(env: Env) {
  return shopifyApp({
    apiKey: env.SHOPIFY_API_KEY,
    apiSecretKey: env.SHOPIFY_API_SECRET || "",
    apiVersion,
    scopes: env.SCOPES?.split(","),
    appUrl: env.SHOPIFY_APP_URL || "",
    authPathPrefix: "/auth",
    sessionStorage: new D1SessionStorage(env.DB),
    distribution: AppDistribution.AppStore,
    billing: {
      [GROWTH_PLAN]: {
        lineItems: [
          {
            amount: 9.99,
            currencyCode: "USD",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
      [SCALE_PLAN]: {
        lineItems: [
          {
            amount: 24.99,
            currencyCode: "USD",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
    },
    future: {
      expiringOfflineAccessTokens: true,
    },
  });
}

let cached: ReturnType<typeof buildShopifyApp> | undefined;

export function getShopify(env: Env) {
  if (!cached) {
    cached = buildShopifyApp(env);
  }
  return cached;
}
