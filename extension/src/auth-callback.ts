const minalyCallbackStatus = document.querySelector<HTMLElement>("[data-status]");

function show(message: string): void {
  if (minalyCallbackStatus) minalyCallbackStatus.textContent = message;
}

async function complete(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const state = params.get("state");
  const token = params.get("token");
  const error = params.get("error");
  window.history.replaceState({}, document.title, window.location.pathname);

  if (!state || (!token && !error)) {
    show("La connexion Minaly n’a pas pu être confirmée.");
    return;
  }

  try {
    const result: unknown = await chrome.runtime.sendMessage({ type: "minaly-auth-callback", state, token, error });
    if (typeof result === "object" && result !== null && "ok" in result && result.ok === true) {
      show("Connexion confirmée. Tu peux revenir sur ton profil.");
    } else {
      show("Cette connexion n’est plus valide. Ferme cet onglet et recommence depuis l’extension.");
    }
  } catch {
    show("Impossible de finaliser la connexion. Ferme cet onglet et recommence depuis l’extension.");
  }
  window.setTimeout(() => window.close(), 900);
}

void complete();
