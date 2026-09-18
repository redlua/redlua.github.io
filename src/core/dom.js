/**
 * RedGet — DOM helpers.
 *
 * `$` returns the first match, `$$` returns a real Array so `.map`, `.filter`
 * and `.forEach` work without conversion. Both accept an optional root, which
 * matters for dialogs: query inside the overlay instead of the whole document.
 */

export function $(selector, root) {
  return (root || document).querySelector(selector);
}

export function $$(selector, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}

/** Create an element with attributes and children in one call. */
export function el(tag, attrs, children) {
  var node = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function (key) {
    if (key === 'class') node.className = attrs[key];
    else if (key === 'text') node.textContent = attrs[key];
    else if (key === 'html') node.innerHTML = attrs[key];
    else if (key.indexOf('on') === 0 && typeof attrs[key] === 'function') node.addEventListener(key.slice(2), attrs[key]);
    else if (attrs[key] !== null && attrs[key] !== undefined) node.setAttribute(key, attrs[key]);
  });
  (children || []).forEach(function (child) {
    if (!child) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

/** Remove every child of a node and return it. */
export function clear(node) {
  if (node) while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}
