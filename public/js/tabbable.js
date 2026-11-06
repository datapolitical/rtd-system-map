// Safari's Tab key skips buttons and links unless the reader has changed a
// setting most people never find, which would leave Lines, the map's buttons
// and every row in a panel out of reach of the keyboard. An explicit
// tabindex puts them back in the Tab order there and changes nothing in
// other browsers. Applied to whatever is on the page now and to anything
// added later (panels, search results, the map's own controls).

const SKIPPED = 'button:not([tabindex]), a[href]:not([tabindex])';

const reach = (root) => {
  if (root.matches?.(SKIPPED)) root.tabIndex = 0;
  root.querySelectorAll?.(SKIPPED).forEach((el) => {
    el.tabIndex = 0;
  });
};

export function keepTabbable(root = document.body) {
  reach(root);
  new MutationObserver((changes) => {
    for (const change of changes) change.addedNodes.forEach(reach);
  }).observe(root, { childList: true, subtree: true });
}
