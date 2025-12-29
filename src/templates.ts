/**
 * HTML templates for OAuth callback pages
 *
 * These templates are shown in the browser after OAuth authorization
 * for loopback OAuth flows (RFC 8252).
 */

/**
 * HTML template for successful OAuth authorization
 */
export function getSuccessTemplate(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authorization Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #e8ebf7 0%, #ede9f2 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
    }
    h1 {
      color: #2d3748;
      margin-bottom: 1rem;
      font-size: 1.875rem;
    }
    p {
      color: #718096;
      font-size: 1.125rem;
      margin-bottom: 1.5rem;
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h1>Authorization Successful!</h1>
    <p>You can close this window and return to your terminal.</p>
  </div>
  <script>
    // Auto-close after 3 seconds
    setTimeout(() => {
      window.close();
    }, 3000);
  </script>
</body>
</html>
  `.trim();
}

/**
 * HTML template for OAuth error
 */
export function getErrorTemplate(error: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authorization Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #fce9f7 0%, #faebed 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
    }
    h1 {
      color: #2d3748;
      margin-bottom: 1rem;
      font-size: 1.875rem;
    }
    p {
      color: #718096;
      font-size: 1.125rem;
      margin-bottom: 1.5rem;
    }
    .error {
      background: #fed7d7;
      color: #9b2c2c;
      padding: 0.75rem;
      border-radius: 0.5rem;
      margin-top: 1rem;
      font-family: monospace;
      font-size: 0.875rem;
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1>Authorization Failed</h1>
    <p>Please try again from your terminal.</p>
    <div class="error">${escapeHtml(error)}</div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(unsafe: string): string {
  return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
