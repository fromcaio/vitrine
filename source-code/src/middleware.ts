import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { nextUrl } = req;

  const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth");
  const isAuthPage = nextUrl.pathname.startsWith("/auth");
  const isAdminRoute = nextUrl.pathname.startsWith("/admin");

  if (isApiAuthRoute) return NextResponse.next();

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/admin", nextUrl));
  }

  if (isAdminRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/auth/login", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};