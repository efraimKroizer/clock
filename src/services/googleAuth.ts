/**
 * Google Identity Services – OAuth2 Token Client
 * Implicit/token flow for SPA (no backend required).
 * Scopes: drive.file (user-visible files), openid + email + profile (user info)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const google: {
  accounts: {
    oauth2: {
      initTokenClient(config: TokenClientConfig): TokenClient
      revoke(token: string, done?: () => void): void
    }
  }
}

interface TokenClientConfig {
  client_id: string
  scope: string
  callback: (response: TokenResponse) => void
  error_callback?: (error: TokenError) => void
}

interface TokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void
}

interface TokenResponse {
  access_token: string
  expires_in: number
  scope?: string
  error?: string
  error_description?: string
}

interface TokenError {
  type: string
  message?: string
}

export interface GoogleUserInfo {
  sub: string
  email: string
  name: string
  picture: string
}

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
  'profile',
].join(' ')

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

const TOKEN_STORAGE_KEY = 'clock-google-token'
const TOKEN_EXPIRY_KEY = 'clock-google-token-expiry'

let tokenClient: TokenClient | null = null
let _accessToken: string | null = null
let _tokenExpiry = 0

/**
 * Load token from localStorage on module initialization.
 */
function loadStoredToken(): void {
  const stored = localStorage.getItem(TOKEN_STORAGE_KEY)
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY)
  
  if (stored && expiry) {
    const expiryTime = parseInt(expiry, 10)
    if (!isNaN(expiryTime) && Date.now() < expiryTime) {
      _accessToken = stored
      _tokenExpiry = expiryTime
    } else {
      // Token expired, clear storage
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      localStorage.removeItem(TOKEN_EXPIRY_KEY)
    }
  }
}

// Load token on module import
loadStoredToken()

export function isTokenValid(): boolean {
  return !!_accessToken && Date.now() < _tokenExpiry
}

export function getAccessToken(): string | null {
  if (isTokenValid()) {
    return _accessToken
  }
  // Token expired, clear it
  _accessToken = null
  _tokenExpiry = 0
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
  return null
}

/**
 * Store token in memory and localStorage.
 */
function storeToken(token: string, expiresIn: number): void {
  _accessToken = token
  _tokenExpiry = Date.now() + (expiresIn - 60) * 1000 // 60 second buffer
  
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
  localStorage.setItem(TOKEN_EXPIRY_KEY, _tokenExpiry.toString())
}

function hasDriveFileScope(scopeValue?: string): boolean {
  if (!scopeValue) {
    return false
  }

  return scopeValue.split(/\s+/).includes(DRIVE_FILE_SCOPE)
}

export function requestToken(clientId: string, silent = false, forceConsent = false): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined' || !google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services לא נטען. נסה לרענן את הדף.'))
      return
    }

    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error_description ?? response.error))
            return
          }

          if (!hasDriveFileScope(response.scope)) {
            reject(new Error('MISSING_DRIVE_FILE_SCOPE'))
            return
          }

          storeToken(response.access_token, response.expires_in)
          resolve(response.access_token)
        },
        error_callback: (error) => {
          reject(new Error(error.message ?? error.type))
        },
      })
    }

    const prompt = silent ? 'none' : forceConsent ? 'consent' : 'select_account'
    tokenClient.requestAccessToken({ prompt })
  })
}

export function revokeToken(): void {
  if (_accessToken) {
    google.accounts.oauth2.revoke(_accessToken)
  }
  _accessToken = null
  _tokenExpiry = 0
  localStorage.removeItem(TOKEN_STORAGE_KEY)
  localStorage.removeItem(TOKEN_EXPIRY_KEY)
  tokenClient = null
}

export async function fetchUserInfo(token: string): Promise<GoogleUserInfo> {
  const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    throw new Error(`שגיאה בטעינת פרטי משתמש: ${resp.status}`)
  }
  return resp.json() as Promise<GoogleUserInfo>
}
