import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  // Pass current pathname to server components via header
  response.headers.set('x-pathname', request.nextUrl.pathname)
  return response
}

export const config = {
  // Run on all routes except static files and _next internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json).*)'],
}
