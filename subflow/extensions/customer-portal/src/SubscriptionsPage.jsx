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

function formatMoney(amount, currencyCode) {
  if (amount == null) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode || 'USD',
    }).format(Number(amount));
  } catch {
    return `${amount} ${currencyCode || ''}`.trim();
  }
}

function formatFrequency(interval, intervalCount) {
  if (!interval) return null;
  const unit = interval.toLowerCase();
  const count = intervalCount || 1;
  const unitLabel = count === 1 ? unit : `${unit}s`;
  return count === 1 ? `Every ${unitLabel}` : `Every ${count} ${unitLabel}`;
}

function formatDate(dateString) {
  if (!dateString) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

const SUCCESS_MESSAGES = {
  pause: 'Your subscription has been paused.',
  resume: 'Your subscription has been resumed.',
  cancel: 'Your subscription has been cancelled.',
  skip: 'Your next delivery has been skipped.',
};

const CONFIRM_COPY = {
  pause: {
    heading: 'Pause this subscription?',
    body: "You won't be charged or receive deliveries until you resume it.",
    confirmLabel: 'Pause subscription',
  },
  cancel: {
    heading: 'Cancel this subscription?',
    body: "This can't be undone — you'll need to subscribe again to restart it.",
    confirmLabel: 'Cancel subscription',
  },
  skip: {
    heading: 'Skip your next delivery?',
    body: "You won't be charged or receive a delivery for the upcoming cycle. Later deliveries are not affected.",
    confirmLabel: 'Skip delivery',
  },
};

function Extension() {
  const [contracts, setContracts] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
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
    setSuccessMessage(null);
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
        setSuccessMessage(SUCCESS_MESSAGES[intent] || 'Done.');
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

      {successMessage && (
        <s-banner tone="success" heading={successMessage} />
      )}

      {contracts && contracts.length === 0 && (
        <s-section>
          <s-text>You don't have any active subscriptions yet.</s-text>
        </s-section>
      )}

      {contracts &&
        contracts.map((contract) => {
          const isBusy = busyId === contract.id;
          const skipModalId = `confirm-skip-${contract.id}`;
          const pauseModalId = `confirm-pause-${contract.id}`;
          const cancelModalId = `confirm-cancel-${contract.id}`;
          return (
            <s-section
              key={contract.id}
              heading={contract.lines.map((l) => l.title).join(', ') || 'Subscription'}
            >
              <s-stack direction="block" gap="base">
                <s-badge tone={badgeTone(contract.status)}>{contract.status}</s-badge>

                {contract.lines.map((line, i) => (
                  <s-stack key={i} direction="inline" gap="small">
                    {line.imageUrl && (
                      <s-image
                        src={line.imageUrl}
                        alt={line.imageAlt}
                        aspectRatio="1"
                        objectFit="cover"
                        borderRadius="base"
                        inlineSize="64px"
                      />
                    )}
                    <s-stack direction="block" gap="none">
                      <s-text>
                        {line.title}
                        {line.quantity > 1 ? ` × ${line.quantity}` : ''}
                      </s-text>
                      <s-text tone="subdued">{formatMoney(line.price, line.currencyCode)}</s-text>
                    </s-stack>
                  </s-stack>
                ))}

                {(formatFrequency(contract.interval, contract.intervalCount) ||
                  (contract.status === 'ACTIVE' && contract.nextBillingDate)) && (
                  <s-text tone="subdued">
                    {[
                      formatFrequency(contract.interval, contract.intervalCount),
                      contract.status === 'ACTIVE' && contract.nextBillingDate
                        ? `Next delivery: ${formatDate(contract.nextBillingDate)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </s-text>
                )}

                <s-stack direction="inline" gap="small">
                  {contract.status === 'ACTIVE' && (
                    <s-button
                      variant="secondary"
                      command="--show"
                      commandFor={skipModalId}
                      {...(isBusy ? { loading: true } : {})}
                    >
                      Skip next delivery
                    </s-button>
                  )}
                  {contract.status === 'ACTIVE' && (
                    <s-button
                      variant="secondary"
                      command="--show"
                      commandFor={pauseModalId}
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
                      command="--show"
                      commandFor={cancelModalId}
                      {...(isBusy ? { loading: true } : {})}
                    >
                      Cancel
                    </s-button>
                  )}
                </s-stack>
              </s-stack>

              <ConfirmModal
                id={skipModalId}
                intent="skip"
                isBusy={isBusy}
                onConfirm={() => runAction(contract.id, 'skip')}
              />
              <ConfirmModal
                id={pauseModalId}
                intent="pause"
                isBusy={isBusy}
                onConfirm={() => runAction(contract.id, 'pause')}
              />
              <ConfirmModal
                id={cancelModalId}
                intent="cancel"
                isBusy={isBusy}
                onConfirm={() => runAction(contract.id, 'cancel')}
              />
            </s-section>
          );
        })}
    </s-page>
  );
}

function ConfirmModal({ id, intent, isBusy, onConfirm }) {
  const copy = CONFIRM_COPY[intent];
  return (
    <s-modal id={id} heading={copy.heading}>
      <s-paragraph>{copy.body}</s-paragraph>
      <s-stack direction="inline" gap="small">
        <s-button
          variant="primary"
          tone="critical"
          command="--hide"
          commandFor={id}
          onClick={onConfirm}
          {...(isBusy ? { loading: true } : {})}
        >
          {copy.confirmLabel}
        </s-button>
        <s-button command="--hide" commandFor={id}>
          Never mind
        </s-button>
      </s-stack>
    </s-modal>
  );
}
