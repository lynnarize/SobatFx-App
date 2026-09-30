import { NextResponse, type NextRequest } from "next/server";

// Temporary public demo (DEMO_MODE=true): no Google login.
//  - Every visitor gets an anonymous demo id cookie, so AI limits are per visitor (see src/lib/auth.ts).
// With DEMO_MODE off this proxy does nothing.

const YEAR = 60 * 60 * 24 * 365;

export function proxy(req: NextRequest) {
  if (process.env.DEMO_MODE !== "true") return NextResponse.next();
  const res = NextResponse.next();
  if (!req.cookies.get("sfx_demo")?.value) {
    res.cookies.set("sfx_demo", crypto.randomUUID(), { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/", maxAge: YEAR });
  }
  return res;
}

export const config = {
  // Everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|icon|mark\\.jpg|sobatfx\\.jpg|favicon).*)"],
};
