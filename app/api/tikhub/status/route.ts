export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.TIKHUB_API_KEY;
  if (!apiKey) {
    return Response.json({ status: "NOT_CONFIGURED", balance: null, freeCredit: null, checkedAt: new Date().toISOString() });
  }

  try {
    const response = await fetch("https://api.tikhub.io/api/v1/tikhub/user/get_user_info", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json() as {
      code?: number;
      api_key_data?: { api_key_status?: number };
      user_data?: { balance?: number; free_credit?: number; is_active?: boolean; account_disabled?: boolean };
    };
    const healthy = response.ok && payload.code === 200 && payload.user_data?.is_active !== false && payload.user_data?.account_disabled !== true;
    return Response.json({
      status: healthy ? "HEALTHY" : "UNAVAILABLE",
      balance: payload.user_data?.balance ?? null,
      freeCredit: payload.user_data?.free_credit ?? null,
      checkedAt: new Date().toISOString(),
    }, { status: healthy ? 200 : 503 });
  } catch {
    return Response.json({ status: "UNAVAILABLE", balance: null, freeCredit: null, checkedAt: new Date().toISOString() }, { status: 503 });
  }
}
