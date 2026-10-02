const authButton = document.getElementById('googleLogin');
const authForm = document.getElementById('loginForm');
const authDivider = document.querySelector('.auth-form .divider');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.querySelector('.auth-sub');
const authMessage = document.getElementById('authMessage');
const accountButton = document.getElementById('accountOpen');
const authFormContainer = document.querySelector('.auth-form');
let signedInUser = null;

// Email/password isn't configured for this site; keep the UI focused on Google OAuth.
authForm.hidden = true;
authDivider.hidden = true;

// Replace the prototype click handler with the server-side OAuth entry point.
const googleButton = authButton.cloneNode(true);
authButton.replaceWith(googleButton);
googleButton.addEventListener('click', () => {
  if (window.location.protocol === 'file:') {
    authMessage.textContent = 'Open the shop at http://localhost:3000 to use Google sign-in.';
    return;
  }
  window.location.assign('/auth/google');
});

const profile = document.createElement('div');
profile.className = 'auth-profile';
profile.hidden = true;
profile.innerHTML = '<img class="auth-avatar" alt=""><div><strong class="auth-user-name"></strong><span class="auth-user-email"></span></div>';
const signOutButton = document.createElement('button');
signOutButton.className = 'button button-dark auth-signout';
signOutButton.type = 'button';
signOutButton.hidden = true;
signOutButton.textContent = 'Sign out';
googleButton.insertAdjacentElement('afterend', profile);
profile.insertAdjacentElement('afterend', signOutButton);

function showUser(user) {
  signedInUser = user;
  accountButton.textContent = user ? `Hi, ${user.name.split(' ')[0]}` : 'Log in';
  googleButton.hidden = Boolean(user);
  profile.hidden = !user;
  signOutButton.hidden = !user;
  if (user) {
    authTitle.textContent = `Welcome, ${user.name.split(' ')[0]}.`;
    authSubtitle.textContent = 'You’re signed in to your Bellisima account.';
    profile.querySelector('.auth-user-name').textContent = user.name;
    profile.querySelector('.auth-user-email').textContent = user.email;
    const avatar = profile.querySelector('.auth-avatar');
    if (user.picture) {
      avatar.src = user.picture;
      avatar.hidden = false;
    } else {
      avatar.removeAttribute('src');
      avatar.hidden = true;
    }
  } else {
    authTitle.textContent = 'Move with us.';
    authSubtitle.textContent = 'Sign in or create an account with Google.';
  }
}

signOutButton.addEventListener('click', async () => {
  signOutButton.disabled = true;
  try {
    const response = await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Sign out failed.');
    showUser(null);
    authMessage.textContent = 'You have been signed out.';
  } catch {
    authMessage.textContent = 'Could not sign out. Please try again.';
  } finally {
    signOutButton.disabled = false;
  }
});

const authResult = new URLSearchParams(window.location.search).get('auth');
if (authResult) {
  const reason = new URLSearchParams(window.location.search).get('reason');
  const messages = {
    exchange: 'Google rejected the sign-in code. Check that this OAuth client and callback URL match.',
    profile: 'Google sign-in completed, but the profile could not be loaded. Try again.',
    state: 'Your sign-in session expired or changed. Please start again from this page.',
    google: 'Google could not complete sign-in. Check your OAuth consent and test-user settings.',
    database_tls: 'Supabase certificate verification failed. Download the project root certificate and set SUPABASE_DATABASE_SSL_CERT in .env.',
    database: 'Google sign-in worked, but Supabase could not save the account. Check the server terminal and Supabase connection settings.',
    server: 'The sign-in server hit an error. Check the terminal running npm start.'
  };
  authMessage.textContent = authResult === 'cancelled'
    ? 'Google sign-in was cancelled.'
    : messages[reason] || 'Google sign-in could not be completed. Please try again.';
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  accountButton.click();
}

fetch('/auth/me', { credentials: 'same-origin' })
  .then(response => response.ok ? response.json() : Promise.reject())
  .then(data => showUser(data.user))
  .catch(() => {
    // The storefront can still be opened as a static preview without the server.
    if (authFormContainer) showUser(null);
  });
