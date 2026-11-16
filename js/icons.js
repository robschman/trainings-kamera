// Symbole aus der Sammlung in index.html (<symbol id="i-…">).
// Eigene Zeichnungen statt Schriftzeichen wie ⏮ oder ⬇: die sehen auf jedem Gerät anders aus (am iPad als bunte Emojis).
export const ic = name => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const setIcon = (el, name) => el.querySelector('use').setAttribute('href', '#i-' + name);
