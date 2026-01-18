const GA_ENDPOINT = "https://www.google-analytics.com/mp/collect";

export async function sendPurchaseToGA({
  clientId,
  transactionId,
  value = 0,
  currency = "USD",
}: {
  clientId: string;
  transactionId: string;
  value: number;
  currency?: string;
}) {
  const payload = {
    client_id: clientId,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: transactionId,
          value,
          currency,
        },
      },
    ],
  };

  const url = `${GA_ENDPOINT}?measurement_id=${process.env.GA_TRACKING_ID}&api_secret=${process.env.GA_SECRET}`;

  await fetch(url, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
