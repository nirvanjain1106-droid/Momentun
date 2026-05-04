# Momentum Debugging Guide

> Everything you need to find, reproduce, and fix bugs in the Momentum stack.

---

## 1. Debug Mode (Frontend)

Debug mode is **automatically active** when the dev server is running (`npm run dev`).
All debug output is stripped from production builds.

### Debug Panel

A floating `🐛` button appears at the bottom-right of the screen in dev mode.
Click it to open a panel showing:

| Field | Description |
|-------|-------------|
| **Screen** | Current SPA screen name (`home`, `tasks`, etc.) |
| **Auth** | Logged-in user name or `✗ logged out` |
| **Requests** | Rolling table of the last 20 API calls with method, URL, status, and response time |

### Console Namespaces

All dev console output uses `[Namespace]` prefixes for easy filtering:

```
[API] → GET /api/v1/schedule/today
[API] ← 200 /api/v1/schedule/today (142ms)
[Error] HIGH — Message: Server error. Please try again.
```

Filter in DevTools: type `[API]` or `[Error]` in the Console filter bar.

### Debug Utilities

```typescript
import { debugLog, debugWarn, debugGroup, debugTime } from '../lib/debug'

debugLog('MyComponent', 'loaded data', data)
debugWarn('MyComponent', 'fallback used')
debugGroup('MyComponent', () => {
  console.log('details...')
})
const result = debugTime('MyComponent', 'heavy computation', () => compute())
```

---

## 2. Error Handling Architecture

### Frontend Error Flow

```
User action
  → API call (try/catch)
    → handleApiError(error, 'ScreenName')  // classify
    → handleError(appError)                 // log / report
    → setErrorMessage(appError.message)     // show in UI
```

### Error Boundary

Every screen is wrapped in `<ErrorBoundary key={screen}>`.
If a render crashes:
1. The boundary catches the error
2. Shows a styled fallback with the error message
3. Offers a "Try Again" button that resets the boundary

The `key={screen}` prop ensures the boundary resets automatically on navigation.

### Backend Error Flow

```
Router handler
  → raise NotFoundError("Task", task_id)
    → app_exception_handler (main.py)
      → 404 JSON: { "error": { "code": "NOT_FOUND", ... } }
```

---

## 3. Error Code Reference

### Backend Codes (HTTP → JSON)

| Code | HTTP | Meaning | When |
|------|------|---------|------|
| `NOT_FOUND` | 404 | Resource doesn't exist | Invalid ID, deleted resource |
| `UNAUTHORIZED` | 401 | Auth required/expired | Missing/expired token |
| `FORBIDDEN` | 403 | Not authorized | Wrong user, insufficient permissions |
| `VALIDATION_ERROR` | 422 | Bad input | Missing fields, wrong types, business rules |
| `CONFLICT` | 409 | Duplicate resource | Email already registered, duplicate name |
| `RATE_LIMITED` | 429 | Too many requests | Exceeded rate limit |
| `INTERNAL_ERROR` | 500 | Unhandled crash | Bug — check server logs |

### Frontend Codes (AppError)

| Code | Severity | User Message |
|------|----------|-------------|
| `UNAUTHORIZED` | medium | Session expired. Please log in again. |
| `FORBIDDEN` | medium | You don't have permission to do that. |
| `NOT_FOUND` | low | Resource not found. |
| `VALIDATION_ERROR` | low | Validation failed. Please check your input. |
| `RATE_LIMITED` | medium | Too many requests. Please slow down. |
| `SERVER_ERROR` | high | Server error. Please try again. |
| `NETWORK_ERROR` | high | Network error. Check your connection. |
| `UNKNOWN` | medium | An unexpected error occurred. |

---

## 4. How to Reproduce Common Issues

### Registration Fails
1. Open DevTools Console, filter `[API]`
2. Fill out the register form and submit
3. Check the request payload — should be `{ name, email, password }`
4. Check response status: 409 = email exists, 422 = validation error

### Session Expires Mid-Use
1. The 401 interceptor in `client.ts` auto-attempts a cookie refresh
2. If refresh fails → `logout()` clears auth state → `App.tsx` auto-redirects to login
3. Check Console for `[API] ← 401` followed by `→ POST /auth/refresh`

### Screen Crashes (White Screen)
1. ErrorBoundary catches it and shows "Something went wrong"
2. The error message is displayed in a `<pre>` block
3. Check Console for `[ErrorBoundary]` with full stack trace
4. Click "Try Again" or navigate away (key={screen} resets automatically)

### API Call Slow or Hanging
1. Open Debug Panel (🐛 button)
2. Look at the Time column — anything > 3000ms is a red flag
3. Check if the request shows `status: null` (network failure vs. slow server)

---

## 5. Debugging Checklist

When you encounter a bug, follow this process **in order**:

### Phase 1: Gather Evidence
- [ ] Read the exact error message and stack trace
- [ ] Check the Debug Panel for recent failed API calls
- [ ] Filter Console with `[Error]` to see classified errors
- [ ] Check the Network tab for request/response bodies
- [ ] Can you reproduce it consistently?

### Phase 2: Identify the Layer
- [ ] **Frontend render?** → Check ErrorBoundary output
- [ ] **API call?** → Check `[API]` console logs for status + timing
- [ ] **Backend logic?** → Check server logs for `app_exception` or `unhandled_exception`
- [ ] **Network?** → Check for `NETWORK_ERROR` code, `navigator.onLine` state

### Phase 3: Isolate
- [ ] What was the last working state?
- [ ] What changed? (git diff, config, environment)
- [ ] Does it happen on all screens or just one?
- [ ] Does it happen with all users or just one?

### Phase 4: Fix
- [ ] Make the smallest possible change
- [ ] Test only that change
- [ ] Verify no regressions with `npx tsc --noEmit`

---

## 6. Where to Find Logs

| What | Where |
|------|-------|
| Frontend API calls | Browser DevTools Console → filter `[API]` |
| Frontend errors | Browser DevTools Console → filter `[Error]` |
| Error boundaries | Browser DevTools Console → filter `[ErrorBoundary]` |
| Debug Panel data | 🐛 button → bottom of screen |
| Backend app exceptions | Server stdout → grep `app_exception` |
| Backend unhandled errors | Server stdout → grep `unhandled_exception` |
| Backend request IDs | Response header `X-Request-ID` |

---

## 7. File Reference

| File | Purpose |
|------|---------|
| `frontend/src/components/ErrorBoundary.tsx` | React error boundary with styled fallback |
| `frontend/src/components/DebugPanel.tsx` | Dev-only floating debug panel |
| `frontend/src/lib/errorHandler.ts` | `handleError()` + `handleApiError()` |
| `frontend/src/lib/debug.ts` | `debugLog()`, `debugWarn()`, `debugGroup()`, `debugTime()` |
| `frontend/src/lib/errorUtils.ts` | `getErrorMessage()` for Axios error extraction |
| `frontend/src/api/client.ts` | Axios interceptors with timing + debug logging |
| `app/exceptions.py` | Backend exception hierarchy |
| `app/main.py` | Exception handler registration |
