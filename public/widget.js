/*
 * Elpino Chat embed loader.
 *
 * This file deliberately contains no tenant secrets.  The public website ID
 * identifies the tenant; the widget API must still validate the host origin.
 */
(function () {
  "use strict";

  var websiteId = window.ELPINO_WEBSITE_ID || window.CRISP_WEBSITE_ID;

  if (!websiteId || typeof websiteId !== "string") {
    console.error(
      "[Elpino Chat] Missing window.ELPINO_WEBSITE_ID (or legacy window.CRISP_WEBSITE_ID).",
    );
    return;
  }

  // Avoid mounting a second chat widget if the loader is added twice.
  if (document.getElementById("elpino-chat-frame")) return;

  var iframe = document.createElement("iframe");
  iframe.id = "elpino-chat-frame";
  iframe.title = "Elpino Chat";
  iframe.setAttribute("aria-label", "Elpino Chat");
  iframe.setAttribute("allow", "clipboard-write");

  // Change localhost to your production Elpino application URL before launch.
  iframe.src =
    "http://localhost:3000/widget?website_id=" + encodeURIComponent(websiteId) +
    // `host` is required by the existing widget API's domain validation.
    "&host=" + encodeURIComponent(window.location.hostname);

  function setLauncherSize() {
    iframe.style.width = "80px";
    iframe.style.height = "80px";
  }

  function setPanelSize() {
    iframe.style.width = "380px";
    iframe.style.height = "600px";
  }

  // Keep all positioning on the host page: a cross-origin iframe cannot
  // resize itself, and the hosted chat UI only requests a size via postMessage.
  iframe.style.position = "fixed";
  iframe.style.right = "20px";
  iframe.style.bottom = "20px";
  iframe.style.zIndex = "999999";
  iframe.style.border = "none";
  iframe.style.background = "transparent";
  iframe.style.overflow = "hidden";
  iframe.style.maxWidth = "calc(100vw - 32px)";
  iframe.style.maxHeight = "calc(100vh - 32px)";
  setLauncherSize();

  window.addEventListener("message", function (event) {
    // Never accept resize commands from another frame on the same page.
    if (event.source !== iframe.contentWindow || !event.data) return;

    // `action` is the compact protocol used by this loader. The `type`
    // variants keep this compatible with the current app/widget/page.tsx.
    var action = event.data.action;
    if (event.data.type === "elpino:open") action = "open";
    if (event.data.type === "elpino:close") action = "close";

    if (action === "open") setPanelSize();
    if (action === "close") setLauncherSize();
  });

  function inject() {
    document.body.appendChild(iframe);
  }

  if (document.body) inject();
  else document.addEventListener("DOMContentLoaded", inject, { once: true });
})();
