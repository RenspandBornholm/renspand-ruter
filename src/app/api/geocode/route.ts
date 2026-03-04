import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { address } = (await req.json()) as { address?: string };

    if (!address || !address.trim()) {
      return NextResponse.json({ error: "Missing address" }, { status: 400 });
    }

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "Missing GOOGLE_MAPS_API_KEY" }, { status: 500 });
    }

    const url =
      "https://maps.googleapis.com/maps/api/geocode/json?address=" +
      encodeURIComponent(address) +
      "&key=" +
      encodeURIComponent(key);

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json(
        { error: "Geocode failed", status: data.status, data },
        { status: 400 }
      );
    }

    const result = data.results[0];
const loc = result.geometry.location;
const components = result.address_components ?? [];

// helper function
function getComponent(type: string) {
  return components.find((c: any) =>
    c.types?.includes(type)
  )?.long_name ?? null;
}

const postcode = getComponent("postal_code");

const city =
  getComponent("locality") ||
  getComponent("postal_town") ||
  getComponent("administrative_area_level_3") ||
  null;

return NextResponse.json({
  lat: loc.lat,
  lng: loc.lng,
  formatted_address: result.formatted_address,
  postcode,
  city,
});  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}