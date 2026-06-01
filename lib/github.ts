export async function createTravelIssue(input: {
  requestCode: string;
  wallet: string;
  hotelUrl: string;
  checkInDate: string;
  checkOutDate: string;
  roomType: string;
  occupancy: number;
  childrenCount?: number;
  childrenAges?: number[];
  infantsCount?: number;
  refundabilityPreference: string;
}) {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;

  if (!token || !owner || !repo) {
    return null;
  }

  const body = [
    `Request Code: ${input.requestCode}`,
    `Wallet: ${input.wallet}`,
    `Hotel URL: ${input.hotelUrl}`,
    `Check-in: ${input.checkInDate}`,
    `Check-out: ${input.checkOutDate}`,
    `Room Type: ${input.roomType}`,
    `Adults: ${input.occupancy}`,
    `Children: ${input.childrenCount ?? 0}`,
    input.childrenAges && input.childrenAges.length > 0
      ? `Children ages: ${input.childrenAges.join(", ")}`
      : null,
    `Infants: ${input.infantsCount ?? 0}`,
    `Refundability: ${input.refundabilityPreference}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: `Purple Club Request ${input.requestCode}`,
      body,
      labels: ["travel-request"],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub issue creation failed: ${text}`);
  }

  const data = (await response.json()) as { number: number; html_url: string };
  return { issueNumber: data.number, issueUrl: data.html_url };
}
