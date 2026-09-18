/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */

// React Native's own rules, minus Prettier: the code is laid out by
// hand, with comments that say why, and a formatter that reflows it
// would only make the lint shout about spaces.
module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'prettier/prettier': 'off',
    // `if (!x) return;` on one line is the house style: braces are asked
    // for only where the body spans more than a line.
    curly: ['warn', 'multi-line'],
    // Effects that deliberately read a ref, or run once, are many here:
    // each is a decision, not a slip. Shown, not fatal.
    'react-hooks/exhaustive-deps': 'warn',
  },
};
