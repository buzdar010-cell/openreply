import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// Subflow's backend — hardcoded because extensions are compiled once and
// hosted by Shopify, with no access to our app's runtime environment.
const APP_URL = 'https://subflow.buzdar0003.workers.dev';

export default async () => {
  render(<Extension />, document.body);
};

function badgeTone(status) {
  if (status === 'CANCELLED' || status === 'EXPIRED' || status === 'FAILED') {
    return 'critical';
  }
  return 'neutral';
}

function Extension() {
  const [contracts, setContracts] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function authedFetch(path, options = {}) {
    const token = await shopify.sessionToken.get();
    return fetch(`${APP_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async function loadContracts() {
    try {
      const res = await authedFetch('/customer-account/subscriptions');
      const data = await res.json();
      setContracts(data.contracts || []);
    } catch {
      setError('Could not load your subscriptions.');
    }
  }

  useEffect(() => {
    loadContracts();
  }, []);

  async function runAction(contractId, intent) {
    setBusyId(contractId);
    setError(null);
    try {
      const body = new URLSearchParams({ intent, contractId });
      const res = await authedFetch('/customer-account/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = await res.json();
      if (data.userErrors && data.userErrors.length > 0) {
        setError(data.userErrors[0].message);
      } else if (data.error) {
        setError(data.error);
      } else {
        await loadContracts();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  if (contracts === null && !error) {
    return (
      <s-page heading="Your subscriptions">
        <s-spinner accessibilityLabel="Loading your subscriptions" />
      </s-page>
    );
  }

  return (
    <s-page heading="Your subscriptions">
      {error && (
        <s-banner tone="critical" heading="Something went wrong">
          <s-text>{error}</s-text>
        </s-banner>
      )}

      {contracts && contracts.length === 0 && (
        <s-section>
          <s-text>You don't have any active subscriptions yet.</s-text>
        </s-section>
      )}

      {contracts &&
        contracts.map((contract) => {
          const isBusy = busyId === contract.id;
          return (
            <s-section
              key={contract.id}
              heading={contract.productNames.join(', ') || 'Subscription'}
            >
              <s-stack direction="block" gap="base">
                <s-badge tone={badgeTone(contract.status)}>{contract.status}</s-badge>
                <s-stack direction="inline" gap="small">
                  {contract.status === 'ACTIVE' && (
                    <s-button
                      variant="secondary"
                      onClick={() => runAction(contract.id, 'skip')}
                      {...(isBusy ? { loading: true } : {})}
                    >
                      Skip next delivery
                    </s-button>
                  )}
                  {contract.status === 'ACTIVE' && (
                    <s-button
                      variant="secondary"
                      onClick={() => runAction(contract.id, 'pause')}
                      {...(isBusy ? { loading: true } : {})}
                    >
                      Pause
                    </s-button>
                  )}
                  {contract.status === 'PAUSED' && (
                    <s-button
                      variant="primary"
                      onClick={() => runAction(contract.id, 'resume')}
                      {...(isBusy ? { loading: true } : {})}
                    >
                      Resume
                    </s-button>
                  )}
                  {(contract.status === 'ACTIVE' || contract.status === 'PAUSED') && (
                    <s-button
                      variant="secondary"
                      tone="critical"
                      onClick={() => runAction(contract.id, 'cancel')}
                      {...(isBusy ? { loading: true } : {})}
                    >
                      Cancel
                    </s-button>
                  )}
                </s-stack>
              </s-stack>
            </s-section>
          );
        })}
    </s-page>
  );
}
