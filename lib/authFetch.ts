const DEFAULT_AUTH_RETRY_DELAYS_MS = [120, 300, 600]

type AuthFetchOptions = {
  retryDelaysMs?: number[]
  fetcher?: typeof fetch
  wait?: (delayMs: number) => Promise<void>
}

function waitFor(delayMs: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, delayMs))
}

/**
 * Retries only a transient 401. Other errors must reach the caller unchanged,
 * so this helper never hides authorization failures or backend problems.
 */
export async function fetchWithAuthRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: AuthFetchOptions = {},
): Promise<Response> {
  const fetcher = options.fetcher ?? fetch
  const wait = options.wait ?? waitFor
  const retryDelays = options.retryDelaysMs ?? DEFAULT_AUTH_RETRY_DELAYS_MS
  const requestInit: RequestInit = {
    ...init,
    cache: 'no-store',
    credentials: 'same-origin',
  }

  let response = await fetcher(input, requestInit)
  for (const delayMs of retryDelays) {
    if (response.status !== 401) return response
    await wait(delayMs)
    response = await fetcher(input, requestInit)
  }
  return response
}
