export default function HelpPage() {
  return (
    <s-page heading="Help">
      <s-section heading="How Subflow works">
        <s-paragraph>
          Subflow adds a "Subscribe & Save" option to any product you choose.
          Customers who subscribe get your chosen discount and are billed
          automatically at the interval you set — you keep the sale without
          having to remind anyone to reorder.
        </s-paragraph>
        <s-paragraph>
          From the Dashboard, pick one or more products, choose a discount
          (5-20%) and a delivery interval (7-60 days), then create the plan.
          It appears automatically at checkout for those products — no theme
          changes needed.
        </s-paragraph>
      </s-section>

      <s-section heading="Billing">
        <s-paragraph>
          Subflow is free for up to 100 active subscribers. Past that, plans
          scale with your subscriber count: $9.99/month up to 250, $24.99/month
          up to 1,000, and a custom Enterprise plan beyond that. See the
          Billing tab for your current usage and to upgrade.
        </s-paragraph>
      </s-section>

      <s-section heading="Removing a plan">
        <s-paragraph>
          Deleting a plan from the Dashboard removes the "Subscribe & Save"
          option from checkout going forward. Customers already subscribed
          keep their existing subscription — deleting a plan doesn't cancel
          anyone automatically.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Need more help?">
        <s-paragraph>
          Reach out any time and we'll get back to you as soon as we can.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
